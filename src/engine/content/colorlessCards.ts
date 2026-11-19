import { hasArtifact } from "../combat/powers";
import type { CardInstance, GameState } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";
import { getAllCards, getCard } from "./loader";

// ── helpers ──────────────────────────────────────────────

function nextUid(state: GameState): number {
	if (!state.combat) return 1;
	const c = state.combat;
	let uid = 1;
	for (const card of [...c.hand, ...c.drawPile, ...c.discardPile, ...c.exhaustPile]) {
		if (card.uniqueId >= uid) uid = card.uniqueId + 1;
	}
	return uid;
}

function makeCardInstance(id: string, upgraded: boolean, uid: number): CardInstance {
	const def = getCard(id);
	const cost = def?.cost ?? 0;
	return {
		id: id as never,
		upgraded,
		uniqueId: uid,
		costOverride: null,
		freeToPlay: false,
		costForTurn: cost,
		misc: 0,
	};
}

// ══════════════════════════════════════════════════════════
// COLORLESS UNCOMMON CARDS (20)
// ══════════════════════════════════════════════════════════

// ── BANDAGE_UP ──────────────────────────────────────────
// Heal 4(6) HP. Exhaust. Cost 0.

registerCardEffect("BANDAGE_UP", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "heal", target: P, amount: v.magic }];
});

// ── BLIND ───────────────────────────────────────────────
// Apply 2 Weak. Upgraded: to ALL enemies. Cost 0.

registerCardEffect("BLIND", (s, card, t) => {
	const v = vals(card);
	if (card.upgraded) {
		const actions: Action[] = [];
		for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
			if (s.combat?.monsters[i]?.alive) {
				actions.push({
					type: "applyPower",
					source: P,
					target: M(i),
					powerId: "weak" as never,
					amount: v.magic,
				});
			}
		}
		return actions;
	}
	return [
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "weak" as never,
			amount: v.magic,
		},
	];
});

// ── DARK_SHACKLES ───────────────────────────────────────
// Enemy loses 9(15) Strength this turn. Exhaust. Cost 0.
// Uses LOSE_STRENGTH power (restores at end of round).

registerCardEffect("DARK_SHACKLES", (s, card, t) => {
	const v = vals(card);
	const loss: Action = {
		type: "applyPower",
		source: P,
		target: M(t),
		powerId: "strength" as never,
		amount: -v.magic,
	};
	// Original: the Strength comes back only if Artifact did not block the loss.
	if (hasArtifact(s, M(t))) return [loss];
	return [
		loss,
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "LOSE_STRENGTH" as never,
			amount: v.magic,
		},
	];
});

// ── DEEP_BREATH ─────────────────────────────────────────
// Shuffle discard pile into draw pile. Draw 1(2) cards. Cost 0.

registerCardEffect("DEEP_BREATH", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "shuffle" }, { type: "drawCards", count: v.magic }];
});

// ── DISCOVERY ───────────────────────────────────────────
// Choose 1 of 3 random cards to add to hand, costs 0 this turn.
// Exhaust (base only). Simplified: add 1 random colorless card to hand.

registerCardEffect("DISCOVERY", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const all = getAllCards().filter(
					(c) =>
						!c.unobtainable && c.rarity !== "basic" && c.type !== "status" && c.type !== "curse",
				);
				if (all.length === 0) return st;
				const r = random(st.rng.cardRng, all.length - 1);
				const chosen = all[r.value];
				if (!chosen || st.combat.hand.length >= 10) {
					return { ...st, rng: { ...st.rng, cardRng: r.state } };
				}
				const uid = nextUid(st);
				const inst = makeCardInstance(chosen.id as string, false, uid);
				return {
					...st,
					rng: { ...st.rng, cardRng: r.state },
					combat: {
						...st.combat,
						hand: [...st.combat.hand, { ...inst, costForTurn: 0, freeToPlay: true }],
					},
				};
			},
		},
	];
});

// ── DRAMATIC_ENTRANCE ───────────────────────────────────
// Innate. Deal 8(12) damage to ALL enemies. Exhaust. Cost 0.

registerCardEffect("DRAMATIC_ENTRANCE", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({
				type: "damage",
				source: P,
				target: M(i),
				baseDamage: v.damage,
				hits: 1,
			});
		}
	}
	return actions;
});

// ── ENLIGHTENMENT ───────────────────────────────────────
// Reduce cost of all cards in hand to 1 this turn (upgraded: this combat).

registerCardEffect("ENLIGHTENMENT", (_s, card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const hand = st.combat.hand.map((c) => {
					const def = getCard(c.id);
					const baseCost = c.upgraded ? (def?.upgrade.cost ?? def?.cost ?? 0) : (def?.cost ?? 0);
					if (baseCost <= 1 || baseCost < 0) return c;
					if (card.upgraded) {
						// Permanent for this combat
						return { ...c, costOverride: 1, costForTurn: 1 };
					}
					// Just this turn
					return { ...c, costForTurn: 1 };
				});
				return { ...st, combat: { ...st.combat, hand } };
			},
		},
	];
});

// ── FINESSE ─────────────────────────────────────────────
// Gain 2(4) Block. Draw 1 card. Cost 0.

registerCardEffect("FINESSE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "drawCards", count: 1 },
	];
});

// ── FLASH_OF_STEEL ──────────────────────────────────────
// Deal 3(6) damage. Draw 1 card. Cost 0.

registerCardEffect("FLASH_OF_STEEL", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "drawCards", count: 1 },
	];
});

// ── FORETHOUGHT ─────────────────────────────────────────
// Put a card from hand to bottom of draw pile. It costs 0 until played.
// Upgraded: any number of cards. Simplified: put 1 random card to bottom (up: up to 3).

registerCardEffect("FORETHOUGHT", (_s, card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat || st.combat.hand.length === 0) return st;
				const count = card.upgraded ? Math.min(3, st.combat.hand.length) : 1;
				let hand = [...st.combat.hand];
				let drawPile = [...st.combat.drawPile];
				let rng = st.rng.cardRng;
				for (let i = 0; i < count; i++) {
					if (hand.length === 0) break;
					const r = random(rng, hand.length - 1);
					rng = r.state;
					const chosen = hand[r.value]!;
					hand = hand.filter((_, idx) => idx !== r.value);
					drawPile = [{ ...chosen, costForTurn: 0, freeToPlay: true }, ...drawPile];
				}
				return {
					...st,
					rng: { ...st.rng, cardRng: rng },
					combat: { ...st.combat, hand, drawPile },
				};
			},
		},
	];
});

// ── GOOD_INSTINCTS ──────────────────────────────────────
// Gain 6(9) Block. Cost 0.

registerCardEffect("GOOD_INSTINCTS", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// ── IMPATIENCE ──────────────────────────────────────────
// If you have no Attacks in hand, draw 2(3) cards. Cost 0.

registerCardEffect("IMPATIENCE", (s, card, _t) => {
	const v = vals(card);
	if (!s.combat) return [];
	const hasAttack = s.combat.hand.some((c) => {
		const def = getCard(c.id);
		return def?.type === "attack";
	});
	if (hasAttack) return [];
	return [{ type: "drawCards", count: v.magic }];
});

// ── JACK_OF_ALL_TRADES ──────────────────────────────────
// Add 1(2) random Colorless card(s) to hand. Exhaust. Cost 0.

registerCardEffect("JACK_OF_ALL_TRADES", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const colorless = getAllCards().filter(
					(c) => c.color === "colorless" && !c.unobtainable && c.rarity !== "basic",
				);
				if (colorless.length === 0) return st;
				let rng = st.rng.cardRng;
				let hand = [...st.combat.hand];
				let uid = nextUid(st);
				for (let i = 0; i < v.magic; i++) {
					if (hand.length >= 10) break;
					const r = random(rng, colorless.length - 1);
					rng = r.state;
					const chosen = colorless[r.value];
					if (chosen) {
						hand = [...hand, makeCardInstance(chosen.id as string, false, uid++)];
					}
				}
				return {
					...st,
					rng: { ...st.rng, cardRng: rng },
					combat: { ...st.combat, hand },
				};
			},
		},
	];
});

// ── MADNESS ─────────────────────────────────────────────
// Reduce cost of a random card in hand to 0 this combat. Exhaust. Cost 1(0).

registerCardEffect("MADNESS", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const hand = st.combat.hand;
				const eligible = hand.filter((c) => {
					const def = getCard(c.id);
					return (def?.cost ?? 0) > 0;
				});
				if (eligible.length === 0) return st;
				const r = random(st.rng.cardRng, eligible.length - 1);
				const chosen = eligible[r.value]!;
				const newHand = hand.map((c) =>
					c.uniqueId === chosen.uniqueId ? { ...c, costOverride: 0, costForTurn: 0 } : c,
				);
				return {
					...st,
					rng: { ...st.rng, cardRng: r.state },
					combat: { ...st.combat, hand: newHand },
				};
			},
		},
	];
});

// ── MIND_BLAST ──────────────────────────────────────────
// Innate. Deal damage equal to draw pile size. Cost 2(1).

registerCardEffect("MIND_BLAST", (s, _card, t) => {
	const drawPileSize = s.combat?.drawPile.length ?? 0;
	return [
		{
			type: "damage",
			source: P,
			target: M(t),
			baseDamage: drawPileSize,
			hits: 1,
		},
	];
});

// ── PANACEA ─────────────────────────────────────────────
// Gain 1(2) Artifact. Exhaust. Cost 0.

registerCardEffect("PANACEA", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "ARTIFACT" as never,
			amount: v.magic,
		},
	];
});

// ── PANIC_BUTTON ────────────────────────────────────────
// Gain 30(40) Block. No Block from cards for 2 turns. Exhaust. Cost 0.

registerCardEffect("PANIC_BUTTON", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "NO_BLOCK" as never,
			amount: v.magic,
		},
	];
});

// ── PURITY ──────────────────────────────────────────────
// Exhaust up to 3(5) cards from hand. Exhaust.
// Simplified: exhaust up to 3(5) random non-Purity cards.

registerCardEffect("PURITY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const hand = [...st.combat.hand];
				const eligible = hand.map((c, i) => ({ c, i })).filter((x) => x.c.id !== "PURITY");
				const count = Math.min(v.magic, eligible.length);
				let rng = st.rng.cardRng;
				const toExhaust: number[] = [];
				const remaining = [...eligible];
				for (let i = 0; i < count; i++) {
					if (remaining.length === 0) break;
					const r = random(rng, remaining.length - 1);
					rng = r.state;
					toExhaust.push(remaining[r.value]!.i);
					remaining.splice(r.value, 1);
				}
				const exhaustSet = new Set(toExhaust);
				const newHand: CardInstance[] = [];
				const newExhaust: CardInstance[] = [...st.combat.exhaustPile];
				for (let i = 0; i < hand.length; i++) {
					if (exhaustSet.has(i)) {
						newExhaust.push(hand[i]!);
					} else {
						newHand.push(hand[i]!);
					}
				}
				return {
					...st,
					rng: { ...st.rng, cardRng: rng },
					combat: { ...st.combat, hand: newHand, exhaustPile: newExhaust },
				};
			},
		},
	];
});

// ── SWIFT_STRIKE ────────────────────────────────────────
// Deal 7(10) damage. Cost 0.
// Generic effect handles this, but register for completeness.

registerCardEffect("SWIFT_STRIKE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// ── TRIP ────────────────────────────────────────────────
// Apply 2 Vulnerable. Upgraded: to ALL enemies. Cost 0.

registerCardEffect("TRIP", (s, card, t) => {
	const v = vals(card);
	if (card.upgraded) {
		const actions: Action[] = [];
		for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
			if (s.combat?.monsters[i]?.alive) {
				actions.push({
					type: "applyPower",
					source: P,
					target: M(i),
					powerId: "vulnerable" as never,
					amount: v.magic,
				});
			}
		}
		return actions;
	}
	return [
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "vulnerable" as never,
			amount: v.magic,
		},
	];
});
