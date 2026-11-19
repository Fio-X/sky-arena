/**
 * The one way cards and relics enter the run (rewards, shop, events, boss
 * relics, monster curses). Fires the run-level hooks relics listen to:
 * - onObtainCard (every relic/power): Ceramic Fish, eggs, Darkstone, Omamori
 * - onEquip (only the new relic): pickup effects (Strawberry, Old Coin…)
 */
import { getCard } from "../content/loader";
import { fireRelicHook, fireRunHook } from "./hooks";
import type { CardId, CardInstance, GameState, RelicId } from "./types";

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
	const card = makeDeckCard(state, cardId, upgraded);
	return fireRunHook({ ...state, deck: [...state.deck, card] }, "onObtainCard", card);
}

export function obtainRelic(state: GameState, relicId: RelicId): GameState {
	const s = { ...state, relics: [...state.relics, { id: relicId, counter: 0 }] };
	return fireRelicHook(s, relicId, "onEquip");
}
