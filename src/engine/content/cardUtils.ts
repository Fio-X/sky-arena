import type { Action, CardInstance, GameState } from "../core/types";
import { random } from "../rng/stsRandom";
import { getAllCards, getCard } from "./loader";

export function vals(card: CardInstance) {
	const def = getCard(card.id);
	if (!def) return { damage: 0, block: 0, magic: 0, hits: 1 };
	const v = card.upgraded
		? {
				damage: def.upgrade.damage ?? def.values.damage,
				block: def.upgrade.block ?? def.values.block,
				magic: def.upgrade.magic ?? def.values.magic,
				hits: def.upgrade.hits ?? def.values.hits,
			}
		: def.values;
	return {
		damage: v.damage ?? 0,
		block: v.block ?? 0,
		magic: v.magic ?? 0,
		hits: v.hits ?? 1,
	};
}

export const P = { type: "player" as const };
export const M = (i: number) => ({ type: "monster" as const, index: i });

export function exhaustRandomCard(st: GameState): GameState {
	if (!st.combat) return st;
	const hand = st.combat.hand;
	if (hand.length === 0) return st;
	const r = random(st.rng.cardRng, hand.length - 1);
	const idx = r.value;
	const card = hand[idx]!;
	return {
		...st,
		rng: { ...st.rng, cardRng: r.state },
		combat: {
			...st.combat,
			hand: hand.filter((_, i) => i !== idx),
			exhaustPile: [...st.combat.exhaustPile, card],
		},
	};
}

export function getAllCardsByColorAndType(color: string, type: string) {
	return getAllCards().filter((c) => c.color === color && c.type === type && !c.unobtainable);
}

export type { Action };
