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
// COLORLESS RARE CARDS (15)
// ══════════════════════════════════════════════════════════

// ── APOTHEOSIS ──────────────────────────────────────────
// Upgrade ALL cards for rest of combat. Exhaust. Cost 2(1).

registerCardEffect("APOTHEOSIS", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const up = (c: CardInstance): CardInstance => {
					if (c.upgraded) return c;
					const def = getCard(c.id);
					if (!def || def.noUpgrade) return c;
					const newCost = def.upgrade.cost ?? def.cost;
					return {
						...c,
						upgraded: true,
						costOverride: newCost !== def.cost ? newCost : c.costOverride,
						costForTurn: newCost ?? c.costForTurn,
					};
				};
				// Upgrade all cards everywhere
				const deck = st.deck.map(up);
				const combat = {
					...st.combat,
					hand: st.combat.hand.map(up),
					drawPile: st.combat.drawPile.map(up),
					discardPile: st.combat.discardPile.map(up),
					exhaustPile: st.combat.exhaustPile.map(up),
				};
				return { ...st, deck, combat };
			},
		},
	];
});

// ── CHRYSALIS ───────────────────────────────────────────
// Shuffle 3(5) random Skills into draw pile, cost 0. Exhaust. Cost 2.

registerCardEffect("CHRYSALIS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const skills = getAllCards().filter(
					(c) => c.type === "skill" && !c.unobtainable && c.rarity !== "basic",
				);
				if (skills.length === 0) return st;
				let rng = st.rng.cardRng;
				let uid = nextUid(st);
				const newCards: CardInstance[] = [];
				for (let i = 0; i < v.magic; i++) {
					const r = random(rng, skills.length - 1);
					rng = r.state;
					const chosen = skills[r.value];
					if (chosen) {
						newCards.push({
							...makeCardInstance(chosen.id as string, false, uid++),
							costOverride: 0,
							costForTurn: 0,
							freeToPlay: true,
						});
					}
				}
				return {
					...st,
					rng: { ...st.rng, cardRng: rng },
					combat: {
						...st.combat,
						drawPile: [...st.combat.drawPile, ...newCards],
					},
				};
			},
		},
	];
});

// ── HAND_OF_GREED ───────────────────────────────────────
// Deal 20(25) damage. If Fatal, gain 20(25) Gold. Cost 2.

registerCardEffect("HAND_OF_GREED", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	// Check if fatal (simplified: if damage >= monster HP)
	const monster = s.combat?.monsters[t];
	if (monster && monster.currentHp <= v.damage) {
		actions.push({ type: "gainGold", amount: v.magic });
	}
	return actions;
});

// ── MAGNETISM ───────────────────────────────────────────
// (Power) At start of turn, add random Colorless card to hand. Cost 2(1).

registerCardEffect("MAGNETISM", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "MAGNETISM" as never,
			amount: v.magic,
		},
	];
});

// ── MASTER_OF_STRATEGY ──────────────────────────────────
// Draw 3(4) cards. Exhaust. Cost 0.

registerCardEffect("MASTER_OF_STRATEGY", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "drawCards", count: v.magic }];
});

// ── MAYHEM ──────────────────────────────────────────────
// (Power) At start of turn, play top card of draw pile. Cost 2(1).

registerCardEffect("MAYHEM", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "MAYHEM" as never,
			amount: v.magic,
		},
	];
});

// ── METAMORPHOSIS ───────────────────────────────────────
// Shuffle 3(5) random Attacks into draw pile, cost 0. Exhaust. Cost 2.

registerCardEffect("METAMORPHOSIS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const attacks = getAllCards().filter(
					(c) => c.type === "attack" && !c.unobtainable && c.rarity !== "basic",
				);
				if (attacks.length === 0) return st;
				let rng = st.rng.cardRng;
				let uid = nextUid(st);
				const newCards: CardInstance[] = [];
				for (let i = 0; i < v.magic; i++) {
					const r = random(rng, attacks.length - 1);
					rng = r.state;
					const chosen = attacks[r.value];
					if (chosen) {
						newCards.push({
							...makeCardInstance(chosen.id as string, false, uid++),
							costOverride: 0,
							costForTurn: 0,
							freeToPlay: true,
						});
					}
				}
				return {
					...st,
					rng: { ...st.rng, cardRng: rng },
					combat: {
						...st.combat,
						drawPile: [...st.combat.drawPile, ...newCards],
					},
				};
			},
		},
	];
});

// ── PANACHE ─────────────────────────────────────────────
// (Power) Every 5 cards played in a turn, deal 10(14) dmg to ALL. Cost 0.

registerCardEffect("PANACHE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "PANACHE" as never,
			amount: v.magic,
		},
	];
});

// ── SADISTIC_NATURE ─────────────────────────────────────
// (Power) When applying a debuff, deal 5(7) damage. Cost 0.

registerCardEffect("SADISTIC_NATURE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "SADISTIC" as never,
			amount: v.magic,
		},
	];
});

// ── SECRET_TECHNIQUE ────────────────────────────────────
// Put a Skill from draw pile into hand. Exhaust (base only). Cost 0.
// Simplified: put a random Skill from draw pile into hand.

registerCardEffect("SECRET_TECHNIQUE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const draw = st.combat.drawPile;
				const skills = draw
					.map((c, i) => ({ c, i }))
					.filter((x) => {
						const def = getCard(x.c.id);
						return def?.type === "skill";
					});
				if (skills.length === 0 || st.combat.hand.length >= 10) return st;
				const r = random(st.rng.cardRng, skills.length - 1);
				const chosen = skills[r.value]!;
				const newDraw = draw.filter((_, i) => i !== chosen.i);
				return {
					...st,
					rng: { ...st.rng, cardRng: r.state },
					combat: {
						...st.combat,
						drawPile: newDraw,
						hand: [...st.combat.hand, chosen.c],
					},
				};
			},
		},
	];
});

// ── SECRET_WEAPON ───────────────────────────────────────
// Put an Attack from draw pile into hand. Exhaust (base only). Cost 0.
// Simplified: put a random Attack from draw pile into hand.

registerCardEffect("SECRET_WEAPON", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const draw = st.combat.drawPile;
				const attacks = draw
					.map((c, i) => ({ c, i }))
					.filter((x) => {
						const def = getCard(x.c.id);
						return def?.type === "attack";
					});
				if (attacks.length === 0 || st.combat.hand.length >= 10) return st;
				const r = random(st.rng.cardRng, attacks.length - 1);
				const chosen = attacks[r.value]!;
				const newDraw = draw.filter((_, i) => i !== chosen.i);
				return {
					...st,
					rng: { ...st.rng, cardRng: r.state },
					combat: {
						...st.combat,
						drawPile: newDraw,
						hand: [...st.combat.hand, chosen.c],
					},
				};
			},
		},
	];
});

// ── THE_BOMB ────────────────────────────────────────────
// (Power) At end of 3 turns, deal 40(50) damage to ALL enemies. Cost 2.

registerCardEffect("THE_BOMB", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "THE_BOMB" as never,
			amount: v.magic,
		},
	];
});

// ── THINKING_AHEAD ──────────────────────────────────────
// Draw 2 cards. Put a card from hand on top of draw pile.
// Exhaust (base only). Cost 0.
// Simplified: draw 2, put a random card on top.

registerCardEffect("THINKING_AHEAD", (_s, _card, _t) => {
	return [
		{ type: "drawCards", count: 2 },
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat || st.combat.hand.length === 0) return st;
				const r = random(st.rng.cardRng, st.combat.hand.length - 1);
				const chosen = st.combat.hand[r.value]!;
				const hand = st.combat.hand.filter((_, i) => i !== r.value);
				const drawPile = [...st.combat.drawPile, chosen];
				return {
					...st,
					rng: { ...st.rng, cardRng: r.state },
					combat: { ...st.combat, hand, drawPile },
				};
			},
		},
	];
});

// ── TRANSMUTATION ───────────────────────────────────────
// X cost. Add X random Colorless cards to hand, cost 0. Exhaust.

registerCardEffect("TRANSMUTATION", (s, _card, _t) => {
	const energy = s.combat?.energy ?? 0;
	return [
		{ type: "loseEnergy", amount: energy },
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat || energy === 0) return st;
				const colorless = getAllCards().filter(
					(c) => c.color === "colorless" && !c.unobtainable && c.rarity !== "basic",
				);
				if (colorless.length === 0) return st;
				let rng = st.rng.cardRng;
				let uid = nextUid(st);
				let hand = [...st.combat.hand];
				for (let i = 0; i < energy; i++) {
					if (hand.length >= 10) break;
					const r = random(rng, colorless.length - 1);
					rng = r.state;
					const chosen = colorless[r.value];
					if (chosen) {
						hand = [
							...hand,
							{
								...makeCardInstance(chosen.id as string, false, uid++),
								costOverride: 0,
								costForTurn: 0,
								freeToPlay: true,
							},
						];
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

// ── VIOLENCE ────────────────────────────────────────────
// Put 3(4) random Attacks from draw pile into hand. Exhaust. Cost 0.

registerCardEffect("VIOLENCE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const draw = [...st.combat.drawPile];
				const attacks = draw
					.map((c, i) => ({ c, i }))
					.filter((x) => {
						const def = getCard(x.c.id);
						return def?.type === "attack";
					});
				const count = Math.min(v.magic, attacks.length);
				let rng = st.rng.cardRng;
				let hand = [...st.combat.hand];
				const toRemove: number[] = [];
				const remaining = [...attacks];
				for (let i = 0; i < count; i++) {
					if (remaining.length === 0 || hand.length >= 10) break;
					const r = random(rng, remaining.length - 1);
					rng = r.state;
					const chosen = remaining[r.value]!;
					toRemove.push(chosen.i);
					hand = [...hand, chosen.c];
					remaining.splice(r.value, 1);
				}
				const removeSet = new Set(toRemove);
				const newDraw = draw.filter((_, i) => !removeSet.has(i));
				return {
					...st,
					rng: { ...st.rng, cardRng: rng },
					combat: { ...st.combat, hand, drawPile: newDraw },
				};
			},
		},
	];
});
