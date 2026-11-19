/**
 * Act 2 normal monster AI — Spheric Guardian, Chosen, Shelled Parasite,
 * Byrd, Mugger, Centurion, Mystic, Snake Plant, Snecko, Book of Stabbing.
 */

import type { MonsterMoveId } from "../core/types";
import { random, randomBoolean, randomBooleanWithChance } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── helpers ─────────────────────────────────────────────────

function lastMove(h: MonsterMoveId[], id: MonsterMoveId): boolean {
	return h.length > 0 && h[h.length - 1] === id;
}

function lastTwoMoves(h: MonsterMoveId[], id: MonsterMoveId): boolean {
	return h.length >= 2 && h[h.length - 1] === id && h[h.length - 2] === id;
}

// ── Spheric Guardian ────────────────────────────────────────
// Fixed script: ACTIVATE → ATTACK_DEBUFF → SLAM, HARDEN, SLAM, HARDEN …
// Burns one aiRng.random(99) every turn.

const SG_ACTIVATE = "SPHERIC_GUARDIAN_ACTIVATE" as MonsterMoveId;
const SG_ATK_DEBUFF = "SPHERIC_GUARDIAN_ATTACK_DEBUFF" as MonsterMoveId;
const SG_SLAM = "SPHERIC_GUARDIAN_SLAM" as MonsterMoveId;
const SG_HARDEN = "SPHERIC_GUARDIAN_HARDEN" as MonsterMoveId;

registerMonsterAi("SPHERIC_GUARDIAN", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99); // burn one roll every turn
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SG_ACTIVATE, aiRng: rng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: SG_ACTIVATE, aiRng: rng };

	const last = h[h.length - 1];
	if (last === SG_ACTIVATE) return { moveId: SG_ATK_DEBUFF, aiRng: rng };
	if (last === SG_ATK_DEBUFF) return { moveId: SG_SLAM, aiRng: rng };
	if (last === SG_SLAM) return { moveId: SG_HARDEN, aiRng: rng };
	return { moveId: SG_SLAM, aiRng: rng }; // after HARDEN → SLAM
});

// ── Chosen ──────────────────────────────────────────────────
// A<17: POKE, HEX, then alternating debuff/attack.
// A17+: HEX, then alternating debuff/attack.

const CH_POKE = "CHOSEN_POKE" as MonsterMoveId;
const CH_ZAP = "CHOSEN_ZAP" as MonsterMoveId;
const CH_DEBIL = "CHOSEN_DEBILITATE" as MonsterMoveId;
const CH_DRAIN = "CHOSEN_DRAIN" as MonsterMoveId;
const CH_HEX = "CHOSEN_HEX" as MonsterMoveId;

registerMonsterAi("CHOSEN", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: CH_POKE, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const asc = ctx.state.ascension;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	if (h.length === 0) {
		return { moveId: asc >= 17 ? CH_HEX : CH_POKE, aiRng: rng };
	}

	// A<17: second turn is always HEX
	if (asc < 17 && h.length === 1) {
		return { moveId: CH_HEX, aiRng: rng };
	}

	const last = h[h.length - 1];
	const isDebuffTurn = last !== CH_DEBIL && last !== CH_DRAIN;

	if (isDebuffTurn) {
		return { moveId: roll < 50 ? CH_DEBIL : CH_DRAIN, aiRng: rng };
	}
	// attack turn
	return { moveId: roll < 40 ? CH_ZAP : CH_POKE, aiRng: rng };
});

// ── Shelled Parasite ────────────────────────────────────────
// First turn: A17+ → FELL; else 50/50 DOUBLE_STRIKE/SUCK.
// Then: FELL 20%, DOUBLE_STRIKE 40%, SUCK 40% with history limits.

const SP_FELL = "SHELLED_PARASITE_FELL" as MonsterMoveId;
const SP_DOUBLE = "SHELLED_PARASITE_DOUBLE_STRIKE" as MonsterMoveId;
const SP_SUCK = "SHELLED_PARASITE_SUCK" as MonsterMoveId;
// STUNNED intent is set by the stun mechanic, not AI-selected

registerMonsterAi("SHELLED_PARASITE", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SP_FELL, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const asc = ctx.state.ascension;

	if (h.length === 0) {
		if (asc >= 17) return { moveId: SP_FELL, aiRng: ctx.aiRng };
		const { value: pick, state: rng } = randomBoolean(ctx.aiRng);
		return { moveId: pick ? SP_DOUBLE : SP_SUCK, aiRng: rng };
	}

	const { value: roll, state: rng1 } = random(ctx.aiRng, 99);
	let rng = rng1;
	let roll2 = 100; // sentinel

	if (roll < 20) {
		if (!lastMove(h, SP_FELL)) return { moveId: SP_FELL, aiRng: rng };
		// reroll into 20-99
		const r2 = random(rng, 79);
		roll2 = r2.value + 20;
		rng = r2.state;
	}

	if (roll < 60 || roll2 < 60) {
		if (!lastTwoMoves(h, SP_DOUBLE)) return { moveId: SP_DOUBLE, aiRng: rng };
		return { moveId: SP_SUCK, aiRng: rng };
	}

	if (!lastTwoMoves(h, SP_SUCK)) return { moveId: SP_SUCK, aiRng: rng };
	return { moveId: SP_DOUBLE, aiRng: rng };
});

// ── Byrd ────────────────────────────────────────────────────
// Airborne AI with flight. Grounded script: STUNNED → HEADBUTT → FLY.

const BY_PECK = "BYRD_PECK" as MonsterMoveId;
const BY_SWOOP = "BYRD_SWOOP" as MonsterMoveId;
const BY_CAW = "BYRD_CAW" as MonsterMoveId;
const BY_STUNNED = "BYRD_STUNNED" as MonsterMoveId;
const BY_HEADBUTT = "BYRD_HEADBUTT" as MonsterMoveId;
const BY_FLY = "BYRD_FLY" as MonsterMoveId;

registerMonsterAi("BYRD", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: BY_PECK, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	// Grounded script: after STUNNED → HEADBUTT, after HEADBUTT → FLY
	const last = h.length > 0 ? h[h.length - 1] : null;
	if (last === BY_STUNNED) {
		const { state: rng } = random(ctx.aiRng, 99); // burn roll
		return { moveId: BY_HEADBUTT, aiRng: rng };
	}
	if (last === BY_HEADBUTT) {
		return { moveId: BY_FLY, aiRng: ctx.aiRng }; // no burn
	}

	// Airborne AI
	const { value: _roll, state: rng1 } = random(ctx.aiRng, 99);

	if (h.length === 0) {
		// First turn: 37.5% CAW, 62.5% PECK
		const { value: caw, state: rng2 } = randomBooleanWithChance(rng1, 0.375);
		return { moveId: caw ? BY_CAW : BY_PECK, aiRng: rng2 };
	}

	const roll = _roll;
	let rng = rng1;

	if (roll < 50) {
		if (lastTwoMoves(h, BY_PECK)) {
			const r = randomBooleanWithChance(rng, 0.4);
			rng = r.state;
			return { moveId: r.value ? BY_SWOOP : BY_CAW, aiRng: rng };
		}
		return { moveId: BY_PECK, aiRng: rng };
	}
	if (roll < 70) {
		if (lastMove(h, BY_SWOOP)) {
			const r = randomBooleanWithChance(rng, 0.375);
			rng = r.state;
			return { moveId: r.value ? BY_CAW : BY_PECK, aiRng: rng };
		}
		return { moveId: BY_SWOOP, aiRng: rng };
	}
	// roll >= 70
	if (lastMove(h, BY_CAW)) {
		const r = randomBooleanWithChance(rng, 0.2857);
		rng = r.state;
		return { moveId: r.value ? BY_SWOOP : BY_PECK, aiRng: rng };
	}
	return { moveId: BY_CAW, aiRng: rng };
});

// ── Mugger ──────────────────────────────────────────────────
// Fixed script: MUG, MUG, then 50/50 → SMOKE_BOMB→ESCAPE or LUNGE→SMOKE_BOMB→ESCAPE.

const MG_MUG = "MUGGER_MUG" as MonsterMoveId;
const MG_LUNGE = "MUGGER_LUNGE" as MonsterMoveId;
const MG_SMOKE = "MUGGER_SMOKE_BOMB" as MonsterMoveId;
const MG_ESCAPE = "MUGGER_ESCAPE" as MonsterMoveId;

registerMonsterAi("MUGGER", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: MG_MUG, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: MG_MUG, aiRng: ctx.aiRng };

	const last = h[h.length - 1];

	// After first MUG (turn 1): burn dialog roll, next = MUG
	if (h.length === 1 && last === MG_MUG) {
		const { state: rng } = randomBooleanWithChance(ctx.aiRng, 0.6);
		return { moveId: MG_MUG, aiRng: rng };
	}

	// After second MUG (turn 2): 50/50 SMOKE_BOMB or LUNGE
	if (last === MG_MUG) {
		const { value: pick, state: rng } = randomBooleanWithChance(ctx.aiRng, 0.5);
		return { moveId: pick ? MG_SMOKE : MG_LUNGE, aiRng: rng };
	}

	// Deterministic chain
	if (last === MG_LUNGE) return { moveId: MG_SMOKE, aiRng: ctx.aiRng };
	if (last === MG_SMOKE) return { moveId: MG_ESCAPE, aiRng: ctx.aiRng };
	return { moveId: MG_ESCAPE, aiRng: ctx.aiRng };
});

// ── Centurion ───────────────────────────────────────────────
// 65% SLASH-side, 35% support-side (DEFEND while Mystic lives, FURY when dead).

const CN_SLASH = "CENTURION_SLASH" as MonsterMoveId;
const CN_FURY = "CENTURION_FURY" as MonsterMoveId;
const CN_DEFEND = "CENTURION_DEFEND" as MonsterMoveId;

registerMonsterAi("CENTURION", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: CN_SLASH, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	const combat = ctx.state.combat;
	const mysticAlive = combat
		? combat.monsters.some((m, i) => i !== ctx.monsterIndex && m.alive && !m.halfDead)
		: false;

	const supportMove = mysticAlive ? CN_DEFEND : CN_FURY;

	if (roll >= 65 && !lastTwoMoves(h, CN_DEFEND) && !lastTwoMoves(h, CN_FURY)) {
		return { moveId: supportMove, aiRng: rng };
	}
	if (!lastTwoMoves(h, CN_SLASH)) return { moveId: CN_SLASH, aiRng: rng };
	return { moveId: supportMove, aiRng: rng };
});

// ── Mystic ──────────────────────────────────────────────────
// Heals if any of the pair is missing >= threshold HP, else 60% attack / 40% buff.

const MY_ATK = "MYSTIC_ATTACK_DEBUFF" as MonsterMoveId;
const MY_HEAL = "MYSTIC_HEAL" as MonsterMoveId;
const MY_BUFF = "MYSTIC_BUFF" as MonsterMoveId;

registerMonsterAi("MYSTIC", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: MY_ATK, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const asc = ctx.state.ascension;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	const healNeed = asc >= 17 ? 21 : 16;
	const combat = ctx.state.combat!;

	// Find the Centurion (the other monster in the pair)
	const knight = combat.monsters.find((m, i) => i !== ctx.monsterIndex && m.alive && !m.halfDead);

	const selfMissing = monster.maxHp - monster.currentHp;
	const knightMissing = knight ? knight.maxHp - knight.currentHp : 0;

	if (selfMissing >= healNeed || knightMissing >= healNeed) {
		return { moveId: MY_HEAL, aiRng: rng };
	}

	const atkLimit = asc >= 17 ? !lastMove(h, MY_ATK) : !lastTwoMoves(h, MY_ATK);
	if (roll >= 40 && atkLimit) return { moveId: MY_ATK, aiRng: rng };
	if (!lastTwoMoves(h, MY_BUFF)) return { moveId: MY_BUFF, aiRng: rng };
	return { moveId: MY_ATK, aiRng: rng };
});

// ── Snake Plant ─────────────────────────────────────────────
// 65% CHOMP, 35% ENFEEBLING_SPORES; history limits differ by ascension.

const SNP_CHOMP = "SNAKE_PLANT_CHOMP" as MonsterMoveId;
const SNP_SPORES = "SNAKE_PLANT_ENFEEBLING_SPORES" as MonsterMoveId;

registerMonsterAi("SNAKE_PLANT", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SNP_CHOMP, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const asc = ctx.state.ascension;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	if (asc >= 17) {
		if (roll < 65) {
			return { moveId: lastTwoMoves(h, SNP_CHOMP) ? SNP_SPORES : SNP_CHOMP, aiRng: rng };
		}
		return {
			moveId: !lastTwoMoves(h, SNP_SPORES) ? SNP_SPORES : SNP_CHOMP,
			aiRng: rng,
		};
	}
	// asc < 17
	if (roll < 65) {
		return { moveId: lastTwoMoves(h, SNP_CHOMP) ? SNP_SPORES : SNP_CHOMP, aiRng: rng };
	}
	return { moveId: lastMove(h, SNP_SPORES) ? SNP_CHOMP : SNP_SPORES, aiRng: rng };
});

// ── Snecko ──────────────────────────────────────────────────
// Turn 1: PERPLEXING_GLARE (Confused). Then BITE 60%, TAIL_WHIP 40%.

const SK_GLARE = "SNECKO_PERPLEXING_GLARE" as MonsterMoveId;
const SK_BITE = "SNECKO_BITE" as MonsterMoveId;
const SK_TAIL = "SNECKO_TAIL_WHIP" as MonsterMoveId;

registerMonsterAi("SNECKO", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SK_GLARE, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	if (h.length === 0) return { moveId: SK_GLARE, aiRng: rng };

	if (roll < 40 || lastTwoMoves(h, SK_BITE)) {
		return { moveId: SK_TAIL, aiRng: rng };
	}
	return { moveId: SK_BITE, aiRng: rng };
});

// ── Book of Stabbing ────────────────────────────────────────
// 85% MULTI_STAB (escalating hits), 15% SINGLE_STAB.
// miscInfo tracks stabCount (hit count for multi-stab).

const BOS_MULTI = "BOOK_OF_STABBING_MULTI_STAB" as MonsterMoveId;
const BOS_SINGLE = "BOOK_OF_STABBING_SINGLE_STAB" as MonsterMoveId;

registerMonsterAi("BOOK_OF_STABBING", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: BOS_MULTI, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	// stabCount is tracked via miscInfo; starts at 1 (set at preBattle).
	// The AI selection logic decides whether to increment it.
	// We replicate the selection logic here; the actual miscInfo update
	// happens in the action executor.

	if (roll < 15) {
		if (!lastMove(h, BOS_SINGLE)) return { moveId: BOS_SINGLE, aiRng: rng };
		return { moveId: BOS_MULTI, aiRng: rng }; // ++stabCount
	}
	if (lastTwoMoves(h, BOS_MULTI)) return { moveId: BOS_SINGLE, aiRng: rng };
	return { moveId: BOS_MULTI, aiRng: rng }; // ++stabCount
});
