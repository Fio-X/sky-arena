import { applyDamage, calculateBlock, calculateDamage } from "../combat/damage";
import { getCard } from "../content/loader";
import { stsShuffle } from "../rng/stsRandom";
import { popAction } from "./actionQueue";
import { fireHook } from "./hooks";
import type {
	Action,
	ActorRef,
	CardInstance,
	GameEvent,
	GameState,
	MonsterMoveId,
	MonsterState,
	PowerInstance,
} from "./types";

export function drainActions(
	state: GameState,
	events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
	let s = state;
	while (s.combat && s.combat.actionQueue.length > 0) {
		const popped = popAction(s.combat);
		if (!popped.action) break;
		s = { ...s, combat: popped.combat };
		({ state: s } = executeAction(s, popped.action, events));
	}
	return { state: s, events };
}

function executeAction(
	state: GameState,
	action: Action,
	events: GameEvent[],
): { state: GameState } {
	switch (action.type) {
		case "damage":
			return executeDamage(state, action, events);
		case "block":
			return executeBlock(state, action, events);
		case "applyPower":
			return executeApplyPower(state, action, events);
		case "heal":
			return executeHeal(state, action, events);
		case "loseHp":
			return executeLoseHp(state, action, events);
		case "drawCards":
			return executeDrawCards(state, action, events);
		case "discardCard":
			return executeDiscardCard(state, action, events);
		case "exhaustCard":
			return executeExhaustCard(state, action, events);
		case "gainEnergy":
			return executeGainEnergy(state, action);
		case "loseEnergy":
			return executeLoseEnergy(state, action);
		case "addCardToDiscardPile":
			return executeAddCardToDiscardPile(state, action);
		case "addCardToDrawPile":
			return executeAddCardToDrawPile(state, action);
		case "addCardToHand":
			return executeAddCardToHand(state, action);
		case "loseGold":
			return executeLoseGold(state, action);
		case "custom":
			return { state: action.execute(state) };
		case "split":
			return executeSplit(state, action, events);
		case "escape":
			return executeEscape(state, action, events);
		default:
			return { state };
	}
}

function executeDamage(
	state: GameState,
	action: Extract<Action, { type: "damage" }>,
	events: GameEvent[],
): { state: GameState } {
	let s = state;
	for (let i = 0; i < action.hits; i++) {
		if (!isTargetAlive(s, action.target)) break;

		const calc = calculateDamage(s, action.source, action.target, action.baseDamage, null);
		s = calc.state;
		const applied = applyDamage(s, action.target, calc.damage);
		s = applied.state;

		events.push({
			type: "damageDealt",
			source: action.source,
			target: action.target,
			amount: applied.hpLost,
			blocked: applied.blocked,
		});

		if (applied.hpLost > 0) {
			s = fireHook(s, action.target, "onAttacked", applied.hpLost, action.source);
			s = fireHook(s, action.target, "wasHPLost", applied.hpLost);
		}

		if (action.target.type === "monster" && !isTargetAlive(s, action.target)) {
			s = fireHook(s, action.target, "onMonsterDeath", action.target.index);
			events.push({ type: "monsterDied", index: action.target.index });
		}

		s = checkHalfDead(s, action.target);
	}
	return { state: s };
}

function executeBlock(
	state: GameState,
	action: Extract<Action, { type: "block" }>,
	events: GameEvent[],
): { state: GameState } {
	const calc = calculateBlock(state, action.source, action.amount, null);
	let s = calc.state;
	if (!s.combat) return { state: s };

	const target: ActorRef = action.source;
	if (target.type === "player") {
		s = {
			...s,
			combat: {
				...s.combat,
				player: {
					...s.combat.player,
					block: s.combat.player.block + calc.block,
				},
			},
		};
	} else {
		const monsters = [...s.combat.monsters];
		const m = monsters[target.index];
		if (m) {
			monsters[target.index] = { ...m, block: m.block + calc.block };
			s = { ...s, combat: { ...s.combat, monsters } };
		}
	}

	events.push({ type: "blockGained", target, amount: calc.block });
	if (calc.block > 0) {
		s = fireHook(s, target, "onGainedBlock", calc.block);
	}
	return { state: s };
}

function executeApplyPower(
	state: GameState,
	action: Extract<Action, { type: "applyPower" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const { target, powerId, amount } = action;
	let newCombat: typeof combat;

	if (target.type === "player") {
		const powers = applyPowerToList(combat.player.powers, powerId, amount);
		newCombat = { ...combat, player: { ...combat.player, powers } };
	} else {
		const monsters = [...combat.monsters];
		const m = monsters[target.index];
		if (!m) {
			events.push({ type: "powerApplied", target, powerId, amount });
			return { state };
		}
		const powers = applyPowerToList(m.powers, powerId, amount);
		monsters[target.index] = { ...m, powers };
		newCombat = { ...combat, monsters };
	}

	events.push({ type: "powerApplied", target, powerId, amount });
	return { state: { ...state, combat: newCombat } };
}

function applyPowerToList(
	powers: readonly PowerInstance[],
	powerId: string,
	amount: number,
): PowerInstance[] {
	const existing = powers.find((p) => p.id === powerId);
	if (existing) {
		return powers.map((p) =>
			p.id === powerId ? { ...p, amount: p.amount + amount, justApplied: true } : p,
		);
	}
	return [...powers, { id: powerId as PowerInstance["id"], amount, justApplied: true }];
}

function executeHeal(
	state: GameState,
	action: Extract<Action, { type: "heal" }>,
	events: GameEvent[],
): { state: GameState } {
	if (action.target.type !== "player") return { state };
	const healed = Math.min(action.amount, state.maxHp - state.currentHp);
	events.push({ type: "healed", target: action.target, amount: healed });
	return { state: { ...state, currentHp: state.currentHp + healed } };
}

function executeLoseHp(
	state: GameState,
	action: Extract<Action, { type: "loseHp" }>,
	events: GameEvent[],
): { state: GameState } {
	if (action.target.type !== "player") return { state };
	const newHp = Math.max(0, state.currentHp - action.amount);
	events.push({ type: "hpLost", target: action.target, amount: state.currentHp - newHp });
	return { state: { ...state, currentHp: newHp } };
}

function executeGainEnergy(
	state: GameState,
	action: Extract<Action, { type: "gainEnergy" }>,
): { state: GameState } {
	if (!state.combat) return { state };
	return {
		state: {
			...state,
			combat: { ...state.combat, energy: state.combat.energy + action.amount },
		},
	};
}

function executeLoseEnergy(
	state: GameState,
	action: Extract<Action, { type: "loseEnergy" }>,
): { state: GameState } {
	if (!state.combat) return { state };
	return {
		state: {
			...state,
			combat: {
				...state.combat,
				energy: Math.max(0, state.combat.energy - action.amount),
			},
		},
	};
}

function executeDrawCards(
	state: GameState,
	action: Extract<Action, { type: "drawCards" }>,
	events: GameEvent[],
): { state: GameState } {
	let s = state;
	for (let i = 0; i < action.count; i++) {
		const combat = s.combat;
		if (!combat) break;
		if (combat.hand.length >= 10) break;

		let drawPile = [...combat.drawPile];
		let discardPile = [...combat.discardPile];
		let rng = s.rng;

		if (drawPile.length === 0) {
			if (discardPile.length === 0) break;
			const shuffled = stsShuffle(discardPile, rng.shuffleRng);
			drawPile = shuffled.result;
			discardPile = [];
			rng = { ...rng, shuffleRng: shuffled.rng };
			events.push({ type: "shuffled" });
		}

		const card = drawPile[drawPile.length - 1];
		if (!card) break;
		drawPile = drawPile.slice(0, -1);

		s = {
			...s,
			rng,
			combat: {
				...combat,
				drawPile,
				discardPile,
				hand: [...combat.hand, card],
			},
		};
		events.push({ type: "cardDrawn", card });
		s = fireHook(s, { type: "player" }, "onDraw", card);

		if (card.id === ("ENDLESS_AGONY" as never) && s.combat && s.combat.hand.length < 10) {
			const uid = nextUniqueCardId++;
			const copy: CardInstance = { ...card, uniqueId: uid };
			s = { ...s, combat: { ...s.combat, hand: [...s.combat.hand, copy] } };
		}
	}
	return { state: s };
}

function executeDiscardCard(
	state: GameState,
	action: Extract<Action, { type: "discardCard" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const card = combat.hand[action.handIndex];
	if (!card) return { state };

	const hand = combat.hand.filter((_, i) => i !== action.handIndex);
	const discardPile = [...combat.discardPile, card];
	events.push({ type: "cardDiscarded", card });
	return {
		state: {
			...state,
			combat: {
				...combat,
				hand,
				discardPile,
				cardsDiscardedThisTurn: combat.cardsDiscardedThisTurn + 1,
			},
		},
	};
}

function executeExhaustCard(
	state: GameState,
	action: Extract<Action, { type: "exhaustCard" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const card = combat.hand[action.handIndex];
	if (!card) return { state };

	const hand = combat.hand.filter((_, i) => i !== action.handIndex);
	const exhaustPile = [...combat.exhaustPile, card];
	events.push({ type: "cardExhausted", card });
	let s: GameState = { ...state, combat: { ...combat, hand, exhaustPile } };
	s = fireHook(s, { type: "player" }, "onExhaust", card);
	return { state: s };
}

function executeAddCardToDiscardPile(
	state: GameState,
	action: Extract<Action, { type: "addCardToDiscardPile" }>,
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const card = makeCardInstance(action.cardId, action.upgraded, combat);
	return {
		state: {
			...state,
			combat: { ...combat, discardPile: [...combat.discardPile, card] },
		},
	};
}

function executeAddCardToDrawPile(
	state: GameState,
	action: Extract<Action, { type: "addCardToDrawPile" }>,
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const card = makeCardInstance(action.cardId, action.upgraded, combat);
	const drawPile = action.toTop ? [...combat.drawPile, card] : [card, ...combat.drawPile];
	return { state: { ...state, combat: { ...combat, drawPile } } };
}

function executeAddCardToHand(
	state: GameState,
	action: Extract<Action, { type: "addCardToHand" }>,
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	if (combat.hand.length >= 10) return { state };
	const card = makeCardInstance(action.cardId, action.upgraded, combat);
	return {
		state: {
			...state,
			combat: { ...combat, hand: [...combat.hand, card] },
		},
	};
}

function executeLoseGold(
	state: GameState,
	action: Extract<Action, { type: "loseGold" }>,
): { state: GameState } {
	return { state: { ...state, gold: Math.max(0, state.gold - action.amount) } };
}

function executeSplit(
	state: GameState,
	action: Extract<Action, { type: "split" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const source = combat.monsters[action.sourceIndex];
	if (!source) return { state };

	const monsters = [...combat.monsters];
	const sourceHp = source.currentHp;
	if (source.alive) {
		monsters[action.sourceIndex] = { ...source, alive: false, currentHp: 0 };
		events.push({ type: "monsterDied", index: action.sourceIndex });
	}

	const newIndices: number[] = [];
	for (let i = 0; i < action.count; i++) {
		const idx = monsters.length;
		newIndices.push(idx);
		const child: MonsterState = {
			id: action.spawnId,
			index: idx,
			maxHp: sourceHp,
			currentHp: sourceHp,
			block: 0,
			powers: [],
			intent: {
				moveId: "" as MonsterMoveId,
				baseDamage: null,
				hits: 1,
				isAttack: false,
				isDebuff: false,
				isBuff: false,
			},
			moveHistory: [],
			alive: true,
			halfDead: false,
			miscInfo: 0,
		};
		monsters.push(child);
	}

	events.push({ type: "monsterSplit", sourceIndex: action.sourceIndex, newIndices });
	return { state: { ...state, combat: { ...combat, monsters } } };
}

function executeEscape(
	state: GameState,
	action: Extract<Action, { type: "escape" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const m = combat.monsters[action.monsterIndex];
	if (!m?.alive) return { state };

	const monsters = [...combat.monsters];
	monsters[action.monsterIndex] = { ...m, alive: false, currentHp: 0 };
	events.push({ type: "monsterEscaped", index: action.monsterIndex });
	return { state: { ...state, combat: { ...combat, monsters } } };
}

let nextUniqueCardId = 10000;

function makeCardInstance(
	cardId: string,
	upgraded: boolean,
	_combat: NonNullable<GameState["combat"]>,
): CardInstance {
	return {
		id: cardId as CardInstance["id"],
		uniqueId: nextUniqueCardId++,
		upgraded,
		costOverride: null,
		costForTurn: getCard(cardId)?.cost ?? 1,
		freeToPlay: false,
		misc: 0,
	};
}

const SPLITTABLE_MONSTERS = new Set(["ACID_SLIME_L", "SPIKE_SLIME_L", "SLIME_BOSS"]);

function checkHalfDead(state: GameState, target: ActorRef): GameState {
	if (target.type !== "monster") return state;
	const combat = state.combat;
	if (!combat) return state;
	const m = combat.monsters[target.index];
	if (!m || !m.alive || m.halfDead) return state;
	if (!SPLITTABLE_MONSTERS.has(m.id)) return state;
	if (m.currentHp <= Math.floor(m.maxHp / 2)) {
		const monsters = [...combat.monsters];
		monsters[target.index] = { ...m, halfDead: true };
		return { ...state, combat: { ...combat, monsters } };
	}
	return state;
}

function isTargetAlive(state: GameState, target: ActorRef): boolean {
	if (target.type === "player") return state.currentHp > 0;
	const monster = state.combat?.monsters[target.index];
	return monster?.alive ?? false;
}
