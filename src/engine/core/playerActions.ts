/**
 * Executors for player-side actions that had no case in the action executor
 * (gainGold, gainMaxHp, loseMaxHp, shuffle) and the hook dispatch around HP,
 * healing, gold and shuffling.
 */
import { stsShuffle } from "../rng/stsRandom";
import { fireHook, foldHook, foldRunHook } from "./hooks";
import type { Action, GameEvent, GameState } from "./types";

type Result = { state: GameState };
const PLAYER = { type: "player" } as const;

/** Gold gain anywhere (combat reward, events, cards): onGainGold may change or cancel it (Ectoplasm). */
export function gainGold(state: GameState, amount: number, events: GameEvent[]): GameState {
	const folded = foldRunHook(state, "onGainGold", amount);
	const gained = Math.max(0, Math.floor(folded.value));
	if (gained <= 0) return folded.state;
	events.push({ type: "goldChanged", delta: gained });
	return { ...folded.state, gold: folded.state.gold + gained };
}

export function executeGainGold(
	state: GameState,
	action: Extract<Action, { type: "gainGold" }>,
	events: GameEvent[],
): Result {
	return { state: gainGold(state, action.amount, events) };
}

export function executeGainMaxHp(
	state: GameState,
	action: Extract<Action, { type: "gainMaxHp" }>,
	events: GameEvent[],
): Result {
	if (action.amount <= 0) return { state };
	events.push({ type: "healed", target: PLAYER, amount: action.amount });
	return {
		state: {
			...state,
			maxHp: state.maxHp + action.amount,
			currentHp: state.currentHp + action.amount,
		},
	};
}

export function executeLoseMaxHp(
	state: GameState,
	action: Extract<Action, { type: "loseMaxHp" }>,
): Result {
	const maxHp = Math.max(1, state.maxHp - action.amount);
	return { state: { ...state, maxHp, currentHp: Math.min(state.currentHp, maxHp) } };
}

/** Player heal: onHeal folds the amount (Red Skull, Magic Flower, Mark of the Bloom). */
export function executePlayerHeal(state: GameState, amount: number, events: GameEvent[]): Result {
	const folded = state.combat
		? foldHook(state, PLAYER, "onHeal", amount)
		: { value: amount, state };
	const s = folded.state;
	const healed = Math.max(0, Math.min(Math.floor(folded.value), s.maxHp - s.currentHp));
	events.push({ type: "healed", target: PLAYER, amount: healed });
	return { state: { ...s, currentHp: s.currentHp + healed } };
}

/** Player HP loss (HP_LOSS type: Offering, Bloodletting, Combust…): onLoseHp (Rupture). */
export function executePlayerLoseHp(state: GameState, amount: number, events: GameEvent[]): Result {
	const newHp = Math.max(0, state.currentHp - amount);
	const lost = state.currentHp - newHp;
	events.push({ type: "hpLost", target: PLAYER, amount: lost });
	const s = { ...state, currentHp: newHp };
	return { state: lost > 0 ? fireHook(s, PLAYER, "onLoseHp", lost) : s };
}

/**
 * EmptyDeckShuffleAction: the discard pile is shuffled (shuffleRng) and placed
 * under the current draw pile, then onShuffle fires. Deep Breath additionally
 * reshuffles the whole draw pile in the original (not modelled).
 */
export function executeShuffle(state: GameState, events: GameEvent[]): Result {
	const combat = state.combat;
	if (!combat || combat.discardPile.length === 0) return { state };
	const shuffled = stsShuffle([...combat.discardPile], state.rng.shuffleRng);
	events.push({ type: "shuffled" });
	const s: GameState = {
		...state,
		rng: { ...state.rng, shuffleRng: shuffled.rng },
		combat: { ...combat, drawPile: [...shuffled.result, ...combat.drawPile], discardPile: [] },
	};
	return { state: fireHook(s, PLAYER, "onShuffle") };
}
