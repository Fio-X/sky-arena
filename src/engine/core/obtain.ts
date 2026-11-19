/**
 * The one way cards and relics enter the run (rewards, shop, events, boss
 * relics, monster curses). Fires the run-level hooks relics listen to:
 * - onObtainCard (every relic/power): Ceramic Fish, eggs, Darkstone
 * - onEquip (only the new relic): pickup effects (Strawberry, Old Coin…)
 *
 * A pickup that needs a choice (Astrolabe, Orrery…) sets state.phase to the
 * choice and keeps the phase it found as the choice's `next`. Callers therefore
 * set the phase they want to go to next BEFORE obtaining a relic.
 */
import { getCard } from "../content/loader";
import { fireRelicHook, fireRunHook } from "./hooks";
import type { CardId, CardInstance, GameState, RelicId } from "./types";

export function hasRelic(state: GameState, relicId: string): boolean {
	return state.relics.some((r) => r.id === relicId);
}

export function makeDeckCard(state: GameState, cardId: CardId, upgraded = false): CardInstance {
	const uid = state.deck.reduce((max, c) => Math.max(max, c.uniqueId), 0) + 1;
	return {
		id: cardId,
		uniqueId: uid,
		upgraded,
		costOverride: null,
		costForTurn: getCard(cardId as string)?.cost ?? 0,
		freeToPlay: false,
		misc: 0,
	};
}

export function obtainCard(state: GameState, cardId: CardId, upgraded = false): GameState {
	const negated = omamoriNegates(state, cardId);
	if (negated) return negated;
	const card = makeDeckCard(state, cardId, upgraded);
	return fireRunHook({ ...state, deck: [...state.deck, card] }, "onObtainCard", card);
}

/** Omamori: a curse is negated before it enters the deck (no onObtainCard). */
function omamoriNegates(state: GameState, cardId: CardId): GameState | null {
	if (getCard(cardId as string)?.type !== "curse") return null;
	const omamori = state.relics.find((r) => r.id === "OMAMORI");
	if (!omamori || omamori.counter <= 0) return null;
	return {
		...state,
		relics: state.relics.map((r) => (r === omamori ? { ...r, counter: r.counter - 1 } : r)),
	};
}

export function obtainRelic(state: GameState, relicId: RelicId): GameState {
	const s = { ...state, relics: [...state.relics, { id: relicId, counter: 0 }] };
	return fireRelicHook(s, relicId, "onEquip");
}
