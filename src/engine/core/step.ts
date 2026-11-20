import { generateCardReward } from "../combat/cardReward";
import { allMonstersGone } from "../combat/death";
import { getEncounterMonsters } from "../combat/encounters";
import { initCombat } from "../combat/init";
import { resolveCardEffect } from "../content/cardEffects";
import { getCard } from "../content/loader";
import { relicVal } from "../content/relicHelpers";
import * as relicRules from "../content/relicsCombatRules";
import {
	addRelicCombatRewards,
	dreamCatcherReward,
	openTreasureChest,
	rollTinyChest,
	stepChooseDeckCards,
	stepRestOption,
	stepSingingBowl,
} from "../content/relicsRun2";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { drainAutoplay } from "./autoplay";
import { afterRewardPhase, rollGoldReward, stepChooseBossRelic } from "./bossReward";
import { stepChooseCard } from "./cardSelect";
import { pickEvent, stepChooseEventOption } from "./event";
import { fireHook, fireHookOnAllActors, fireRunHook, foldHook, vetoHook } from "./hooks";
import { stepChooseNeowBlessing } from "./neow";
import { hasRelic, obtainCard } from "./obtain";
import { gainGold } from "./playerActions";
import { rollPotionDrop, stepDiscardPotion, stepObtainPotionReward, stepUsePotion } from "./potion";
import {
	replayIfAmplify,
	replayIfBurst,
	replayIfDoubleTap,
	replayIfDuplication,
	replayIfEchoForm,
	replayIfNecronomicon,
} from "./replay";
import { generateShop, stepChooseShopItem, stepShopPurge } from "./shop";
import { stepEndTurn } from "./turn";
import type {
	ActorRef,
	CardInstance,
	Command,
	GameEvent,
	GameState,
	MapNode,
	StepResult,
} from "./types";

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
			return checkCombatEnd(drainAutoplay(result, stepPlayCard));
		case "discardPotion":
			return stepDiscardPotion(state, command.index, events);
		case "obtainPotionReward":
			return stepObtainPotionReward(state, events);
		case "chooseBossRelic":
			return stepChooseBossRelic(state, command.index, events);
		case "chooseCard":
			result = stepChooseCard(state, command.indices, events);
			return checkCombatEnd(drainAutoplay(result, stepPlayCard));
		case "proceed":
			return stepProceed(state, events);
		case "chooseDeckCards":
			return stepChooseDeckCards(state, command.indices, events);
		case "restOption":
			return stepRestOption(state, command.option, events);
		case "singingBowl":
			return stepSingingBowl(state, events);
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
	const def = getCard(card.id);
	// Data cost -2 marks unplayable cards (status/curse); costForTurn alone cannot block them.
	// Blue Candle / Medical Kit make them playable (no effect; exhausted).
	const relicPlay = def?.cost === -2 && relicRules.playableByRelic(state, card);
	if (def?.cost === -2 && !relicPlay) return { state, events };

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

	// X cost: energy spent is all energy (Necronomicon checks it).
	const energySpent = def?.cost === -1 ? combat.energy : cost;
	const actions = relicPlay ? [] : resolveCardEffect(s, card, targetIndex);
	for (const action of actions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}
	s = fireHook(s, playerRef, "onUseCard", card); // after queuing, before resolving (Rage)

	({ state: s } = drainActions(s, events));

	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "onAfterCardPlayed", card));

	s = exhaustOrDiscard(s, card, events, relicPlay);
	s = replayIfDoubleTap(s, card, targetIndex, events);
	s = replayIfBurst(s, card, targetIndex, events);
	s = replayIfEchoForm(s, card, targetIndex, events);
	s = replayIfAmplify(s, card, targetIndex, events);
	s = replayIfNecronomicon(s, card, targetIndex, events, energySpent);
	s = replayIfDuplication(s, card, targetIndex, events);

	return { state: s, events };
}

function exhaustOrDiscard(
	state: GameState,
	card: CardInstance,
	events: GameEvent[],
	forceExhaust: boolean,
): GameState {
	let s = state;
	if (!s.combat) return s;
	const def = getCard(card.id);
	const cardFlags = card.upgraded ? (def?.upgrade.flags ?? def?.flags ?? []) : (def?.flags ?? []);
	let exhausts =
		forceExhaust ||
		cardFlags.includes("exhaust") ||
		(def?.type === "skill" && s.combat.player.powers.some((p) => p.id === "corruption"));
	if (exhausts) {
		const spoon = relicRules.strangeSpoon(s, card);
		s = spoon.state;
		exhausts = !spoon.spoon;
	}
	if (!s.combat) return s;
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
	if (!isEdgeReachable(state, x, y)) s = spendWingBoots(s);
	s = fireRunHook(s, "onEnterRoom", node.type);

	let roomType = node.type;
	if (roomType === "event") {
		const tiny = rollTinyChest(s);
		s = tiny.state;
		if (tiny.treasure) roomType = "treasure";
	}

	switch (roomType) {
		case "monster":
		case "elite": {
			const encId = pickEncounter(s, roomType);
			const next = { ...s, encounterIndex: advanceEncounterIndex(s, roomType) };
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
		case "treasure":
			s = openTreasureChest({
				...s,
				phase: { type: "reward", cardRewards: [], potionReward: null, gold: 0 },
			});
			break;
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

/** A node the player may travel to next (map UI uses this too). */
export function isNodeReachable(state: GameState, x: number, y: number): boolean {
	return isEdgeReachable(state, x, y) || canFlyTo(state, x, y);
}

function isEdgeReachable(state: GameState, x: number, y: number): boolean {
	const current = state.map.currentNode;
	if (!current) return y === 0;
	if (y !== current.y + 1) return false;
	const currentNode = state.map.nodes[current.y]?.[current.x];
	return currentNode?.edges.some((e) => e.x === x && e.y === y) ?? false;
}

/** Wing Boots: while charges remain, any map node of the next row (not off-path grid cells). */
function canFlyTo(state: GameState, x: number, y: number): boolean {
	const current = state.map.currentNode;
	if (!current || y !== current.y + 1) return false;
	const boots = state.relics.find((r) => r.id === "WING_BOOTS");
	if (!boots || boots.counter <= 0) return false;
	const node = state.map.nodes[y]?.[x];
	if (!node) return false;
	const onPath = (row: readonly MapNode[] | undefined) =>
		row?.some((n) => n.edges.some((e) => e.x === x && e.y === y)) ?? false;
	return node.edges.length > 0 || onPath(state.map.nodes[current.y]);
}

/** A flight spends one Wing Boots charge; at 0 the relic is used up (counter −2). */
function spendWingBoots(state: GameState): GameState {
	const relics = state.relics.map((r) => {
		if (r.id !== "WING_BOOTS") return r;
		const counter = r.counter - 1;
		return { ...r, counter: counter <= 0 ? -2 : counter };
	});
	return { ...state, relics };
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
	// Coffee Dripper: the Rest option is disabled.
	if (state.phase.type !== "rest" || hasRelic(state, "COFFEE_DRIPPER")) return { state, events };
	// Regal Pillow: +15 on top of 30% max HP.
	const pillow = hasRelic(state, "REGAL_PILLOW") ? relicVal("REGAL_PILLOW", 0, 15) : 0;
	const healAmount = Math.floor(state.maxHp * 0.3) + pillow;
	const newHp = Math.min(state.maxHp, state.currentHp + healAmount);
	const healed = newHp - state.currentHp;
	events.push({ type: "healed", target: { type: "player" }, amount: healed });
	const rested: GameState = { ...state, currentHp: newHp, combat: null, phase: { type: "map" } };
	return { state: dreamCatcherReward(rested), events };
}

function stepSmith(state: GameState, cardIndex: number, events: GameEvent[]): StepResult {
	// Fusion Hammer: the Smith option is disabled.
	if (state.phase.type !== "rest" || hasRelic(state, "FUSION_HAMMER")) return { state, events };
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
	const { events } = result;
	// Lizard Tail: deaths outside the damage/HP-loss actions (powers that set HP directly).
	const state = relicRules.preventPlayerDeath(result.state, events);
	const combat = state.combat;
	if (!combat || state.phase.type !== "combat") return { state, events };

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
		const potionChance = hasRelic(s, "WHITE_BEAST_STATUE") ? 100 : 40;
		const potionResult = rollPotionDrop(s.rng.potionRng, s.potions, potionChance, s.character);
		const newRng = {
			...s.rng,
			miscRng: goldResult.rng,
			cardRng: reward.rng,
			potionRng: potionResult.rng,
		};
		const withGold = gainGold({ ...s, rng: newRng }, goldResult.gold, events);
		events.push({ type: "cardRewardOffered", cards: reward.cards });
		// Prayer Wheel (second card reward), Black Star (extra elite relic).
		const withExtras = addRelicCombatRewards({
			...withGold,
			phase: {
				type: "reward",
				cardRewards: reward.cards,
				potionReward: potionResult.potion,
				gold: goldResult.gold,
			},
		});
		return { state: withExtras, events };
	}

	return { state, events };
}
