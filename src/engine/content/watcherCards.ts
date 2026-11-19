import type { GameState } from "../core/types";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";
import { getCard } from "./loader";

// ── Helpers ─────────────────────────────────────────────

/** Get the last card played this turn from the discard pile. */
function lastPlayedDef(s: GameState) {
	const disc = s.combat?.discardPile;
	if (!disc || disc.length === 0) return null;
	const last = disc[disc.length - 1]!;
	return getCard(last.id) ?? null;
}

/** Push damage to every alive monster. */
function damageAllEnemies(s: GameState, baseDamage: number): Action[] {
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({
				type: "damage",
				source: P,
				target: M(i),
				baseDamage,
				hits: 1,
			});
		}
	}
	return actions;
}

// ── Basic cards ─────────────────────────────────────────

// Strike (Purple): Deal 6(9) damage.
registerCardEffect("STRIKE_PURPLE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Defend (Purple): Gain 5(8) Block.
registerCardEffect("DEFEND_PURPLE", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// Eruption: Deal 9(12) damage. Enter Wrath. Cost 2(1).
registerCardEffect("ERUPTION", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "changeStance", stance: "wrath" as never },
	];
});

// Vigilance: Gain 8(12) Block. Enter Calm. Cost 2(2).
registerCardEffect("VIGILANCE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "changeStance", stance: "calm" as never },
	];
});

// ── Common attacks ──────────────────────────────────────

// Bowling Bash: Deal 7(10) damage for each enemy alive.
registerCardEffect("BOWLING_BASH", (s, card, t) => {
	const v = vals(card);
	const aliveCount = s.combat?.monsters.filter((m) => m.alive).length ?? 0;
	const actions: Action[] = [];
	for (let i = 0; i < aliveCount; i++) {
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

// Consecrate: Deal 5(8) damage to ALL enemies.
registerCardEffect("CONSECRATE", (s, card, _t) => {
	const v = vals(card);
	return damageAllEnemies(s, v.damage);
});

// Crescendo: Enter Wrath. Exhaust. Cost 1(0).
registerCardEffect("CRESCENDO", (_s, _card, _t) => {
	return [{ type: "changeStance", stance: "wrath" as never }];
});

// Crush Joints: Deal 8(10) damage. If last card was a Skill, apply 1(2) Vulnerable.
registerCardEffect("CRUSH_JOINTS", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const last = lastPlayedDef(s);
	if (last?.type === "skill") {
		actions.push({
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "vulnerable" as never,
			amount: v.magic,
		});
	}
	return actions;
});

// Cut Through Fate: Deal 7(9) damage. Scry 2(3). Draw 1 card.
registerCardEffect("CUT_THROUGH_FATE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "scry", count: v.magic },
		{ type: "drawCards", count: 1 },
	];
});

// Empty Fist: Deal 9(14) damage. Exit stance (neutral).
registerCardEffect("EMPTY_FIST", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "changeStance", stance: "neutral" as never },
	];
});

// Flurry of Blows: Deal 4(6) damage.
registerCardEffect("FLURRY_OF_BLOWS", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Flying Sleeves: Deal 4(6) damage 2 times. selfRetain handled by flags.
registerCardEffect("FLYING_SLEEVES", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 2 }];
});

// Follow-Up: Deal 7(11) damage. If last card was an Attack, gain 1 energy.
registerCardEffect("FOLLOW_UP", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const last = lastPlayedDef(s);
	if (last?.type === "attack") {
		actions.push({ type: "gainEnergy", amount: 1 });
	}
	return actions;
});

// Sash Whip: Deal 8(10) damage. If last card was an Attack, apply 1(2) Weak.
registerCardEffect("SASH_WHIP", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const last = lastPlayedDef(s);
	if (last?.type === "attack") {
		actions.push({
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "weak" as never,
			amount: v.magic,
		});
	}
	return actions;
});

// Pressure Points: Apply 8(11) Mark. ALL enemies with Mark lose HP = their Mark.
registerCardEffect("PRESSURE_POINTS", (_s, card, t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "MARK" as never,
			amount: v.magic,
		},
		{
			type: "custom",
			execute: (st: GameState) => {
				if (!st.combat) return st;
				let result = st;
				for (let i = 0; i < st.combat.monsters.length; i++) {
					const m = result.combat!.monsters[i];
					if (!m?.alive) continue;
					const mark = m.powers.find((p) => p.id === ("MARK" as never));
					if (mark && mark.amount > 0) {
						const newHp = Math.max(0, m.currentHp - mark.amount);
						const monsters = [...result.combat!.monsters];
						monsters[i] = { ...m, currentHp: newHp, alive: newHp > 0 };
						result = { ...result, combat: { ...result.combat!, monsters } };
					}
				}
				return result;
			},
		},
	];
});

// ── Common skills ───────────────────────────────────────

// Empty Body: Gain 7(10) Block. Exit stance (neutral).
registerCardEffect("EMPTY_BODY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "changeStance", stance: "neutral" as never },
	];
});

// Evaluate: Gain 6(10) Block. Shuffle Insight into draw pile.
registerCardEffect("EVALUATE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "addCardToDrawPile", cardId: "INSIGHT" as never, upgraded: false, toTop: false },
	];
});

// Halt: Gain 3(4) Block. If in Wrath, gain 9(14) additional Block.
registerCardEffect("HALT", (s, card, _t) => {
	const v = vals(card);
	let amount = v.block;
	if (s.combat?.player.stance === "wrath") {
		amount += v.magic;
	}
	return [{ type: "block", source: P, amount }];
});

// Just Lucky: Scry 1(2). Gain 2(3) Block. Deal 3(4) damage.
registerCardEffect("JUST_LUCKY", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "scry", count: card.upgraded ? 2 : 1 },
		{ type: "block", source: P, amount: v.block },
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
});

// Prostrate: Gain 4(6) Block. Gain 2(3) Mantra.
registerCardEffect("PROSTRATE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "MANTRA" as never,
			amount: v.magic,
		},
	];
});

// Protect: Gain 12(16) Block. selfRetain handled by flags.
registerCardEffect("PROTECT", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// Third Eye: Gain 7(9) Block. Scry 3(5).
registerCardEffect("THIRD_EYE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "scry", count: v.magic },
	];
});

// Tranquility: Enter Calm. Exhaust. Cost 1(0).
registerCardEffect("TRANQUILITY", (_s, _card, _t) => {
	return [{ type: "changeStance", stance: "calm" as never }];
});
