/**
 * Card effect registry — maps card IDs to their effect functions.
 *
 * Each card effect takes the game state, the played card, and the target,
 * and returns a list of Actions to enqueue.
 * This is the core bridge between card data and game logic.
 */

import type { Action, CardInstance, GameState } from "../core/types";
import type { CardDef } from "./loader";
import { getCard } from "./loader";

export type CardEffectFn = (state: GameState, card: CardInstance, targetIndex: number) => Action[];

const registry = new Map<string, CardEffectFn>();

export function registerCardEffect(cardId: string, effect: CardEffectFn): void {
	registry.set(cardId, effect);
}

export function getCardEffect(cardId: string): CardEffectFn | undefined {
	return registry.get(cardId);
}

export function hasCardEffect(cardId: string): boolean {
	return registry.has(cardId);
}

/**
 * Generate Actions for a card being played.
 * Falls back to a generic effect based on card data values if no
 * specific effect function is registered.
 */
export function resolveCardEffect(
	state: GameState,
	card: CardInstance,
	targetIndex: number,
): Action[] {
	const specific = registry.get(card.id);
	if (specific) return specific(state, card, targetIndex);
	return genericCardEffect(state, card, targetIndex);
}

/**
 * Generic effect: reads damage/block/magic from CardDef values.
 * Handles the most common card patterns without needing a registered function.
 * Complex cards (Whirlwind, Feed, Clash, etc.) must register specific effects.
 */
function genericCardEffect(_state: GameState, card: CardInstance, targetIndex: number): Action[] {
	const def = getCard(card.id);
	if (!def) return [];

	const values = card.upgraded ? mergeUpgrade(def) : def.values;
	const actions: Action[] = [];
	const player = { type: "player" as const };
	const target = { type: "monster" as const, index: targetIndex };

	if (values.damage != null) {
		actions.push({
			type: "damage",
			source: player,
			target,
			baseDamage: values.damage,
			hits: values.hits ?? 1,
		});
	}

	if (values.block != null) {
		actions.push({
			type: "block",
			source: player,
			amount: values.block,
		});
	}

	return actions;
}

function mergeUpgrade(def: CardDef) {
	return {
		damage: def.upgrade.damage ?? def.values.damage,
		block: def.upgrade.block ?? def.values.block,
		magic: def.upgrade.magic ?? def.values.magic,
		hits: def.upgrade.hits ?? def.values.hits,
	};
}
