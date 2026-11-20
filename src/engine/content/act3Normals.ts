/**
 * Act 3 normal monsters (Darkling, Orb Walker, Spiker, Repulsor, Exploder, Transient, The Maw, Spire Growth, Writhing Mass): AI, move effects, death interceptors and powers.
 * Specs: data-reference/monsters-act34.json (ai.spec, historyRules, conflicts).
 *
 * Every AI call is one original rollMove: it consumes aiRng.random(99) first,
 * also for moves that force their successor (noOpRollMove, notes.rngParity).
 * Moves after which the monster dies (Exploder EXPLODE, Transient's last
 * attack) burn that roll in their move handler, because the engine does not
 * call the AI of a dead monster.
 */
import { registerDeathInterceptor } from "../combat/death";
import { registerMiscRoll } from "../combat/monsterFactory";
import { buildIntent } from "../combat/monsterTurn";
import { registerMoveDamage, registerMoveHandler, registerMoveHits } from "../combat/moveEffects";
import type { Action, GameState, MonsterMoveId, MonsterState, RngState } from "../core/types";
import { random, randomBooleanWithChance } from "../rng/stsRandom";
import { addPower, powerOf, updateMonster } from "./act3NormalsPowers";
import type { MonsterAiContext, MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── helpers ─────────────────────────────────────────────────

type History = readonly MonsterMoveId[];
const mv = (id: string) => id as MonsterMoveId;

function lastMove(h: History, id: MonsterMoveId): boolean {
	return h.length > 0 && h[h.length - 1] === id;
}

function lastTwoMoves(h: History, id: MonsterMoveId): boolean {
	return h.length >= 2 && h[h.length - 1] === id && h[h.length - 2] === id;
}

/** aiRng.random(min, max) */
function randRange(rng: RngState, min: number, max: number): { value: number; rng: RngState } {
	const r = random(rng, max - min);
	return { value: min + r.value, rng: r.state };
}

function chance(rng: RngState, p: number): { value: boolean; rng: RngState } {
	const r = randomBooleanWithChance(rng, p);
	return { value: r.value, rng: r.state };
}

/**
 * Register an AI that rolls aiRng.random(99) and passes it to getMove, like
 * Monster::rollMove. getMove may consume more aiRng (re-rolls).
 */
function registerRollAi(
	monsterId: string,
	getMove: (roll: number, rng: RngState, m: MonsterState, ctx: MonsterAiContext) => MonsterAiResult,
): void {
	registerMonsterAi(monsterId, (ctx) => {
		const m = ctx.state.combat?.monsters[ctx.monsterIndex];
		const r = random(ctx.aiRng, 99);
		if (!m) return { moveId: mv(""), aiRng: r.state };
		return getMove(r.value, r.state, m, ctx);
	});
}

/** bc.noOpRollMove() for a monster that will not get another AI call. */
function burnAiRoll(): Action {
	return {
		type: "custom",
		execute: (s) => ({ ...s, rng: { ...s.rng, aiRng: random(s.rng.aiRng, 99).state } }),
	};
}

// ── Darkling ────────────────────────────────────────────────

const DK_NIP = mv("DARKLING_NIP");
const DK_CHOMP = mv("DARKLING_CHOMP");
const DK_HARDEN = mv("DARKLING_HARDEN");
const DK_REGROW = mv("DARKLING_REGROW");
const DK_REINCARNATE = mv("DARKLING_REINCARNATE");

/**
 * NIP damage is rolled at construction (monsterHpRng, right after HP):
 * random(7,11), A2+: random(9,13). Spec conflict "moves.DARKLING_NIP.damage
 * (asc2 range)": lightspeed also adds +2 at A2 (11-15); the original
 * Darkling.java uses the rolled value as is (wiki: 9-13), so no +2 here.
 */
registerMiscRoll("DARKLING", (asc, rng) => {
	const r = asc >= 2 ? randRange(rng, 9, 13) : randRange(rng, 7, 11);
	return { miscInfo: r.value, rng: r.rng };
});
registerMoveDamage("DARKLING_NIP", (m) => m.miscInfo);

function darklingGetMove(roll: number, rng: RngState, m: MonsterState): MonsterAiResult {
	const h = m.moveHistory;
	if (h.length === 0) return { moveId: roll < 50 ? DK_HARDEN : DK_NIP, aiRng: rng };
	if (m.halfDead) return { moveId: DK_REINCARNATE, aiRng: rng };
	let r = roll;
	let next = rng;
	if (r < 40) {
		if (!lastMove(h, DK_CHOMP) && m.index !== 1) return { moveId: DK_CHOMP, aiRng: next };
		({ value: r, rng: next } = randRange(next, 40, 99));
	}
	if (r < 70) return { moveId: lastMove(h, DK_HARDEN) ? DK_NIP : DK_HARDEN, aiRng: next };
	if (!lastTwoMoves(h, DK_NIP)) return { moveId: DK_NIP, aiRng: next };
	const again = random(next, 99);
	return darklingGetMove(again.value, again.state, m);
}

registerRollAi("DARKLING", (roll, rng, m) => darklingGetMove(roll, rng, m));

/**
 * Monster::die with Life Link: while any other monster is still alive
 * (monstersAlive > 0), the Darkling clears its powers and block, becomes
 * halfDead and its move becomes REGROW. Otherwise it dies for real and the
 * LIFE_LINK onMonsterDeath hook ends the fight (act3NormalsPowers.ts).
 */
registerDeathInterceptor("DARKLING", (state, index) => {
	const monsters = state.combat?.monsters ?? [];
	const othersAlive = monsters.some((m) => m.index !== index && m.alive && !m.halfDead);
	if (!othersAlive) return null;
	return updateMonster(state, index, (m) => {
		const dead: MonsterState = {
			...m,
			alive: false,
			halfDead: true,
			currentHp: 0,
			block: 0,
			powers: [],
		};
		return { ...dead, intent: buildIntent(dead, DK_REGROW, state.ascension, state.currentHp) };
	});
});

/** REINCARNATE: revive at maxHp/2, regain Life Link (+1 Strength with Philosopher's Stone). */
function reincarnate(state: GameState, index: number): GameState {
	const stone = state.relics.some((r) => r.id === "PHILOSOPHERS_STONE");
	return updateMonster(state, index, (m) => {
		if (!m.halfDead) return m;
		const revived: MonsterState = {
			...m,
			alive: true,
			halfDead: false,
			currentHp: Math.floor(m.maxHp / 2),
			block: 0,
			powers: [{ id: "LIFE_LINK" as never, amount: 1, justApplied: false }],
		};
		return stone ? addPower(revived, "strength", 1) : revived;
	});
}

registerMoveHandler("DARKLING_REINCARNATE", (ctx, actions) => [
	...actions,
	{ type: "custom", execute: (s) => reincarnate(s, ctx.monster.index) },
]);

// ── Orb Walker ──────────────────────────────────────────────

const OW_LASER = mv("ORB_WALKER_LASER");
const OW_CLAW = mv("ORB_WALKER_CLAW");

registerRollAi("ORB_WALKER", (roll, rng, m) => {
	const h = m.moveHistory;
	if (roll < 40) return { moveId: lastTwoMoves(h, OW_CLAW) ? OW_LASER : OW_CLAW, aiRng: rng };
	return { moveId: lastTwoMoves(h, OW_LASER) ? OW_CLAW : OW_LASER, aiRng: rng };
});

// ── Spiker ──────────────────────────────────────────────────
// Spike use count (original miscInfo) = SPIKE entries in the executed history.

const SPK_CUT = mv("SPIKER_CUT");
const SPK_SPIKE = mv("SPIKER_SPIKE");

registerRollAi("SPIKER", (roll, rng, m) => {
	const h = m.moveHistory;
	const spikes = h.filter((id) => id === SPK_SPIKE).length;
	const cut = spikes > 5 || (roll < 50 && !lastMove(h, SPK_CUT));
	return { moveId: cut ? SPK_CUT : SPK_SPIKE, aiRng: rng };
});

// ── Repulsor ────────────────────────────────────────────────

const REP_BASH = mv("REPULSOR_BASH");
const REP_REPULSE = mv("REPULSOR_REPULSE");

registerRollAi("REPULSOR", (roll, rng, m) => ({
	moveId: roll < 20 && !lastMove(m.moveHistory, REP_BASH) ? REP_BASH : REP_REPULSE,
	aiRng: rng,
}));

// ── Exploder ────────────────────────────────────────────────
// SLAM, SLAM, EXPLODE. EXPLODE = NonAttackDamage(30) + Suicide from data.

const EXP_SLAM = mv("EXPLODER_SLAM");
const EXP_EXPLODE = mv("EXPLODER_EXPLODE");

registerRollAi("EXPLODER", (_roll, rng, m) => ({
	moveId: lastTwoMoves(m.moveHistory, EXP_SLAM) ? EXP_EXPLODE : EXP_SLAM,
	aiRng: rng,
}));

registerMoveHandler("EXPLODER_EXPLODE", (_ctx, actions) => [burnAiRoll(), ...actions]);

// ── Transient ───────────────────────────────────────────────
// Damage = base + 10 per earlier turn (monster turn number = executed moves + 1).
// Fading: at 1 the attack is its last; it then disappears via the monsterDie
// action. The original does not call Monster::die here; monsterDie fires only
// the dying monster's onMonsterDeath powers, and the Transient has none.

const TR_ATTACK = mv("TRANSIENT_ATTACK");

registerRollAi("TRANSIENT", (_roll, rng) => ({ moveId: TR_ATTACK, aiRng: rng }));

registerMoveDamage(
	"TRANSIENT_ATTACK",
	(m, asc) => (asc >= 2 ? 40 : 30) + 10 * m.moveHistory.length,
);

registerMoveHandler("TRANSIENT_ATTACK", (ctx, actions) => {
	const index = ctx.monster.index;
	if (powerOf(ctx.monster, "FADING") === 1) {
		return [...actions, { type: "monsterDie", monsterIndex: index }, burnAiRoll()];
	}
	return [
		...actions,
		{
			type: "custom",
			execute: (s) => updateMonster(s, index, (m) => addPower(m, "FADING", -1)),
		},
	];
});

// ── The Maw ─────────────────────────────────────────────────

const MAW_ROAR = mv("THE_MAW_ROAR");
const MAW_DROOL = mv("THE_MAW_DROOL");
const MAW_SLAM = mv("THE_MAW_SLAM");
const MAW_NOM = mv("THE_MAW_NOM");

registerRollAi("THE_MAW", (roll, rng, m) => {
	const h = m.moveHistory;
	if (h.length === 0) return { moveId: MAW_ROAR, aiRng: rng };
	if (lastMove(h, MAW_NOM)) return { moveId: MAW_DROOL, aiRng: rng }; // setMove + noOpRollMove
	if (roll < 50) return { moveId: MAW_NOM, aiRng: rng };
	return { moveId: lastMove(h, MAW_SLAM) ? MAW_DROOL : MAW_SLAM, aiRng: rng };
});

/** ceil(turn / 2) hits, turn = this monster's turn number. */
registerMoveHits("THE_MAW_NOM", (m) => Math.floor((m.moveHistory.length + 2) / 2));

// ── Spire Growth ────────────────────────────────────────────

const SG_TACKLE = mv("SPIRE_GROWTH_QUICK_TACKLE");
const SG_SMASH = mv("SPIRE_GROWTH_SMASH");
const SG_CONSTRICT = mv("SPIRE_GROWTH_CONSTRICT");

registerRollAi("SPIRE_GROWTH", (roll, rng, m, ctx) => {
	const h = m.moveHistory;
	const constricted = (ctx.state.combat?.player.powers ?? []).some(
		(p) => p.id === "CONSTRICTED" && p.amount > 0,
	);
	const useConstrict =
		!constricted && !lastMove(h, SG_CONSTRICT) && (ctx.state.ascension >= 17 || roll >= 50);
	if (useConstrict) return { moveId: SG_CONSTRICT, aiRng: rng };
	if (roll < 50 && !lastTwoMoves(h, SG_TACKLE)) return { moveId: SG_TACKLE, aiRng: rng };
	return { moveId: lastTwoMoves(h, SG_SMASH) ? SG_TACKLE : SG_SMASH, aiRng: rng };
});

// ── Writhing Mass ───────────────────────────────────────────
// miscInfo = haveUsedImplant (set when IMPLANT executes).

const WM_STRONG = mv("WRITHING_MASS_STRONG_STRIKE");
const WM_MULTI = mv("WRITHING_MASS_MULTI_STRIKE");
const WM_FLAIL = mv("WRITHING_MASS_FLAIL");
const WM_WITHER = mv("WRITHING_MASS_WITHER");
const WM_IMPLANT = mv("WRITHING_MASS_IMPLANT");

type Pick = { moveId: MonsterMoveId | null; roll: number; rng: RngState };

/** Band B (roll < 20): Implant, else 10% Strong Strike, else re-roll into 20..99. */
function wmImplantBand(h: History, used: boolean, rng: RngState): Pick {
	if (!used && !lastMove(h, WM_IMPLANT)) return { moveId: WM_IMPLANT, roll: 0, rng };
	const c = chance(rng, 0.1);
	if (c.value) return { moveId: WM_STRONG, roll: 0, rng: c.rng };
	const r = randRange(c.rng, 20, 99);
	return { moveId: null, roll: r.value, rng: r.rng };
}

/** Band C (roll < 40) after a Wither: the 40% branch. null move = continue the loop. */
function wmWitherRepeat(used: boolean, rng: RngState): Pick {
	const c = chance(rng, 0.4);
	if (!c.value) {
		const r = randRange(c.rng, 40, 99);
		return { moveId: null, roll: r.value, rng: r.rng };
	}
	const r = randRange(c.rng, 0, 19);
	if (r.value < 10) return { moveId: WM_STRONG, roll: 0, rng: r.rng };
	if (!used) return { moveId: WM_IMPLANT, roll: 0, rng: r.rng };
	const c2 = chance(r.rng, 0.1);
	if (c2.value) return { moveId: WM_STRONG, roll: 0, rng: c2.rng };
	const r2 = randRange(c2.rng, 20, 99);
	return { moveId: null, roll: r2.value, rng: r2.rng };
}

/** One pass over bands A..E; returns a move, or null with the roll to loop on. */
function wmPass(h: History, used: boolean, start: number, rng: RngState): Pick {
	let roll = start;
	let next = rng;
	if (roll < 10) {
		if (!lastMove(h, WM_STRONG)) return { moveId: WM_STRONG, roll, rng: next };
		({ value: roll, rng: next } = randRange(next, 10, 99));
	}
	if (roll < 20) {
		const p = wmImplantBand(h, used, next);
		if (p.moveId) return p;
		({ roll, rng: next } = p);
	}
	if (roll < 40) {
		if (!lastMove(h, WM_WITHER)) return { moveId: WM_WITHER, roll, rng: next };
		const p = wmWitherRepeat(used, next);
		if (p.moveId) return p;
		if (p.roll < 40) return p; // continue the loop (from band C)
		({ roll, rng: next } = p);
	}
	if (roll < 70) {
		if (!lastMove(h, WM_MULTI)) return { moveId: WM_MULTI, roll, rng: next };
		const c = chance(next, 0.3);
		if (c.value) return { moveId: WM_FLAIL, roll, rng: c.rng };
		const r = randRange(c.rng, 0, 39);
		return { moveId: null, roll: r.value, rng: r.rng }; // continue from band A
	}
	return { moveId: lastMove(h, WM_FLAIL) ? WM_WITHER : WM_FLAIL, roll, rng: next };
}

registerRollAi("WRITHING_MASS", (roll, rng, m) => {
	const h = m.moveHistory;
	if (h.length === 0) {
		const first = roll < 33 ? WM_MULTI : roll < 66 ? WM_FLAIL : WM_WITHER;
		return { moveId: first, aiRng: rng };
	}
	const used = m.miscInfo === 1;
	let p: Pick = { moveId: null, roll, rng };
	while (!p.moveId) p = wmPass(h, used, p.roll, p.rng);
	return { moveId: p.moveId, aiRng: p.rng };
});

/**
 * IMPLANT: Parasite into the master deck (data AddCard:PARASITE:masterDeck;
 * the original adds it when the battle ends — same result). The card goes
 * through obtainCard, so Omamori / Darkstone Periapt react via their own hooks.
 */
registerMoveHandler("WRITHING_MASS_IMPLANT", (ctx, actions) => {
	const index = ctx.monster.index;
	const markUsed: Action = {
		type: "custom",
		execute: (s) => updateMonster(s, index, (m) => ({ ...m, miscInfo: 1 })),
	};
	return [markUsed, ...actions];
});
