import type { CardInstance } from "../core/types";
import { registerCardEffect } from "./cardEffects";
import { getCard } from "./loader";

/**
 * Status cards (data cost -2 = unplayable). stepPlayCard rejects them before
 * any effect runs; the registrations exist so the effect registry is complete
 * and the generic fallback never touches them.
 */

registerCardEffect("WOUND", () => []);
registerCardEffect("DAZED", () => []);

/** BURN: end-of-turn damage to the player (magic 2, upgraded 4). */
registerCardEffect("BURN", (_s, card: CardInstance) => {
	const def = getCard(card.id);
	const magic = (card.upgraded ? def?.upgrade.magic : def?.values.magic) ?? 2;
	const player = { type: "player" as const };
	return [{ type: "damage", source: player, target: player, baseDamage: magic, hits: 1 }];
});
