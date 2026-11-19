import type { CardInstance, GameState } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, getAllCardsByColorAndType, M, P, vals } from "./cardUtils";
import { getCard } from "./loader";

// ── Acrobatics (Common, missed earlier) ─────────────────
// Draw 3(4) cards, discard 1 card. Cost 1.
registerCardEffect("ACROBATICS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "drawCards", count: v.magic },
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "acrobatics" as const },
			}),
		},
	];
});

// ── Uncommon attacks ────────────────────────────────────

// All-Out Attack: Deal 10(14) damage to ALL enemies. Discard 1 random card. Cost 1.
registerCardEffect("ALL_OUT_ATTACK", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	actions.push({
		type: "custom",
		execute: (st: GameState): GameState => {
			if (!st.combat) return st;
			const { hand } = st.combat;
			if (hand.length === 0) return st;
			const r = random(st.rng.cardRng, hand.length - 1);
			const idx = r.value;
			const picked = hand[idx];
			if (!picked) return st;
			return {
				...st,
				rng: { ...st.rng, cardRng: r.state },
				combat: {
					...st.combat,
					hand: hand.filter((_, i) => i !== idx),
					discardPile: [...st.combat.discardPile, picked],
					cardsDiscardedThisTurn: st.combat.cardsDiscardedThisTurn + 1,
				},
			};
		},
	});
	return actions;
});

// Backstab: Deal 11(15) damage. Innate. Exhaust. Cost 0.
// Innate + Exhaust handled by flags. Simple damage.
registerCardEffect("BACKSTAB", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Choke: Deal 12 damage. Apply 3(5) Choke. Cost 2.
registerCardEffect("CHOKE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "applyPower", source: P, target: M(t), powerId: "CHOKE" as never, amount: v.magic },
	];
});

// Dash: Deal 10(13) damage. Gain 10(13) Block. Cost 2.
registerCardEffect("DASH", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "block", source: P, amount: v.block },
	];
});

// Endless Agony: Deal 4(6) damage. Exhaust. When drawn, add copy to hand. Cost 0.
// Copy-on-draw handled by onDraw power hook. Damage + exhaust by flags.
registerCardEffect("ENDLESS_AGONY", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Eviscerate: Costs 1 less for each card discarded this turn. Deal 7(9) x3. Cost 3.
registerCardEffect("EVISCERATE", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < 3; i++) {
		actions.push({ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 });
	}
	return actions;
});

// Finisher: Deal 6(8) damage for each Attack played this turn. Cost 1.
registerCardEffect("FINISHER", (s, card, t) => {
	const v = vals(card);
	const attacks = s.combat?.cardsPlayedThisTurn ?? 0;
	const actions: Action[] = [];
	for (let i = 0; i < attacks; i++) {
		actions.push({ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 });
	}
	return actions;
});

// Flechettes: Deal 4(6) damage for each Skill in hand. Cost 1.
registerCardEffect("FLECHETTES", (s, card, t) => {
	const v = vals(card);
	const skills =
		s.combat?.hand.filter((c) => {
			const def = getCard(c.id);
			return def?.type === "skill";
		}).length ?? 0;
	const actions: Action[] = [];
	for (let i = 0; i < skills; i++) {
		actions.push({ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 });
	}
	return actions;
});

// Heel Hook: Deal 5(8) damage. If enemy is Weak, gain 1(2) Energy and draw 1 card.
registerCardEffect("HEEL_HOOK", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const monster = s.combat?.monsters[t];
	if (monster?.powers.some((p) => p.id === "weak")) {
		actions.push({ type: "gainEnergy", amount: card.upgraded ? 2 : 1 });
		actions.push({ type: "drawCards", count: 1 });
	}
	return actions;
});

// Masterful Stab: Deal 12(16) damage. Cost 0. No special effect in data.
registerCardEffect("MASTERFUL_STAB", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Predator: Deal 15(20) damage. Next turn draw 2 cards. Cost 2.
registerCardEffect("PREDATOR", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "DRAW_CARD_NEXT_TURN" as never,
			amount: 2,
		},
	];
});

// Riddle with Holes: Deal 3(4) damage 5 times. Cost 2.
registerCardEffect("RIDDLE_WITH_HOLES", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < 5; i++) {
		actions.push({ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 });
	}
	return actions;
});

// Skewer: Deal 7(10) damage X times (X = energy spent). Cost X.
registerCardEffect("SKEWER", (s, card, t) => {
	const v = vals(card);
	const energy = s.combat?.energy ?? 0;
	const actions: Action[] = [];
	for (let i = 0; i < energy; i++) {
		actions.push({ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 });
	}
	return actions;
});

// ── Uncommon skills ─────────────────────────────────────

// Blur: Gain 5(8) Block. Block not removed at start of next turn.
registerCardEffect("BLUR", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "applyPower", source: P, target: P, powerId: "BLUR" as never, amount: 1 },
	];
});

// Bouncing Flask: Apply 3(4) Poison to a random enemy 3 times. Cost 2.
registerCardEffect("BOUNCING_FLASK", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	const alive = (s.combat?.monsters ?? []).map((m, i) => ({ m, i })).filter((x) => x.m.alive);
	if (alive.length === 0) return [];
	for (let hit = 0; hit < 3; hit++) {
		actions.push({
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const aliveNow = st.combat.monsters.map((m, i) => ({ m, i })).filter((x) => x.m.alive);
				if (aliveNow.length === 0) return st;
				const r = random(st.rng.cardRng, aliveNow.length - 1);
				const picked = aliveNow[r.value];
				if (!picked) return st;
				const monster = st.combat.monsters[picked.i];
				if (!monster) return st;
				const poisonPower = monster.powers.find((p) => p.id === "POISON");
				const newAmount = (poisonPower?.amount ?? 0) + v.magic;
				const powers = poisonPower
					? monster.powers.map((p) => (p.id === "POISON" ? { ...p, amount: newAmount } : p))
					: [...monster.powers, { id: "POISON" as never, amount: v.magic, justApplied: false }];
				const monsters = [...st.combat.monsters];
				monsters[picked.i] = { ...monster, powers };
				return { ...st, rng: { ...st.rng, cardRng: r.state }, combat: { ...st.combat, monsters } };
			},
		});
	}
	return actions;
});

// Calculated Gamble: Discard your hand. Draw that many cards. Exhaust (unless upgraded).
registerCardEffect("CALCULATED_GAMBLE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: {
					type: "cardSelect" as const,
					task: "gamble" as const,
					options: undefined,
				},
			}),
		},
	];
});

// Catalyst: Double(Triple) an enemy's Poison. Exhaust. Cost 1.
registerCardEffect("CATALYST", (_s, card, t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => {
				if (!st.combat) return st;
				const monster = st.combat.monsters[t];
				if (!monster?.alive) return st;
				const poison = monster.powers.find((p) => p.id === "POISON");
				if (!poison || poison.amount <= 0) return st;
				const newAmount = card.upgraded ? poison.amount * 3 : poison.amount * 2;
				const powers = monster.powers.map((p) =>
					p.id === "POISON" ? { ...p, amount: newAmount } : p,
				);
				const monsters = [...st.combat.monsters];
				monsters[t] = { ...monster, powers };
				return { ...st, combat: { ...st.combat, monsters } };
			},
		},
	];
});

// Concentrate: Discard 3(2) cards. Gain 2 Energy. Cost 0. Unplayable flag: cost -2.
registerCardEffect("CONCENTRATE", (_s, card, _t) => {
	return [
		{ type: "gainEnergy", amount: 2 },
		{
			type: "custom",
			execute: (st: GameState): GameState => ({
				...st,
				phase: {
					type: "cardSelect" as const,
					task: "concentrate" as const,
					drawAfter: card.upgraded ? 2 : 3,
				},
			}),
		},
	];
});

// Crippling Cloud: Apply 4(7) Poison to ALL enemies. Apply 2 Weak to ALL enemies. Exhaust.
registerCardEffect("CRIPPLING_CLOUD", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "POISON" as never,
				amount: v.magic,
			});
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "weak" as never,
				amount: 2,
			});
		}
	}
	return actions;
});

// Distraction: Add a random Colorless Skill to hand that costs 0 this turn. Exhaust.
// Upgraded: costs 0 instead of 1.
registerCardEffect("DISTRACTION", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const colorless = getAllCardsByColorAndType("colorless", "skill");
				if (colorless.length === 0) return st;
				const r = random(st.rng.cardRng, colorless.length - 1);
				const chosen = colorless[r.value];
				if (!chosen) return st;
				const allCards = [
					...st.combat.hand,
					...st.combat.drawPile,
					...st.combat.discardPile,
					...st.combat.exhaustPile,
				];
				const uid = allCards.reduce((max, c) => Math.max(max, c.uniqueId), 0) + 1;
				const newCard: CardInstance = {
					id: chosen.id as never,
					upgraded: false,
					uniqueId: uid,
					costOverride: 0,
					freeToPlay: false,
					costForTurn: 0,
					misc: 0,
				};
				const hand = st.combat.hand.length < 10 ? [...st.combat.hand, newCard] : st.combat.hand;
				return { ...st, rng: { ...st.rng, cardRng: r.state }, combat: { ...st.combat, hand } };
			},
		},
	];
});

// Escape Plan: Gain 3(5) Block. Draw 1 card. If drawn card is Skill, draw another.
// Simplified: gain block + draw 1. Actual "if skill, draw again" needs onDraw hook.
registerCardEffect("ESCAPE_PLAN", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "drawCards", count: 1 },
	];
});

// Expertise: Draw cards until you have 6(7) cards in hand. Cost 1.
registerCardEffect("EXPERTISE", (s, card, _t) => {
	const v = vals(card);
	const handSize = s.combat?.hand.length ?? 0;
	const toDraw = Math.max(0, v.magic - handSize);
	return [{ type: "drawCards", count: toDraw }];
});

// Leg Sweep: Apply 2(3) Weak. Gain 11(14) Block. Cost 2.
registerCardEffect("LEG_SWEEP", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: M(t), powerId: "weak" as never, amount: v.magic },
		{ type: "block", source: P, amount: v.block },
	];
});

// Reflex: Unplayable. When discarded, draw 2(3) cards. Cost unplayable(-2).
// The draw-on-discard is handled by onManualDiscard power hook.
// No card effect needed since it's unplayable.

// Setup: Place a card from your hand on top of your draw pile. It costs 0 next turn.
registerCardEffect("SETUP", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "setup" as const },
			}),
		},
	];
});

// Tactician: Unplayable. When discarded, gain 1(2) Energy. Cost unplayable(-2).
// Handled by onManualDiscard power hook. No card effect.

// Terror: Apply 99 Vulnerable to enemy. Exhaust. Cost 1(0).
registerCardEffect("TERROR", (_s, _card, t) => {
	return [
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "vulnerable" as never,
			amount: 99,
		},
	];
});

// ── Uncommon powers ─────────────────────────────────────

// Accuracy: Shivs deal 4(6) more damage. Cost 1.
registerCardEffect("ACCURACY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "ACCURACY" as never,
			amount: v.magic,
		},
	];
});

// Caltrops: Whenever you're attacked, deal 3(5) damage back. Cost 1.
registerCardEffect("CALTROPS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "CALTROPS" as never,
			amount: v.magic,
		},
	];
});

// Footwork: Gain 2(3) Dexterity. Cost 1.
registerCardEffect("FOOTWORK", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "dexterity" as never,
			amount: v.magic,
		},
	];
});

// Infinite Blades: At the start of your turn, add a Shiv to your hand. Cost 1.
registerCardEffect("INFINITE_BLADES", (_s, _card, _t) => {
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "INFINITE_BLADES" as never,
			amount: 1,
		},
	];
});

// Noxious Fumes: At start of turn, apply 2(3) Poison to ALL enemies. Cost 1.
registerCardEffect("NOXIOUS_FUMES", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "NOXIOUS_FUMES" as never,
			amount: v.magic,
		},
	];
});

// Well-Laid Plans: At end of turn, Retain up to 1(2) cards. Cost 1.
registerCardEffect("WELL_LAID_PLANS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "WELL_LAID_PLANS" as never,
			amount: v.magic,
		},
	];
});
