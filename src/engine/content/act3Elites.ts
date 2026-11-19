/**
 * Act 3 elites (Giant Head, Nemesis, Reptomancer + Dagger): AI, move effects, death interceptors and powers.
 * Specs: data-reference/monsters-act34.json (ai.spec, historyRules, conflicts).
 */
import { registerMoveDamage, registerMoveEffect, registerMoveHandler } from "../combat/moveEffects";
import { canonicalPowerId, type HookSource, registerPowerHooks } from "../core/hooks";
import type {
	Action,
	GameState,
	MonsterId,
	MonsterMoveId,
	MonsterState,
	PowerId,
	PowerInstance,
	RngState,
} from "../core/types";
import { random, randomBoolean } from "../rng/stsRandom";
import { type MonsterAiResult, registerMonsterAi } from "./monsterAi";

// ── helpers ─────────────────────────────────────────────────

type History = readonly MonsterMoveId[];

function lastMove(h: History, id: MonsterMoveId): boolean {
	return h.length > 0 && h[h.length - 1] === id;
}

function lastTwoMoves(h: History, id: MonsterMoveId): boolean {
	return h.length >= 2 && h[h.length - 1] === id && h[h.length - 2] === id;
}

/** Used as either of the last two moves. */
function inLastTwo(h: History, id: MonsterMoveId): boolean {
	return h[h.length - 1] === id || h[h.length - 2] === id;
}

function historyOf(state: GameState, index: number): History {
	return state.combat?.monsters[index]?.moveHistory ?? [];
}

function updateMonster(
	state: GameState,
	index: number,
	fn: (m: MonsterState) => MonsterState,
): GameState {
	const c = state.combat;
	const m = c?.monsters[index];
	if (!c || !m) return state;
	const monsters = [...c.monsters];
	monsters[index] = fn(m);
	return { ...state, combat: { ...c, monsters } };
}

function setPowerAmount(m: MonsterState, id: string, amount: number): MonsterState {
	return { ...m, powers: m.powers.map((p) => (p.id === id ? { ...p, amount } : p)) };
}

function hasPower(m: MonsterState, id: string): boolean {
	return m.powers.some((p) => p.id.toUpperCase() === id && p.amount > 0);
}

const move = (id: string) => id as MonsterMoveId;

// ── Giant Head ──────────────────────────────────────────────
// Count/Glare 50/50 (neither three times in a row) until the It Is Time phase,
// then It Is Time forever. Original GiantHead: count = 5 (A18: 4), decremented
// per roll; It Is Time damage = start - 5 * count with count floored at -6.

const GH_COUNT = move("GIANT_HEAD_COUNT");
const GH_GLARE = move("GIANT_HEAD_GLARE");
const GH_TIME = move("GIANT_HEAD_IT_IS_TIME");

/**
 * First turn that uses It Is Time. Spec: turn 5. Conflict "ai IT_IS_TIME start
 * turn at asc18" (resolution: add the A18 branch): turn 4 at A18+.
 */
export function itIsTimeStartTurn(ascension: number): number {
	return ascension >= 18 ? 4 : 5;
}

/** Turn the monster's next move is for: moves done so far + 1. */
function nextTurn(m: { moveHistory: History }): number {
	return m.moveHistory.length + 1;
}

registerMonsterAi("GIANT_HEAD", (ctx): MonsterAiResult => {
	const h = historyOf(ctx.state, ctx.monsterIndex);
	const { value: roll, state: aiRng } = random(ctx.aiRng, 99);
	if (h.length + 1 >= itIsTimeStartTurn(ctx.state.ascension)) return { moveId: GH_TIME, aiRng };
	if (roll < 50) return { moveId: lastTwoMoves(h, GH_GLARE) ? GH_COUNT : GH_GLARE, aiRng };
	return { moveId: lastTwoMoves(h, GH_COUNT) ? GH_GLARE : GH_COUNT, aiRng };
});

// (asc >= 3 ? 40 : 30) + 5 * min(turnsInto It Is Time, 6).
registerMoveDamage(GH_TIME, (m, asc) => {
	const base = asc >= 3 ? 40 : 30;
	const steps = Math.max(0, nextTurn(m) - itIsTimeStartTurn(asc));
	return base + 5 * Math.min(steps, 6);
});

// SLOW: +1 per card the player plays; attack damage taken × (1 + X/10)
// (SlowPower.atDamageReceive, float math, NORMAL damage only); 0 at end of round.
registerPowerHooks(
	"SLOW",
	(p: PowerInstance): HookSource => ({
		powerId: "SLOW",
		hooks: {
			atDamageReceive: (_ctx, damage) => {
				const mult = Math.fround(1 + Math.fround(p.amount * Math.fround(0.1)));
				return Math.fround(damage * mult);
			},
			onAfterCardPlayed: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				return updateMonster(ctx.state, ctx.owner.index, (m) => {
					const cur = m.powers.find((pw) => pw.id === p.id)?.amount ?? 0;
					return setPowerAmount(m, p.id, cur + 1);
				});
			},
			atEndOfRound: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				return updateMonster(ctx.state, ctx.owner.index, (m) => setPowerAmount(m, p.id, 0));
			},
		},
	}),
);

// ── Nemesis ─────────────────────────────────────────────────

const NM_ATTACK = move("NEMESIS_ATTACK");
const NM_SCYTHE = move("NEMESIS_SCYTHE");
const NM_DEBUFF = move("NEMESIS_DEBUFF");

type Pick = { moveId: MonsterMoveId; aiRng: RngState };

function nemesisLow(h: History, rng: RngState): Pick {
	if (!inLastTwo(h, NM_SCYTHE)) return { moveId: NM_SCYTHE, aiRng: rng };
	const b = randomBoolean(rng);
	if (b.value)
		return { moveId: lastTwoMoves(h, NM_ATTACK) ? NM_DEBUFF : NM_ATTACK, aiRng: b.state };
	return { moveId: lastMove(h, NM_DEBUFF) ? NM_ATTACK : NM_DEBUFF, aiRng: b.state };
}

function nemesisMid(h: History, rng: RngState): Pick {
	if (!lastTwoMoves(h, NM_ATTACK)) return { moveId: NM_ATTACK, aiRng: rng };
	const b = randomBoolean(rng);
	const debuff = !b.value || inLastTwo(h, NM_SCYTHE);
	return { moveId: debuff ? NM_DEBUFF : NM_SCYTHE, aiRng: b.state };
}

function nemesisHigh(h: History, rng: RngState): Pick {
	if (!lastMove(h, NM_DEBUFF)) return { moveId: NM_DEBUFF, aiRng: rng };
	const b = randomBoolean(rng);
	const scythe = b.value && !inLastTwo(h, NM_SCYTHE);
	return { moveId: scythe ? NM_SCYTHE : NM_ATTACK, aiRng: b.state };
}

registerMonsterAi("NEMESIS", (ctx): MonsterAiResult => {
	const h = historyOf(ctx.state, ctx.monsterIndex);
	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	if (h.length === 0) return { moveId: roll < 50 ? NM_ATTACK : NM_DEBUFF, aiRng: rng };
	if (roll < 30) return nemesisLow(h, rng);
	if (roll < 65) return nemesisMid(h, rng);
	return nemesisHigh(h, rng);
});

/**
 * After any move: if not Intangible, gain INTANGIBLE 2 that ticks down from this
 * round's end (no justApplied skip), so it is up on every even-numbered turn.
 */
function gainIntangible(index: number): Action {
	const id = canonicalPowerId("INTANGIBLE");
	return {
		type: "custom",
		execute: (state) =>
			updateMonster(state, index, (m) =>
				m.alive && !hasPower(m, "INTANGIBLE")
					? {
							...m,
							powers: [
								...m.powers.filter((p) => p.id !== id),
								{ id, amount: 2, justApplied: false },
							],
						}
					: m,
			),
	};
}

for (const id of [NM_ATTACK, NM_SCYTHE, NM_DEBUFF]) {
	registerMoveHandler(id, (ctx, actions) =>
		hasPower(ctx.monster, "INTANGIBLE")
			? [...actions]
			: [...actions, gainIntangible(ctx.monster.index)],
	);
}

// ── Reptomancer ─────────────────────────────────────────────

const RM_SUMMON = move("REPTOMANCER_SUMMON");
const RM_SNAKE = move("REPTOMANCER_SNAKE_STRIKE");
const RM_BITE = move("REPTOMANCER_BIG_BITE");

/** Slots searched for a summon (the Reptomancer sits in slot 2). */
export const DAGGER_SLOTS = [4, 1, 3, 0] as const;

/**
 * canSpawn = monstersAlive < 4 (lightspeed; counts the Reptomancer). Conflict
 * "ai spawn cap" is unresolved (wiki: 4 daggers); the spec expression is used.
 */
function canSpawn(state: GameState): boolean {
	return (state.combat?.monsters ?? []).filter((m) => m.alive).length < 4;
}

function reptomancerMove(h: History, roll: number, rng: RngState, spawnOk: boolean): Pick {
	let r = roll;
	let s = rng;
	for (;;) {
		if (r < 33) {
			if (!lastMove(h, RM_SNAKE)) return { moveId: RM_SNAKE, aiRng: s };
			const x = random(s, 66); // aiRng.random(33, 99)
			r = 33 + x.value;
			s = x.state;
		}
		if (r < 66) {
			const summon = !lastTwoMoves(h, RM_SUMMON) && spawnOk;
			return { moveId: summon ? RM_SUMMON : RM_SNAKE, aiRng: s };
		}
		if (!lastMove(h, RM_BITE)) return { moveId: RM_BITE, aiRng: s };
		const y = random(s, 65); // aiRng.random(0, 65), loop again
		r = y.value;
		s = y.state;
	}
}

registerMonsterAi("REPTOMANCER", (ctx): MonsterAiResult => {
	const h = historyOf(ctx.state, ctx.monsterIndex);
	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	// First turn always summons; the spawn cap is not consulted.
	if (h.length === 0) return { moveId: RM_SUMMON, aiRng: rng };
	return reptomancerMove(h, roll, rng, canSpawn(ctx.state));
});

/**
 * SUMMON: `amount` daggers (A18: 2, from data) into open slots in order
 * [4, 1, 3, 0]; fewer when fewer slots are open. Each dagger rolls HP, gets
 * MINION, and its first intent roll (Dagger AI) burns one aiRng.random(99) like
 * noOpRollMove. A dagger summoned this round does not act (executeMonsterTurns).
 * Philosopher's Stone: +1 Strength (SpawnMonsterAction).
 */
registerMoveEffect("SummonDaggers", (ctx, effect, actions) => {
	const monsters = ctx.state.combat?.monsters ?? [];
	const open = DAGGER_SLOTS.filter((s) => {
		const m = monsters[s];
		return !m || !(m.alive || m.halfDead);
	});
	const slots = open.slice(0, effect.amount ?? 1);
	const stone = ctx.state.relics.some((r) => r.id === "PHILOSOPHERS_STONE");
	const out: Action[] = [...actions];
	for (const slot of slots) {
		out.push({ type: "spawnMonster", monsterId: "DAGGER" as MonsterId, slot, minion: true });
		if (stone) {
			out.push({
				type: "applyPower",
				source: { type: "monster", index: slot },
				target: { type: "monster", index: slot },
				powerId: canonicalPowerId("STRENGTH") as PowerId,
				amount: 1,
			});
		}
	}
	return out;
});

// ── Dagger (Reptomancer minion) ─────────────────────────────
// STAB, then EXPLODE (attack 25 + Suicide). Every roll burns aiRng.random(99).

const DG_STAB = move("DAGGER_STAB");
const DG_EXPLODE = move("DAGGER_EXPLODE");

registerMonsterAi("DAGGER", (ctx): MonsterAiResult => {
	const h = historyOf(ctx.state, ctx.monsterIndex);
	const { state: aiRng } = random(ctx.aiRng, 99);
	return { moveId: h.length === 0 ? DG_STAB : DG_EXPLODE, aiRng };
});
