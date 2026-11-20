import type { CardInstance, GameState } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";
import { getAllPotions, getCard } from "./loader";

// ── Rare attacks ────────────────────────────────────────

// Die Die Die: Deal 13(17) damage to ALL enemies. Exhaust. Cost 1.
registerCardEffect("DIE_DIE_DIE", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	return actions;
});

// Glass Knife: Deal 8(12) damage twice. Loses 2 damage each use this combat. Cost 1.
registerCardEffect("GLASS_KNIFE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "custom",
			execute: (st: GameState) => {
				if (!st.combat) return st;
				const updateCard = (c: CardInstance) =>
					c.uniqueId === card.uniqueId ? { ...c, misc: c.misc + 2 } : c;
				return {
					...st,
					combat: {
						...st.combat,
						hand: st.combat.hand.map(updateCard),
						drawPile: st.combat.drawPile.map(updateCard),
						discardPile: st.combat.discardPile.map(updateCard),
						exhaustPile: st.combat.exhaustPile.map(updateCard),
					},
				};
			},
		},
	];
});

// Grand Finale: Can only be played if draw pile is empty. Deal 50(60) to ALL. Cost 0.
registerCardEffect("GRAND_FINALE", (s, card, _t) => {
	const v = vals(card);
	const c = s.combat;
	if (!c || c.drawPile.length > 0) return [];
	const actions: Action[] = [];
	for (let i = 0; i < c.monsters.length; i++) {
		if (c.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	return actions;
});

// Unload: Deal 14(18) damage. Discard all non-Attack cards from hand. Cost 1.
registerCardEffect("UNLOAD", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	actions.push({
		type: "custom",
		execute: (st: GameState): GameState => {
			if (!st.combat) return st;
			const toDiscard: CardInstance[] = [];
			const hand: CardInstance[] = [];
			for (const c of st.combat.hand) {
				const def = getCard(c.id);
				if (def?.type !== "attack") {
					toDiscard.push(c);
				} else {
					hand.push(c);
				}
			}
			return {
				...st,
				combat: {
					...st.combat,
					hand,
					discardPile: [...st.combat.discardPile, ...toDiscard],
					cardsDiscardedThisTurn: st.combat.cardsDiscardedThisTurn + toDiscard.length,
				},
			};
		},
	});
	return actions;
});

// ── Rare skills ─────────────────────────────────────────

// Adrenaline: Gain 1(2) Energy. Draw 2 cards. Exhaust. Cost 0.
registerCardEffect("ADRENALINE", (_s, card, _t) => {
	const energy = card.upgraded ? 2 : 1;
	return [
		{ type: "gainEnergy", amount: energy },
		{ type: "drawCards", count: 2 },
	];
});

// Alchemize: Obtain a random potion. Exhaust. Cost 1(0).
registerCardEffect("ALCHEMIZE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				const potions = getAllPotions();
				if (potions.length === 0) return st;
				const r = random(st.rng.potionRng, potions.length - 1);
				const chosen = potions[r.value];
				if (!chosen) return st;
				const emptySlot = st.potions.indexOf(null);
				if (emptySlot === -1) return { ...st, rng: { ...st.rng, potionRng: r.state } };
				const newPotions = [...st.potions];
				newPotions[emptySlot] = chosen.id;
				return { ...st, rng: { ...st.rng, potionRng: r.state }, potions: newPotions };
			},
		},
	];
});

// Bullet Time: This turn, cards cost 0. Can't draw any more cards this turn. Cost 3(2).
registerCardEffect("BULLET_TIME", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => {
				if (!st.combat) return st;
				const hand = st.combat.hand.map((c) => ({ ...c, costForTurn: 0, freeToPlay: true }));
				return {
					...st,
					combat: {
						...st.combat,
						hand,
						player: {
							...st.combat.player,
							powers: [
								...st.combat.player.powers,
								{ id: "NO_DRAW" as never, amount: 1, justApplied: false },
							],
						},
					},
				};
			},
		},
	];
});

// Burst: Next 1(2) Skill(s) are played twice. Cost 1.
registerCardEffect("BURST", (_s, card, _t) => {
	const amount = card.upgraded ? 2 : 1;
	return [{ type: "applyPower", source: P, target: P, powerId: "BURST" as never, amount }];
});

// Corpse Explosion: Apply 6(9) Poison. When enemy dies, deal damage to all equal to max HP.
registerCardEffect("CORPSE_EXPLOSION", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: M(t), powerId: "POISON" as never, amount: v.magic },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "CORPSE_EXPLOSION" as never,
			amount: 1,
		},
	];
});

// Doppelganger: Next turn, gain X Energy and draw X cards. Exhaust. Cost X.
registerCardEffect("DOPPELGANGER", (s, _card, _t) => {
	const energy = s.combat?.energy ?? 0;
	return [
		{ type: "loseEnergy", amount: energy },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "energized" as never,
			amount: energy,
		},
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "DRAW_CARD_NEXT_TURN" as never,
			amount: energy,
		},
	];
});

// Malaise: Enemy loses X Strength. Apply X Weak. Exhaust. Cost X.
registerCardEffect("MALAISE", (s, _card, t) => {
	const energy = s.combat?.energy ?? 0;
	return [
		{ type: "loseEnergy", amount: energy },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "strength" as never,
			amount: -energy,
		},
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "weak" as never,
			amount: energy,
		},
	];
});

// Nightmare: Choose a card. Next turn, add 3 copies to your hand. Exhaust. Cost 3(2).
registerCardEffect("NIGHTMARE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "nightmare" as const },
			}),
		},
	];
});

// Phantasmal Killer: Next turn, your attacks deal double damage. Cost 1(0).
registerCardEffect("PHANTASMAL_KILLER", (_s, _card, _t) => {
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "PHANTASMAL" as never,
			amount: 1,
		},
	];
});

// Storm of Steel: Discard your hand. Add a Shiv for each card discarded. Cost 1.
registerCardEffect("STORM_OF_STEEL", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => {
				if (!st.combat) return st;
				const handCount = st.combat.hand.length;
				const discardPile = [...st.combat.discardPile, ...st.combat.hand];
				let combat = {
					...st.combat,
					hand: [] as CardInstance[],
					discardPile,
					cardsDiscardedThisTurn: st.combat.cardsDiscardedThisTurn + handCount,
				};
				const uid =
					Math.max(
						...[
							...combat.hand,
							...combat.drawPile,
							...combat.discardPile,
							...combat.exhaustPile,
						].map((c) => c.uniqueId),
						0,
					) + 1;
				const shivs: CardInstance[] = [];
				for (let i = 0; i < handCount; i++) {
					shivs.push({
						id: "SHIV" as never,
						upgraded: false,
						uniqueId: uid + i,
						costOverride: null,
						freeToPlay: false,
						costForTurn: 0,
						misc: 0,
					});
				}
				combat = { ...combat, hand: shivs.slice(0, 10) };
				return { ...st, combat };
			},
		},
	];
});

// ── Rare powers ─────────────────────────────────────────

// A Thousand Cuts: Whenever you play a card, deal 1(2) damage to ALL enemies. Cost 2.
registerCardEffect("A_THOUSAND_CUTS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "A_THOUSAND_CUTS" as never,
			amount: v.magic,
		},
	];
});

// After Image: Whenever you play a card, gain 1 Block. Cost 1.
registerCardEffect("AFTER_IMAGE", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "AFTER_IMAGE" as never, amount: 1 }];
});

// Envenom: Whenever you deal unblocked attack damage, apply 1 Poison. Cost 2(1).
registerCardEffect("ENVENOM", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "ENVENOM" as never, amount: 1 }];
});

// Tools of the Trade: At start of turn, draw 1 card and discard 1 card. Cost 1(0).
registerCardEffect("TOOLS_OF_THE_TRADE", (_s, _card, _t) => {
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "TOOLS_OF_THE_TRADE" as never,
			amount: 1,
		},
	];
});

// Wraith Form: Gain 2(3) Intangible. At end of each turn, lose 1 Dexterity. Cost 3.
registerCardEffect("WRAITH_FORM", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "intangible" as never,
			amount: v.magic,
		},
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "WRAITH_FORM" as never,
			amount: 1,
		},
	];
});
