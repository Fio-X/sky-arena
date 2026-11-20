/**
 * Potion rewards (AbstractRoom.addPotionToRewards + returnRandomPotion):
 * 40% ± blizzardPotionMod, then a 65 / 25 / 10 rarity roll — through real fights.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getPotion } from "../content/loader";
import { base, loadRunData, run, winFight } from "../content/relicsRunTestHelpers";
import { createRun } from "./newRun";
import { rollPotionDrop } from "./potion";
import type { GameState, PotionId } from "./types";

beforeAll(loadRunData);

const reward = (s: GameState) => (s.phase.type === "reward" ? s.phase.potionReward : undefined);

describe("drop chance", () => {
	it("a drop lowers the next chance by 10, a miss raises it by 10", () => {
		let s = base(["monster", "monster", "monster", "monster", "monster", "monster"]);
		for (let y = 0; y < 6; y++) {
			const mod = s.potionChanceMod ?? 0;
			s = winFight({ ...s, potions: [null, null, null] }, y);
			expect(s.potionChanceMod).toBe(reward(s) ? mod - 10 : mod + 10);
			s = { ...s, phase: { type: "map" } };
		}
	});

	it("the modifier decides: −40 never drops, +60 always does", () => {
		for (const seed of [1n, 2n, 3n, 4n, 5n]) {
			const at = (mod: number) =>
				winFight({ ...base(), rng: createRun(seed, "IRONCLAD").rng, potionChanceMod: mod }, 0);
			expect(reward(at(-40))).toBeNull();
			expect(reward(at(60))).not.toBeNull();
		}
	});

	it("White Beast Statue: always a potion, and the modifier still drops by 10", () => {
		const s = winFight({ ...base(["monster"], ["WHITE_BEAST_STATUE"]), potionChanceMod: -40 }, 0);
		expect(reward(s)).not.toBeNull();
		expect(s.potionChanceMod).toBe(-50);
	});

	it("all slots full: still rolled (the modifier moves); the reward waits for a free slot", () => {
		const full: GameState = {
			...base(["monster"], ["WHITE_BEAST_STATUE"]),
			potions: ["FIRE_POTION", "FIRE_POTION", "FIRE_POTION"] as PotionId[],
		};
		let s = winFight(full, 0);
		const potion = reward(s);
		expect(potion).not.toBeNull();
		expect(s.potionChanceMod).toBe(-10);
		expect(s.rng.potionRng).not.toEqual(full.rng.potionRng);
		s = run(s, { type: "obtainPotionReward" });
		expect(reward(s)).toBe(potion);
		s = run(s, { type: "discardPotion", index: 0 }, { type: "obtainPotionReward" });
		expect(reward(s)).toBeNull();
		expect(s.potions).toContain(potion);
	});

	it("4 rewards already listed (burning elite + Black Star): chance 0 even with White Beast Statue", () => {
		const elite = (relics: string[]): GameState => {
			const b = base(["elite"], ["WHITE_BEAST_STATUE", ...relics]);
			const node = b.map.nodes[0]?.[0];
			if (!node) throw new Error("no node");
			return { ...b, map: { ...b.map, nodes: [[{ ...node, emerald: true }]] } };
		};
		expect(reward(winFight(elite([]), 0))).not.toBeNull(); // gold + relic + key = 3
		const four = winFight(elite(["BLACK_STAR"]), 0);
		expect(reward(four)).toBeNull();
		expect(four.potionChanceMod).toBe(10);
	});
});

describe("rarity", () => {
	it("about 65% common, 25% uncommon, 10% rare", () => {
		const count = { common: 0, uncommon: 0, rare: 0 } as Record<string, number>;
		let rng = createRun(9n, "IRONCLAD").rng.potionRng;
		const n = 4000;
		for (let i = 0; i < n; i++) {
			const r = rollPotionDrop(rng, 100, "IRONCLAD");
			rng = r.rng;
			const rarity = getPotion(r.potion ?? "")?.rarity ?? "?";
			count[rarity] = (count[rarity] ?? 0) + 1;
		}
		expect((count.common ?? 0) / n).toBeCloseTo(0.65, 1);
		expect((count.uncommon ?? 0) / n).toBeCloseTo(0.25, 1);
		expect((count.rare ?? 0) / n).toBeCloseTo(0.1, 1);
	});
});
