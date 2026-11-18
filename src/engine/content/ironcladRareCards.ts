import type { GameState } from "../core/types";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";

// ── Rare attacks ─────────────────────────────────────────

registerCardEffect("FEED", (s, card, t) => {
	const v = vals(card);
	const target = s.combat?.monsters[t];
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	if (target && target.currentHp <= v.damage) {
		actions.push({ type: "gainMaxHp", amount: v.magic });
	}
	return actions;
});

registerCardEffect("IMMOLATE", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	actions.push({ type: "addCardToDiscardPile", cardId: "BURN" as never, upgraded: false });
	return actions;
});

registerCardEffect("FIEND_FIRE", (s, card, t) => {
	const v = vals(card);
	const hand = s.combat?.hand ?? [];
	const actions: Action[] = [];
	for (let i = hand.length - 1; i >= 0; i--) {
		actions.push({ type: "exhaustCard", handIndex: i });
	}
	actions.push({
		type: "damage",
		source: P,
		target: M(t),
		baseDamage: v.damage,
		hits: hand.length,
	});
	return actions;
});

registerCardEffect("REAPER", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	return actions;
});

// ── Rare skills ──────────────────────────────────────────

registerCardEffect("EXHUME", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => {
				if (!st.combat || st.combat.exhaustPile.length === 0) return st;
				return {
					...st,
					phase: { type: "cardSelect" as const, task: "exhume" as const },
				};
			},
		},
	];
});

registerCardEffect("IMPERVIOUS", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

registerCardEffect("LIMIT_BREAK", (s, _card, _t) => {
	const str = s.combat?.player.powers.find((p) => p.id === ("strength" as never))?.amount ?? 0;
	if (str <= 0) return [];
	return [{ type: "applyPower", source: P, target: P, powerId: "strength" as never, amount: str }];
});

// ── Rare powers ──────────────────────────────────────────

registerCardEffect("BARRICADE", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "barricade" as never, amount: 1 }];
});

registerCardEffect("BERSERK", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "vulnerable" as never, amount: v.magic },
		{ type: "applyPower", source: P, target: P, powerId: "berserk" as never, amount: 1 },
	];
});

registerCardEffect("BRUTALITY", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "brutality" as never, amount: 1 }];
});

registerCardEffect("CORRUPTION", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "corruption" as never, amount: 1 }];
});

registerCardEffect("DEMON_FORM", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "demonForm" as never, amount: v.magic },
	];
});

registerCardEffect("DOUBLE_TAP", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "doubleTap" as never, amount: v.magic },
	];
});

registerCardEffect("JUGGERNAUT", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "juggernaut" as never, amount: v.magic },
	];
});

registerCardEffect("RUPTURE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "rupture" as never, amount: v.magic },
	];
});
