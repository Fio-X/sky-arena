/**
 * Ascension audit for every Act 3 and Act 4 monster, through initCombat and
 * the real endTurn / playCard loop. Each threshold is checked one level below
 * and at the threshold:
 *   HP: A7 normal / A8 elite (and Dagger) / A9 boss
 *   damage: A2 normal / A3 elite / A4 boss
 *   behaviour: A17 normal / A18 elite / A19 boss (+ prebattle power amounts)
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
	card,
	endTurn,
	forceMove,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
	startFight,
} from "../core/fightTestHelpers";
import type { GameState, MonsterMoveId } from "../core/types";
import { registerEncounterLayout } from "./encounters";

beforeAll(() => {
	loadAllData();
	// Solo fights for the shapes and the Dagger (normally only in mixed layouts).
	registerEncounterLayout("ASC_SPIKER", ["SPIKER"] as never);
	registerEncounterLayout("ASC_REPULSOR", ["REPULSOR"] as never);
	registerEncounterLayout("ASC_EXPLODER", ["EXPLODER"] as never);
	registerEncounterLayout("ASC_DAGGER", ["DAGGER"] as never);
});

const SEEDS = Array.from({ length: 20 }, (_, i) => BigInt(i + 1));
const defends = (n: number) => Array.from({ length: n }, (_, i) => card("DEFEND_RED", i + 1));

function tank(s: GameState): GameState {
	return { ...s, currentHp: 1_000_000, maxHp: 1_000_000 };
}

const playerPower = (s: GameState, id: string) =>
	powerAmount(s.combat?.player ?? { powers: [] }, id);

function countIn(s: GameState, pile: "hand" | "drawPile" | "discardPile", id: string): number {
	return (s.combat?.[pile] ?? []).filter((c) => c.id === id).length;
}

/** Every living monster except `keep` removed (not killed: no death triggers). */
function only(s: GameState, keep: number): GameState {
	let st = s;
	for (const m of s.combat?.monsters ?? []) {
		if (m.index !== keep && m.alive) st = patchMonster(st, m.index, { alive: false, currentHp: 0 });
	}
	return st;
}

/** Fight at `asc` with only `slot` left, forced into `move`; HP the player loses over one end of turn. */
function hitFor(enc: string, slot: number, move: string, asc: number): number {
	const s = forceMove(only(tank(startFight(enc, 1n, defends(10), asc)), slot), slot, move);
	return s.currentHp - endTurn(s).currentHp;
}

// ── HP ──────────────────────────────────────────────────────

type HpRow = [
	enc: string,
	slot: number,
	level: number,
	base: [number, number],
	asc: [number, number],
];

const HP_ROWS: HpRow[] = [
	["THREE_DARKLINGS", 0, 7, [48, 56], [50, 59]],
	["ORB_WALKER", 0, 7, [90, 96], [92, 102]],
	["ASC_SPIKER", 0, 7, [42, 56], [44, 60]],
	["ASC_REPULSOR", 0, 7, [29, 35], [31, 38]],
	["ASC_EXPLODER", 0, 7, [30, 30], [30, 35]],
	["TRANSIENT", 0, 7, [999, 999], [999, 999]],
	["MAW", 0, 7, [300, 300], [300, 300]],
	["SPIRE_GROWTH", 0, 7, [170, 170], [190, 190]],
	["WRITHING_MASS", 0, 7, [160, 160], [175, 175]],
	["GIANT_HEAD", 0, 8, [500, 500], [520, 520]],
	["NEMESIS", 0, 8, [185, 185], [200, 200]],
	["REPTOMANCER", 2, 8, [180, 190], [190, 200]],
	["ASC_DAGGER", 0, 8, [20, 25], [20, 25]],
	["AWAKENED_ONE", 2, 9, [300, 300], [320, 320]],
	["TIME_EATER", 0, 9, [456, 456], [480, 480]],
	["DONU_AND_DECA", 0, 9, [250, 250], [265, 265]],
	["DONU_AND_DECA", 1, 9, [250, 250], [265, 265]],
	["SHIELD_AND_SPEAR", 0, 8, [110, 110], [125, 125]],
	["SHIELD_AND_SPEAR", 1, 8, [160, 160], [180, 180]],
	["CORRUPT_HEART", 0, 9, [750, 750], [800, 800]],
];

describe("HP thresholds (A7 normal / A8 elite / A9 boss)", () => {
	for (const [enc, slot, level, base, asc] of HP_ROWS) {
		it(`${enc}[${slot}]: ${base.join("-")} below A${level}, ${asc.join("-")} from A${level}`, () => {
			const rolled = (a: number) =>
				SEEDS.map((seed) => {
					const m = monsterAt(startFight(enc, seed, undefined, a), slot);
					expect(m.currentHp).toBe(m.maxHp);
					return m.maxHp;
				});
			const below = rolled(level - 1);
			const at = rolled(level);
			for (const hp of below)
				expect(hp >= base[0] && hp <= base[1], `A${level - 1} ${hp}`).toBe(true);
			for (const hp of at) expect(hp >= asc[0] && hp <= asc[1], `A${level} ${hp}`).toBe(true);
			// Different ranges: the ascension roll really uses the new range.
			if (base[0] !== asc[0] || base[1] !== asc[1]) {
				expect(at.some((hp) => hp < base[0] || hp > base[1])).toBe(true);
			}
		});
	}
});

// ── Damage ──────────────────────────────────────────────────

type DmgRow = [enc: string, slot: number, move: string, level: number, below: number, at: number];

const DMG_ROWS: DmgRow[] = [
	["THREE_DARKLINGS", 0, "DARKLING_CHOMP", 2, 16, 18],
	["ORB_WALKER", 0, "ORB_WALKER_CLAW", 2, 15, 16],
	["ORB_WALKER", 0, "ORB_WALKER_LASER", 2, 10, 11],
	["ASC_SPIKER", 0, "SPIKER_CUT", 2, 7, 9],
	["ASC_REPULSOR", 0, "REPULSOR_BASH", 2, 11, 13],
	["ASC_EXPLODER", 0, "EXPLODER_SLAM", 2, 9, 11],
	["ASC_EXPLODER", 0, "EXPLODER_EXPLODE", 2, 30, 30],
	["TRANSIENT", 0, "TRANSIENT_ATTACK", 2, 30, 40],
	["MAW", 0, "THE_MAW_SLAM", 2, 25, 30],
	["SPIRE_GROWTH", 0, "SPIRE_GROWTH_QUICK_TACKLE", 2, 16, 18],
	["SPIRE_GROWTH", 0, "SPIRE_GROWTH_SMASH", 2, 22, 25],
	["WRITHING_MASS", 0, "WRITHING_MASS_STRONG_STRIKE", 2, 32, 38],
	["WRITHING_MASS", 0, "WRITHING_MASS_MULTI_STRIKE", 2, 21, 27],
	["WRITHING_MASS", 0, "WRITHING_MASS_FLAIL", 2, 15, 16],
	["WRITHING_MASS", 0, "WRITHING_MASS_WITHER", 2, 10, 12],
	["GIANT_HEAD", 0, "GIANT_HEAD_COUNT", 3, 13, 13],
	["NEMESIS", 0, "NEMESIS_ATTACK", 3, 18, 21],
	["NEMESIS", 0, "NEMESIS_SCYTHE", 3, 45, 45],
	["REPTOMANCER", 2, "REPTOMANCER_SNAKE_STRIKE", 3, 26, 32],
	["REPTOMANCER", 2, "REPTOMANCER_BIG_BITE", 3, 30, 34],
	["ASC_DAGGER", 0, "DAGGER_STAB", 3, 9, 9],
	["ASC_DAGGER", 0, "DAGGER_EXPLODE", 3, 25, 25],
	// A4: no move value changes, the Awakened One starts with 2 Strength instead.
	["AWAKENED_ONE", 2, "AWAKENED_ONE_SLASH", 4, 20, 22],
	["AWAKENED_ONE", 2, "AWAKENED_ONE_SOUL_STRIKE", 4, 24, 32],
	["TIME_EATER", 0, "TIME_EATER_REVERBERATE", 4, 21, 24],
	["TIME_EATER", 0, "TIME_EATER_HEAD_SLAM", 4, 26, 32],
	["DONU_AND_DECA", 1, "DONU_BEAM", 4, 20, 24],
	["DONU_AND_DECA", 0, "DECA_BEAM", 4, 20, 24],
	// The Shield (slot 0) is behind the player: Back Attack x1.5.
	["SHIELD_AND_SPEAR", 0, "SPIRE_SHIELD_BASH", 3, 18, 21],
	["SHIELD_AND_SPEAR", 0, "SPIRE_SHIELD_SMASH", 3, 51, 57],
	["SHIELD_AND_SPEAR", 1, "SPIRE_SPEAR_BURN_STRIKE", 3, 10, 12],
	["SHIELD_AND_SPEAR", 1, "SPIRE_SPEAR_SKEWER", 3, 30, 40],
	["CORRUPT_HEART", 0, "CORRUPT_HEART_BLOOD_SHOTS", 4, 24, 30],
	["CORRUPT_HEART", 0, "CORRUPT_HEART_ECHO", 4, 40, 45],
];

describe("damage thresholds (A2 normal / A3 elite / A4 boss), executed", () => {
	for (const [enc, slot, move, level, below, at] of DMG_ROWS) {
		it(`${move}: ${below} at A${level - 1}, ${at} at A${level}`, () => {
			expect(hitFor(enc, slot, move, level - 1)).toBe(below);
			expect(hitFor(enc, slot, move, level)).toBe(at);
		});
	}

	it("Darkling Nip deals the construction roll as is: 7-11, A2 9-13 (no +2)", () => {
		for (const [asc, lo, hi] of [
			[1, 7, 11],
			[2, 9, 13],
		] as const) {
			const seen = new Set<number>();
			for (const seed of SEEDS) {
				let s = tank(startFight("THREE_DARKLINGS", seed, defends(10), asc));
				const nip = monsterAt(s, 0).miscInfo;
				s = forceMove(only(s, 0), 0, "DARKLING_NIP");
				expect(monsterAt(s, 0).intent.baseDamage).toBe(nip);
				expect(s.currentHp - endTurn(s).currentHp).toBe(nip);
				seen.add(nip);
			}
			expect(Math.min(...seen)).toBeGreaterThanOrEqual(lo);
			expect(Math.max(...seen)).toBeLessThanOrEqual(hi);
		}
	});

	it("Writhing Mass Flail block 16, A2: 18 (data/lightspeed)", () => {
		for (const [asc, block] of [
			[1, 16],
			[2, 18],
		] as const) {
			const s = forceMove(
				tank(startFight("WRITHING_MASS", 1n, defends(10), asc)),
				0,
				"WRITHING_MASS_FLAIL",
			);
			expect(monsterAt(endTurn(s), 0).block).toBe(block);
		}
	});

	it("Giant Head It Is Time: 30 (A2), 40 (A3) on its first use", () => {
		for (const [asc, dmg] of [
			[2, 30],
			[3, 40],
		] as const) {
			const count = "GIANT_HEAD_COUNT" as MonsterMoveId;
			let s = tank(startFight("GIANT_HEAD", 1n, defends(10), asc));
			s = patchMonster(s, 0, { moveHistory: [count, count, count, count] });
			s = forceMove(s, 0, "GIANT_HEAD_IT_IS_TIME");
			expect(s.currentHp - endTurn(s).currentHp).toBe(dmg);
		}
	});
});

// ── A17: normal monsters ────────────────────────────────────

describe("A17 behaviour (normal monsters)", () => {
	it("Darkling Harden: 12 Block, +2 Strength only from A17", () => {
		for (const [asc, str] of [
			[16, undefined],
			[17, 2],
		] as const) {
			let s = forceMove(
				only(tank(startFight("THREE_DARKLINGS", 1n, defends(10), asc)), 0),
				0,
				"DARKLING_HARDEN",
			);
			s = endTurn(s);
			expect(monsterAt(s, 0).block).toBe(12);
			expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(str);
		}
	});

	it("Orb Walker: Strength Up 3, A17: 5 (Strength after one round)", () => {
		for (const [asc, n] of [
			[16, 3],
			[17, 5],
		] as const) {
			let s = tank(startFight("ORB_WALKER", 1n, defends(10), asc));
			expect(powerAmount(monsterAt(s, 0), "GENERIC_STRENGTH_UP")).toBe(n);
			s = endTurn(s);
			expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(n);
		}
	});

	it("Spiker Thorns: 3, A2: 4, A17: 7 (hits back for that much)", () => {
		for (const [asc, thorns] of [
			[1, 3],
			[2, 4],
			[16, 4],
			[17, 7],
		] as const) {
			const s = tank(startFight("ASC_SPIKER", 1n, undefined, asc));
			expect(powerAmount(monsterAt(s, 0), "THORNS")).toBe(thorns);
			expect(s.currentHp - playCard(s, "STRIKE_RED", 0).currentHp).toBe(thorns);
		}
	});

	it("Transient: Fading 5, A17: 6", () => {
		expect(powerAmount(monsterAt(startFight("TRANSIENT", 1n, undefined, 16), 0), "FADING")).toBe(5);
		expect(powerAmount(monsterAt(startFight("TRANSIENT", 1n, undefined, 17), 0), "FADING")).toBe(6);
	});

	it("The Maw: Roar Weak/Frail 3 -> 5 and Drool Strength 3 -> 5 at A17", () => {
		for (const [asc, n] of [
			[16, 3],
			[17, 5],
		] as const) {
			let s = tank(startFight("MAW", 1n, defends(10), asc));
			expect(monsterAt(s, 0).intent.moveId).toBe("THE_MAW_ROAR");
			s = endTurn(s);
			expect(playerPower(s, "WEAK")).toBe(n);
			expect(playerPower(s, "FRAIL")).toBe(n);
			s = endTurn(forceMove(s, 0, "THE_MAW_DROOL"));
			expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(n);
		}
	});

	it("Spire Growth: Constrict 10 -> 12; from A17 it opens with Constrict whenever legal", () => {
		const firsts = (asc: number) =>
			new Set(
				SEEDS.map(
					(seed) => monsterAt(startFight("SPIRE_GROWTH", seed, undefined, asc), 0).intent.moveId,
				),
			);
		expect(firsts(17)).toEqual(new Set(["SPIRE_GROWTH_CONSTRICT"]));
		expect(firsts(16).size).toBeGreaterThan(1);
		for (const [asc, n] of [
			[16, 10],
			[17, 12],
		] as const) {
			const s = forceMove(
				tank(startFight("SPIRE_GROWTH", 1n, defends(10), asc)),
				0,
				"SPIRE_GROWTH_CONSTRICT",
			);
			expect(playerPower(endTurn(s), "CONSTRICTED")).toBe(n);
		}
	});

	it("A17 changes nothing for Repulsor, Exploder and Writhing Mass", () => {
		for (const enc of ["ASC_REPULSOR", "ASC_EXPLODER", "WRITHING_MASS"]) {
			const p = (asc: number) => monsterAt(startFight(enc, 1n, undefined, asc), 0).powers;
			expect(p(17), enc).toEqual(p(16));
		}
	});
});

// ── A18: elites ─────────────────────────────────────────────

describe("A18 behaviour (elites)", () => {
	const firstItIsTime = (asc: number) => {
		let s = tank(startFight("GIANT_HEAD", 3n, defends(10), asc));
		for (let turn = 1; turn <= 6; turn++) {
			if (monsterAt(s, 0).intent.moveId === "GIANT_HEAD_IT_IS_TIME") return turn;
			s = endTurn(s);
		}
		return -1;
	};

	it("Giant Head: It Is Time first on turn 5, A18: turn 4", () => {
		expect(firstItIsTime(17)).toBe(5);
		expect(firstItIsTime(18)).toBe(4);
	});

	it("Nemesis Tri Burn: 3 Burns, A18: 5", () => {
		for (const [asc, n] of [
			[17, 3],
			[18, 5],
		] as const) {
			const s = endTurn(
				forceMove(tank(startFight("NEMESIS", 1n, defends(10), asc)), 0, "NEMESIS_DEBUFF"),
			);
			const burns =
				countIn(s, "hand", "BURN") +
				countIn(s, "drawPile", "BURN") +
				countIn(s, "discardPile", "BURN");
			expect(burns).toBe(n);
		}
	});

	it("Reptomancer opening Summon: 1 Dagger, A18: 2 (4 Daggers on the board)", () => {
		for (const [asc, daggers] of [
			[17, 3],
			[18, 4],
		] as const) {
			let s = tank(startFight("REPTOMANCER", 1n, defends(10), asc));
			expect(monsterAt(s, 2).intent.moveId).toBe("REPTOMANCER_SUMMON");
			s = endTurn(s);
			const alive = (s.combat?.monsters ?? []).filter((m) => m.alive && m.id === "DAGGER");
			expect(alive.length).toBe(daggers);
		}
	});

	it("Spire Shield: Artifact 1 -> 2; Smash blocks the damage dealt, A18: flat 99", () => {
		for (const [asc, artifact, block] of [
			[17, 1, 57],
			[18, 2, 99],
		] as const) {
			let s = tank(startFight("SHIELD_AND_SPEAR", 1n, defends(10), asc));
			expect(powerAmount(monsterAt(s, 0), "ARTIFACT")).toBe(artifact);
			s = forceMove(forceMove(s, 0, "SPIRE_SHIELD_SMASH"), 1, "SPIRE_SPEAR_PIERCER");
			const hp = s.currentHp;
			s = endTurn(s);
			expect(hp - s.currentHp).toBe(57);
			expect(monsterAt(s, 0).block).toBe(block);
		}
	});

	it("Spire Spear: Artifact 1 -> 2; Burn Strike Burns go to the discard pile, A18: on top of the draw pile", () => {
		for (const [asc, artifact, inHand, inDiscard] of [
			[17, 1, 0, 2],
			[18, 2, 2, 0],
		] as const) {
			let s = tank(startFight("SHIELD_AND_SPEAR", 1n, defends(10), asc));
			expect(powerAmount(monsterAt(s, 1), "ARTIFACT")).toBe(artifact);
			s = forceMove(forceMove(s, 0, "SPIRE_SHIELD_FORTIFY"), 1, "SPIRE_SPEAR_BURN_STRIKE");
			s = endTurn(s); // on top of the draw pile = drawn into the next hand
			expect(countIn(s, "hand", "BURN")).toBe(inHand);
			expect(countIn(s, "discardPile", "BURN")).toBe(inDiscard);
		}
	});
});

// ── A19: bosses ─────────────────────────────────────────────

describe("A19 behaviour (bosses)", () => {
	it("Awakened One: Strength 0 -> 2 (A4); Curiosity 1 -> 2 and Regenerate 10 -> 15 (A19)", () => {
		const ao = (asc: number) => monsterAt(startFight("AWAKENED_ONE", 1n, undefined, asc), 2);
		expect(powerAmount(ao(3), "STRENGTH")).toBeUndefined();
		expect(powerAmount(ao(4), "STRENGTH")).toBe(2);
		for (const [asc, cur, regen] of [
			[18, 1, 10],
			[19, 2, 15],
		] as const) {
			expect(powerAmount(ao(asc), "CURIOSITY")).toBe(cur);
			let s = tank(startFight("AWAKENED_ONE", 1n, [card("INFLAME", 100), ...defends(9)], asc));
			s = playCard(s, "INFLAME");
			expect(powerAmount(monsterAt(s, 2), "STRENGTH")).toBe(2 + cur);
			s = patchMonster(s, 2, { currentHp: 100 });
			s = endTurn(s);
			expect(monsterAt(s, 2).currentHp).toBe(100 + regen);
		}
	});

	it("Time Eater A19: Head Slam adds 2 Slimed, Ripple adds Frail, Haste gains 32 Block", () => {
		for (const [asc, slimed, frail, block] of [
			[18, 0, undefined, 0],
			[19, 2, 1, 32],
		] as const) {
			const fresh = () => tank(startFight("TIME_EATER", 1n, defends(10), asc));
			let s = endTurn(forceMove(fresh(), 0, "TIME_EATER_HEAD_SLAM"));
			expect(countIn(s, "discardPile", "SLIMED") + countIn(s, "hand", "SLIMED")).toBe(slimed);
			expect(playerPower(s, "DRAW_REDUCTION")).toBe(1);
			s = endTurn(forceMove(fresh(), 0, "TIME_EATER_RIPPLE"));
			expect(playerPower(s, "FRAIL")).toBe(frail);
			expect(playerPower(s, "WEAK")).toBe(1);
			s = patchMonster(fresh(), 0, { currentHp: 100 });
			s = endTurn(forceMove(s, 0, "TIME_EATER_HASTE"));
			expect(monsterAt(s, 0).currentHp).toBe(240);
			expect(monsterAt(s, 0).block).toBe(block);
		}
	});

	it("Donu & Deca A19: Artifact 2 -> 3; Square of Protection adds 3 Plated Armor to both", () => {
		for (const [asc, artifact, plated] of [
			[18, 2, undefined],
			[19, 3, 3],
		] as const) {
			let s = tank(startFight("DONU_AND_DECA", 1n, defends(10), asc));
			for (const i of [0, 1]) expect(powerAmount(monsterAt(s, i), "ARTIFACT")).toBe(artifact);
			s = forceMove(forceMove(s, 0, "DECA_SQUARE_OF_PROTECTION"), 1, "DONU_CIRCLE_OF_POWER");
			s = endTurn(s);
			for (const i of [0, 1]) {
				expect(monsterAt(s, i).block).toBe(16);
				expect(powerAmount(monsterAt(s, i), "PLATED_ARMOR")).toBe(plated);
			}
		}
	});

	it("Corrupt Heart A19: Beat of Death 1 -> 2, Invincible 300 -> 200 (and refills to it)", () => {
		for (const [asc, beat, cap] of [
			[18, 1, 300],
			[19, 2, 200],
		] as const) {
			let s = tank(startFight("CORRUPT_HEART", 1n, undefined, asc));
			expect(powerAmount(monsterAt(s, 0), "BEAT_OF_DEATH")).toBe(beat);
			expect(powerAmount(monsterAt(s, 0), "INVINCIBLE")).toBe(cap);
			const hp = s.currentHp;
			s = playCard(s, "DEFEND_RED");
			expect(hp - s.currentHp).toBe(0); // Beat of Death hit the fresh Block first
			s = playCard(s, "STRIKE_RED", 0);
			expect(powerAmount(monsterAt(s, 0), "INVINCIBLE")).toBe(cap - 6);
			s = endTurn(s);
			expect(powerAmount(monsterAt(s, 0), "INVINCIBLE")).toBe(cap);
		}
	});
});
