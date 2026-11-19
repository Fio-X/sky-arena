import { generateCardReward } from "../combat/cardReward";
import { allMonstersGone } from "../combat/death";
import { getEncounterMonsters } from "../combat/encounters";
import { initCombat } from "../combat/init";
import { resolveCardEffect } from "../content/cardEffects";
import { getCard } from "../content/loader";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { afterRewardPhase, rollGoldReward, stepChooseBossRelic } from "./bossReward";
import { stepChooseCard } from "./cardSelect";
import { obtainRandomRelic, pickEvent, stepChooseEventOption } from "./event";
import { fireHook, fireHookOnAllActors, fireRunHook, foldHook, vetoHook } from "./hooks";
import { stepChooseNeowBlessing } from "./neow";
import { obtainCard } from "./obtain";
import { gainGold } from "./playerActions";
import { rollPotionDrop, stepDiscardPotion, stepObtainPotionReward, stepUsePotion } from "./potion";
import { replayIfAmplify, replayIfBurst, replayIfDoubleTap, replayIfEchoForm } from "./replay";
import { generateShop, stepChooseShopItem, stepShopPurge } from "./shop";
import { stepEndTurn } from "./turn";
import type { ActorRef, CardInstance, Command, GameEvent, GameState, StepResult } from "./types";

export function step(state: GameState, command: Command): StepResult {
	const events: GameEvent[] = [];
	let result: StepResult;
	switch (command.type) {
		case "playCard":
			result = honorEndTurnRequest(
				checkCombatEnd(stepPlayCard(state, command.handIndex, command.targetIndex, events)),
			);
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

/** A hook asked to end the player's turn early (Time Eater's Time Warp at 12 cards). */
function honorEndTurnRequest(result: StepResult): StepResult {
	const combat = result.state.combat;
	if (!combat?.endTurnRequested || result.state.phase.type !== "combat") return result;
	const s = { ...result.state, combat: { ...combat, endTurnRequested: false } };
	return stepEndTurn(s, result.events);
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

	let baseCost = card.freeToPlay ? 0 : card.costForTurn;
	if (card.id === "EVISCERATE") baseCost = Math.max(0, baseCost - combat.cardsDiscardedThisTurn);
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
	s = fireHook(s, playerRef, "onUseCard", card); // after queuing, before resolving (Rage)

	({ state: s } = drainActions(s, events));

	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "onAfterCardPlayed", card));

	s = exhaustOrDiscard(s, card, events);
	s = replayIfDoubleTap(s, card, targetIndex, events);
	s = replayIfBurst(s, card, targetIndex, events);
	s = replayIfEchoForm(s, card, targetIndex, events);
	s = replayIfAmplify(s, card, targetIndex, events);

	return { state: s, events };
}

function exhaustOrDiscard(s: GameState, card: CardInstance, events: GameEvent[]): GameState {
	if (!s.combat) return s;
	const def = getCard(card.id);
	const cardFlags = card.upgraded ? (def?.upgrade.flags ?? def?.flags ?? []) : (def?.flags ?? []);
	const exhausts =
		cardFlags.includes("exhaust") ||
		(def?.type === "skill" && s.combat.player.powers.some((p) => p.id === "corruption"));
	if (exhausts) {
		s = {
			...s,
			combat: { ...s.combat, exhaustPile: [...s.combat.exhaustPile, card] },
		};
		events.push({ type: "cardExhausted", card });
		s = fireHook(s, { type: "player" }, "onExhaust", card);
	} else {
		// REBOUND: put on top of draw pile instead of discard
		const reboundPower = s.combat.player.powers.find((p) => p.id === "REBOUND");
		if (reboundPower) {
			const powers = s.combat.player.powers.filter((p) => p.id !== "REBOUND");
			s = {
				...s,
				combat: {
					...s.combat,
					player: { ...s.combat.player, powers },
					drawPile: [...s.combat.drawPile, card],
				},
			};
		} else {
			s = {
				...s,
				combat: { ...s.combat, discardPile: [...s.combat.discardPile, card] },
			};
		}
	}
	return s;
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

	if (!isNodeReachable(state, x, y)) return { state, events };

	const newMap = {
		...state.map,
		currentNode: { x, y },
		visitedNodes: [...state.map.visitedNodes, { x, y }],
	};

	let s: GameState = { ...state, map: newMap, floor: state.floor + 1 };
	s = fireRunHook(s, "onEnterRoom", node.type);

	switch (node.type) {
		case "monster":
		case "elite": {
			const encId = pickEncounter(s, node.type);
			const next = { ...s, encounterIndex: advanceEncounterIndex(s, node.type) };
			s = initCombat(next, getEncounterMonsters(encId), encId);
			s = fireHook(s, { type: "player" }, "atBattleStart");
			events.push({ type: "combatStarted" });
			break;
		}
		case "boss": {
			const bossId = s.encounterLists.boss;
			s = initCombat(s, getEncounterMonsters(bossId), bossId);
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
			const eventResult = pickEvent(s.rng.eventRng, s.act);
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

function pickEncounter(state: GameState, roomType: "monster" | "elite"): string {
	const { encounterIndex: idx, encounterLists: lists } = state;
	if (roomType === "elite") return lists.elites[idx.elite % lists.elites.length] ?? "";
	if (idx.weak < lists.weak.length) return lists.weak[idx.weak] ?? "";
	return lists.strong[idx.strong % lists.strong.length] ?? "";
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

	events.push({ type: "cardRewardChosen", card });
	const nextPhase = afterRewardPhase(state);
	return {
		state: { ...obtainCard({ ...state, combat: null }, card), phase: nextPhase },
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

	if (allMonstersGone(state)) {
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
		const withGold = gainGold({ ...s, rng: newRng }, goldResult.gold, events);
		events.push({ type: "cardRewardOffered", cards: reward.cards });
		return {
			state: {
				...withGold,
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
