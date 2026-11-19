/**
 * Effect words from the Act 3/4 monster data (data-reference/monsters-act34.json)
 * that mean the same thing for every monster. Looked up by effect word, so
 * "AddCard:BURN:discard" reaches the "AddCard" handler (see findMoveEffect).
 */
import { registerMoveEffect } from "../combat/moveEffects";
import type { Action, CardId } from "../core/types";

/**
 * AddCard:<CARD>:<where>, amount = copies.
 * - discard: MakeTempCardInDiscardAction
 * - drawShuffle: MakeTempCardInDrawPileAction(randomSpot) — CardGroup.addToRandomSpot
 * - drawTop: on top of the draw pile
 * - hand: into the hand (dropped when the hand is full)
 * - masterDeck: AddCardToDeckAction (permanent; Writhing Mass → Parasite)
 */
function addCardActions(cardId: CardId, where: string, copies: number): Action[] {
	const one = (): Action | null => {
		switch (where) {
			case "discard":
				return { type: "addCardToDiscardPile", cardId, upgraded: false };
			case "drawShuffle":
				return {
					type: "addCardToDrawPile",
					cardId,
					upgraded: false,
					toTop: false,
					randomSpot: true,
				};
			case "drawTop":
				return { type: "addCardToDrawPile", cardId, upgraded: false, toTop: true };
			case "hand":
				return { type: "addCardToHand", cardId, upgraded: false };
			case "masterDeck":
				return { type: "addCardToMasterDeck", cardId };
			default:
				return null;
		}
	};
	const actions: Action[] = [];
	for (let i = 0; i < copies; i++) {
		const a = one();
		if (!a) throw new Error(`AddCard: unknown destination "${where}"`);
		actions.push(a);
	}
	return actions;
}

registerMoveEffect("AddCard", (_ctx, effect, actions) => {
	const [, cardId, where] = (effect.power ?? "").split(":");
	if (!cardId || !where) return [...actions];
	return [...actions, ...addCardActions(cardId as CardId, where, effect.amount ?? 1)];
});

/** SuicideAction: after the rest of the move (Exploder EXPLODE, Dagger EXPLODE). */
registerMoveEffect("Suicide", (ctx, _effect, actions) => [
	...actions,
	{ type: "monsterDie", monsterIndex: ctx.monster.index },
]);

/** DamageType.THORNS hit on the player (Exploder's 30). */
registerMoveEffect("NonAttackDamage", (ctx, effect, actions) => [
	...actions,
	{
		type: "damage",
		source: ctx.self,
		target: { type: "player" },
		baseDamage: effect.amount ?? 0,
		hits: 1,
		nonAttack: true,
	},
]);

/** Time Eater HASTE: heal up to half max HP (HealAction for maxHp/2 - currentHp). */
registerMoveEffect("HealToHalfMaxHp", (ctx, _effect, actions) => {
	const missing = Math.floor(ctx.monster.maxHp / 2) - ctx.monster.currentHp;
	return missing > 0
		? [...actions, { type: "heal", target: ctx.self, amount: missing }]
		: [...actions];
});

/** Time Eater HASTE: RemoveDebuffsAction on itself. */
registerMoveEffect("RemoveOwnDebuffs", (ctx, _effect, actions) => [
	...actions,
	{ type: "removeDebuffs", target: ctx.self },
]);
