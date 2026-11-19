import {
	applyDamage,
	calculateBlock,
	calculateDamage,
	calculateNonAttackDamage,
} from "../combat/damage";
import { resolveMonsterDeath } from "../combat/death";
import { negateWithArtifact } from "../combat/powers";
import { getCard } from "../content/loader";
import * as relicRules from "../content/relicsCombatRules";
import { popAction } from "./actionQueue";
import { insertAtRandomSpot } from "./drawPile";
import { fireHook, vetoHook } from "./hooks";
import {
	executeAddCardToMasterDeck,
	executeEscape,
	executeMonsterDie,
	executeMonsterHeal,
	executeRemoveDebuffs,
	executeSpawnMonster,
	executeSplit,
	executeStealCard,
	executeVampireDamage,
} from "./monsterActions";
import { channelOrb as channelOrbImpl, evokeOrb as evokeOrbImpl } from "./orbSystem";
import {
	executeGainGold,
	executeGainMaxHp,
	executeLoseMaxHp,
	executePlayerHeal,
	executePlayerLoseHp,
	executeShuffle,
} from "./playerActions";
import type { Action, ActorRef, CardInstance, GameEvent, GameState, PowerInstance } from "./types";

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
			return action.target.type === "monster"
				? executeMonsterHeal(state, action, events)
				: executeHeal(state, action, events);
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
		case "gainGold":
			return executeGainGold(state, action, events);
		case "gainMaxHp":
			return executeGainMaxHp(state, action, events);
		case "loseMaxHp":
			return executeLoseMaxHp(state, action);
		case "shuffle":
			return executeShuffle(state, events);
		case "custom":
			return { state: action.execute(state) };
		case "split":
			return executeSplit(state, action, events);
		case "escape":
			return executeEscape(state, action, events);
		case "monsterDie":
			return executeMonsterDie(state, action, events);
		case "addCardToMasterDeck":
			return executeAddCardToMasterDeck(state, action);
		case "spawnMonster":
			return executeSpawnMonster(state, action, events);
		case "removeDebuffs":
			return executeRemoveDebuffs(state, action);
		case "vampireDamage":
			return executeVampireDamage(state, action, events, executeDamage);
		case "stealCard":
			return executeStealCard(state, action);
		case "channelOrb":
			return executeChannelOrb(state, action, events);
		case "evokeOrb":
			return executeEvokeOrb(state, action, events);
		case "changeStance":
			return executeChangeStance(state, action, events);
		case "scry":
			return executeScry(state, action, events);
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

		const calc = action.nonAttack
			? calculateNonAttackDamage(s, action.target, action.baseDamage)
			: calculateDamage(s, action.source, action.target, action.baseDamage, null);
		s = calc.state;
		const blockBefore = relicRules.targetBlock(s, action.target);
		const applied = applyDamage(s, action.target, calc.damage);
		s = relicRules.handDrill(applied.state, action, blockBefore);

		events.push({
			type: "damageDealt",
			source: action.source,
			target: action.target,
			amount: applied.hpLost,
			blocked: applied.blocked,
		});

		if (applied.hpLost > 0 && action.nonAttack) {
			s = fireHook(s, action.target, "wasHPLost", applied.hpLost);
		} else if (applied.hpLost > 0) {
			s = fireHook(s, action.target, "onAttacked", applied.hpLost, action.source);
			s = fireHook(s, action.target, "wasHPLost", applied.hpLost);
			s = fireHook(s, action.source, "onAttack", applied.hpLost, action.target);
		}
		s = relicRules.preventPlayerDeath(s, events);

		if (action.target.type === "monster" && !isTargetAlive(s, action.target)) {
			s = resolveMonsterDeath(s, action.target.index, events);
		}

		s = checkSplitTrigger(s, action.target);
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
	rawState: GameState,
	rawAction: Extract<Action, { type: "applyPower" }>,
	events: GameEvent[],
): { state: GameState } {
	const { state, action } = relicRules.applyPowerRelics(rawState, rawAction);
	if (!state.combat) return { state };
	const { target, powerId, amount } = action;
	const negated = negateWithArtifact(state, target, powerId, amount);
	if (negated) {
		events.push({ type: "powerNegated", target, powerId });
		return { state: negated };
	}
	if (!vetoHook(state, target, "onApplyPower", powerId, amount)) return { state };
	const combat = state.combat;
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
	return executePlayerHeal(state, action.amount, events);
}

function executeLoseHp(
	state: GameState,
	action: Extract<Action, { type: "loseHp" }>,
	events: GameEvent[],
): { state: GameState } {
	if (action.target.type !== "player") return { state };
	const lost = executePlayerLoseHp(state, action.amount, events).state;
	return { state: relicRules.preventPlayerDeath(lost, events) };
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
			// EmptyDeckShuffleAction: reshuffle, then onShuffle (Sundial, Abacus) before drawing.
			({ state: s } = executeShuffle(s, events));
			const after = s.combat;
			if (!after) break;
			drawPile = [...after.drawPile];
			discardPile = [...after.discardPile];
			rng = s.rng;
		}

		const card = drawPile[drawPile.length - 1];
		if (!card) break;
		drawPile = drawPile.slice(0, -1);

		const current = s.combat ?? combat;
		s = {
			...s,
			rng,
			combat: {
				...current,
				drawPile,
				discardPile,
				hand: [...current.hand, card],
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
	const s: GameState = {
		...state,
		combat: {
			...combat,
			hand,
			discardPile,
			cardsDiscardedThisTurn: combat.cardsDiscardedThisTurn + 1,
		},
	};
	return { state: fireHook(s, { type: "player" }, "onManualDiscard", card) };
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
	if (action.randomSpot) {
		const placed = insertAtRandomSpot(combat.drawPile, card, state.rng.cardRandomRng);
		return {
			state: {
				...state,
				combat: { ...combat, drawPile: placed.pile },
				rng: { ...state.rng, cardRandomRng: placed.rng },
			},
		};
	}
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

function executeChannelOrb(
	state: GameState,
	action: Extract<Action, { type: "channelOrb" }>,
	events: GameEvent[],
): { state: GameState } {
	const result = channelOrbImpl(state, action.orbType, events);
	return { state: result.state };
}

function executeEvokeOrb(
	state: GameState,
	action: Extract<Action, { type: "evokeOrb" }>,
	events: GameEvent[],
): { state: GameState } {
	const result = evokeOrbImpl(state, action.times, events);
	return { state: result.state };
}

function checkSplitTrigger(state: GameState, target: ActorRef): GameState {
	if (target.type !== "monster") return state;
	const combat = state.combat;
	if (!combat) return state;
	const m = combat.monsters[target.index];
	if (!m || !m.alive || m.splitPending) return state;
	if (!SPLITTABLE_MONSTERS.has(m.id)) return state;
	if (m.currentHp <= Math.floor(m.maxHp / 2)) {
		const monsters = [...combat.monsters];
		monsters[target.index] = { ...m, splitPending: true };
		return { ...state, combat: { ...combat, monsters } };
	}
	return state;
}

function isTargetAlive(state: GameState, target: ActorRef): boolean {
	if (target.type === "player") return state.currentHp > 0;
	const monster = state.combat?.monsters[target.index];
	return monster?.alive ?? false;
}

function executeChangeStance(
	state: GameState,
	action: Extract<Action, { type: "changeStance" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const from = combat.player.stance;
	const to = action.stance;
	if (from === to) return { state };

	let s: GameState = {
		...state,
		combat: { ...combat, player: { ...combat.player, stance: to } },
	};

	// Leaving Calm: gain 2 energy
	if (from === "calm") {
		s = { ...s, combat: { ...s.combat!, energy: s.combat!.energy + 2 } };
	}

	// Entering Divinity: gain 3 energy
	if (to === "divinity") {
		s = { ...s, combat: { ...s.combat!, energy: s.combat!.energy + 3 } };
	}

	events.push({ type: "stanceChanged", from, to });
	s = fireHook(s, { type: "player" }, "onChangeStance", from, to);
	return { state: s };
}

function executeScry(
	state: GameState,
	action: Extract<Action, { type: "scry" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat || action.count <= 0) return { state };

	const count = Math.min(action.count + relicRules.scryBonus(state), combat.drawPile.length);
	if (count === 0) return { state };

	// Scry: look at top N cards, discard any (for now auto-discard status/curse)
	const drawPile = [...combat.drawPile];
	const toDiscard: CardInstance[] = [];
	const toKeep: CardInstance[] = [];

	const scried = drawPile.splice(drawPile.length - count, count);
	for (const card of scried) {
		const def = getCard(card.id);
		if (def?.type === "status" || def?.type === "curse") {
			toDiscard.push(card);
		} else {
			toKeep.push(card);
		}
	}

	const newDrawPile = [...drawPile, ...toKeep];
	const newDiscardPile = [...combat.discardPile, ...toDiscard];

	for (const card of toDiscard) {
		events.push({ type: "cardDiscarded", card });
	}

	const s: GameState = {
		...state,
		combat: { ...combat, drawPile: newDrawPile, discardPile: newDiscardPile },
	};
	return { state: fireHook(s, { type: "player" }, "onScry", count) };
}
