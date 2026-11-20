import type { GameState } from "../core/types";
import { registerCardEffect } from "./cardEffects";
import { type Action, exhaustRandomCard, M, P, vals } from "./cardUtils";
import { getCard } from "./loader";

// ── Basic ────────────────────────────────────────────────

registerCardEffect("BASH", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "vulnerable" as never,
			amount: v.magic,
		},
	];
});

// ── Common attacks ───────────────────────────────────────

registerCardEffect("ANGER", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "addCardToDiscardPile", cardId: card.id, upgraded: card.upgraded },
	];
});

registerCardEffect("BODY_SLAM", (s, _card, t) => {
	const block = s.combat?.player.block ?? 0;
	return [{ type: "damage", source: P, target: M(t), baseDamage: block, hits: 1 }];
});

registerCardEffect("CLASH", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

registerCardEffect("CLEAVE", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	return actions;
});

registerCardEffect("CLOTHESLINE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "applyPower", source: P, target: M(t), powerId: "weak" as never, amount: v.magic },
	];
});

registerCardEffect("HEADBUTT", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	if ((s.combat?.discardPile.length ?? 0) > 0) {
		actions.push({
			type: "custom",
			execute: (st) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "headbutt" as const },
			}),
		});
	}
	return actions;
});

registerCardEffect("HEAVY_BLADE", (s, card, t) => {
	const v = vals(card);
	const str = s.combat?.player.powers.find((p) => p.id === ("strength" as never))?.amount ?? 0;
	const totalDamage = v.damage + str * (v.magic - 1);
	return [{ type: "damage", source: P, target: M(t), baseDamage: totalDamage, hits: 1 }];
});

// PerfectedStrike.countCards: Strike-tagged cards in hand, draw and discard piles.
// The card is still in hand when its damage is calculated (useCard removes it
// afterwards), so it counts itself; here it has already left the hand.
registerCardEffect("PERFECTED_STRIKE", (s, card, t) => {
	const v = vals(card);
	const c = s.combat;
	const piles = c ? [...c.hand, ...c.drawPile, ...c.discardPile] : [];
	const strikeCount =
		piles.filter((x) => getCard(x.id)?.flags.includes("tag:strike")).length +
		(piles.some((x) => x.uniqueId === card.uniqueId) ? 0 : 1);
	return [
		{
			type: "damage",
			source: P,
			target: M(t),
			baseDamage: v.damage + strikeCount * v.magic,
			hits: 1,
		},
	];
});

registerCardEffect("POMMEL_STRIKE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "drawCards", count: v.magic },
	];
});

registerCardEffect("SWORD_BOOMERANG", (s, card, _t) => {
	const v = vals(card);
	const alive = s.combat?.monsters.filter((m) => m.alive) ?? [];
	const actions: Action[] = [];
	for (let i = 0; i < v.hits; i++) {
		const target = alive[i % alive.length];
		if (target) {
			actions.push({
				type: "damage",
				source: P,
				target: M(target.index),
				baseDamage: v.damage,
				hits: 1,
			});
		}
	}
	return actions;
});

registerCardEffect("THUNDERCLAP", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "vulnerable" as never,
				amount: 1,
			});
		}
	}
	return actions;
});

registerCardEffect("TWIN_STRIKE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 2 }];
});

registerCardEffect("WILD_STRIKE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "addCardToDrawPile", cardId: "WOUND" as never, upgraded: false, toTop: false },
	];
});

// ── Common skills ────────────────────────────────────────

registerCardEffect("ARMAMENTS", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [{ type: "block", source: P, amount: v.block }];
	if (card.upgraded) {
		actions.push({
			type: "custom",
			execute: (st) => {
				if (!st.combat) return st;
				const hand = st.combat.hand.map((c) => ({ ...c, upgraded: true }));
				return { ...st, combat: { ...st.combat, hand } };
			},
		});
	} else {
		const hasUpgradeable = s.combat?.hand.some((c) => !c.upgraded) ?? false;
		if (hasUpgradeable) {
			actions.push({
				type: "custom",
				execute: (st) => ({
					...st,
					phase: { type: "cardSelect" as const, task: "armaments" as const },
				}),
			});
		}
	}
	return actions;
});

registerCardEffect("FLEX", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "strength" as never, amount: v.magic },
		{ type: "applyPower", source: P, target: P, powerId: "loseStrength" as never, amount: v.magic },
	];
});

registerCardEffect("SHRUG_IT_OFF", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "drawCards", count: 1 },
	];
});

registerCardEffect("WARCRY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "drawCards", count: v.magic },
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "warcry" as const },
			}),
		},
	];
});

registerCardEffect("RECKLESS_CHARGE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "addCardToDrawPile", cardId: "DAZED" as never, upgraded: false, toTop: false },
	];
});

registerCardEffect("TRUE_GRIT", (_s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [{ type: "block", source: P, amount: v.block }];
	if (card.upgraded) {
		actions.push({
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "exhaust" as const },
			}),
		});
	} else {
		actions.push({
			type: "custom",
			execute: (st) => exhaustRandomCard(st),
		});
	}
	return actions;
});
