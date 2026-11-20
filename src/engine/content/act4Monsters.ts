/**
 * Act 4 monsters: Spire Shield + Spire Spear (elite, Surrounded) and the
 * Corrupt Heart (boss). AI, move effects and the Surrounded encounter setup.
 * Specs: data-reference/monsters-act34.json (ai.spec, historyRules, notes).
 *
 * RNG parity (notes.rngParity): every move selection consumes one
 * aiRng.random(99) — the real rollMove, or the noOpRollMove of a handler that
 * forced its successor. A 50/50 pick adds one aiRng.randomBoolean() after it.
 */
import { calculateDamage } from "../combat/damage";
import { registerEncounterSetup } from "../combat/encounterSetup";
import {
	allyRefs,
	type MoveCtx,
	registerMoveEffect,
	registerMoveHandler,
} from "../combat/moveEffects";
import { addToTop } from "../core/actionQueue";
import { canonicalPowerId } from "../core/hooks";
import type {
	Action,
	ActorRef,
	GameState,
	MonsterMoveId,
	PowerInstance,
	RngState,
} from "../core/types";
import { random, randomBoolean } from "../rng/stsRandom";
import { BACK_ATTACK, SURROUNDED } from "./act4Powers";
import { type MonsterAiContext, type MonsterAiResult, registerMonsterAi } from "./monsterAi";

const mv = (id: string) => id as MonsterMoveId;
const PLAYER: ActorRef = { type: "player" };

function historyOf(ctx: MonsterAiContext): readonly MonsterMoveId[] {
	return ctx.state.combat?.monsters[ctx.monsterIndex]?.moveHistory ?? [];
}

/** rollMove / noOpRollMove: the random(99) every selection burns. */
function burnRoll(rng: RngState): RngState {
	return random(rng, 99).state;
}

/** One random(99), then a 50/50 between `onTrue` and `onFalse`. */
function coinFlip(rng: RngState, onTrue: MonsterMoveId, onFalse: MonsterMoveId): MonsterAiResult {
	const b = randomBoolean(burnRoll(rng));
	return { moveId: b.value ? onTrue : onFalse, aiRng: b.state };
}

function applyTo(self: ActorRef, target: ActorRef, id: string, amount: number): Action {
	return { type: "applyPower", source: self, target, powerId: canonicalPowerId(id), amount };
}

// ── Spire Shield (slot 0) ───────────────────────────────────
// SMASH every 3rd turn (3, 6, 9…); between Smashes BASH and FORTIFY once
// each, the first of the pair picked 50/50 (at battle start and after SMASH).

const SHIELD_BASH = mv("SPIRE_SHIELD_BASH");
const SHIELD_FORTIFY = mv("SPIRE_SHIELD_FORTIFY");
const SHIELD_SMASH = mv("SPIRE_SHIELD_SMASH");

registerMonsterAi("SPIRE_SHIELD", (ctx): MonsterAiResult => {
	const h = historyOf(ctx);
	const last = h[h.length - 1];
	if (last === undefined || last === SHIELD_SMASH) {
		return coinFlip(ctx.aiRng, SHIELD_FORTIFY, SHIELD_BASH);
	}
	const before = h[h.length - 2];
	const pairStart = before === undefined || before === SHIELD_SMASH;
	const second = last === SHIELD_BASH ? SHIELD_FORTIFY : SHIELD_BASH;
	return { moveId: pairStart ? second : SHIELD_SMASH, aiRng: burnRoll(ctx.aiRng) };
});

/**
 * Player has orb slots (the original's !player.orbs.isEmpty()). The engine
 * gives every character 3 slots at combat start, so a non-Defect counts only
 * once it really holds an orb.
 */
function hasOrbSlots(state: GameState): boolean {
	const p = state.combat?.player;
	if (!p || p.orbSlots <= 0) return false;
	return state.character === "DEFECT" || p.orbs.length > 0;
}

/** BASH: with orb slots, aiRng.randomBoolean() picks Focus -1 (true) or Strength -1. */
function shieldDebuff(self: ActorRef) {
	return (state: GameState): GameState => {
		const b = randomBoolean(state.rng.aiRng);
		const s = { ...state, rng: { ...state.rng, aiRng: b.state } };
		const power = applyTo(self, PLAYER, b.value ? "FOCUS" : "STRENGTH", -1);
		return s.combat ? { ...s, combat: addToTop(s.combat, power) } : s;
	};
}

registerMoveEffect("FOCUS(-1)|STRENGTH(-1)", (ctx, _effect, actions) => [
	...actions,
	hasOrbSlots(ctx.state)
		? { type: "custom", execute: shieldDebuff(ctx.self) }
		: applyTo(ctx.self, PLAYER, "STRENGTH", -1),
]);

/** "Block" effect word: GainBlockAction on each ally (self is covered by the move's block). */
registerMoveEffect("Block", (ctx, effect, actions) => {
	const targets = effect.target === "allies" ? allyRefs(ctx) : [ctx.self];
	const amount = effect.amount ?? 0;
	return [...actions, ...targets.map((t): Action => ({ type: "block", source: t, amount }))];
});

/**
 * SMASH (below A18): block = the attack's fully modified damage (Strength,
 * Back Attack, Weak, the player's Vulnerable), as shown on the intent. A18+
 * uses the data's flat 99 block and has no effect.
 */
registerMoveEffect("BlockEqualToDamageDealt", (ctx, _effect, actions) => {
	const hit = actions.find((a): a is Extract<Action, { type: "damage" }> => a.type === "damage");
	if (!hit) return [...actions];
	const { damage } = calculateDamage(ctx.state, ctx.self, PLAYER, hit.baseDamage, null);
	return [...actions, { type: "block", source: ctx.self, amount: damage }];
});

// ── Spire Spear (slot 1) ────────────────────────────────────
// Turn 1 BURN_STRIKE; SKEWER every 3rd turn (2, 5, 8…); between Skewers
// BURN_STRIKE and PIERCER once each, the first picked 50/50 after SKEWER.

const SPEAR_BURN_STRIKE = mv("SPIRE_SPEAR_BURN_STRIKE");
const SPEAR_PIERCER = mv("SPIRE_SPEAR_PIERCER");
const SPEAR_SKEWER = mv("SPIRE_SPEAR_SKEWER");

registerMonsterAi("SPIRE_SPEAR", (ctx): MonsterAiResult => {
	const h = historyOf(ctx);
	const last = h[h.length - 1];
	if (last === undefined) return { moveId: SPEAR_BURN_STRIKE, aiRng: burnRoll(ctx.aiRng) };
	if (last === SPEAR_SKEWER) return coinFlip(ctx.aiRng, SPEAR_PIERCER, SPEAR_BURN_STRIKE);
	const pairStart = h[h.length - 2] === SPEAR_SKEWER;
	const second = last === SPEAR_BURN_STRIKE ? SPEAR_PIERCER : SPEAR_BURN_STRIKE;
	return { moveId: pairStart ? second : SPEAR_SKEWER, aiRng: burnRoll(ctx.aiRng) };
});

// PIERCER: Spire Shield (data "allies") and the Spear itself each gain 2 Strength.
registerMoveHandler("SPIRE_SPEAR_PIERCER", (ctx, actions) => [
	...actions,
	applyTo(ctx.self, ctx.self, "STRENGTH", 2),
]);

// ── Surrounded setup ────────────────────────────────────────
// Spire Shield's prebattle SURROUNDED goes on the player. The player starts
// facing right (the Spear), so the Shield on the left attacks from behind.

const PLAYER_SLOT = 1; // monsters in slots below this stand left of the player

registerEncounterSetup("SHIELD_AND_SPEAR", (state) => {
	const c = state.combat;
	if (!c) return state;
	const isSurrounded = (p: PowerInstance) => p.id.toUpperCase() === SURROUNDED;
	const monsters = c.monsters.map((m) => {
		const powers = m.powers.filter((p) => !isSurrounded(p));
		const behind = m.alive && m.index < PLAYER_SLOT;
		const back: PowerInstance = {
			id: canonicalPowerId(BACK_ATTACK),
			amount: 1,
			justApplied: false,
		};
		return { ...m, powers: behind ? [...powers, back] : powers };
	});
	const surrounded: PowerInstance = {
		id: canonicalPowerId(SURROUNDED),
		amount: 1,
		justApplied: false,
	};
	const player = { ...c.player, powers: [...c.player.powers, surrounded] };
	return { ...state, combat: { ...c, monsters, player } };
});

// ── Corrupt Heart ───────────────────────────────────────────
// Turn 1 DEBILITATE. After DEBILITATE or BUFF: BLOOD_SHOTS / ECHO 50/50; an
// attack on a monster turn divisible by 3 is followed by BUFF, otherwise by the
// other attack. Monster turn number = moves made so far (history length).

const HEART_DEBILITATE = mv("CORRUPT_HEART_DEBILITATE");
const HEART_BLOOD_SHOTS = mv("CORRUPT_HEART_BLOOD_SHOTS");
const HEART_ECHO = mv("CORRUPT_HEART_ECHO");
const HEART_BUFF = mv("CORRUPT_HEART_BUFF");

registerMonsterAi("CORRUPT_HEART", (ctx): MonsterAiResult => {
	const h = historyOf(ctx);
	const last = h[h.length - 1];
	if (last === undefined) return { moveId: HEART_DEBILITATE, aiRng: burnRoll(ctx.aiRng) };
	if (last === HEART_BLOOD_SHOTS || last === HEART_ECHO) {
		const other = last === HEART_ECHO ? HEART_BLOOD_SHOTS : HEART_ECHO;
		return { moveId: h.length % 3 === 0 ? HEART_BUFF : other, aiRng: burnRoll(ctx.aiRng) };
	}
	return coinFlip(ctx.aiRng, HEART_BLOOD_SHOTS, HEART_ECHO);
});

function strengthOf(ctx: MoveCtx): number {
	return ctx.monster.powers.find((p) => p.id.toUpperCase() === "STRENGTH")?.amount ?? 0;
}

/** BUFF: negative Strength is cleared, then +X (one Strength application). */
registerMoveEffect("ClearNegativeStrengthThenStrength", (ctx, effect, actions) => {
	const amount = Math.max(0, -strengthOf(ctx)) + (effect.amount ?? 2);
	return [...actions, applyTo(ctx.self, ctx.self, "STRENGTH", amount)];
});

/** The n-th BUFF (n counted from 1): Artifact 2, Beat of Death +1, Painful Stabs, Strength +10, then Strength +50. */
function heartBuff(ctx: MoveCtx, buffCount: number): Action {
	switch (buffCount) {
		case 1:
			return applyTo(ctx.self, ctx.self, "ARTIFACT", 2);
		case 2:
			return applyTo(ctx.self, ctx.self, "BEAT_OF_DEATH", 1);
		case 3:
			return applyTo(ctx.self, ctx.self, "PAINFUL_STABS", 1);
		case 4:
			return applyTo(ctx.self, ctx.self, "STRENGTH", 10);
		default:
			return applyTo(ctx.self, ctx.self, "STRENGTH", 50);
	}
}

registerMoveEffect("EscalatingBuff", (ctx, _effect, actions) => {
	const buffCount = ctx.monster.moveHistory.filter((m) => m === HEART_BUFF).length + 1;
	return [...actions, heartBuff(ctx, buffCount)];
});
