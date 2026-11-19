import type { GameState } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";

// ── Rare attacks ────────────────────────────────────────

// Brilliance: Deal 12(16) damage + mantra gained this combat to a single enemy.
// In the real game this tracks total mantra; here we use card.misc as an accumulator.
registerCardEffect("BRILLIANCE", (_s, card, t) => {
	const v = vals(card);
	const mantraGained = card.misc ?? 0;
	const totalDamage = v.damage + mantraGained;
	return [{ type: "damage", source: P, target: M(t), baseDamage: totalDamage, hits: 1 }];
});

// Lesson Learned: Deal 10(13) damage. If fatal, upgrade a random card in deck. Exhaust.
registerCardEffect("LESSON_LEARNED", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	actions.push({
		type: "custom",
		execute: (st: GameState): GameState => {
			if (!st.combat) return st;
			const monster = st.combat.monsters[t];
			if (!monster || monster.alive) return st;
			// Upgrade a random non-upgraded card in the master deck
			const upgradable = st.deck
				.map((c, i) => ({ card: c, index: i }))
				.filter((e) => !e.card.upgraded);
			if (upgradable.length === 0) return st;
			const r = random(st.rng.cardRng, upgradable.length - 1);
			const pick = upgradable[r.value];
			if (!pick) return { ...st, rng: { ...st.rng, cardRng: r.state } };
			const newDeck = [...st.deck];
			newDeck[pick.index] = { ...pick.card, upgraded: true };
			return { ...st, deck: newDeck, rng: { ...st.rng, cardRng: r.state } };
		},
	});
	return actions;
});

// Ragnarok: Deal 5(6) damage to a random enemy 5(5) times.
registerCardEffect("RAGNAROK", (_s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < v.hits; i++) {
		actions.push({
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const alive = st.combat.monsters.filter((m) => m.alive);
				if (alive.length === 0) return st;
				const r = random(st.rng.miscRng, alive.length - 1);
				const picked = alive[r.value];
				if (!picked) return { ...st, rng: { ...st.rng, miscRng: r.state } };
				const m = st.combat.monsters[picked.index];
				if (!m?.alive) return { ...st, rng: { ...st.rng, miscRng: r.state } };
				const dmg = Math.max(0, v.damage - m.block);
				const newBlock = Math.max(0, m.block - v.damage);
				const newHp = Math.max(0, m.currentHp - dmg);
				const monsters = [...st.combat.monsters];
				monsters[picked.index] = {
					...m,
					currentHp: newHp,
					block: newBlock,
					alive: newHp > 0,
				};
				return {
					...st,
					rng: { ...st.rng, miscRng: r.state },
					combat: { ...st.combat, monsters },
				};
			},
		});
	}
	return actions;
});

// ── Rare skills ─────────────────────────────────────────

// Alpha: Shuffle a Beta into draw pile. Exhaust. (Upgraded: Innate.)
registerCardEffect("ALPHA", (_s, card, _t) => {
	return [
		{
			type: "addCardToDrawPile",
			cardId: "BETA" as never,
			upgraded: card.upgraded,
			toTop: false,
		},
		{ type: "shuffle" },
	];
});

// Blasphemy: Enter Divinity stance. Die next turn. Exhaust. (Upgraded: Retain.)
registerCardEffect("BLASPHEMY", (_s, _card, _t) => {
	return [
		{ type: "changeStance", stance: "divinity" as never },
		{ type: "applyPower", source: P, target: P, powerId: "BLASPHEMY" as never, amount: 1 },
	];
});

// Conjure Blade: X cost. Create an Expunger in hand with X energy damage. Exhaust.
// Simplified: spend all energy, add EXPUNGER to hand.
registerCardEffect("CONJURE_BLADE", (s, card, _t) => {
	const energy = s.combat?.energy ?? 0;
	return [
		{ type: "loseEnergy", amount: energy },
		{
			type: "addCardToHand",
			cardId: "EXPUNGER" as never,
			upgraded: card.upgraded,
		},
	];
});

// Deus Ex Machina: Unplayable (cost -2). When drawn, add 2(3) Miracles to hand.
// The draw trigger is handled elsewhere; the play effect is a no-op.
registerCardEffect("DEUS_EX_MACHINA", (_s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (v.magic || 2); i++) {
		actions.push({
			type: "addCardToHand",
			cardId: "MIRACLE" as never,
			upgraded: false,
		});
	}
	return actions;
});

// Judgment: If enemy HP <= 30(40), set their HP to 0.
registerCardEffect("JUDGMENT", (_s, card, t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const monster = st.combat.monsters[t];
				if (!monster?.alive) return st;
				if (monster.currentHp <= v.magic) {
					const monsters = [...st.combat.monsters];
					monsters[t] = { ...monster, currentHp: 0, alive: false };
					return { ...st, combat: { ...st.combat, monsters } };
				}
				return st;
			},
		},
	];
});

// Omniscience: Choose a card in hand; play it twice. Exhaust. Cost 4(3).
// Simplified: play the first non-Omniscience attack/skill in hand twice.
registerCardEffect("OMNISCIENCE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => ({
				...st,
				phase: {
					type: "cardSelect" as never,
					task: "omniscience" as never,
					options: st.combat?.hand.slice() ?? [],
				},
			}),
		},
	];
});

// Scrawl: Draw cards until hand is full (10 cards). Cost 1(0).
registerCardEffect("SCRAWL", (_s, _card, _t) => {
	const handSize = _s.combat?.hand.length ?? 10;
	const toDraw = Math.max(0, 10 - handSize);
	if (toDraw <= 0) return [];
	return [{ type: "drawCards", count: toDraw }];
});

// Spirit Shield: Gain 3(4) block per card in hand.
registerCardEffect("SPIRIT_SHIELD", (_s, card, _t) => {
	const v = vals(card);
	const cardsInHand = _s.combat?.hand.length ?? 0;
	const totalBlock = v.magic * cardsInHand;
	if (totalBlock <= 0) return [];
	return [{ type: "block", source: P, amount: totalBlock }];
});

// Vault: Take an extra turn. Exhaust. Cost 3(2).
// Simplified: gain 3 energy + draw 5 cards to approximate an extra turn.
registerCardEffect("VAULT", (_s, _card, _t) => {
	return [
		{ type: "gainEnergy", amount: 3 },
		{ type: "drawCards", count: 5 },
	];
});

// Wish: Choose Plated Armor, Strength, or Gold. Exhaust.
// Simplified: gain Strength equal to damage value (3/4).
registerCardEffect("WISH", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "STRENGTH" as never,
			amount: v.damage,
		},
	];
});

// ── Special generated cards ─────────────────────────────

// Beta: Shuffle an Omega into draw pile. Exhaust.
registerCardEffect("BETA", (_s, card, _t) => {
	return [
		{
			type: "addCardToDrawPile",
			cardId: "OMEGA" as never,
			upgraded: card.upgraded,
			toTop: false,
		},
		{ type: "shuffle" },
	];
});

// Expunger: Deal 9(15) damage X times (hits come from Conjure Blade energy).
// The base card data has damage 9/15. Hits set by Conjure Blade via misc or costOverride.
registerCardEffect("EXPUNGER", (_s, card, t) => {
	const v = vals(card);
	const hits = card.misc ?? v.hits;
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits }];
});

// Miracle: Gain 1(2) energy. Retain. Exhaust.
registerCardEffect("MIRACLE", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "gainEnergy", amount: v.magic || 1 }];
});
