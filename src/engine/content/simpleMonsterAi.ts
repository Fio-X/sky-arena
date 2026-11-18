import type { MonsterMoveId } from "../core/types";
import { random } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── Cultist ──────────────────────────────────────────────
const INCANTATION = "CULTIST_INCANTATION" as MonsterMoveId;
const DARK_STRIKE = "CULTIST_DARK_STRIKE" as MonsterMoveId;

registerMonsterAi("CULTIST", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster || monster.moveHistory.length === 0) {
		return { moveId: INCANTATION, aiRng: rng };
	}
	return { moveId: DARK_STRIKE, aiRng: rng };
});

// ── Spike Slime (S) ─────────────────────────────────────
const SS_TACKLE = "SPIKE_SLIME_S_TACKLE" as MonsterMoveId;

registerMonsterAi("SPIKE_SLIME_S", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	return { moveId: SS_TACKLE, aiRng: rng };
});

// ── Mad Gremlin ──────────────────────────────────────────
const SCRATCH = "MAD_GREMLIN_SCRATCH" as MonsterMoveId;

registerMonsterAi("MAD_GREMLIN", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	return { moveId: SCRATCH, aiRng: rng };
});

// ── Sneaky Gremlin ───────────────────────────────────────
const PUNCTURE = "SNEAKY_GREMLIN_PUNCTURE" as MonsterMoveId;

registerMonsterAi("SNEAKY_GREMLIN", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	return { moveId: PUNCTURE, aiRng: rng };
});

// ── Fat Gremlin ──────────────────────────────────────────
const SMASH = "FAT_GREMLIN_SMASH" as MonsterMoveId;

registerMonsterAi("FAT_GREMLIN", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	return { moveId: SMASH, aiRng: rng };
});
