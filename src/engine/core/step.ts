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
	stepChooseDeckCards,
	stepRestOption,
	stepSingingBowl,
} from "../content/relicsRun2";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { drainAutoplay } from "./autoplay";
import {
	afterRewardPhase,
	getCurrentRoomType,
	rollGoldReward,
	stepChooseBossRelic,
} from "./bossReward";
import { stepChooseCard } from "./cardSelect";
import { stepChooseEventOption } from "./event";
import { eventCombatVictory } from "./eventCombat";
import { generateEvent, rollQuestionRoom } from "./eventRoom";
import { fireHook, fireHookOnAllActors, fireRunHook, foldHook, vetoHook } from "./hooks";
import { applyEmeraldEliteBuff, inEmeraldElite, stepTakeChestRelic, stepTakeKey } from "./keys";
import { stepChooseNeowBlessing } from "./neow";
import { hasRelic, obtainCard } from "./obtain";
import { executePlayerHeal, gainGold } from "./playerActions";
import {
	rollPotionReward,
	stepDiscardPotion,
	stepObtainPotionReward,
	stepUsePotion,
} from "./potion";
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
			return outOfCombatDeath(stepChooseEventOption(state, command.index, events));
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
		case "takeKey":
			return stepTakeKey(state, command.key, events);
		case "takeChestRelic":
			return stepTakeChestRelic(state, events);
		default:
			return { state, events };
	}
	return checkCombatEnd(result);
}

/** Event HP loss to 0 (any event path): Fairy / Lizard Tail, or the run ends. */
function outOfCombatDeath(result: StepResult): StepResult {
	if (result.state.combat) return result;
	return { state: relicRules.endRunIfDead(result.state, result.events), events: result.events };
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

	if ((def?.target === "enemy" || def?.target === "selfandenemy") && targetAlive(s, targetIndex)) {
		s = fireHook(s, playerRef, "onTargetMonster", targetIndex); // Surrounded: turn around
	}

	// X cost: energy spent is all energy (Necronomicon checks it).
	const energySpent = def?.cost === -1 ? combat.energy : cost;
	const actions = relicPlay ? [] : resolveCardEffect(s, card, targetIndex);
	for (const action of actions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}
	// UseCardAction: every actor's powers (monsters too: Sharp Hide), after queuing, before resolving (Rage)
	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "onUseCard", card));

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

function targetAlive(state: GameState, index: number): boolean {
	return state.combat?.monsters[index]?.alive ?? false;
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
		// "?" room: monster / shop / treasure / event (EventHelper.roll).
		const q = rollQuestionRoom(s);
		s = q.state;
		roomType = q.room;
	}

	switch (roomType) {
		case "monster":
		case "elite": {
			const encId = pickEncounter(s, roomType);
			const next = { ...s, encounterIndex: advanceEncounterIndex(s, roomType) };
			s = initCombat(next, getEncounterMonsters(encId), encId);
			s = applyEmeraldEliteBuff(s, events);
			s = fireHook(s, { type: "player" }, "atBattleStart");
			events.push({ type: "combatStarted" });
			break;
		}
		case "boss": {
			// A20 Act 3: the second boss node fights boss2.
			const second = !!s.encounterLists.boss2 && previousBossCount(s) > 0;
			const bossId = second ? (s.encounterLists.boss2 ?? "") : s.encounterLists.boss;
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
			const picked = generateEvent(s);
			s = { ...picked.state, phase: { type: "event", eventId: picked.eventId } };
			break;
		}
	}

	return { state: s, events };
}

/** Boss rooms already visited in this act (the current one excluded). */
function previousBossCount(state: GameState): number {
	const visited = state.map.visitedNodes.slice(0, -1);
	return visited.filter((v) => state.map.nodes[v.y]?.[v.x]?.type === "boss").length;
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
	const upgraded = state.phase.cardRewardsUpgraded?.[index] ?? false;
	return {
		state: { ...obtainCard({ ...state, combat: null }, card, upgraded), phase: nextPhase },
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
	const healed = executePlayerHeal({ ...state, combat: null }, healAmount, events).state;
	const rested: GameState = { ...healed, phase: { type: "map" } };
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
		if (s.eventCombat) return { state: eventCombatVictory(s, events), events };
		// The Corrupt Heart is the end of the run: no rewards.
		if (s.act === 4 && getCurrentRoomType(s) === "boss") {
			return { state: { ...s, phase: { type: "gameOver", victory: true } }, events };
		}

		if (s.currentHp !== state.currentHp) {
			events.push({
				type: "healed",
				target: { type: "player" },
				amount: s.currentHp - state.currentHp,
			});
		}

		const goldResult = rollGoldReward(s);
		const reward = generateCardReward({ ...s, rng: { ...s.rng, miscRng: goldResult.rng } });
		const potionResult = rollPotionReward(s);
		const newRng = {
			...s.rng,
			miscRng: goldResult.rng,
			cardRng: reward.rng,
			potionRng: potionResult.state.rng.potionRng,
		};
		const withGold = gainGold(
			{ ...s, rng: newRng, potionChanceMod: potionResult.state.potionChanceMod },
			goldResult.gold,
			events,
		);
		events.push({ type: "cardRewardOffered", cards: reward.cards });
		// Prayer Wheel (second card reward), Black Star (extra elite relic).
		const withExtras = addRelicCombatRewards({
			...withGold,
			phase: {
				type: "reward",
				cardRewards: reward.cards,
				cardRewardsUpgraded: reward.upgraded,
				potionReward: potionResult.potion,
				gold: goldResult.gold,
				emeraldKey: inEmeraldElite(s),
			},
		});
		return { state: withExtras, events };
	}

	return { state, events };
}
