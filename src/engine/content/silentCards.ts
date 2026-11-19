import { hasArtifact } from "../combat/powers";
import type { GameState } from "../core/types";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";

// ── Helper: add Shivs to hand ───────────────────────────

function addShivsToHand(count: number, upgraded: boolean): Action[] {
	const actions: Action[] = [];
	for (let i = 0; i < count; i++) {
		actions.push({
			type: "addCardToHand",
			cardId: "SHIV" as never,
			upgraded,
		});
	}
	return actions;
}

// ── Starter cards ────────────────────────────────────────

// Neutralize: Deal 3(4) damage, apply 1(2) Weak. Cost 0.
registerCardEffect("NEUTRALIZE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "weak" as never,
			amount: v.magic,
		},
	];
});

// Survivor: Gain 8(11) Block. Discard 1 card. Cost 1.
registerCardEffect("SURVIVOR", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [{ type: "block", source: P, amount: v.block }];
	if ((s.combat?.hand.length ?? 0) > 1) {
		// Hand has more cards (excluding the one being played); prompt discard
		actions.push({
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "survivor" as const },
			}),
		});
	}
	return actions;
});

// ── Common attacks ───────────────────────────────────────

// Bane: Deal 7(10) damage. If enemy has Poison, deal 7(10) again. Cost 1.
registerCardEffect("BANE", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const monster = s.combat?.monsters[t];
	if (monster?.powers.some((p) => p.id === "POISON")) {
		actions.push({
			type: "damage",
			source: P,
			target: M(t),
			baseDamage: v.damage,
			hits: 1,
		});
	}
	return actions;
});

// Dagger Spray: Deal 4(6) damage to ALL enemies. Twice. Cost 1.
registerCardEffect("DAGGER_SPRAY", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	// Two hits on each enemy
	for (let hit = 0; hit < 2; hit++) {
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
	}
	return actions;
});

// Dagger Throw: Deal 9(12) damage. Draw 1 card. Discard 1 card. Cost 1.
registerCardEffect("DAGGER_THROW", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "drawCards", count: 1 },
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "daggerThrow" as const },
			}),
		},
	];
});

// Flying Knee: Deal 8(11) damage. Next turn gain 1 Energy. Cost 1.
registerCardEffect("FLYING_KNEE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "energized" as never,
			amount: 1,
		},
	];
});

// Poisoned Stab: Deal 6(8) damage. Apply 3(4) Poison. Cost 1.
registerCardEffect("POISONED_STAB", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "POISON" as never,
			amount: v.magic,
		},
	];
});

// Quick Slash: Deal 8(12) damage. Draw 1 card. Cost 1.
registerCardEffect("QUICK_SLASH", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "drawCards", count: 1 },
	];
});

// Slice: Deal 6(9) damage. Cost 0.
// Generic fallback handles this, but register explicitly for clarity.
registerCardEffect("SLICE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Sneaky Strike: Deal 12(16) damage. If you discarded this turn, gain 2 Energy. Cost 2.
registerCardEffect("SNEAKY_STRIKE", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	if ((s.combat?.cardsDiscardedThisTurn ?? 0) > 0) {
		actions.push({ type: "gainEnergy", amount: 2 });
	}
	return actions;
});

// Sucker Punch: Deal 7(9) damage. Apply 1(2) Weak. Cost 1.
registerCardEffect("SUCKER_PUNCH", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "weak" as never,
			amount: v.magic,
		},
	];
});

// ── Common skills ────────────────────────────────────────

// Backflip: Gain 5(8) Block. Draw 2 cards. Cost 1.
registerCardEffect("BACKFLIP", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "drawCards", count: 2 },
	];
});

// Blade Dance: Add 2(3) Shivs to hand. Cost 1.
registerCardEffect("BLADE_DANCE", (_s, card, _t) => {
	const v = vals(card);
	return addShivsToHand(v.magic, false);
});

// Cloak and Dagger: Gain 6 Block. Add 1(2) Shiv(s) to hand. Cost 1.
registerCardEffect("CLOAK_AND_DAGGER", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }, ...addShivsToHand(v.magic, false)];
});

// Deadly Poison: Apply 5(7) Poison. Cost 1.
registerCardEffect("DEADLY_POISON", (_s, card, t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "POISON" as never,
			amount: v.magic,
		},
	];
});

// Deflect: Gain 4(7) Block. Cost 0.
// Generic fallback handles this, but register explicitly.
registerCardEffect("DEFLECT", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// Dodge and Roll: Gain 4(6) Block. Next turn gain 4(6) Block. Cost 1.
registerCardEffect("DODGE_AND_ROLL", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "nextTurnBlock" as never,
			amount: v.block,
		},
	];
});

// Outmaneuver: Next turn gain 2(3) Energy. Cost 1.
// In the data, magic is null for both base and upgrade.
// Hard-code 2(3) as per original game.
registerCardEffect("OUTMANEUVER", (_s, card, _t) => {
	const amount = card.upgraded ? 3 : 2;
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "energized" as never,
			amount,
		},
	];
});

// Piercing Wail: ALL enemies lose 6(8) Strength this turn. Cost 1. Exhaust.
// Applies negative strength + loseStrength power so it reverts at end of turn.
registerCardEffect("PIERCING_WAIL", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "strength" as never,
				amount: -v.magic,
			});
			// Original: the Strength comes back only if Artifact did not block the loss.
			if (hasArtifact(s, M(i))) continue;
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "LOSE_STRENGTH" as never,
				amount: v.magic,
			});
		}
	}
	return actions;
});

// Prepared: Draw 1(2) card(s). Discard 1(2) card(s). Cost 0.
registerCardEffect("PREPARED", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "drawCards", count: v.magic },
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: {
					type: "cardSelect" as const,
					task: "prepared" as const,
					drawAfter: 0,
					options: undefined,
				},
			}),
		},
	];
});

// ── Strike/Defend (green variants) ──────────────────────
// These use the generic fallback (damage-only / block-only), but we
// register them explicitly so the registry is complete.

registerCardEffect("STRIKE_GREEN", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

registerCardEffect("DEFEND_GREEN", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// ── Shiv ─────────────────────────────────────────────────
// 0-cost attack, deal 4(6) damage, Exhaust (handled by flags).
// Generic fallback works, but register explicitly.

registerCardEffect("SHIV", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});
