/**
 * Ascension behaviour of the Act 1 and Act 2 monsters (part 1), through real
 * encounters and endTurn: HP (A7/A8/A9), damage (A2/A3/A4), prebattle powers,
 * then Act 1 normals and elites (move amounts and A17/A18 AI changes).
 * Expected values are the original game's, written out (not read from data).
 * Part 2 (Act 1 bosses, Act 2): ascensionAct12More.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	endTurn,
	forceMove,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
	startFight,
} from "../core/fightTestHelpers";
import {
	deckOf,
	discardCount,
	endTurnHits,
	fight,
	HP,
	intentOf,
	nextIntents,
	player,
	run,
	SEEDS,
	withEnergy,
} from "./ascensionTestHelpers";

beforeEach(() => loadAllData());

describe("HP by ascension (A7 normal / A8 elite / A9 boss)", () => {
	it.each(HP)("%s: threshold A%i", (id, at, below, above) => {
		for (const [asc, [lo, hi]] of [
			[at - 1, below],
			[at, above],
		] as const) {
			const hps = SEEDS.map((seed) => monsterAt(fight(id, asc, seed), 0).maxHp);
			expect(Math.min(...hps), `${id} A${asc} min`).toBeGreaterThanOrEqual(lo);
			expect(Math.max(...hps), `${id} A${asc} max`).toBeLessThanOrEqual(hi);
			if (hi > lo) expect(new Set(hps).size, `${id} A${asc} rolls`).toBeGreaterThan(1);
		}
		// The asc range is really used: some roll falls outside the base range, or the bounds moved.
		const top = Math.max(...SEEDS.map((seed) => monsterAt(fight(id, at, seed), 0).maxHp));
		if (above[1] > below[1]) expect(top).toBeGreaterThan(below[1] - 2);
	});
});

// ── Attack damage ──────────────────────────────────────────

const DAMAGE: Array<[string, string, number, number[], number[]]> = [
	// id, move, threshold, hits below, hits at threshold
	["CULTIST", "CULTIST_DARK_STRIKE", 2, [6], [6]],
	["JAW_WORM", "JAW_WORM_CHOMP", 2, [11], [12]],
	["JAW_WORM", "JAW_WORM_THRASH", 2, [7], [7]],
	["ACID_SLIME_S", "ACID_SLIME_S_TACKLE", 2, [3], [4]],
	["ACID_SLIME_M", "ACID_SLIME_M_CORROSIVE_SPIT", 2, [7], [8]],
	["ACID_SLIME_M", "ACID_SLIME_M_TACKLE", 2, [10], [12]],
	["ACID_SLIME_L", "ACID_SLIME_L_CORROSIVE_SPIT", 2, [11], [12]],
	["ACID_SLIME_L", "ACID_SLIME_L_TACKLE", 2, [16], [18]],
	["SPIKE_SLIME_S", "SPIKE_SLIME_S_TACKLE", 2, [5], [6]],
	["SPIKE_SLIME_M", "SPIKE_SLIME_M_FLAME_TACKLE", 2, [8], [10]],
	["SPIKE_SLIME_L", "SPIKE_SLIME_L_FLAME_TACKLE", 2, [16], [18]],
	["MAD_GREMLIN", "MAD_GREMLIN_SCRATCH", 2, [4], [5]],
	["SNEAKY_GREMLIN", "SNEAKY_GREMLIN_PUNCTURE", 2, [9], [10]],
	["FAT_GREMLIN", "FAT_GREMLIN_SMASH", 2, [4], [5]],
	["SHIELD_GREMLIN", "SHIELD_GREMLIN_SHIELD_BASH", 2, [6], [8]],
	["GREMLIN_WIZARD", "GREMLIN_WIZARD_ULTIMATE_BLAST", 2, [25], [30]],
	["LOOTER", "LOOTER_MUG", 2, [10], [11]],
	["LOOTER", "LOOTER_LUNGE", 2, [12], [14]],
	["FUNGI_BEAST", "FUNGI_BEAST_BITE", 2, [6], [6]],
	["BLUE_SLAVER", "BLUE_SLAVER_STAB", 2, [12], [13]],
	["BLUE_SLAVER", "BLUE_SLAVER_RAKE", 2, [7], [8]],
	["RED_SLAVER", "RED_SLAVER_STAB", 2, [13], [14]],
	["RED_SLAVER", "RED_SLAVER_SCRAPE", 2, [8], [9]],
	["GREMLIN_NOB", "GREMLIN_NOB_RUSH", 3, [14], [16]],
	["GREMLIN_NOB", "GREMLIN_NOB_SKULL_BASH", 3, [6], [8]],
	["LAGAVULIN", "LAGAVULIN_ATTACK", 3, [18], [20]],
	["SENTRY", "SENTRY_BEAM", 3, [9], [10]],
	["SLIME_BOSS", "SLIME_BOSS_SLAM", 4, [35], [38]],
	["THE_GUARDIAN", "THE_GUARDIAN_FIERCE_BASH", 4, [32], [36]],
	["THE_GUARDIAN", "THE_GUARDIAN_ROLL_ATTACK", 4, [9], [10]],
	["THE_GUARDIAN", "THE_GUARDIAN_WHIRLWIND", 4, [5, 5, 5, 5], [5, 5, 5, 5]],
	["THE_GUARDIAN", "THE_GUARDIAN_TWIN_SLAM", 4, [8, 8], [8, 8]],
	["HEXAGHOST", "HEXAGHOST_SEAR", 4, [6], [6]],
	["HEXAGHOST", "HEXAGHOST_TACKLE", 4, [5, 5], [6, 6]],
	["HEXAGHOST", "HEXAGHOST_INFERNO", 4, [2, 2, 2, 2, 2, 2], [3, 3, 3, 3, 3, 3]],
	["SPHERIC_GUARDIAN", "SPHERIC_GUARDIAN_ATTACK_DEBUFF", 2, [10], [11]],
	["SPHERIC_GUARDIAN", "SPHERIC_GUARDIAN_SLAM", 2, [10, 10], [11, 11]],
	["SPHERIC_GUARDIAN", "SPHERIC_GUARDIAN_HARDEN", 2, [10], [11]],
	["CHOSEN", "CHOSEN_POKE", 2, [5, 5], [6, 6]],
	["CHOSEN", "CHOSEN_ZAP", 2, [18], [21]],
	["CHOSEN", "CHOSEN_DEBILITATE", 2, [10], [12]],
	["SHELLED_PARASITE", "SHELLED_PARASITE_FELL", 2, [18], [21]],
	["SHELLED_PARASITE", "SHELLED_PARASITE_DOUBLE_STRIKE", 2, [6, 6], [7, 7]],
	["SHELLED_PARASITE", "SHELLED_PARASITE_SUCK", 2, [10], [12]],
	["BYRD", "BYRD_PECK", 2, [1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]],
	["BYRD", "BYRD_SWOOP", 2, [12], [14]],
	["BYRD", "BYRD_HEADBUTT", 2, [3], [3]],
	["MUGGER", "MUGGER_MUG", 2, [10], [11]],
	["MUGGER", "MUGGER_LUNGE", 2, [16], [18]],
	["CENTURION", "CENTURION_SLASH", 2, [12], [14]],
	["CENTURION", "CENTURION_FURY", 2, [6, 6, 6], [7, 7, 7]],
	["MYSTIC", "MYSTIC_ATTACK_DEBUFF", 2, [8], [9]],
	["SNAKE_PLANT", "SNAKE_PLANT_CHOMP", 2, [7, 7, 7], [8, 8, 8]],
	["SNECKO", "SNECKO_BITE", 2, [15], [18]],
	["SNECKO", "SNECKO_TAIL_WHIP", 2, [8], [10]],
	["BEAR", "BEAR_LUNGE", 2, [9], [10]],
	["BEAR", "BEAR_MAUL", 2, [18], [20]],
	["ROMEO", "ROMEO_AGONIZING_SLASH", 2, [10], [12]],
	["ROMEO", "ROMEO_CROSS_SLASH", 2, [15], [17]],
	["POINTY", "POINTY_ATTACK", 2, [5, 5], [6, 6]],
	["BOOK_OF_STABBING", "BOOK_OF_STABBING_SINGLE_STAB", 3, [21], [24]],
	["GREMLIN_LEADER", "GREMLIN_LEADER_STAB", 3, [6, 6, 6], [6, 6, 6]],
	["TASKMASTER", "TASKMASTER_SCOURING_WHIP", 3, [7], [7]],
	["BRONZE_AUTOMATON", "BRONZE_AUTOMATON_FLAIL", 4, [7, 7], [8, 8]],
	["BRONZE_AUTOMATON", "BRONZE_AUTOMATON_HYPER_BEAM", 4, [45], [50]],
	["BRONZE_ORB", "BRONZE_ORB_BEAM", 4, [8], [8]],
	["THE_COLLECTOR", "THE_COLLECTOR_FIREBALL", 4, [18], [21]],
	["TORCH_HEAD", "TORCH_HEAD_TACKLE", 4, [7], [7]],
	["THE_CHAMP", "THE_CHAMP_HEAVY_SLASH", 4, [16], [18]],
	["THE_CHAMP", "THE_CHAMP_FACE_SLAP", 4, [12], [14]],
	["THE_CHAMP", "THE_CHAMP_EXECUTE", 4, [10, 10], [10, 10]],
];

describe("attack damage by ascension (A2 normal / A3 elite / A4 boss)", () => {
	it.each(DAMAGE)("%s %s: threshold A%i", (id, move, at, below, above) => {
		expect(run(id, move, at - 1).hits).toEqual(below);
		expect(run(id, move, at).hits).toEqual(above);
	});

	it("Louse BITE: one pre-rolled value in 5-7, 6-8 from A2", () => {
		for (const id of ["RED_LOUSE", "GREEN_LOUSE"]) {
			const bite = `${id}_BITE`;
			for (const [asc, lo, hi] of [
				[1, 5, 7],
				[2, 6, 8],
			] as const) {
				const dmg = SEEDS.map((seed) => run(id, bite, asc, seed).hits);
				for (const d of dmg) expect(d.length === 1 && d[0]! >= lo && d[0]! <= hi).toBe(true);
				expect(new Set(dmg.map((d) => d[0])).size).toBe(3);
			}
		}
	});

	it("Hexaghost DIVIDER: player HP / 12 + 1, six times, at every ascension", () => {
		for (const asc of [0, 20]) {
			const s = forceMove(fight("HEXAGHOST", asc), 0, "HEXAGHOST_DIVIDER");
			expect(endTurnHits(s).hits).toEqual(Array(6).fill(Math.floor(999 / 12) + 1));
		}
	});
});

// ── Prebattle powers ───────────────────────────────────────

describe("prebattle powers by ascension", () => {
	it("Louse Curl Up: 3-7, A7 4-8, A17 9-12", () => {
		for (const id of ["RED_LOUSE", "GREEN_LOUSE"]) {
			for (const [asc, lo, hi] of [
				[6, 3, 7],
				[7, 4, 8],
				[16, 4, 8],
				[17, 9, 12],
			] as const) {
				const curl = SEEDS.map((seed) =>
					powerAmount(monsterAt(fight(id, asc, seed), 0), "CURL_UP"),
				);
				for (const c of curl) expect(c! >= lo && c! <= hi, `${id} A${asc} ${c}`).toBe(true);
			}
		}
	});

	it.each([
		["MAD_GREMLIN", "ANGRY", 17, 1, 2],
		["LOOTER", "THIEVERY", 17, 15, 20],
		["MUGGER", "THIEVERY", 17, 15, 20],
		["BYRD", "FLIGHT", 17, 3, 4],
		["THE_GUARDIAN", "MODE_SHIFT", 9, 30, 35],
		["THE_GUARDIAN", "MODE_SHIFT", 19, 35, 40],
		["FUNGI_BEAST", "SPORE_CLOUD", 17, 2, 2],
		["SENTRY", "ARTIFACT", 18, 1, 1],
		["SPHERIC_GUARDIAN", "ARTIFACT", 17, 3, 3],
		["BRONZE_AUTOMATON", "ARTIFACT", 19, 3, 3],
		["SHELLED_PARASITE", "PLATED_ARMOR", 17, 14, 14],
		["SNAKE_PLANT", "MALLEABLE", 17, 3, 3],
		["LAGAVULIN", "METALLICIZE", 18, 8, 8],
	] as const)("%s %s: A%i changes %i -> %i", (id, power, at, below, above) => {
		expect(powerAmount(monsterAt(fight(id, at - 1), 0), power)).toBe(below);
		expect(powerAmount(monsterAt(fight(id, at), 0), power)).toBe(above);
	});

	it("starting block: Lagavulin 8, Spheric Guardian 40, Shelled Parasite 14 (no asc change)", () => {
		for (const asc of [0, 20]) {
			expect(monsterAt(fight("LAGAVULIN", asc), 0).block).toBe(8);
			expect(monsterAt(fight("SPHERIC_GUARDIAN", asc), 0).block).toBe(40);
			expect(monsterAt(fight("SHELLED_PARASITE", asc), 0).block).toBe(14);
		}
	});
});

// ── Act 1: move effects and AI ─────────────────────────────

describe("Act 1 normals", () => {
	it("Cultist Ritual 3 / A2 4 / A17 5", () => {
		const ritual = (asc: number) =>
			powerAmount(monsterAt(run("CULTIST", "CULTIST_INCANTATION", asc).state, 0), "RITUAL");
		expect([ritual(1), ritual(2), ritual(16), ritual(17)]).toEqual([3, 4, 4, 5]);
	});

	it("Jaw Worm Bellow: Strength 3/4/5 (A2/A17), block 6, 9 at A17", () => {
		const bellow = (asc: number) => {
			const m = monsterAt(run("JAW_WORM", "JAW_WORM_BELLOW", asc).state, 0);
			return [powerAmount(m, "STRENGTH"), m.block];
		};
		expect([bellow(1), bellow(2), bellow(16), bellow(17)]).toEqual([
			[3, 6],
			[4, 6],
			[4, 6],
			[5, 9],
		]);
		expect(monsterAt(run("JAW_WORM", "JAW_WORM_THRASH", 20).state, 0).block).toBe(5);
	});

	it("Red Louse Grow +3, +4 at A17; A17 never Grows twice in a row", () => {
		const grow = (asc: number) =>
			powerAmount(monsterAt(run("RED_LOUSE", "RED_LOUSE_GROW", asc).state, 0), "STRENGTH");
		expect([grow(16), grow(17)]).toEqual([3, 4]);
		expect(nextIntents("RED_LOUSE", 17, [], "RED_LOUSE_GROW")).not.toContain("RED_LOUSE_GROW");
		expect(nextIntents("RED_LOUSE", 16, [], "RED_LOUSE_GROW")).toContain("RED_LOUSE_GROW");
	});

	it("Green Louse Spit Web: Weak 2 at every asc; A17 never twice in a row", () => {
		const spit = "GREEN_LOUSE_SPIT_WEB";
		expect(powerAmount(player(run("GREEN_LOUSE", spit, 20).state), "WEAK")).toBe(2);
		expect(nextIntents("GREEN_LOUSE", 17, [], spit)).not.toContain(spit);
		expect(nextIntents("GREEN_LOUSE", 16, [], spit)).toContain(spit);
	});

	it("Acid Slime S: A17 always opens with Lick; below, Tackle or Lick", () => {
		const first = (asc: number) => SEEDS.map((seed) => intentOf(fight("ACID_SLIME_S", asc, seed)));
		expect(new Set(first(17))).toEqual(new Set(["ACID_SLIME_S_LICK"]));
		expect(new Set(first(16))).toEqual(new Set(["ACID_SLIME_S_LICK", "ACID_SLIME_S_TACKLE"]));
		expect(powerAmount(player(run("ACID_SLIME_S", "ACID_SLIME_S_LICK", 20).state), "WEAK")).toBe(1);
	});

	it("Acid Slime M/L: Slimed 1/2, Weak 1/2; A17 Lick never twice; L A17 Spit never 3x", () => {
		const spitM = run("ACID_SLIME_M", "ACID_SLIME_M_CORROSIVE_SPIT", 20).state;
		expect(discardCount(spitM, "SLIMED")).toBe(1);
		const spitL = run("ACID_SLIME_L", "ACID_SLIME_L_CORROSIVE_SPIT", 20).state;
		expect(discardCount(spitL, "SLIMED")).toBe(2);
		expect(powerAmount(player(run("ACID_SLIME_M", "ACID_SLIME_M_LICK", 20).state), "WEAK")).toBe(1);
		expect(powerAmount(player(run("ACID_SLIME_L", "ACID_SLIME_L_LICK", 20).state), "WEAK")).toBe(2);
		for (const id of ["ACID_SLIME_M", "ACID_SLIME_L"]) {
			expect(nextIntents(id, 17, [], `${id}_LICK`)).not.toContain(`${id}_LICK`);
		}
		const spit = "ACID_SLIME_L_CORROSIVE_SPIT";
		expect(nextIntents("ACID_SLIME_L", 17, [spit], spit)).not.toContain(spit);
		expect(nextIntents("ACID_SLIME_L", 17, [], spit)).toContain(spit);
	});

	it("Spike Slime M/L: Slimed 1/2; Frail 1, L Frail 2 -> 3 at A17; A17 Lick never twice", () => {
		expect(
			discardCount(run("SPIKE_SLIME_M", "SPIKE_SLIME_M_FLAME_TACKLE", 20).state, "SLIMED"),
		).toBe(1);
		expect(
			discardCount(run("SPIKE_SLIME_L", "SPIKE_SLIME_L_FLAME_TACKLE", 20).state, "SLIMED"),
		).toBe(2);
		const frail = (id: string, asc: number) =>
			powerAmount(player(run(id, `${id}_LICK`, asc).state), "FRAIL");
		expect([
			frail("SPIKE_SLIME_M", 20),
			frail("SPIKE_SLIME_L", 16),
			frail("SPIKE_SLIME_L", 17),
		]).toEqual([1, 2, 3]);
		for (const id of ["SPIKE_SLIME_M", "SPIKE_SLIME_L"]) {
			expect(nextIntents(id, 17, [], `${id}_LICK`)).not.toContain(`${id}_LICK`);
			expect(nextIntents(id, 16, [], `${id}_LICK`)).toContain(`${id}_LICK`);
		}
	});

	it("Fat Gremlin Smash: Weak 1, plus Frail 1 from A17", () => {
		const smash = (asc: number) => player(run("FAT_GREMLIN", "FAT_GREMLIN_SMASH", asc).state);
		expect([powerAmount(smash(16), "WEAK"), powerAmount(smash(16), "FRAIL")]).toEqual([
			1,
			undefined,
		]);
		expect([powerAmount(smash(17), "WEAK"), powerAmount(smash(17), "FRAIL")]).toEqual([1, 1]);
	});

	it("Shield Gremlin Protect: an ally gains 7, 8 from A7, 11 from A17", () => {
		const protect = (asc: number) => {
			const s = forceMove(
				startFight("GREMLIN_GANG", 1n, undefined, asc),
				3,
				"SHIELD_GREMLIN_PROTECT",
			);
			const after = endTurn(s);
			return Math.max(...[0, 1, 2].map((i) => monsterAt(after, i).block));
		};
		expect([protect(6), protect(7), protect(16), protect(17)]).toEqual([7, 8, 8, 11]);
	});

	it("Gremlin Wizard: blasts on turn 3; A17 keeps blasting, below it charges again", () => {
		const afterFirstBlast = (asc: number) => {
			let s = fight("GREMLIN_WIZARD", asc);
			const seen = [intentOf(s)];
			for (let t = 0; t < 3; t++) {
				s = endTurn(s);
				seen.push(intentOf(s));
			}
			return seen;
		};
		const C = "GREMLIN_WIZARD_CHARGING";
		const B = "GREMLIN_WIZARD_ULTIMATE_BLAST";
		expect(afterFirstBlast(16)).toEqual([C, C, B, C]);
		expect(afterFirstBlast(17)).toEqual([C, C, B, B]);
	});

	it("Looter / Mugger steal 15 gold, 20 from A17; Mugger Smoke Bomb 11 -> 17, Looter 6", () => {
		for (const [id, move] of [
			["LOOTER", "LOOTER_MUG"],
			["LOOTER", "LOOTER_LUNGE"],
			["MUGGER", "MUGGER_MUG"],
			["MUGGER", "MUGGER_LUNGE"],
		] as const) {
			expect(run(id, move, 16).state.gold, `${move} A16`).toBe(99 - 15);
			expect(run(id, move, 17).state.gold, `${move} A17`).toBe(99 - 20);
		}
		const smoke = (id: string, asc: number) =>
			monsterAt(run(id, `${id}_SMOKE_BOMB`, asc).state, 0).block;
		expect([smoke("MUGGER", 16), smoke("MUGGER", 17), smoke("LOOTER", 20)]).toEqual([11, 17, 6]);
	});

	it("Fungi Beast Grow: Strength 3 / A2 4 / A17 5; Spore Cloud gives 2 Vulnerable", () => {
		const grow = (asc: number) =>
			powerAmount(monsterAt(run("FUNGI_BEAST", "FUNGI_BEAST_GROW", asc).state, 0), "STRENGTH");
		expect([grow(1), grow(2), grow(16), grow(17)]).toEqual([3, 4, 4, 5]);
		let s = withEnergy(fight("FUNGI_BEAST", 20, 1n, deckOf(["BLUDGEON"])));
		s = playCard(s, "BLUDGEON");
		expect(monsterAt(s, 0).alive).toBe(false);
		expect(powerAmount(player(s), "VULNERABLE")).toBe(2);
	});

	it("Blue Slaver Rake: Weak 1, 2 at A17; A17 never Rakes twice in a row", () => {
		const rake = "BLUE_SLAVER_RAKE";
		const weak = (asc: number) => powerAmount(player(run("BLUE_SLAVER", rake, asc).state), "WEAK");
		expect([weak(16), weak(17)]).toEqual([1, 2]);
		expect(nextIntents("BLUE_SLAVER", 17, [], rake)).not.toContain(rake);
		expect(nextIntents("BLUE_SLAVER", 16, [], rake)).toContain(rake);
	});

	it("Red Slaver Scrape: Vulnerable 1, 2 at A17; A17 never Scrapes twice in a row", () => {
		const scrape = "RED_SLAVER_SCRAPE";
		const vuln = (asc: number) =>
			powerAmount(player(run("RED_SLAVER", scrape, asc).state), "VULNERABLE");
		expect([vuln(16), vuln(17)]).toEqual([1, 2]);
		expect(nextIntents("RED_SLAVER", 17, ["RED_SLAVER_STAB"], scrape)).not.toContain(scrape);
		expect(nextIntents("RED_SLAVER", 16, ["RED_SLAVER_STAB"], scrape)).toContain(scrape);
	});
});

describe("Act 1 elites", () => {
	it("Gremlin Nob: Enrage 2, 3 at A18 (Strength per Skill); Skull Bash Vulnerable 2", () => {
		for (const [asc, enrage] of [
			[17, 2],
			[18, 3],
		] as const) {
			let s = run("GREMLIN_NOB", "GREMLIN_NOB_BELLOW", asc, 1n).state;
			expect(powerAmount(monsterAt(s, 0), "ENRAGE")).toBe(enrage);
			s = playCard(s, "DEFEND_RED");
			expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(enrage);
		}
		const bash = run("GREMLIN_NOB", "GREMLIN_NOB_SKULL_BASH", 20).state;
		expect(powerAmount(player(bash), "VULNERABLE")).toBe(2);
	});

	it("Gremlin Nob A18: Bellow, then Skull Bash, Rush, Rush repeating", () => {
		for (const seed of SEEDS.slice(0, 5)) {
			let s = fight("GREMLIN_NOB", 18, seed);
			const seen = [intentOf(s)];
			for (let t = 0; t < 7; t++) {
				s = endTurn(s);
				seen.push(intentOf(s).replace("GREMLIN_NOB_", ""));
			}
			expect(seen).toEqual([
				"GREMLIN_NOB_BELLOW",
				"SKULL_BASH",
				"RUSH",
				"RUSH",
				"SKULL_BASH",
				"RUSH",
				"RUSH",
				"SKULL_BASH",
			]);
		}
		// Below A18 the choice is random (33% Skull Bash).
		const a17 = SEEDS.map((seed) => intentOf(endTurn(fight("GREMLIN_NOB", 17, seed))));
		expect(new Set(a17)).toEqual(new Set(["GREMLIN_NOB_RUSH", "GREMLIN_NOB_SKULL_BASH"]));
	});

	it("Lagavulin (elite encounter) sleeps: 3 Sleep turns, wakes, loses Metallicize, then attacks", () => {
		let s = startFight("LAGAVULIN", 1n, undefined, 0);
		expect(intentOf(s)).toBe("LAGAVULIN_SLEEP");
		for (let t = 0; t < 2; t++) {
			s = endTurn(s);
			expect(intentOf(s)).toBe("LAGAVULIN_SLEEP");
		}
		s = endTurn(s);
		const lag = monsterAt(s, 0);
		expect(lag.intent.moveId).toBe("LAGAVULIN_ATTACK");
		expect(powerAmount(lag, "ASLEEP")).toBeUndefined();
		expect(powerAmount(lag, "METALLICIZE")).toBeUndefined();
		const hit = endTurnHits(s);
		expect(hit.hits).toEqual([18]);
		expect(monsterAt(hit.state, 0).block).toBe(0); // no Metallicize after waking
	});

	it("Lagavulin wakes when it loses HP: the queued Sleep runs, then it attacks", () => {
		let s = withEnergy(startFight("LAGAVULIN", 1n, undefined, 0));
		s = patchMonster(s, 0, { block: 0 });
		s = playCard(s, "STRIKE_RED");
		expect(powerAmount(monsterAt(s, 0), "ASLEEP")).toBeUndefined();
		expect(powerAmount(monsterAt(s, 0), "METALLICIZE")).toBeUndefined();
		s = endTurn(s);
		expect(intentOf(s)).toBe("LAGAVULIN_ATTACK");
	});

	it("Lagavulin Siphon Soul: -1 Str/Dex, -2 at A18; awake cycle Attack, Attack, Siphon", () => {
		for (const [asc, amount] of [
			[17, -1],
			[18, -2],
		] as const) {
			const p = player(run("LAGAVULIN", "LAGAVULIN_SIPHON_SOUL", asc).state);
			expect([powerAmount(p, "STRENGTH"), powerAmount(p, "DEXTERITY")]).toEqual([amount, amount]);
		}
		const after = nextIntents("LAGAVULIN", 18, ["LAGAVULIN_ATTACK"], "LAGAVULIN_ATTACK");
		expect(new Set(after)).toEqual(new Set(["LAGAVULIN_SIPHON_SOUL"]));
	});

	it("Sentry Bolt: 2 Dazed, 3 at A18", () => {
		const dazed = (asc: number) => discardCount(run("SENTRY", "SENTRY_BOLT", asc).state, "DAZED");
		expect([dazed(17), dazed(18)]).toEqual([2, 3]);
	});
});
