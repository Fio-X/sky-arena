/** The three keys and the way into Act 4, through real step commands. */
import { beforeAll, describe, expect, it } from "vitest";
import {
	base,
	enter,
	linearMap,
	loadRunData,
	run,
	winFight,
} from "../content/relicsRunTestHelpers";
import { generateAct4Map, generateMap } from "../map/generate";
import { hasNextAct, startNextAct } from "./act";
import { hasAllKeys, hasKey } from "./keys";
import type { GameState, MapNode } from "./types";

beforeAll(loadRunData);

const allKeys = { ruby: true, emerald: true, sapphire: true };

function burningEliteMap(): GameState["map"] {
	const map = linearMap(["elite"]);
	const node = map.nodes[0]?.[0] as MapNode;
	return { ...map, nodes: [[{ ...node, emerald: true }]] };
}

describe("map", () => {
	it("one elite per act burns while the Emerald Key is missing; rooms are unchanged", () => {
		for (const seed of [1n, 42n, 777n]) {
			const withKey = generateMap(seed, 1, 0, true);
			const without = generateMap(seed, 1, 0, false);
			const burning = withKey.nodes.flat().filter((n) => n.emerald);
			expect(burning).toHaveLength(1);
			expect(burning[0]?.type).toBe("elite");
			expect(without.nodes.flat().some((n) => n.emerald)).toBe(false);
			expect(withKey.nodes.flat().map((n) => n.type)).toEqual(
				without.nodes.flat().map((n) => n.type),
			);
		}
	});

	it("Act 4: rest site → shop → elite → boss in one line", () => {
		const map = generateAct4Map();
		expect(map.nodes.map((row) => row[3]?.type)).toEqual(["rest", "shop", "elite", "boss"]);
		expect(map.nodes[0]?.[3]?.edges).toEqual([{ x: 3, y: 1 }]);
	});
});

describe("keys", () => {
	it("Ruby: Recall at a rest site, instead of resting; only once", () => {
		let s = run(enter(base(["rest", "rest"]), 0), { type: "restOption", option: "recall" });
		expect(hasKey(s, "ruby")).toBe(true);
		expect(s.currentHp).toBe(50);
		expect(s.phase.type).toBe("map");
		s = run(enter(s, 1), { type: "restOption", option: "recall" });
		expect(s.phase.type).toBe("rest");
	});

	it("Emerald: the burning elite is buffed and offers the key", () => {
		const plain = enter(base(["elite"]), 0);
		const burning = enter({ ...base(["elite"]), map: burningEliteMap() }, 0);
		const m0 = plain.combat?.monsters[0];
		const m1 = burning.combat?.monsters[0];
		const buffed =
			(m1?.maxHp ?? 0) > (m0?.maxHp ?? 0) || (m1?.powers.length ?? 0) > (m0?.powers.length ?? 0);
		expect(buffed).toBe(true);

		let s = winFight({ ...base(["elite"]), map: burningEliteMap() }, 0);
		expect(s.phase.type === "reward" && s.phase.emeraldKey).toBe(true);
		s = run(s, { type: "takeKey", key: "emerald" });
		expect(hasKey(s, "emerald")).toBe(true);
		expect(s.phase.type === "reward" && s.phase.emeraldKey).toBe(false);
	});

	it("Emerald: no key from a normal elite or once the key is owned", () => {
		const normal = winFight(base(["elite"]), 0);
		expect(normal.phase.type === "reward" && normal.phase.emeraldKey).toBe(false);
		const owned = winFight(
			{ ...base(["elite"]), map: burningEliteMap(), keys: { ...allKeys, emerald: true } },
			0,
		);
		expect(owned.phase.type === "reward" && owned.phase.emeraldKey).toBe(false);
	});

	it("Sapphire: the chest offers its relic or the key, not both", () => {
		const chest = enter(base(["treasure"]), 0);
		expect(chest.phase).toMatchObject({ type: "reward", sapphireKey: true });
		const relics = chest.relics.length;

		const key = run(chest, { type: "takeKey", key: "sapphire" });
		expect(hasKey(key, "sapphire")).toBe(true);
		expect(run(key, { type: "takeChestRelic" }).relics).toHaveLength(relics);

		const relic = run(chest, { type: "takeChestRelic" });
		expect(relic.relics).toHaveLength(relics + 1);
		expect(hasKey(run(relic, { type: "takeKey", key: "sapphire" }), "sapphire")).toBe(false);
	});

	it("Sapphire owned: chests give their relic directly", () => {
		const s = enter({ ...base(["treasure"]), keys: { ...allKeys } }, 0);
		expect(s.relics).toHaveLength(1);
		expect(s.phase.type === "reward" && s.phase.sapphireKey).toBeFalsy();
	});
});

describe("Act 4", () => {
	it("after Act 3 only with all three keys", () => {
		const act3: GameState = { ...base(), act: 3, floor: 50 };
		expect(hasNextAct(act3)).toBe(false);
		expect(hasNextAct({ ...act3, keys: { ...allKeys, ruby: false } })).toBe(false);
		const keyed = { ...act3, keys: allKeys };
		expect(hasAllKeys(keyed)).toBe(true);
		expect(hasNextAct(keyed)).toBe(true);
		const act4 = startNextAct(keyed);
		expect(act4.act).toBe(4);
		expect(act4.floor).toBe(51);
		expect(act4.encounterLists).toMatchObject({
			elites: ["SHIELD_AND_SPEAR"],
			boss: "CORRUPT_HEART",
		});
		expect(act4.rng.monsterRng).toEqual(keyed.rng.monsterRng);
		expect(act4.map.nodes.map((r) => r[3]?.type)).toEqual(["rest", "shop", "elite", "boss"]);
	});

	it("walk Act 4: rest site, shop, Shield and Spear, Corrupt Heart", () => {
		let s = startNextAct({ ...base(), act: 3, floor: 50, keys: allKeys });
		s = enter(s, 0, 3);
		expect(s.phase.type).toBe("rest");
		s = run(s, { type: "rest" });
		s = enter(s, 1, 3);
		expect(s.phase.type).toBe("shop");
		s = run(s, { type: "leaveShop" });
		const elite = enter(s, 2, 3);
		expect(elite.combat?.monsters.map((m) => m.id)).toEqual(["SPIRE_SHIELD", "SPIRE_SPEAR"]);
		const atBoss = { ...elite, combat: null, phase: { type: "map" as const } };
		const heart = enter(atBoss, 3, 3);
		expect(heart.combat?.monsters.map((m) => m.id)).toEqual(["CORRUPT_HEART"]);
		expect(heart.floor).toBe(55);
	});

	it("the Act 4 boss ends the run with victory, no rewards", () => {
		const s: GameState = {
			...base(["boss"]),
			act: 4,
			encounterLists: { weak: [], strong: [], elites: [], boss: "CULTIST" },
		};
		const won = winFight(s, 0);
		expect(won.phase).toEqual({ type: "gameOver", victory: true });
	});
});
