import type { MonsterMoveId, MonsterState } from "../core/types";
import { random } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── Lagavulin (elite) ────────────────────────────────────
const LG_SLEEP = "LAGAVULIN_SLEEP" as MonsterMoveId;
const LG_ATTACK = "LAGAVULIN_ATTACK" as MonsterMoveId;
const LG_SIPHON = "LAGAVULIN_SIPHON_SOUL" as MonsterMoveId;

/** Monsters spawn with the canonical id "ASLEEP" (ADR-5): compare case-insensitively. */
function isAsleep(m: MonsterState): boolean {
	return m.powers.some((p) => p.id.toUpperCase() === "ASLEEP");
}

registerMonsterAi("LAGAVULIN", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: LG_ATTACK, aiRng: rng };
	const h = monster.moveHistory;

	// Init: SLEEP if asleep, else SIPHON_SOUL (Dead Adventurer event)
	if (h.length === 0) {
		return { moveId: isAsleep(monster) ? LG_SLEEP : LG_SIPHON, aiRng: rng };
	}

	const last = h[h.length - 1];

	// After SLEEP: wake after 3 sleeps or when ASLEEP power removed
	if (last === LG_SLEEP) {
		const sleepCount = h.filter((m) => m === LG_SLEEP).length;
		if (!isAsleep(monster) || sleepCount >= 3) return { moveId: LG_ATTACK, aiRng: rng };
		return { moveId: LG_SLEEP, aiRng: rng };
	}

	// After SIPHON_SOUL: always ATTACK
	if (last === LG_SIPHON) return { moveId: LG_ATTACK, aiRng: rng };

	// After ATTACK: SIPHON_SOUL if two ATTACKs in a row
	const lastTwoAttack =
		h.length >= 2 && h[h.length - 1] === LG_ATTACK && h[h.length - 2] === LG_ATTACK;
	if (lastTwoAttack) return { moveId: LG_SIPHON, aiRng: rng };
	return { moveId: LG_ATTACK, aiRng: rng };
});

// ── Sentry (elite) ───────────────────────────────────────
const SE_BOLT = "SENTRY_BOLT" as MonsterMoveId;
const SE_BEAM = "SENTRY_BEAM" as MonsterMoveId;

registerMonsterAi("SENTRY", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SE_BOLT, aiRng: rng };
	const h = monster.moveHistory;

	// Init: phase determined by spawn position
	if (h.length === 0) {
		return { moveId: monster.index % 2 === 0 ? SE_BOLT : SE_BEAM, aiRng: rng };
	}

	// Strict alternation
	return { moveId: h[h.length - 1] === SE_BOLT ? SE_BEAM : SE_BOLT, aiRng: rng };
});
