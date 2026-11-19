import { random } from "../rng/stsRandom";
import type { CardInstance, RngState } from "./types";

/**
 * CardGroup.addToRandomSpot: empty pile → just add; otherwise insert at index
 * cardRandomRng.random(size - 1). Index 0 is the bottom and the end is the top,
 * so a random-spot card never lands on top.
 */
export function insertAtRandomSpot(
	pile: readonly CardInstance[],
	card: CardInstance,
	rng: RngState,
): { pile: CardInstance[]; rng: RngState } {
	if (pile.length === 0) return { pile: [card], rng };
	const roll = random(rng, pile.length - 1);
	const next = [...pile];
	next.splice(roll.value, 0, card);
	return { pile: next, rng: roll.state };
}
