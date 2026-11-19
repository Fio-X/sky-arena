import { generateCardReward } from "../combat/cardReward";
import { getEncounterMonsters } from "../combat/encounters";
import { initCombat } from "../combat/init";
import { buildIntent, resolveMonsterMove, rollMonsterMove } from "../combat/monsterTurn";
import { tickTurnBasedPowers } from "../combat/powers";
import { resolveCardEffect } from "../content/cardEffects";
import { getCard } from "../content/loader";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { afterRewardPhase, rollGoldReward, stepChooseBossRelic } from "./bossReward";
import { stepChooseCard } from "./cardSelect";
import { obtainRandomRelic, pickEvent, stepChooseEventOption } from "./event";
import { fireHook, fireHookOnAllActors, foldHook, vetoHook } from "./hooks";
import { stepChooseNeowBlessing } from "./neow";
import { rollPotionDrop, stepDiscardPotion, stepObtainPotionReward, stepUsePotion } from "./potion";
import { generateShop, stepChooseShopItem, stepShopPurge } from "./shop";
import type {
	ActorRef,
	CardInstance,
	Command,
	GameEvent,
	GameState,
	MonsterId,
	StepResult,
} from "./types";

const TURN_BASED_POWER_IDS = new Set([
	"vulnerable",
	"weak",
	"frail",
	"intangible",
	"INTANGIBLE",
	"regen",
]);

/**
 * Pure step function: the entire game engine entry point.
 * Takes current state + player command, returns new state + events for UI.
 * No side effects, no DOM, no async, no Math.random.
 */
export function step(state: GameState, command: Command): StepResult {
	const events: GameEvent[] = [];

	let result: StepResult;
	switch (command.type) {
		case "playCard":
			result = stepPlayCard(state, command.handIndex, command.targetIndex, events);
			break;
		case "endTurn":
			result = stepEndTurn(state, events);
			break;
		case "chooseMapNode":
			return stepChooseMapNode(state, command.x, command.y, events);
		case "chooseCardReward":
			return stepChooseCardReward(state, command.index, events);
		case "skipCardReward":
			return stepSkipCardReward(state, events);
		case "rest":
			return stepRest(state, events);
		case "smith":
			return stepSmith(state, command.cardIndex, events);
		case "chooseNeowBlessing":
			return stepChooseNeowBlessing(state, command.index, events);
		case "chooseShopItem":
			return stepChooseShopItem(state, command.index, events);
		case "shopPurge":
			return stepShopPurge(state, command.cardIndex, events);
		case "leaveShop":
			return stepProceed(state, events);
		case "chooseEventOption":
			return stepChooseEventOption(state, command.index, events);
		case "usePotion":
			result = stepUsePotion(state, command.index, command.targetIndex, events);
			return checkCombatEnd(result);
		case "discardPotion":
			return stepDiscardPotion(state, command.index, events);
		case "obtainPotionReward":
			return stepObtainPotionReward(state, events);
		case "chooseBossRelic":
			return stepChooseBossRelic(state, command.index, events);
		case "chooseCard":
			result = stepChooseCard(state, command.indices, events);
			return checkCombatEnd(result);
		case "proceed":
			return stepProceed(state, events);
		default:
			return { state, events };
	}
	return checkCombatEnd(result);
}

function stepPlayCard(
	state: GameState,
	handIndex: number,
	targetIndex: number,
	events: GameEvent[],
): StepResult {
	const combat = state.combat;
	if (!combat || state.phase.type !== "combat") return { state, events };

	const card = combat.hand[handIndex];
	if (!card) return { state, events };

	// Data cost -2 marks unplayable cards (status/curse); costForTurn alone cannot block them.
	if (getCard(card.id)?.cost === -2) return { state, events };

	const def = getCard(card.id);

	const baseCost = card.freeToPlay ? 0 : card.costForTurn;
	const costResult = foldHook(state, { type: "player" }, "modifyCardCost", baseCost, card);
	const cost = Math.max(0, costResult.value);
	if (cost > combat.energy) return { state, events };

	if (def?.type === "attack") {
		const target = combat.monsters[targetIndex];
		if (!target || target.currentHp <= 0) return { state, events };
	}

	const playerRef: ActorRef = { type: "player" };
	if (!vetoHook(state, playerRef, "canPlayCard", card)) return { state, events };

	const hand = combat.hand.filter((_, i) => i !== handIndex);
	let s: GameState = {
		...state,
		combat: {
			...combat,
			energy: combat.energy - cost,
			hand,
			cardsPlayedThisTurn: combat.cardsPlayedThisTurn + 1,
		},
	};

	events.push({
		type: "cardPlayed",
		card,
		target: { type: "monster", index: targetIndex },
	});

	const actions = resolveCardEffect(s, card, targetIndex);
	for (const action of actions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}

	({ state: s } = drainActions(s, events));

	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "onAfterCardPlayed", card));

	s = exhaustOrDiscard(s, card, events);
	s = replayIfDoubleTap(s, card, targetIndex, events);

	return { state: s, events };
}

function exhaustOrDiscard(s: GameState, card: CardInstance, events: GameEvent[]): GameState {
	if (!s.combat) return s;
	const def = getCard(card.id);
	const exhausts =
		(def?.flags.includes("exhaust") ?? false) ||
		(def?.type === "skill" && s.combat.player.powers.some((p) => p.id === "corruption"));
	s = {
		...s,
		combat: exhausts
			? { ...s.combat, exhaustPile: [...s.combat.exhaustPile, card] }
			: { ...s.combat, discardPile: [...s.combat.discardPile, card] },
	};
	if (exhausts) {
		events.push({ type: "cardExhausted", card });
		s = fireHook(s, { type: "player" }, "onExhaust", card);
	}
	return s;
}

function replayIfDoubleTap(
	s: GameState,
	card: CardInstance,
	targetIndex: number,
	events: GameEvent[],
): GameState {
	if (!s.combat) return s;
	const def = getCard(card.id);
	if (def?.type !== "attack") return s;
	const dtIdx = s.combat.player.powers.findIndex((p) => p.id === "doubleTap" && p.amount > 0);
	if (dtIdx < 0) return s;
	const powers = [...s.combat.player.powers];
	const dt = powers[dtIdx]!;
	powers[dtIdx] = { ...dt, amount: dt.amount - 1 };
	s = { ...s, combat: { ...s.combat, player: { ...s.combat.player, powers } } };
	const replayActions = resolveCardEffect(s, card, targetIndex);
	for (const action of replayActions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}
	({ state: s } = drainActions(s, events));
	return s;
}

function stepEndTurn(state: GameState, events: GameEvent[]): StepResult {
	const combat = state.combat;
	if (!combat || state.phase.type !== "combat") return { state, events };

	// 1. Discard remaining hand (ethereal → exhaust, burn → damage)
	const toDiscard = [];
	const toExhaust = [];
	for (const card of combat.hand) {
		const def = getCard(card.id);
		if (def?.flags.includes("ethereal")) {
			toExhaust.push(card);
			events.push({ type: "cardExhausted", card });
		} else {
			toDiscard.push(card);
			events.push({ type: "cardDiscarded", card });
		}
	}
	let s: GameState = {
		...state,
		combat: {
			...combat,
			hand: [],
			discardPile: [...combat.discardPile, ...toDiscard],
			exhaustPile: [...combat.exhaustPile, ...toExhaust],
		},
	};

	// Burn cards deal damage when discarded at end of turn
	for (const card of toDiscard) {
		if (card.id === ("BURN" as never)) {
			const def = getCard(card.id);
			const dmg = (card.upgraded ? def?.upgrade.magic : def?.values.magic) ?? 2;
			s = { ...s, currentHp: Math.max(0, s.currentHp - dmg) };
			events.push({ type: "hpLost", target: { type: "player" }, amount: dmg });
		}
	}

	events.push({ type: "turnEnded", turn: combat.turn });

	// 2. Clear block (player + monsters), respecting barricade
	const playerRef: ActorRef = { type: "player" };
	const blockRetain = foldHook(s, playerRef, "modifyBlockRetention", 0);
	s = blockRetain.state;
	if (s.combat) {
		const retainedBlock = Math.min(blockRetain.value, s.combat.player.block);
		const clearedMonsters = s.combat.monsters.map((m) => (m.alive ? { ...m, block: 0 } : m));
		s = {
			...s,
			combat: {
				...s.combat,
				player: { ...s.combat.player, block: retainedBlock },
				monsters: clearedMonsters,
			},
		};
	}

	// 3. Fire atEndOfTurn for all actors (Metallicize etc. — after block clear)
	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "atEndOfTurn", true));

	// 4. Monster turns: execute current intent, roll next move
	s = executeMonsterTurns(s, events);

	// 5. End of round: tick turn-based powers, fire atEndOfRound (Ritual etc.)
	s = fireHookOnAllActors(s, (st, actor) => tickTurnBasedPowers(st, actor, TURN_BASED_POWER_IDS));

	// 6. New turn: restore energy, increment turn, draw 5
	const c = s.combat;
	if (!c) return { state: s, events };

	const newTurn = c.turn + 1;

	s = {
		...s,
		combat: {
			...c,
			turn: newTurn,
			energy: c.maxEnergy,
			cardsPlayedThisTurn: 0,
			cardsDiscardedThisTurn: 0,
			actionQueue: [],
		},
		phase: { type: "combat", turn: newTurn },
	};

	// Remove Entangled at start of turn
	if (s.combat) {
		const pp = s.combat.player.powers.filter((p) => p.id !== "ENTANGLED");
		if (pp.length !== s.combat.player.powers.length) {
			s = { ...s, combat: { ...s.combat, player: { ...s.combat.player, powers: pp } } };
		}
	}

	// 6. Fire atStartOfTurn for all actors (Demon Form, Metallicize end-block etc.)
	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "atStartOfTurn"));

	// Enqueue draw 5 and drain
	s = { ...s, combat: addToBot(s.combat as typeof c, { type: "drawCards", count: 5 }) };
	({ state: s } = drainActions(s, events));

	// 7. Fire atStartOfTurnPostDraw
	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "atStartOfTurnPostDraw"));

	events.push({ type: "turnStarted", turn: newTurn });

	return { state: s, events };
}

function stepChooseMapNode(
	state: GameState,
	x: number,
	y: number,
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "map") return { state, events };

	const node = state.map.nodes[y]?.[x];
	if (!node) return { state, events };

	// Validate reachability
	if (!isNodeReachable(state, x, y)) return { state, events };

	const newMap = {
		...state.map,
		currentNode: { x, y },
		visitedNodes: [...state.map.visitedNodes, { x, y }],
	};

	let s: GameState = { ...state, map: newMap, floor: y + 1 };

	switch (node.type) {
		case "monster":
		case "elite": {
			const monsterIds = pickEncounter(s, node.type);
			s = initCombat({ ...s, encounterIndex: advanceEncounterIndex(s, node.type) }, monsterIds);
			s = fireHook(s, { type: "player" }, "atBattleStart");
			events.push({ type: "combatStarted" });
			break;
		}
		case "boss": {
			const bossId = s.encounterLists.boss;
			const monsterIds = getEncounterMonsters(bossId);
			s = initCombat(s, monsterIds);
			s = fireHook(s, { type: "player" }, "atBattleStart");
			events.push({ type: "combatStarted" });
			break;
		}
		case "rest":
			s = { ...s, phase: { type: "rest" } };
			break;
		case "shop": {
			const shopResult = generateShop(s);
			s = {
				...s,
				rng: { ...s.rng, merchantRng: shopResult.rng },
				phase: { type: "shop", shop: shopResult.shop },
			};
			break;
		}
		case "treasure": {
			const withRelic = obtainRandomRelic(s);
			s = { ...withRelic, phase: { type: "reward", cardRewards: [], potionReward: null, gold: 0 } };
			break;
		}
		case "event": {
			const eventResult = pickEvent(s.rng.eventRng);
			s = {
				...s,
				rng: { ...s.rng, eventRng: eventResult.rng },
				phase: { type: "event", eventId: eventResult.eventId },
			};
			break;
		}
	}

	return { state: s, events };
}

function isNodeReachable(state: GameState, x: number, y: number): boolean {
	const current = state.map.currentNode;
	if (!current) return y === 0;
	if (y !== current.y + 1) return false;
	const currentNode = state.map.nodes[current.y]?.[current.x];
	return currentNode?.edges.some((e) => e.x === x && e.y === y) ?? false;
}

function pickEncounter(state: GameState, roomType: "monster" | "elite"): MonsterId[] {
	if (roomType === "elite") {
		const idx = state.encounterIndex.elite;
		const encId = state.encounterLists.elites[idx % state.encounterLists.elites.length];
		return getEncounterMonsters(encId ?? "");
	}
	// First 3 floors use weak pool, then strong
	const isWeak = state.encounterIndex.weak < state.encounterLists.weak.length;
	if (isWeak) {
		const idx = state.encounterIndex.weak;
		const encId = state.encounterLists.weak[idx];
		return getEncounterMonsters(encId ?? "");
	}
	const idx = state.encounterIndex.strong;
	const encId = state.encounterLists.strong[idx % state.encounterLists.strong.length];
	return getEncounterMonsters(encId ?? "");
}

function advanceEncounterIndex(
	state: GameState,
	roomType: "monster" | "elite",
): GameState["encounterIndex"] {
	const idx = { ...state.encounterIndex };
	if (roomType === "elite") {
		idx.elite++;
	} else if (idx.weak < state.encounterLists.weak.length) {
		idx.weak++;
	} else {
		idx.strong++;
	}
	return idx;
}

function stepChooseCardReward(state: GameState, index: number, events: GameEvent[]): StepResult {
	if (state.phase.type !== "reward") return { state, events };
	const card = state.phase.cardRewards[index];
	if (!card) return { state, events };

	let uid = 1;
	for (const c of state.deck) {
		if (c.uniqueId >= uid) uid = c.uniqueId + 1;
	}

	const def = getCard(card);
	const newCard = {
		id: card,
		uniqueId: uid,
		upgraded: false,
		costOverride: null,
		costForTurn: def?.cost ?? 1,
		freeToPlay: false,
		misc: 0,
	};
	events.push({ type: "cardRewardChosen", card });
	const nextPhase = afterRewardPhase(state);
	return {
		state: {
			...state,
			deck: [...state.deck, newCard],
			combat: null,
			phase: nextPhase,
		},
		events,
	};
}

function stepSkipCardReward(state: GameState, events: GameEvent[]): StepResult {
	if (state.phase.type !== "reward") return { state, events };
	const nextPhase = afterRewardPhase(state);
	return { state: { ...state, combat: null, phase: nextPhase }, events };
}

function stepRest(state: GameState, events: GameEvent[]): StepResult {
	if (state.phase.type !== "rest") return { state, events };
	const healAmount = Math.floor(state.maxHp * 0.3);
	const newHp = Math.min(state.maxHp, state.currentHp + healAmount);
	const healed = newHp - state.currentHp;
	events.push({ type: "healed", target: { type: "player" }, amount: healed });
	return { state: { ...state, currentHp: newHp, combat: null, phase: { type: "map" } }, events };
}

function stepSmith(state: GameState, cardIndex: number, events: GameEvent[]): StepResult {
	if (state.phase.type !== "rest") return { state, events };
	const card = state.deck[cardIndex];
	if (!card || card.upgraded) return { state, events };

	const def = getCard(card.id);
	const newCost = def?.upgrade.cost ?? card.costForTurn;
	const newDeck = [...state.deck];
	newDeck[cardIndex] = { ...card, upgraded: true, costForTurn: newCost };

	return {
		state: { ...state, deck: newDeck, combat: null, phase: { type: "map" } },
		events,
	};
}

function stepProceed(state: GameState, events: GameEvent[]): StepResult {
	switch (state.phase.type) {
		case "reward": {
			const nextPhase = afterRewardPhase(state);
			return { state: { ...state, combat: null, phase: nextPhase }, events };
		}
		case "rest":
		case "shop":
		case "event":
			return { state: { ...state, combat: null, phase: { type: "map" } }, events };
		default:
			return { state, events };
	}
}

function checkCombatEnd(result: StepResult): StepResult {
	const { state, events } = result;
	const combat = state.combat;
	if (!combat) return result;
	if (state.phase.type !== "combat") return result;

	if (state.currentHp <= 0) {
		events.push({ type: "combatEnded", victory: false });
		return { state: { ...state, phase: { type: "gameOver", victory: false } }, events };
	}

	const allDead = combat.monsters.every((m) => !m.alive);
	if (allDead) {
		events.push({ type: "combatEnded", victory: true });

		const s = fireHook(state, { type: "player" }, "onVictory");

		if (s.currentHp !== state.currentHp) {
			events.push({
				type: "healed",
				target: { type: "player" },
				amount: s.currentHp - state.currentHp,
			});
		}

		const goldResult = rollGoldReward(s);
		const reward = generateCardReward({ ...s, rng: { ...s.rng, miscRng: goldResult.rng } });
		const potionResult = rollPotionDrop(s.rng.potionRng, s.potionSlots, s.potions);
		const newRng = {
			...s.rng,
			miscRng: goldResult.rng,
			cardRng: reward.rng,
			potionRng: potionResult.rng,
		};
		events.push({ type: "goldChanged", delta: goldResult.gold });
		events.push({ type: "cardRewardOffered", cards: reward.cards });
		return {
			state: {
				...s,
				gold: s.gold + goldResult.gold,
				rng: newRng,
				phase: {
					type: "reward",
					cardRewards: reward.cards,
					potionReward: potionResult.potion,
					gold: goldResult.gold,
				},
			},
			events,
		};
	}

	return result;
}

function executeMonsterTurns(state: GameState, events: GameEvent[]): GameState {
	let s = state;
	const combat = s.combat;
	if (!combat) return s;

	for (let i = 0; i < combat.monsters.length; i++) {
		const monster = s.combat?.monsters[i];
		if (!monster?.alive) continue;

		const moveId = monster.intent.moveId;
		const actions = resolveMonsterMove(monster, moveId, s.ascension, s.currentHp);

		for (const action of actions) {
			if (!s.combat) break;
			s = { ...s, combat: addToBot(s.combat, action) };
		}
		({ state: s } = drainActions(s, events));

		// Update history BEFORE rolling next move so the AI sees the just-executed move
		if (s.combat) {
			const ms1 = [...s.combat.monsters];
			const m1 = ms1[i];
			if (m1) {
				ms1[i] = { ...m1, moveHistory: [...m1.moveHistory, moveId] };
				s = { ...s, combat: { ...s.combat, monsters: ms1 } };
			}
		}

		const { moveId: nextMoveId, state: s2 } = rollMonsterMove(s, i);
		s = s2;

		if (s.combat) {
			const ms2 = [...s.combat.monsters];
			const m2 = ms2[i];
			if (m2) {
				ms2[i] = { ...m2, intent: buildIntent(m2, nextMoveId, s.ascension, s.currentHp) };
				s = { ...s, combat: { ...s.combat, monsters: ms2 } };
			}
		}
	}
	return s;
}
