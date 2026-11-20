/** Small helpers shared by the Act 1 and shrine event handlers. */
import type { EventChoice } from "../../core/eventRegistry";
import { obtainCard, obtainRelic } from "../../core/obtain";
import { executePlayerHeal } from "../../core/playerActions";
import type { CardId, DeckSelectTask, GameEvent, GamePhase, GameState } from "../../core/types";
import { endRunIfDead } from "../relicsCombatRules";
import { deckSelectPhase, eligibleIndices, rollRandomRelic } from "../relicsRun2";

export const a15 = (state: GameState): boolean => state.ascension >= 15;

export const curse = (state: GameState, id: string): GameState => obtainCard(state, id as CardId);

export const MAP: GamePhase = { type: "map" };
export const LEAVE: EventChoice = { label: "[Leave]", zh: "[离开]" };

export function screenOf(state: GameState): number {
	return state.phase.type === "event" ? (state.phase.screen ?? 0) : 0;
}

export function dataOf(state: GameState): Readonly<Record<string, number>> {
	return state.phase.type === "event" ? (state.phase.data ?? {}) : {};
}

export const toMap = (state: GameState): GameState => ({ ...state, phase: MAP });

/** (int)(maxHealth * f) with Java float arithmetic. */
export function pctOfMax(state: GameState, f: number): number {
	return Math.trunc(Math.fround(state.maxHp * Math.fround(f)));
}

/** MathUtils.round(maxHealth * f): floor(x + 0.5f). */
export function roundPctOfMax(state: GameState, f: number): number {
	return Math.floor(Math.fround(state.maxHp * Math.fround(f)) + 0.5);
}

export function heal(state: GameState, amount: number, events: GameEvent[]): GameState {
	return executePlayerHeal(state, amount, events).state;
}

/**
 * Event damage / HP loss (player.damage outside combat). At 0 HP Fairy in a
 * Bottle / Lizard Tail may save the player; otherwise the run ends.
 */
export function loseHp(state: GameState, amount: number, events: GameEvent[]): GameState {
	const newHp = Math.max(0, state.currentHp - amount);
	events.push({ type: "hpLost", target: { type: "player" }, amount: state.currentHp - newHp });
	return endRunIfDead({ ...state, currentHp: newHp }, events);
}

export function loseGold(state: GameState, amount: number, events: GameEvent[]): GameState {
	const lost = Math.min(amount, state.gold);
	if (lost > 0) events.push({ type: "goldChanged", delta: -lost });
	return { ...state, gold: state.gold - lost };
}

/** AbstractPlayer.decreaseMaxHealth. */
export function loseMaxHp(state: GameState, amount: number): GameState {
	const maxHp = Math.max(1, state.maxHp - amount);
	return { ...state, maxHp, currentHp: Math.min(state.currentHp, maxHp) };
}

export function gainMaxHpEvent(state: GameState, amount: number, events: GameEvent[]): GameState {
	events.push({ type: "healed", target: { type: "player" }, amount });
	return { ...state, maxHp: state.maxHp + amount, currentHp: state.currentHp + amount };
}

/** Pick one card from the deck (remove / transform / upgrade), then `next`. */
export function pickCard(state: GameState, task: DeckSelectTask, next: GamePhase = MAP): GameState {
	return deckSelectPhase(state, task, 1, next);
}

export const canPick = (state: GameState, task: DeckSelectTask): boolean =>
	eligibleIndices(state, task).length > 0;

const SCREEN_RELICS = ["BOTTLED_FLAME", "BOTTLED_LIGHTNING", "BOTTLED_TORNADO", "WHETSTONE"];

/**
 * returnRandomScreenlessRelic(returnRandomRelicTier()): 50/33/17 tier roll on
 * relicRng, never a relic whose pickup opens a card screen. Set the phase to
 * go to next BEFORE calling (a pickup choice keeps it as its `next`).
 */
export function obtainScreenlessRelic(state: GameState): GameState {
	const r = rollRandomRelic(state, SCREEN_RELICS);
	return r.id ? obtainRelic(r.state, r.id) : r.state;
}
