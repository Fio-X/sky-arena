/**
 * Act 2 elite/boss/event monster AI — Gremlin Leader, Taskmaster,
 * Bear, Romeo, Pointy, Bronze Automaton, Bronze Orb,
 * The Collector, Torch Head, The Champ.
 */

import type { MonsterMoveId, RngState } from "../core/types";
import { random } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── helpers ─────────────────────────────────────────────────

function lastMove(h: MonsterMoveId[], id: MonsterMoveId): boolean {
	return h.length > 0 && h[h.length - 1] === id;
}

function lastTwoMoves(h: MonsterMoveId[], id: MonsterMoveId): boolean {
	return h.length >= 2 && h[h.length - 1] === id && h[h.length - 2] === id;
}

// ── Gremlin Leader (elite) ──────────────────────────────────
// Move depends on living gremlin count.
// 0 gremlins: RALLY 75% / STAB 25%
// 1 gremlin: RALLY 50% / ENCOURAGE 30% / STAB 20%
// 2+ gremlins: ENCOURAGE 66% / STAB 34%

const GL_RALLY = "GREMLIN_LEADER_RALLY" as MonsterMoveId;
const GL_ENC = "GREMLIN_LEADER_ENCOURAGE" as MonsterMoveId;
const GL_STAB = "GREMLIN_LEADER_STAB" as MonsterMoveId;

function glNoGremlins(h: MonsterMoveId[], roll: number, rng: RngState): MonsterAiResult {
	if (roll < 75) {
		return { moveId: lastMove(h, GL_RALLY) ? GL_STAB : GL_RALLY, aiRng: rng };
	}
	return { moveId: lastMove(h, GL_STAB) ? GL_RALLY : GL_STAB, aiRng: rng };
}

function glOneGremlin(h: MonsterMoveId[], roll: number, rng: RngState): MonsterAiResult {
	if (roll < 50) {
		if (lastMove(h, GL_RALLY)) {
			const r2 = random(rng, 49);
			const roll2 = r2.value + 50;
			return { moveId: roll2 < 80 ? GL_ENC : GL_STAB, aiRng: r2.state };
		}
		return { moveId: GL_RALLY, aiRng: rng };
	}
	if (roll < 80) {
		return { moveId: lastMove(h, GL_ENC) ? GL_STAB : GL_ENC, aiRng: rng };
	}
	if (lastMove(h, GL_STAB)) {
		const r2 = random(rng, 80);
		return { moveId: r2.value < 50 ? GL_RALLY : GL_ENC, aiRng: r2.state };
	}
	return { moveId: GL_STAB, aiRng: rng };
}

registerMonsterAi("GREMLIN_LEADER", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: GL_STAB, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	const combat = ctx.state.combat!;
	const aliveGremlins = combat.monsters.filter(
		(m, i) => i !== ctx.monsterIndex && m.alive && !m.halfDead,
	).length;

	if (aliveGremlins === 0) return glNoGremlins(h, roll, rng);
	if (aliveGremlins === 1) return glOneGremlin(h, roll, rng);

	if (roll < 66) {
		return { moveId: lastMove(h, GL_ENC) ? GL_STAB : GL_ENC, aiRng: rng };
	}
	return { moveId: lastMove(h, GL_STAB) ? GL_ENC : GL_STAB, aiRng: rng };
});

// ── Taskmaster (elite) ──────────────────────────────────────
// Only one move: SCOURING_WHIP every turn. Burns one roll per turn.

const TM_WHIP = "TASKMASTER_SCOURING_WHIP" as MonsterMoveId;

registerMonsterAi("TASKMASTER", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	return { moveId: TM_WHIP, aiRng: rng };
});

// ── Bear (event: Masked Bandits) ────────────────────────────
// Fixed script: BEAR_HUG → LUNGE, MAUL, LUNGE, MAUL …
// No aiRng burned after initial roll.

const BR_HUG = "BEAR_BEAR_HUG" as MonsterMoveId;
const BR_LUNGE = "BEAR_LUNGE" as MonsterMoveId;
const BR_MAUL = "BEAR_MAUL" as MonsterMoveId;

registerMonsterAi("BEAR", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: BR_HUG, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: BR_HUG, aiRng: ctx.aiRng };

	const last = h[h.length - 1];
	if (last === BR_HUG) return { moveId: BR_LUNGE, aiRng: ctx.aiRng };
	if (last === BR_LUNGE) return { moveId: BR_MAUL, aiRng: ctx.aiRng };
	return { moveId: BR_LUNGE, aiRng: ctx.aiRng }; // after MAUL
});

// ── Romeo (event: Masked Bandits) ───────────────────────────
// Fixed script: MOCK → AGONIZING_SLASH, CROSS_SLASH, repeat.

const RM_MOCK = "ROMEO_MOCK" as MonsterMoveId;
const RM_AGON = "ROMEO_AGONIZING_SLASH" as MonsterMoveId;
const RM_CROSS = "ROMEO_CROSS_SLASH" as MonsterMoveId;

registerMonsterAi("ROMEO", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: RM_MOCK, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: RM_MOCK, aiRng: ctx.aiRng };

	const last = h[h.length - 1];
	if (last === RM_MOCK || last === RM_CROSS) return { moveId: RM_AGON, aiRng: ctx.aiRng };
	return { moveId: RM_CROSS, aiRng: ctx.aiRng }; // after AGONIZING_SLASH
});

// ── Pointy (event: Masked Bandits) ──────────────────────────
// Only one move: POINTY_ATTACK every turn.

const PT_ATK = "POINTY_ATTACK" as MonsterMoveId;

registerMonsterAi("POINTY", (ctx): MonsterAiResult => {
	return { moveId: PT_ATK, aiRng: ctx.aiRng };
});

// ── Bronze Automaton (boss) ─────────────────────────────────
// Fixed script: SPAWN_ORBS, then cycle
//   below A19: FLAIL, BOOST, FLAIL, BOOST, HYPER_BEAM, STUNNED (repeat)
//   A19+: FLAIL, BOOST, FLAIL, BOOST, HYPER_BEAM, then [BOOST, FLAIL, BOOST, HYPER_BEAM]
// Burns one aiRng.random(99) per turn.
// miscInfo bit tracking: we use moveHistory to deduce phase.

const BA_SPAWN = "BRONZE_AUTOMATON_SPAWN_ORBS" as MonsterMoveId;
const BA_FLAIL = "BRONZE_AUTOMATON_FLAIL" as MonsterMoveId;
const BA_BOOST = "BRONZE_AUTOMATON_BOOST" as MonsterMoveId;
const BA_HYPER = "BRONZE_AUTOMATON_HYPER_BEAM" as MonsterMoveId;
const BA_STUN = "BRONZE_AUTOMATON_STUNNED" as MonsterMoveId;

registerMonsterAi("BRONZE_AUTOMATON", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: BA_SPAWN, aiRng: rng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: BA_SPAWN, aiRng: rng };

	const last = h[h.length - 1];
	if (last === BA_SPAWN) return { moveId: BA_FLAIL, aiRng: rng };
	if (last === BA_STUN) return { moveId: BA_FLAIL, aiRng: rng };
	if (last === BA_FLAIL) return { moveId: BA_BOOST, aiRng: rng };

	if (last === BA_HYPER) {
		return { moveId: ctx.state.ascension >= 19 ? BA_BOOST : BA_STUN, aiRng: rng };
	}

	// last === BA_BOOST: determine if this is the "pre-beam" or "post-flail" boost
	// Count how many BOOSTs since last FLAIL/HYPER_BEAM/SPAWN/STUN
	// The pattern: FLAIL → BOOST → FLAIL → BOOST → HYPER_BEAM
	// So after BOOST, check miscInfo (lastBoostWasFlail).
	// We track it via history: count consecutive non-HYPER moves since the last
	// HYPER_BEAM/SPAWN/STUN to find position in the cycle.
	let pos = 0;
	for (let i = h.length - 1; i >= 0; i--) {
		if (h[i] === BA_HYPER || h[i] === BA_SPAWN || h[i] === BA_STUN) break;
		pos++;
	}
	// In the cycle: pos 1=FLAIL, 2=BOOST(1st), 3=FLAIL, 4=BOOST(2nd)→HYPER
	// After 1st BOOST (pos=2): next is FLAIL
	// After 2nd BOOST (pos=4): next is HYPER_BEAM
	if (pos >= 4) return { moveId: BA_HYPER, aiRng: rng };
	return { moveId: BA_FLAIL, aiRng: rng };
});

// ── Bronze Orb (minion of Bronze Automaton) ─────────────────
// STASIS once (75% first chance), then BEAM 70% / SUPPORT_BEAM 30%.
// miscInfo tracks usedStasis; we check moveHistory for STASIS.

const BO_BEAM = "BRONZE_ORB_BEAM" as MonsterMoveId;
const BO_SUPPORT = "BRONZE_ORB_SUPPORT_BEAM" as MonsterMoveId;
const BO_STASIS = "BRONZE_ORB_STASIS" as MonsterMoveId;

registerMonsterAi("BRONZE_ORB", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: BO_BEAM, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	const usedStasis = h.includes(BO_STASIS);

	if (!usedStasis && roll >= 25) return { moveId: BO_STASIS, aiRng: rng };

	if (roll >= 70 && !lastTwoMoves(h, BO_SUPPORT)) {
		return { moveId: BO_SUPPORT, aiRng: rng };
	}
	if (!lastTwoMoves(h, BO_BEAM)) return { moveId: BO_BEAM, aiRng: rng };
	return { moveId: BO_SUPPORT, aiRng: rng };
});

// ── The Collector (boss) ────────────────────────────────────
// Turn 1: SPAWN. Turn 4: MEGA_DEBUFF.
// Otherwise: SPAWN 26% (if < 2 Torch Heads) / FIREBALL 45% / BUFF 29%.

const TC_SPAWN = "THE_COLLECTOR_SPAWN" as MonsterMoveId;
const TC_FIRE = "THE_COLLECTOR_FIREBALL" as MonsterMoveId;
const TC_BUFF = "THE_COLLECTOR_BUFF" as MonsterMoveId;
const TC_MEGA = "THE_COLLECTOR_MEGA_DEBUFF" as MonsterMoveId;

registerMonsterAi("THE_COLLECTOR", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: TC_SPAWN, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	if (h.length === 0) return { moveId: TC_SPAWN, aiRng: rng };

	// Turn 4 (moveHistory length 3 means selecting move for turn 4)
	if (h.length === 3) return { moveId: TC_MEGA, aiRng: rng };

	const combat = ctx.state.combat!;
	const monstersAlive = combat.monsters.filter((m) => m.alive && !m.halfDead).length;
	const canSpawn = monstersAlive < 3 && !lastMove(h, TC_SPAWN);

	if (roll <= 25 && canSpawn) return { moveId: TC_SPAWN, aiRng: rng };
	if (roll <= 70 && !lastTwoMoves(h, TC_FIRE)) return { moveId: TC_FIRE, aiRng: rng };
	if (lastMove(h, TC_BUFF)) return { moveId: TC_FIRE, aiRng: rng };
	return { moveId: TC_BUFF, aiRng: rng };
});

// ── Torch Head (minion of The Collector) ────────────────────
// Only one move: TACKLE every turn. No aiRng consumed.

const TH_TACKLE = "TORCH_HEAD_TACKLE" as MonsterMoveId;

registerMonsterAi("TORCH_HEAD", (ctx): MonsterAiResult => {
	return { moveId: TH_TACKLE, aiRng: ctx.aiRng };
});

// ── The Champ (boss) ────────────────────────────────────────
// Phase 1: TAUNT on turns 4,8,12…; shared table otherwise.
// Phase 2 at <50% HP: ANGER (once), then EXECUTE every 3rd turn.
// miscInfo bits: 0-1 = defensiveStanceUseCount, bit 2 = phase2 flag.

const TC2_HEAVY = "THE_CHAMP_HEAVY_SLASH" as MonsterMoveId;
const TC2_FACE = "THE_CHAMP_FACE_SLAP" as MonsterMoveId;
const TC2_STANCE = "THE_CHAMP_DEFENSIVE_STANCE" as MonsterMoveId;
const TC2_GLOAT = "THE_CHAMP_GLOAT" as MonsterMoveId;
const TC2_TAUNT = "THE_CHAMP_TAUNT" as MonsterMoveId;
const TC2_ANGER = "THE_CHAMP_ANGER" as MonsterMoveId;
const TC2_EXECUTE = "THE_CHAMP_EXECUTE" as MonsterMoveId;

registerMonsterAi("THE_CHAMP", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: TC2_HEAVY, aiRng: ctx.aiRng };
	const h = monster.moveHistory;
	const asc = ctx.state.ascension;
	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	// Decode miscInfo: bits 0-1 = stanceUseCount, bit 2 = phase2 flag
	const phase2 = (monster.miscInfo & 0x4) !== 0;
	const stanceUseCount = monster.miscInfo & 0x3;

	if (phase2) {
		// EXECUTE every 3rd turn: if neither of the last two moves is EXECUTE
		const last1 = h.length > 0 ? h[h.length - 1] : null;
		const last2 = h.length > 1 ? h[h.length - 2] : null;
		if (last1 !== TC2_EXECUTE && last2 !== TC2_EXECUTE) {
			return { moveId: TC2_EXECUTE, aiRng: rng };
		}
		// fall through to shared table
	} else {
		// Phase 1: check for phase transition
		if (monster.currentHp < monster.maxHp / 2) {
			return { moveId: TC2_ANGER, aiRng: rng }; // action executor sets phase2 flag
		}

		// TAUNT on turns 4, 8, 12 … (turn number = h.length + 1; check (h.length + 1) % 4 == 0)
		// spec says: (getMonsterTurnNumber() + 1) % 4 == 0
		// monsterTurnNumber is h.length (0-indexed turns already taken)
		// so the check is (h.length + 1) % 4 === 0
		if ((h.length + 1) % 4 === 0) {
			return { moveId: TC2_TAUNT, aiRng: rng };
		}
	}

	// Shared table (phase 1 non-taunt, phase 2 non-execute)
	const stanceThreshold = asc >= 19 ? 30 : 15;
	if (roll <= stanceThreshold && !lastMove(h, TC2_STANCE) && stanceUseCount < 2) {
		return { moveId: TC2_STANCE, aiRng: rng };
	}
	if (roll <= 30 && !lastMove(h, TC2_GLOAT) && !lastMove(h, TC2_STANCE)) {
		return { moveId: TC2_GLOAT, aiRng: rng };
	}
	if (roll <= 55 && !lastMove(h, TC2_FACE)) {
		return { moveId: TC2_FACE, aiRng: rng };
	}
	if (!lastMove(h, TC2_HEAVY)) return { moveId: TC2_HEAVY, aiRng: rng };
	return { moveId: TC2_FACE, aiRng: rng };
});
