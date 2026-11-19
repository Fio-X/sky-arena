import { evokeOrb, removeAllOrbs } from "../core/orbSystem";
import type { CardInstance, GameState, OrbType } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";
import { getCard } from "./loader";

// ── Rare attacks ────────────────────────────────────────

// All for One: Deal 10(14) damage. Put all cost-0 cards from discard into hand.
registerCardEffect("ALL_FOR_ONE", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	actions.push({
		type: "custom",
		execute: (st: GameState): GameState => {
			if (!st.combat) return st;
			const toHand: CardInstance[] = [];
			const remaining: CardInstance[] = [];
			for (const c of st.combat.discardPile) {
				const def = getCard(c.id);
				const cost = c.costOverride ?? def?.cost ?? 1;
				if (cost === 0 && st.combat.hand.length + toHand.length < 10) {
					toHand.push(c);
				} else {
					remaining.push(c);
				}
			}
			return {
				...st,
				combat: {
					...st.combat,
					hand: [...st.combat.hand, ...toHand],
					discardPile: remaining,
				},
			};
		},
	});
	return actions;
});

// Core Surge: Deal 11(15) damage. Gain 1 Artifact. Exhaust.
registerCardEffect("CORE_SURGE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "applyPower", source: P, target: P, powerId: "artifact" as never, amount: 1 },
	];
});

// Hyperbeam: Deal 26(34) to ALL enemies. Lose 3 Focus.
registerCardEffect("HYPERBEAM", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	actions.push({
		type: "applyPower",
		source: P,
		target: P,
		powerId: "FOCUS" as never,
		amount: -v.magic,
	});
	return actions;
});

// Meteor Strike: Deal 24(30) damage. Channel 3 Plasma.
registerCardEffect("METEOR_STRIKE", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	for (let i = 0; i < 3; i++) {
		actions.push({ type: "channelOrb", orbType: "plasma" });
	}
	return actions;
});

// Thunder Strike: Deal 7(9) damage to random enemy for each Lightning channeled.
registerCardEffect("THUNDER_STRIKE", (s, card, _t) => {
	const v = vals(card);
	const count = s.combat?.lightningChanneled ?? 0;
	const actions: Action[] = [];
	for (let i = 0; i < count; i++) {
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

// Amplify: This turn, next 1(2) Power cards played twice.
registerCardEffect("AMPLIFY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "AMPLIFY" as never, amount: v.magic },
	];
});

// Fission: Base: Remove all orbs. Upgraded: Evoke all orbs.
// Gain 1 energy + draw 1 per orb removed/evoked.
registerCardEffect("FISSION", (_s, card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const orbCount = st.combat.player.orbs.length;
				if (orbCount === 0) return st;
				let ns = st;
				const events: import("../core/types").GameEvent[] = [];
				if (card.upgraded) {
					// Evoke all orbs
					const result = evokeOrb(ns, orbCount, events);
					ns = result.state;
				} else {
					// Remove without evoking
					const result = removeAllOrbs(ns);
					ns = result.state;
				}
				// Gain energy and draw
				const c2 = ns.combat;
				if (!c2) return ns;
				let combat = { ...c2, energy: c2.energy + orbCount };
				// Draw cards
				for (let i = 0; i < orbCount; i++) {
					if (combat.hand.length >= 10 || combat.drawPile.length === 0) break;
					const top = combat.drawPile[combat.drawPile.length - 1];
					if (!top) break;
					combat = {
						...combat,
						drawPile: combat.drawPile.slice(0, -1),
						hand: [...combat.hand, top],
					};
				}
				return { ...ns, combat };
			},
		},
	];
});

// Multi-Cast: X cost. Evoke next orb X(X+1) times.
registerCardEffect("MULTI_CAST", (s, card, _t) => {
	const energy = s.combat?.energy ?? 0;
	const extra = card.upgraded ? 1 : 0;
	const times = energy + extra;
	return [
		{ type: "loseEnergy", amount: energy },
		{ type: "evokeOrb", times },
	];
});

// Rainbow: Channel 1 Lightning, 1 Frost, 1 Dark. Base: Exhaust. Upgraded: no exhaust.
registerCardEffect("RAINBOW", (_s, _card, _t) => {
	return [
		{ type: "channelOrb", orbType: "lightning" as OrbType },
		{ type: "channelOrb", orbType: "frost" as OrbType },
		{ type: "channelOrb", orbType: "dark" as OrbType },
	];
});

// Reboot: Shuffle ALL cards into draw pile. Draw 4(6). Exhaust.
registerCardEffect("REBOOT", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				// Move hand, discard, exhaust all into draw pile (excluding the Reboot card itself)
				const allCards = [...st.combat.hand, ...st.combat.discardPile, ...st.combat.exhaustPile];
				// Shuffle using Fisher-Yates with the rng
				const drawPile = [...st.combat.drawPile, ...allCards];
				let rng = st.rng.shuffleRng;
				for (let i = drawPile.length - 1; i > 0; i--) {
					const r = random(rng, i);
					rng = r.state;
					const j = r.value;
					const a = drawPile[i];
					const b = drawPile[j];
					if (a !== undefined && b !== undefined) {
						drawPile[i] = b;
						drawPile[j] = a;
					}
				}
				let combat = {
					...st.combat,
					hand: [] as CardInstance[],
					discardPile: [] as CardInstance[],
					exhaustPile: [] as CardInstance[],
					drawPile,
				};
				// Draw N cards
				for (let i = 0; i < v.magic; i++) {
					if (combat.hand.length >= 10 || combat.drawPile.length === 0) break;
					const top = combat.drawPile[combat.drawPile.length - 1];
					if (!top) break;
					combat = {
						...combat,
						drawPile: combat.drawPile.slice(0, -1),
						hand: [...combat.hand, top],
					};
				}
				return { ...st, combat, rng: { ...st.rng, shuffleRng: rng } };
			},
		},
	];
});

// Seek: Put 1(2) cards from draw pile into hand. Exhaust.
registerCardEffect("SEEK", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: {
					type: "cardSelect" as const,
					task: "seek" as const,
					options: st.combat?.drawPile.slice() ?? [],
				},
			}),
		},
	];
});

// ── Rare powers ─────────────────────────────────────────

// Biased Cognition: Gain 4(5) Focus. At start of turn, lose 1 Focus.
registerCardEffect("BIASED_COGNITION", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "FOCUS" as never, amount: v.magic },
		{ type: "applyPower", source: P, target: P, powerId: "BIAS" as never, amount: 1 },
	];
});

// Buffer: Prevent next 1(2) times you lose HP.
registerCardEffect("BUFFER", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "BUFFER" as never, amount: v.magic },
	];
});

// Creative AI: At start of turn, add random Power to hand.
registerCardEffect("CREATIVE_AI", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "CREATIVE_AI" as never, amount: 1 }];
});

// Echo Form: First card each turn played twice. Base: Ethereal.
registerCardEffect("ECHO_FORM", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "ECHO_FORM" as never, amount: 1 }];
});

// Electrodynamics: Lightning hits ALL enemies. Channel 2(3) Lightning.
registerCardEffect("ELECTRODYNAMICS", (_s, card, _t) => {
	const v = vals(card);
	const channelCount = v.magic;
	const actions: Action[] = [
		{ type: "applyPower", source: P, target: P, powerId: "ELECTRO" as never, amount: 1 },
	];
	for (let i = 0; i < channelCount; i++) {
		actions.push({ type: "channelOrb", orbType: "lightning" });
	}
	return actions;
});

// Machine Learning: At start of turn, draw 1 extra card.
registerCardEffect("MACHINE_LEARNING", (_s, _card, _t) => {
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "MACHINE_LEARNING" as never,
			amount: 1,
		},
	];
});
