/**
 * Ascension behaviour of the Act 1 and Act 2 monsters (part 2): Act 1 bosses
 * and all of Act 2 (move amounts by ascension and the A17/A18/A19 AI changes),
 * through real encounters and endTurn. Part 1: ascensionAct12.test.ts.
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
import type { MonsterId } from "../core/types";
import { random } from "../rng/stsRandom";
import {
	deckOf,
	discardCount,
	endTurnHits,
	fight,
	HP,
	intentOf,
	player,
	run,
	SEEDS,
	withEnergy,
} from "./ascensionTestHelpers";

beforeEach(() => loadAllData());

describe("Act 1 bosses", () => {
	it("Slime Boss Goop Spray: 3 Slimed, 5 at A19", () => {
		const goop = (asc: number) =>
			discardCount(run("SLIME_BOSS", "SLIME_BOSS_GOOP_SPRAY", asc).state, "SLIMED");
		expect([goop(18), goop(19)]).toEqual([3, 5]);
	});

	it("Slime Boss splits at half HP into Spike Slime L and Acid Slime L with its HP", () => {
		let s = withEnergy(fight("SLIME_BOSS", 9, 1n));
		s = patchMonster(s, 0, { currentHp: 80 });
		s = playCard(s, "STRIKE_RED");
		expect(monsterAt(s, 0).currentHp).toBe(74);
		s = playCard(s, "STRIKE_RED");
		s = endTurn(s);
		expect(intentOf(s)).toBe("SLIME_BOSS_SPLIT");
		s = endTurn(s);
		const alive = (s.combat?.monsters ?? []).filter((m) => m.alive);
		expect(alive.map((m) => m.id).sort()).toEqual(["ACID_SLIME_L", "SPIKE_SLIME_L"]);
		for (const m of alive) expect([m.currentHp, m.maxHp]).toEqual([68, 68]);
	});

	it("Guardian Mode Shift breaks at 30 (A9 35, A19 40): 20 block, intent becomes Defensive Mode", () => {
		const bludgeon = (asc: number) => {
			const s = withEnergy(fight("THE_GUARDIAN", asc, 1n, deckOf(["BLUDGEON", "STRIKE_RED"])));
			return playCard(s, "BLUDGEON");
		};
		const a8 = monsterAt(bludgeon(8), 0);
		expect([powerAmount(a8, "MODE_SHIFT"), a8.block, a8.intent.moveId]).toEqual([
			undefined,
			20,
			"THE_GUARDIAN_DEFENSIVE_MODE",
		]);
		const a9 = monsterAt(bludgeon(9), 0);
		expect([powerAmount(a9, "MODE_SHIFT"), a9.block, a9.intent.moveId]).toEqual([
			3,
			0,
			"THE_GUARDIAN_CHARGING_UP",
		]);
		const a19 = bludgeon(19);
		expect(powerAmount(monsterAt(a19, 0), "MODE_SHIFT")).toBe(8);
		const broken = monsterAt(playCard(a19, "STRIKE_RED"), 0);
		expect([powerAmount(broken, "MODE_SHIFT"), broken.intent.moveId]).toEqual([
			2,
			"THE_GUARDIAN_CHARGING_UP",
		]);
	});

	it("Guardian defensive loop: Sharp Hide 3 (A19 4), Roll, Twin Slam restores Mode Shift +10", () => {
		for (const [asc, hide, threshold] of [
			[18, 3, 45],
			[19, 4, 50],
		] as const) {
			let s = withEnergy(fight("THE_GUARDIAN", asc, 1n, deckOf(["BLUDGEON", "BLUDGEON"])));
			s = playCard(playCard(s, "BLUDGEON"), "BLUDGEON");
			expect(intentOf(s)).toBe("THE_GUARDIAN_DEFENSIVE_MODE");
			s = endTurn(s);
			expect(powerAmount(monsterAt(s, 0), "SHARP_HIDE")).toBe(hide);
			expect(intentOf(s)).toBe("THE_GUARDIAN_ROLL_ATTACK");
			s = endTurn(s);
			expect(intentOf(s)).toBe("THE_GUARDIAN_TWIN_SLAM");
			s = endTurn(s);
			const g = monsterAt(s, 0);
			expect([powerAmount(g, "MODE_SHIFT"), powerAmount(g, "SHARP_HIDE")]).toEqual([
				threshold,
				undefined,
			]);
			expect(g.intent.moveId).toBe("THE_GUARDIAN_WHIRLWIND");
		}
	});

	it("Guardian Vent Steam: Vulnerable 2 + Weak 2; Charging Up 9 block (no asc change)", () => {
		const p = player(run("THE_GUARDIAN", "THE_GUARDIAN_VENT_STEAM", 20).state);
		expect([powerAmount(p, "VULNERABLE"), powerAmount(p, "WEAK")]).toEqual([2, 2]);
		expect(monsterAt(run("THE_GUARDIAN", "THE_GUARDIAN_CHARGING_UP", 20).state, 0).block).toBe(9);
	});

	it("Hexaghost: Sear 1 Burn (A19 2); Inflame +2 Strength (A19 +3) and 12 block", () => {
		const burns = (asc: number) =>
			discardCount(run("HEXAGHOST", "HEXAGHOST_SEAR", asc).state, "BURN");
		expect([burns(18), burns(19)]).toEqual([1, 2]);
		const inflame = (asc: number) => {
			const m = monsterAt(run("HEXAGHOST", "HEXAGHOST_INFLAME", asc).state, 0);
			return [powerAmount(m, "STRENGTH"), m.block];
		};
		expect([inflame(18), inflame(19)]).toEqual([
			[2, 12],
			[3, 12],
		]);
	});
});

// ── Act 2 ──────────────────────────────────────────────────

describe("Act 2 normals", () => {
	it("Spheric Guardian Activate: 25 block, 35 at A17; Frail 5; Harden 15 block", () => {
		const block = (asc: number) =>
			monsterAt(run("SPHERIC_GUARDIAN", "SPHERIC_GUARDIAN_ACTIVATE", asc).state, 0).block;
		expect([block(16) - 40, block(17) - 40]).toEqual([25, 35]); // Barricade keeps the 40
		const debuff = run("SPHERIC_GUARDIAN", "SPHERIC_GUARDIAN_ATTACK_DEBUFF", 20).state;
		expect(powerAmount(player(debuff), "FRAIL")).toBe(5);
		const harden = run("SPHERIC_GUARDIAN", "SPHERIC_GUARDIAN_HARDEN", 20).state;
		expect(monsterAt(harden, 0).block).toBe(55);
	});

	it("Chosen opens with Poke, Hex at A17", () => {
		const first = (asc: number) =>
			new Set(SEEDS.map((seed) => intentOf(fight("CHOSEN", asc, seed))));
		expect(first(16)).toEqual(new Set(["CHOSEN_POKE"]));
		expect(first(17)).toEqual(new Set(["CHOSEN_HEX"]));
		const drain = run("CHOSEN", "CHOSEN_DRAIN", 20).state;
		expect([
			powerAmount(player(drain), "WEAK"),
			powerAmount(monsterAt(drain, 0), "STRENGTH"),
		]).toEqual([3, 3]);
	});

	it("Shelled Parasite opens with Fell at A17, never below", () => {
		const first = (asc: number) =>
			new Set(SEEDS.map((seed) => intentOf(fight("SHELLED_PARASITE", asc, seed))));
		expect(first(16)).toEqual(new Set(["SHELLED_PARASITE_DOUBLE_STRIKE", "SHELLED_PARASITE_SUCK"]));
		expect(first(17)).toEqual(new Set(["SHELLED_PARASITE_FELL"]));
	});

	it("Byrd Flight resets to 3, 4 at A17; Fly regains 3 / 4", () => {
		for (const [asc, flight] of [
			[16, 3],
			[17, 4],
		] as const) {
			let s = withEnergy(fight("BYRD", asc));
			s = playCard(s, "STRIKE_RED");
			expect(powerAmount(monsterAt(s, 0), "FLIGHT")).toBe(flight - 1);
			s = endTurn(forceMove(s, 0, "BYRD_CAW"));
			expect(powerAmount(monsterAt(s, 0), "FLIGHT")).toBe(flight);
			const grounded = patchMonster(fight("BYRD", asc), 0, { powers: [] });
			const flown = endTurn(forceMove(grounded, 0, "BYRD_FLY"));
			expect(powerAmount(monsterAt(flown, 0), "FLIGHT")).toBe(flight);
		}
	});

	it("Centurion Defend: Mystic gains 15, 20 at A17", () => {
		const defend = (asc: number) => {
			const s = forceMove(
				startFight("CENTURION_AND_HEALER", 1n, undefined, asc),
				0,
				"CENTURION_DEFEND",
			);
			return monsterAt(endTurn(s), 1).block;
		};
		expect([defend(16), defend(17)]).toEqual([15, 20]);
	});

	it("Mystic: Buff 2 / A2 3 / A17 4 to both; Heal 16 / A17 20; heals at 16 missing, 21 at A17", () => {
		const buff = (asc: number) => {
			const s = forceMove(startFight("CENTURION_AND_HEALER", 1n, undefined, asc), 1, "MYSTIC_BUFF");
			const after = endTurn(s);
			return [
				powerAmount(monsterAt(after, 0), "STRENGTH"),
				powerAmount(monsterAt(after, 1), "STRENGTH"),
			];
		};
		expect([buff(1), buff(2), buff(17)]).toEqual([
			[2, 2],
			[3, 3],
			[4, 4],
		]);
		for (const [asc, amount] of [
			[16, 16],
			[17, 20],
		] as const) {
			let s = startFight("CENTURION_AND_HEALER", 1n, undefined, asc);
			const max = monsterAt(s, 0).maxHp;
			s = patchMonster(s, 0, { currentHp: max - 30 });
			s = endTurn(forceMove(s, 1, "MYSTIC_HEAL"));
			expect(max - monsterAt(s, 0).currentHp, `heal A${asc}`).toBe(30 - amount);
		}
		const next = (asc: number, missing: number) =>
			SEEDS.slice(0, 8).map((seed) => {
				let s = startFight("CENTURION_AND_HEALER", seed, undefined, asc);
				s = forceMove(s, 1, "MYSTIC_BUFF");
				s = patchMonster(s, 0, { currentHp: monsterAt(s, 0).maxHp - missing });
				return intentOf(endTurn(forceMove(s, 0, "CENTURION_DEFEND")), 1);
			});
		expect(new Set(next(16, 16))).toEqual(new Set(["MYSTIC_HEAL"]));
		expect(next(17, 20)).not.toContain("MYSTIC_HEAL");
		expect(new Set(next(17, 21))).toEqual(new Set(["MYSTIC_HEAL"]));
	});

	it("Mystic A17: never attacks twice in a row", () => {
		const atk = "MYSTIC_ATTACK_DEBUFF";
		const next = (asc: number) =>
			SEEDS.map((seed) => {
				const s = forceMove(startFight("CENTURION_AND_HEALER", seed, undefined, asc), 1, atk);
				return intentOf(endTurn(forceMove(s, 0, "CENTURION_DEFEND")), 1);
			});
		expect(next(17)).not.toContain(atk);
		expect(next(16)).toContain(atk);
	});

	it("Snake Plant A17: after Spores always Chomp, Chomp, Spores", () => {
		const spores = "SNAKE_PLANT_ENFEEBLING_SPORES";
		const chomp = "SNAKE_PLANT_CHOMP";
		const cycle = (asc: number, seed: bigint) => {
			let s = endTurn(forceMove(fight("SNAKE_PLANT", asc, seed), 0, spores));
			const seen = [intentOf(s)];
			for (let t = 0; t < 2; t++) {
				s = endTurn(s);
				seen.push(intentOf(s));
			}
			return seen.join(",");
		};
		const a17 = new Set(SEEDS.map((seed) => cycle(17, seed)));
		expect(a17).toEqual(new Set([[chomp, chomp, spores].join(",")]));
		const a16 = new Set(SEEDS.map((seed) => cycle(16, seed)));
		expect(a16.size).toBeGreaterThan(1);
		const p = player(run("SNAKE_PLANT", spores, 20).state);
		expect([powerAmount(p, "FRAIL"), powerAmount(p, "WEAK")]).toEqual([2, 2]);
	});

	it("Snecko Tail Whip: Vulnerable 2, plus Weak 2 from A17; Glare confuses", () => {
		const whip = (asc: number) => player(run("SNECKO", "SNECKO_TAIL_WHIP", asc).state);
		expect([powerAmount(whip(16), "VULNERABLE"), powerAmount(whip(16), "WEAK")]).toEqual([
			2,
			undefined,
		]);
		expect([powerAmount(whip(17), "VULNERABLE"), powerAmount(whip(17), "WEAK")]).toEqual([2, 2]);
		expect(intentOf(fight("SNECKO", 20))).toBe("SNECKO_PERPLEXING_GLARE");
	});
});

describe("Act 2 masked bandits", () => {
	it("Bear Hug: Dexterity -2, -4 at A17; Lunge 9 block", () => {
		const hug = (asc: number) =>
			powerAmount(player(run("BEAR", "BEAR_BEAR_HUG", asc).state), "DEXTERITY");
		expect([hug(16), hug(17)]).toEqual([-2, -4]);
		expect(monsterAt(run("BEAR", "BEAR_LUNGE", 20).state, 0).block).toBe(9);
	});

	it("Romeo: Weak 2, 3 at A17; A17 pattern Mock, then Agonizing, Cross, Cross", () => {
		const weak = (asc: number) =>
			powerAmount(player(run("ROMEO", "ROMEO_AGONIZING_SLASH", asc).state), "WEAK");
		expect([weak(16), weak(17)]).toEqual([2, 3]);
		const seq = (asc: number) => {
			let s = fight("ROMEO", asc);
			const seen = [intentOf(s).replace("ROMEO_", "")];
			for (let t = 0; t < 6; t++) {
				s = endTurn(s);
				seen.push(intentOf(s).replace("ROMEO_", ""));
			}
			return seen;
		};
		const [M, A, X] = ["MOCK", "AGONIZING_SLASH", "CROSS_SLASH"];
		expect(seq(16)).toEqual([M, A, X, A, X, A, X]);
		expect(seq(17)).toEqual([M, A, X, X, A, X, X]);
	});
});

describe("Act 2 elites", () => {
	it("Book of Stabbing Multi Stab: 6 per hit, 7 from A3", () => {
		const stab = (asc: number) => {
			const s = patchMonster(fight("BOOK_OF_STABBING", asc), 0, { miscInfo: 2 });
			return endTurnHits(forceMove(s, 0, "BOOK_OF_STABBING_MULTI_STAB")).hits;
		};
		expect([stab(2), stab(3)]).toEqual([
			[6, 6],
			[7, 7],
		]);
	});

	it("Book of Stabbing: Multi Stab hits grow; from A18 Single Stab also raises the count", () => {
		for (const seed of SEEDS.slice(0, 10)) {
			for (const asc of [17, 18]) {
				let s = fight("BOOK_OF_STABBING", asc, seed);
				for (let t = 0; t < 8; t++) {
					const m = monsterAt(s, 0);
					const picks = [...m.moveHistory, m.intent.moveId];
					const multis = picks.filter((id) => id === "BOOK_OF_STABBING_MULTI_STAB").length;
					expect(m.miscInfo, `seed ${seed} A${asc} t${t}`).toBe(
						1 + (asc >= 18 ? picks.length : multis),
					);
					if (m.intent.moveId === "BOOK_OF_STABBING_MULTI_STAB")
						expect(m.intent.hits).toBe(m.miscInfo);
					s = endTurn(s);
				}
			}
		}
	});

	it("Gremlin Leader Encourage: Strength 3 / A3 4 / A18 5; minion block 6, 10 at A18", () => {
		const seed = SEEDS.find((sd) => {
			const ids = (startFight("GREMLIN_LEADER", sd).combat?.monsters ?? []).map((m) => m.id);
			return !ids.includes("SHIELD_GREMLIN" as MonsterId);
		});
		const encourage = (asc: number) => {
			const s = forceMove(
				startFight("GREMLIN_LEADER", seed, undefined, asc),
				3,
				"GREMLIN_LEADER_ENCOURAGE",
			);
			const after = endTurn(s);
			const minion = monsterAt(after, 1);
			return [
				powerAmount(monsterAt(after, 3), "STRENGTH"),
				powerAmount(minion, "STRENGTH"),
				minion.block,
			];
		};
		expect([encourage(2), encourage(3), encourage(17), encourage(18)]).toEqual([
			[3, 3, 6],
			[4, 4, 6],
			[4, 4, 6],
			[5, 5, 10],
		]);
	});

	it("Gremlin Leader Rally: summoned gremlins roll A7+ HP in an A8 fight", () => {
		const hpRange = new Map(HP.map(([id, , , above]) => [id, above]));
		for (const seed of SEEDS.slice(0, 10)) {
			let s = startFight("GREMLIN_LEADER", seed, undefined, 8);
			for (const i of [1, 2]) s = patchMonster(s, i, { alive: false, currentHp: 0 });
			s = endTurn(forceMove(s, 3, "GREMLIN_LEADER_RALLY"));
			for (const i of [1, 2]) {
				const m = monsterAt(s, i);
				const [lo, hi] = hpRange.get(m.id) ?? [0, 0];
				expect(m.alive && m.maxHp >= lo && m.maxHp <= hi, `${m.id} ${m.maxHp}`).toBe(true);
			}
		}
	});

	it("Taskmaster: 1 Wound, 2 from A3, 3 and +1 Strength from A18", () => {
		const whip = (asc: number) => {
			const s = run("TASKMASTER", "TASKMASTER_SCOURING_WHIP", asc).state;
			return [discardCount(s, "WOUND"), powerAmount(monsterAt(s, 0), "STRENGTH")];
		};
		expect([whip(2), whip(3), whip(17), whip(18)]).toEqual([
			[1, undefined],
			[2, undefined],
			[2, undefined],
			[3, 1],
		]);
	});
});

describe("Act 2 bosses", () => {
	it("Bronze Automaton Boost: Strength 3 / A4 4, block 9 / A9 12", () => {
		const boost = (asc: number) => {
			const m = monsterAt(run("BRONZE_AUTOMATON", "BRONZE_AUTOMATON_BOOST", asc).state, 0);
			return [powerAmount(m, "STRENGTH"), m.block];
		};
		expect([boost(3), boost(4), boost(8), boost(9)]).toEqual([
			[3, 9],
			[4, 9],
			[4, 9],
			[4, 12],
		]);
	});

	it("Bronze Automaton: Stunned after Hyper Beam, Boost instead from A19", () => {
		const afterBeam = (asc: number) =>
			intentOf(run("BRONZE_AUTOMATON", "BRONZE_AUTOMATON_HYPER_BEAM", asc).state);
		expect([afterBeam(18), afterBeam(19)]).toEqual([
			"BRONZE_AUTOMATON_STUNNED",
			"BRONZE_AUTOMATON_BOOST",
		]);
	});

	it("Bronze Orbs spawned by the Automaton roll A9 HP", () => {
		const orbHp = (asc: number) =>
			SEEDS.slice(0, 10).flatMap((seed) => {
				const s = endTurn(startFight("AUTOMATON", seed, undefined, asc));
				return [0, 2].map((i) => monsterAt(s, i).maxHp);
			});
		expect(Math.max(...orbHp(8))).toBeLessThanOrEqual(58);
		expect(Math.min(...orbHp(9))).toBeGreaterThanOrEqual(54);
		expect(Math.max(...orbHp(9))).toBeLessThanOrEqual(60);
	});

	it("Collector Buff: Strength 3 / A4 4 / A19 5 to itself and heads; block 15 / A9 18 / A19 23", () => {
		const buff = (asc: number) => {
			let s = endTurn(startFight("COLLECTOR", 1n, undefined, asc)); // spawns two Torch Heads
			s = endTurn(forceMove(s, 2, "THE_COLLECTOR_BUFF"));
			const c = monsterAt(s, 2);
			return [powerAmount(c, "STRENGTH"), powerAmount(monsterAt(s, 0), "STRENGTH"), c.block];
		};
		expect([buff(3), buff(4), buff(9), buff(18), buff(19)]).toEqual([
			[3, 3, 15],
			[4, 4, 15],
			[4, 4, 18],
			[4, 4, 18],
			[5, 5, 23],
		]);
	});

	it("Collector Mega Debuff: 3 Weak/Vulnerable/Frail, 5 at A19; Torch Heads roll A9 HP", () => {
		for (const [asc, n] of [
			[18, 3],
			[19, 5],
		] as const) {
			const p = player(run("THE_COLLECTOR", "THE_COLLECTOR_MEGA_DEBUFF", asc).state);
			expect(["WEAK", "VULNERABLE", "FRAIL"].map((id) => powerAmount(p, id))).toEqual([n, n, n]);
		}
		const heads = (asc: number) =>
			SEEDS.slice(0, 10).flatMap((seed) => {
				const s = endTurn(startFight("COLLECTOR", seed, undefined, asc));
				return [0, 1].map((i) => monsterAt(s, i).maxHp);
			});
		expect(Math.max(...heads(8))).toBeLessThanOrEqual(40);
		expect(Math.min(...heads(9))).toBeGreaterThanOrEqual(40);
	});

	it("Champ: Gloat 2/3/4, Anger 6/9/12 (A4/A19); Defensive Stance block 15/18/20, Metallicize 5/6/7 (A9/A19)", () => {
		const str = (move: string, asc: number) =>
			powerAmount(monsterAt(run("THE_CHAMP", move, asc).state, 0), "STRENGTH");
		expect([3, 4, 18, 19].map((a) => str("THE_CHAMP_GLOAT", a))).toEqual([2, 3, 3, 4]);
		expect([3, 4, 18, 19].map((a) => str("THE_CHAMP_ANGER", a))).toEqual([6, 9, 9, 12]);
		const stance = (asc: number) => {
			const m = monsterAt(run("THE_CHAMP", "THE_CHAMP_DEFENSIVE_STANCE", asc).state, 0);
			return [m.block, powerAmount(m, "METALLICIZE")];
		};
		expect([stance(8), stance(9), stance(18), stance(19)]).toEqual([
			[15, 5],
			[18, 6],
			[18, 6],
			[20, 7],
		]);
		const taunt = player(run("THE_CHAMP", "THE_CHAMP_TAUNT", 20).state);
		expect([powerAmount(taunt, "WEAK"), powerAmount(taunt, "VULNERABLE")]).toEqual([2, 2]);
	});

	it("Champ: Defensive Stance on rolls up to 15, up to 30 from A19", () => {
		let checked = 0;
		for (let seed = 1n; seed <= 300n && checked < 3; seed++) {
			const s = forceMove(fight("THE_CHAMP", 19, seed), 0, "THE_CHAMP_HEAVY_SLASH");
			const roll = random(s.rng.aiRng, 99).value;
			if (roll <= 15 || roll > 30) continue;
			checked++;
			expect(intentOf(endTurn(s))).toBe("THE_CHAMP_DEFENSIVE_STANCE");
			const a18 = forceMove(fight("THE_CHAMP", 18, seed), 0, "THE_CHAMP_HEAVY_SLASH");
			expect(intentOf(endTurn(a18))).toBe("THE_CHAMP_GLOAT");
		}
		expect(checked).toBe(3);
	});
});
