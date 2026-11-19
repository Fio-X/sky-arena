import { describe, expect, it } from "vitest";
import { ACT_ENCOUNTER_POOLS } from "./encounters";

// Exordium.generateStrongEnemies after MonsterInfo.normalizeWeights (ascending, stable);
// same values in sts_lightspeed MonsterEncounters.h and spire-engine acts.rs.
const ACT1_STRONG_x16: [string, number][] = [
	["GREMLIN_GANG", 1],
	["LOTS_OF_SLIMES", 1],
	["RED_SLAVER", 1],
	["EXORDIUM_THUGS", 1.5],
	["EXORDIUM_WILDLIFE", 1.5],
	["BLUE_SLAVER", 2],
	["LOOTER", 2],
	["LARGE_SLIME", 2],
	["THREE_LOUSE", 2],
	["TWO_FUNGI_BEASTS", 2],
];

describe("encounter pools", () => {
	it("Act 1 strong weights match the game and sum to 1", () => {
		const strong = ACT_ENCOUNTER_POOLS[1]?.strong ?? [];
		expect(strong.map((w) => [w.id, w.weight * 16])).toEqual(ACT1_STRONG_x16);
	});

	it.each([1, 2])("Act %i weak and strong weights sum to 1", (act) => {
		const pool = ACT_ENCOUNTER_POOLS[act];
		const sum = (ws: readonly { weight: number }[] = []) => ws.reduce((a, w) => a + w.weight, 0);
		expect(sum(pool?.weak)).toBeCloseTo(1, 6);
		expect(sum(pool?.strong)).toBeCloseTo(1, 6);
	});
});
