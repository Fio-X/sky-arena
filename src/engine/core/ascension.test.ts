/** Run-level ascension rules (A6, A10–A14, A16, A20) and the reward upgrade roll. */
import { beforeAll, describe, expect, it } from "vitest";
import { cardUpgradedChance, generateCardReward } from "../combat/cardReward";
import { getCard } from "../content/loader";
import { base, enter, loadRunData, run, winFight } from "../content/relicsRunTestHelpers";
import { startNextAct } from "./act";
import { createRun } from "./newRun";
import { generateShop } from "./shop";
import type { GameState } from "./types";

beforeAll(loadRunData);

const elites = (s: GameState) => s.map.nodes.flat().filter((n) => n.type === "elite").length;

describe("run start", () => {
	it("A0 Ironclad: 80/80, 3 potion slots, no curse", () => {
		const s = createRun(1n, "IRONCLAD", 0);
		expect([s.maxHp, s.currentHp, s.potions.length]).toEqual([80, 80, 3]);
		expect(s.deck.some((c) => c.id === "ASCENDERS_BANE")).toBe(false);
	});

	it("A20 Ironclad: A14 −5 max HP, A6 90% HP, A10 Ascender's Bane, A11 two slots", () => {
		const s = createRun(1n, "IRONCLAD", 20);
		expect(s.maxHp).toBe(75);
		expect(s.currentHp).toBe(68); // round(67.5)
		expect(s.deck.filter((c) => c.id === "ASCENDERS_BANE")).toHaveLength(1);
		expect(s.potions).toHaveLength(2);
		expect(s.potionSlots).toBe(2);
		expect(new Set(s.deck.map((c) => c.uniqueId)).size).toBe(s.deck.length);
	});

	it("A14 costs the other characters 4 max HP", () => {
		expect(createRun(1n, "SILENT", 14).maxHp).toBe(66);
		expect(createRun(1n, "DEFECT", 14).maxHp).toBe(71);
		expect(createRun(1n, "WATCHER", 14).maxHp).toBe(68);
	});

	it("A1+ maps have more elites", () => {
		let more = 0;
		for (const seed of [1n, 2n, 3n, 4n, 5n]) {
			if (elites(createRun(seed, "IRONCLAD", 1)) > elites(createRun(seed, "IRONCLAD", 0))) more++;
		}
		expect(more).toBeGreaterThanOrEqual(4);
	});
});

describe("card reward upgrades", () => {
	it("chance by act, halved at A12", () => {
		const at = (act: number, ascension: number) =>
			cardUpgradedChance({ ...base(), act, ascension });
		expect([at(1, 0), at(2, 0), at(3, 0), at(4, 0)]).toEqual([0, 0.25, 0.5, 0.5]);
		expect([at(1, 12), at(2, 12), at(3, 12)]).toEqual([0, 0.125, 0.25]);
	});

	it("Act 3: some non-rare cards come upgraded, rares never; Act 1 never", () => {
		let upgraded = 0;
		for (let i = 0; i < 30; i++) {
			const s = {
				...base(),
				act: 3,
				rng: { ...base().rng, cardRng: createRun(BigInt(i), "IRONCLAD").rng.cardRng },
			};
			const r = generateCardReward(s);
			r.cards.forEach((id, j) => {
				if (r.upgraded[j]) {
					upgraded++;
					expect(getCard(id)?.rarity).not.toBe("rare");
				}
			});
			expect(generateCardReward({ ...s, act: 1 }).upgraded.every((u) => !u)).toBe(true);
		}
		expect(upgraded).toBeGreaterThan(10);
	});

	it("an upgraded reward card goes into the deck upgraded", () => {
		const s: GameState = {
			...base(),
			phase: {
				type: "reward",
				cardRewards: ["ANGER" as never],
				cardRewardsUpgraded: [true],
				potionReward: null,
				gold: 0,
			},
		};
		const after = run(s, { type: "chooseCardReward", index: 0 });
		expect(after.deck.find((c) => c.id === "ANGER")?.upgraded).toBe(true);
	});
});

describe("gold and prices", () => {
	it("A13: bosses drop 75 gold", () => {
		const boss = (ascension: number) => {
			const s: GameState = {
				...base(["boss"]),
				ascension,
				encounterLists: { weak: [], strong: [], elites: [], boss: "CULTIST" },
			};
			const won = winFight(s, 0);
			return won.phase.type === "reward" ? won.phase.gold : -1;
		};
		expect(boss(0)).toBe(100);
		expect(boss(13)).toBe(75);
	});

	it("A16: shop prices ×1.1 (rounded), card removal unchanged", () => {
		const a0 = generateShop(base()).shop;
		const a16 = generateShop({ ...base(), ascension: 16 }).shop;
		a0.cards.forEach((c, i) => {
			expect(a16.cards[i]?.price).toBe(Math.floor(c.price * 1.1 + 0.5));
		});
		expect(a16.relics[0]?.price).toBe(Math.floor((a0.relics[0]?.price ?? 0) * 1.1 + 0.5));
		expect(a16.purgePrice).toBe(a0.purgePrice);
	});
});

describe("A20 double boss", () => {
	it("Act 3 gets a second, different boss on a row above the first", () => {
		const act3 = startNextAct({ ...base(), act: 2, ascension: 20 });
		expect(act3.encounterLists.boss2).toBeDefined();
		expect(act3.encounterLists.boss2).not.toBe(act3.encounterLists.boss);
		expect(act3.map.nodes).toHaveLength(17);
		expect(act3.map.nodes[15]?.[3]?.edges).toEqual([{ x: 3, y: 16 }]);
		const below = startNextAct({ ...base(), act: 2, ascension: 19 });
		expect(below.encounterLists.boss2).toBeUndefined();
		expect(below.map.nodes).toHaveLength(16);
	});

	it("first boss → rewards → map → second boss → boss relic", () => {
		const act3 = startNextAct({ ...base(), act: 2, ascension: 20 });
		const from = act3.map.nodes[14]?.find((n) => n.edges.some((e) => e.y === 15));
		if (!from) throw new Error("no path to the boss");
		let s: GameState = {
			...act3,
			encounterLists: { ...act3.encounterLists, boss: "CULTIST", boss2: "JAW_WORM" },
			map: { ...act3.map, currentNode: { x: from.x, y: 14 }, visitedNodes: [{ x: from.x, y: 14 }] },
		};
		s = winFight(s, 15, 3);
		expect(s.phase.type).toBe("reward");
		s = run(s, { type: "proceed" });
		expect(s.phase.type).toBe("map");
		const second = enter(s, 16, 3);
		expect(second.combat?.monsters[0]?.id).toBe("JAW_WORM");
		s = winFight(s, 16, 3);
		s = run(s, { type: "proceed" });
		expect(s.phase.type).toBe("bossReward");
	});
});
