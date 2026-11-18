import type { MonsterMoveId, RngState } from "../core/types";
import { random, randomBoolean, randomBooleanWithChance } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── helpers ──────────────────────────────────────────────

function last(h: readonly MonsterMoveId[]): MonsterMoveId | undefined {
	return h[h.length - 1];
}

function lastTwo(h: readonly MonsterMoveId[], id: MonsterMoveId): boolean {
	return h.length >= 2 && h[h.length - 1] === id && h[h.length - 2] === id;
}

interface ThreeMoveBranch {
	threshold: number;
	move: MonsterMoveId;
	block: "lastTwo" | "last" | "never";
	blockChance: number;
	altA: MonsterMoveId;
	altB: MonsterMoveId;
}

function threeWayAi(
	h: readonly MonsterMoveId[],
	roll: number,
	rng: RngState,
	branches: [ThreeMoveBranch, ThreeMoveBranch, ThreeMoveBranch],
): MonsterAiResult {
	for (const b of branches) {
		if (roll >= b.threshold) continue;
		const blocked =
			b.block === "lastTwo" ? lastTwo(h, b.move) : b.block === "last" ? last(h) === b.move : false;
		if (!blocked) return { moveId: b.move, aiRng: rng };
		const { value: p, state: r } = randomBooleanWithChance(rng, b.blockChance);
		return { moveId: p ? b.altA : b.altB, aiRng: r };
	}
	// Should never reach here if thresholds cover [0,100)
	return { moveId: branches[2].move, aiRng: rng };
}

// ── Acid Slime (S) ───────────────────────────────────────
const AS_LICK = "ACID_SLIME_S_LICK" as MonsterMoveId;
const AS_TACKLE = "ACID_SLIME_S_TACKLE" as MonsterMoveId;

registerMonsterAi("ACID_SLIME_S", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: AS_LICK, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) {
		const { state: rng } = random(ctx.aiRng, 99);
		if (ctx.state.ascension >= 17) return { moveId: AS_LICK, aiRng: rng };
		const { value: pick, state: rng2 } = randomBoolean(rng);
		return { moveId: pick ? AS_TACKLE : AS_LICK, aiRng: rng2 };
	}
	return { moveId: last(h) === AS_LICK ? AS_TACKLE : AS_LICK, aiRng: ctx.aiRng };
});

// ── Acid Slime (M) ───────────────────────────────────────
const AM_SPIT = "ACID_SLIME_M_CORROSIVE_SPIT" as MonsterMoveId;
const AM_TACKLE = "ACID_SLIME_M_TACKLE" as MonsterMoveId;
const AM_LICK = "ACID_SLIME_M_LICK" as MonsterMoveId;

registerMonsterAi("ACID_SLIME_M", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: AM_SPIT, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;

	if (ctx.state.ascension >= 17) {
		return threeWayAi(h, roll, rng, [
			{
				threshold: 40,
				move: AM_SPIT,
				block: "lastTwo",
				blockChance: 0.5,
				altA: AM_TACKLE,
				altB: AM_LICK,
			},
			{
				threshold: 80,
				move: AM_TACKLE,
				block: "lastTwo",
				blockChance: 0.5,
				altA: AM_SPIT,
				altB: AM_LICK,
			},
			{
				threshold: 100,
				move: AM_LICK,
				block: "last",
				blockChance: 0.4,
				altA: AM_SPIT,
				altB: AM_TACKLE,
			},
		]);
	}
	return threeWayAi(h, roll, rng, [
		{
			threshold: 30,
			move: AM_SPIT,
			block: "lastTwo",
			blockChance: 0.5,
			altA: AM_TACKLE,
			altB: AM_LICK,
		},
		{
			threshold: 70,
			move: AM_TACKLE,
			block: "last",
			blockChance: 0.4,
			altA: AM_SPIT,
			altB: AM_LICK,
		},
		{
			threshold: 100,
			move: AM_LICK,
			block: "lastTwo",
			blockChance: 0.4,
			altA: AM_SPIT,
			altB: AM_TACKLE,
		},
	]);
});

// ── Acid Slime (L) ───────────────────────────────────────
const AL_SPIT = "ACID_SLIME_L_CORROSIVE_SPIT" as MonsterMoveId;
const AL_TACKLE = "ACID_SLIME_L_TACKLE" as MonsterMoveId;
const AL_LICK = "ACID_SLIME_L_LICK" as MonsterMoveId;
const AL_SPLIT = "ACID_SLIME_L_SPLIT" as MonsterMoveId;

registerMonsterAi("ACID_SLIME_L", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: AL_SPIT, aiRng: ctx.aiRng };

	if (monster.halfDead) return { moveId: AL_SPLIT, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;

	if (ctx.state.ascension >= 17) {
		// Bug: lightspeed checks MEDIUM spit ID → SPIT unconstrained at asc17
		return threeWayAi(h, roll, rng, [
			{
				threshold: 40,
				move: AL_SPIT,
				block: "never",
				blockChance: 0,
				altA: AL_SPIT,
				altB: AL_SPIT,
			},
			{
				threshold: 70,
				move: AL_TACKLE,
				block: "lastTwo",
				blockChance: 0.6,
				altA: AL_SPIT,
				altB: AL_LICK,
			},
			{
				threshold: 100,
				move: AL_LICK,
				block: "last",
				blockChance: 0.4,
				altA: AL_SPIT,
				altB: AL_TACKLE,
			},
		]);
	}
	return threeWayAi(h, roll, rng, [
		{
			threshold: 30,
			move: AL_SPIT,
			block: "lastTwo",
			blockChance: 0.5,
			altA: AL_TACKLE,
			altB: AL_LICK,
		},
		{
			threshold: 70,
			move: AL_TACKLE,
			block: "last",
			blockChance: 0.4,
			altA: AL_SPIT,
			altB: AL_LICK,
		},
		{
			threshold: 100,
			move: AL_LICK,
			block: "lastTwo",
			blockChance: 0.4,
			altA: AL_SPIT,
			altB: AL_TACKLE,
		},
	]);
});

// ── Spike Slime (M) ─────────────────────────────────────
const SM_FT = "SPIKE_SLIME_M_FLAME_TACKLE" as MonsterMoveId;
const SM_LICK = "SPIKE_SLIME_M_LICK" as MonsterMoveId;

registerMonsterAi("SPIKE_SLIME_M", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SM_LICK, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;

	if (roll < 30) {
		return { moveId: lastTwo(h, SM_FT) ? SM_LICK : SM_FT, aiRng: rng };
	}
	if (lastTwo(h, SM_LICK) || (ctx.state.ascension >= 17 && last(h) === SM_LICK)) {
		return { moveId: SM_FT, aiRng: rng };
	}
	return { moveId: SM_LICK, aiRng: rng };
});

// ── Spike Slime (L) ─────────────────────────────────────
const SL_FT = "SPIKE_SLIME_L_FLAME_TACKLE" as MonsterMoveId;
const SL_LICK = "SPIKE_SLIME_L_LICK" as MonsterMoveId;
const SL_SPLIT = "SPIKE_SLIME_L_SPLIT" as MonsterMoveId;

registerMonsterAi("SPIKE_SLIME_L", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SL_LICK, aiRng: ctx.aiRng };

	if (monster.halfDead) return { moveId: SL_SPLIT, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;

	if (roll < 30) {
		return { moveId: lastTwo(h, SL_FT) ? SL_LICK : SL_FT, aiRng: rng };
	}
	if (lastTwo(h, SL_LICK) || (ctx.state.ascension >= 17 && last(h) === SL_LICK)) {
		return { moveId: SL_FT, aiRng: rng };
	}
	return { moveId: SL_LICK, aiRng: rng };
});
