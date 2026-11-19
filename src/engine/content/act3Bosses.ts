/**
 * Act 3 bosses (Awakened One, Time Eater, Donu and Deca): AI, move effects, death interceptors and powers.
 * Specs: data-reference/monsters-act34.json (ai.spec, historyRules, conflicts).
 */
import { registerDeathInterceptor } from "../combat/death";
import { allyRefs, registerMoveHandler } from "../combat/moveEffects";
import { canonicalPowerId, fireHook } from "../core/hooks";
import type {
	Action,
	GameState,
	MonsterMoveId,
	MonsterState,
	PowerInstance,
	RngState,
} from "../core/types";
import { random, randomBooleanWithChance } from "../rng/stsRandom";
import { setMonsterMove } from "./act2Powers";
import "./act3BossesPowers";
import { getPower } from "./loader";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── helpers ─────────────────────────────────────────────────

const mv = (id: string) => id as MonsterMoveId;

function lastMove(h: readonly MonsterMoveId[], id: MonsterMoveId): boolean {
	return h.length > 0 && h[h.length - 1] === id;
}

function lastTwoMoves(h: readonly MonsterMoveId[], id: MonsterMoveId): boolean {
	return h.length >= 2 && h[h.length - 1] === id && h[h.length - 2] === id;
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

const hasPower = (m: MonsterState, id: string) => m.powers.some((p) => p.id.toUpperCase() === id);

function withPower(m: MonsterState, id: string): MonsterState {
	if (hasPower(m, id)) return m;
	const power: PowerInstance = { id: canonicalPowerId(id), amount: 1, justApplied: false };
	return { ...m, powers: [...m.powers, power] };
}

// ── Awakened One ────────────────────────────────────────────
// miscInfo = phase (0 = phase 1, 1 = phase 2 / reborn).

const AO_SLASH = mv("AWAKENED_ONE_SLASH");
const AO_SOUL_STRIKE = mv("AWAKENED_ONE_SOUL_STRIKE");
const AO_REBIRTH = mv("AWAKENED_ONE_REBIRTH");
const AO_DARK_ECHO = mv("AWAKENED_ONE_DARK_ECHO");
const AO_SLUDGE = mv("AWAKENED_ONE_SLUDGE");
const AO_TACKLE = mv("AWAKENED_ONE_TACKLE");
export const AO_PHASE_2 = 1;

function awakenedPhase1(h: readonly MonsterMoveId[], roll: number): MonsterMoveId {
	if (h.length === 0) return AO_SLASH;
	if (roll < 25) return lastMove(h, AO_SOUL_STRIKE) ? AO_SLASH : AO_SOUL_STRIKE;
	return lastTwoMoves(h, AO_SLASH) ? AO_SOUL_STRIKE : AO_SLASH;
}

function awakenedPhase2(h: readonly MonsterMoveId[], roll: number): MonsterMoveId {
	// Rebirth sets firstTurn again: phase 2 opens with Dark Echo (the roll is still burnt).
	if (lastMove(h, AO_REBIRTH)) return AO_DARK_ECHO;
	if (roll < 50) return lastTwoMoves(h, AO_SLUDGE) ? AO_TACKLE : AO_SLUDGE;
	return lastTwoMoves(h, AO_TACKLE) ? AO_SLUDGE : AO_TACKLE;
}

registerMonsterAi("AWAKENED_ONE", (ctx): MonsterAiResult => {
	const { value: roll, state: aiRng } = random(ctx.aiRng, 99);
	const m = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!m) return { moveId: AO_SLASH, aiRng };
	if (m.halfDead) return { moveId: AO_REBIRTH, aiRng };
	const moveId =
		m.miscInfo === AO_PHASE_2
			? awakenedPhase2(m.moveHistory, roll)
			: awakenedPhase1(m.moveHistory, roll);
	return { moveId, aiRng };
});

/** Powers the phase-1 death strips: every debuff (negative Strength too) plus Curiosity/Unawakened/Shackled. */
const STRIPPED_ON_HALF_DEATH = new Set(["CURIOSITY", "UNAWAKENED", "SHACKLED"]);

function keptOnHalfDeath(p: PowerInstance): boolean {
	const id = p.id.toUpperCase();
	if (STRIPPED_ON_HALF_DEATH.has(id)) return false;
	if (id === "STRENGTH") return p.amount >= 0;
	return getPower(id)?.kind !== "debuff";
}

// Phase 1 at 0 HP: halfDead (untargetable, keeps its turns), debuffs and
// Curiosity removed, next move forced to REBIRTH. Phase 2: real death.
registerDeathInterceptor("AWAKENED_ONE", (state, index) => {
	const m = state.combat?.monsters[index];
	if (!m || m.miscInfo === AO_PHASE_2) return null;
	const s = updateMonster(state, index, (x) => ({
		...x,
		alive: false,
		halfDead: true,
		currentHp: 0,
		powers: x.powers.filter(keptOnHalfDeath),
	}));
	// AwakenedOne.damage: relics' onMonsterDeath still fire on the phase-1 "death"
	// (Gremlin Horn: the fight goes on, so it triggers).
	const withRelics = fireHook(s, { type: "player" }, "onMonsterDeath", index);
	return setMonsterMove(withRelics, index, AO_REBIRTH);
});

/**
 * REBIRTH: max HP = 300 (A9+: 320, flat), full heal, phase 2, positive Strength
 * kept, gains MINION_LEADER. The other living monsters (the Cultists) are marked
 * MINION here so the shared MINION_LEADER hook makes them flee when the reborn
 * Awakened One dies; before rebirth they are ordinary monsters.
 */
function rebirth(state: GameState, index: number): GameState {
	const maxHp = state.ascension >= 9 ? 320 : 300;
	let s = updateMonster(state, index, (m) =>
		withPower(
			{
				...m,
				alive: true,
				halfDead: false,
				maxHp,
				currentHp: maxHp,
				miscInfo: AO_PHASE_2,
				powers: m.powers.filter((p) => p.id.toUpperCase() !== "STRENGTH" || p.amount >= 0),
			},
			"MINION_LEADER",
		),
	);
	for (const other of s.combat?.monsters ?? []) {
		if (other.index === index || !other.alive) continue;
		s = updateMonster(s, other.index, (m) => withPower(m, "MINION"));
	}
	return s;
}

registerMoveHandler("AWAKENED_ONE_REBIRTH", (ctx, actions) => [
	...actions,
	{ type: "custom", execute: (s) => rebirth(s, ctx.monster.index) },
]);

// ── Time Eater ──────────────────────────────────────────────
// miscInfo = usedHaste (0/1). Recursive getMove like the original.

const TE_REVERBERATE = mv("TIME_EATER_REVERBERATE");
const TE_HEAD_SLAM = mv("TIME_EATER_HEAD_SLAM");
const TE_RIPPLE = mv("TIME_EATER_RIPPLE");
const TE_HASTE = mv("TIME_EATER_HASTE");

function timeEaterMove(
	h: readonly MonsterMoveId[],
	roll: number,
	rng: RngState,
): { moveId: MonsterMoveId; rng: RngState } {
	if (roll < 45) {
		if (!lastTwoMoves(h, TE_REVERBERATE)) return { moveId: TE_REVERBERATE, rng };
		const r = random(rng, 49); // aiRng.random(50, 99)
		return timeEaterMove(h, 50 + r.value, r.state);
	}
	if (roll < 80) {
		if (!lastMove(h, TE_HEAD_SLAM)) return { moveId: TE_HEAD_SLAM, rng };
		const b = randomBooleanWithChance(rng, 0.66);
		return { moveId: b.value ? TE_REVERBERATE : TE_RIPPLE, rng: b.state };
	}
	if (!lastMove(h, TE_RIPPLE)) return { moveId: TE_RIPPLE, rng };
	const r = random(rng, 74);
	return timeEaterMove(h, r.value, r.state);
}

registerMonsterAi("TIME_EATER", (ctx): MonsterAiResult => {
	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const m = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!m) return { moveId: TE_REVERBERATE, aiRng: rng };
	if (m.miscInfo === 0 && m.currentHp < Math.floor(m.maxHp / 2)) {
		return { moveId: TE_HASTE, aiRng: rng, miscInfo: 1 };
	}
	const next = timeEaterMove(m.moveHistory, roll, rng);
	return { moveId: next.moveId, aiRng: next.rng };
});

// ── Donu & Deca ─────────────────────────────────────────────
// One aiRng.random(99) at battle start (rollMove), then strict alternation
// with no further rolls (notes.rngParity).

function alternating(first: MonsterMoveId, second: MonsterMoveId) {
	return (ctx: Parameters<Parameters<typeof registerMonsterAi>[1]>[0]): MonsterAiResult => {
		const h = ctx.state.combat?.monsters[ctx.monsterIndex]?.moveHistory ?? [];
		if (h.length === 0) return { moveId: first, aiRng: random(ctx.aiRng, 99).state };
		return { moveId: lastMove(h, first) ? second : first, aiRng: ctx.aiRng };
	};
}

const DONU_CIRCLE = mv("DONU_CIRCLE_OF_POWER");
const DONU_BEAM = mv("DONU_BEAM");
const DECA_BEAM = mv("DECA_BEAM");
const DECA_SQUARE = mv("DECA_SQUARE_OF_PROTECTION");

registerMonsterAi("DONU", alternating(DONU_CIRCLE, DONU_BEAM));
registerMonsterAi("DECA", alternating(DECA_BEAM, DECA_SQUARE));

// Circle of Power: +3 Strength to every monster, Donu included (data lists allies only).
registerMoveHandler("DONU_CIRCLE_OF_POWER", (ctx, actions) => [
	...actions,
	{
		type: "applyPower",
		source: ctx.self,
		target: ctx.self,
		powerId: canonicalPowerId("STRENGTH"),
		amount: 3,
	},
]);

// Square of Protection: every living monster (Deca included), in slot order,
// gains 16 Block, then (A19+) 3 Plated Armor. Rebuilt from scratch: the data's
// "Block" ally effect word is not a power and must not be applied as one.
registerMoveHandler("DECA_SQUARE_OF_PROTECTION", (ctx) => {
	const targets = [...allyRefs(ctx), ctx.self].sort((a, b) =>
		a.type === "monster" && b.type === "monster" ? a.index - b.index : 0,
	);
	const out: Action[] = [];
	for (const target of targets) {
		out.push({ type: "block", source: target, amount: 16 });
		if (ctx.state.ascension >= 19) {
			out.push({
				type: "applyPower",
				source: ctx.self,
				target,
				powerId: canonicalPowerId("PLATED_ARMOR"),
				amount: 3,
			});
		}
	}
	return out;
});
