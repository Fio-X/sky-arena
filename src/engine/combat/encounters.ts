import type { MonsterId, RngState } from "../core/types";
import { random, randomFloat } from "../rng/stsRandom";

/**
 * One position in an encounter layout. The array index is the monster's slot
 * (which also fixes turn order). "EMPTY" reserves a slot for a later summon.
 * Random slots are resolved at combat start with miscRng, in slot order:
 * - "RANDOM_GREMLIN": getGremlin (8-entry pool, with replacement)
 * - "SHAPE_POOL": createShapes — draws WITHOUT replacement from one 6-shape pool
 *   shared by every SHAPE_POOL slot of the encounter
 * - "RANDOM_SHAPE": getAncientShape — uniform over 3 shapes, with replacement
 */
export type EncounterSlot = MonsterId | "EMPTY" | "RANDOM_GREMLIN" | "SHAPE_POOL" | "RANDOM_SHAPE";

const L = (...ids: string[]): EncounterSlot[] => ids as EncounterSlot[];

const ENCOUNTER_MONSTERS: Record<string, EncounterSlot[]> = {
	// ── Act 1 ──
	CULTIST: L("CULTIST"),
	JAW_WORM: L("JAW_WORM"),
	TWO_LOUSE: L("RED_LOUSE", "GREEN_LOUSE"),
	SMALL_SLIMES: L("SPIKE_SLIME_M", "ACID_SLIME_M"),
	GREMLIN_GANG: L("MAD_GREMLIN", "SNEAKY_GREMLIN", "FAT_GREMLIN", "SHIELD_GREMLIN"),
	LOTS_OF_SLIMES: L(
		"SPIKE_SLIME_S",
		"ACID_SLIME_S",
		"SPIKE_SLIME_M",
		"ACID_SLIME_S",
		"SPIKE_SLIME_S",
	),
	RED_SLAVER: L("RED_SLAVER"),
	EXORDIUM_THUGS: L("LOOTER", "CULTIST"),
	EXORDIUM_WILDLIFE: L("FUNGI_BEAST", "JAW_WORM"),
	BLUE_SLAVER: L("BLUE_SLAVER"),
	LOOTER: L("LOOTER"),
	LARGE_SLIME: L("ACID_SLIME_L"),
	THREE_LOUSE: L("RED_LOUSE", "RED_LOUSE", "GREEN_LOUSE"),
	TWO_FUNGI_BEASTS: L("FUNGI_BEAST", "FUNGI_BEAST"),
	GREMLIN_NOB: L("GREMLIN_NOB"),
	LAGAVULIN: L("LAGAVULIN"),
	SENTRY: L("SENTRY", "SENTRY", "SENTRY"),
	SLIME_BOSS: L("SLIME_BOSS"),
	THE_GUARDIAN: L("THE_GUARDIAN"),
	HEXAGHOST: L("HEXAGHOST"),
	// ── Act 2 (slot orders per MonsterGroup.cpp / spire-engine) ──
	SPHERIC_GUARDIAN: L("SPHERIC_GUARDIAN"),
	CHOSEN: L("CHOSEN"),
	SHELL_PARASITE: L("SHELLED_PARASITE"),
	THREE_BYRDS: L("BYRD", "BYRD", "BYRD"),
	TWO_THIEVES: L("LOOTER", "MUGGER"),
	CHOSEN_AND_BYRDS: L("BYRD", "CHOSEN"),
	SENTRY_AND_SPHERE: L("SENTRY", "SPHERIC_GUARDIAN"),
	CULTIST_AND_CHOSEN: L("CULTIST", "CHOSEN"),
	THREE_CULTIST: L("CULTIST", "CULTIST", "CULTIST"),
	SHELLED_PARASITE_AND_FUNGI: L("SHELLED_PARASITE", "FUNGI_BEAST"),
	SNECKO: L("SNECKO"),
	SNAKE_PLANT: L("SNAKE_PLANT"),
	CENTURION_AND_HEALER: L("CENTURION", "MYSTIC"),
	GREMLIN_LEADER: L("EMPTY", "RANDOM_GREMLIN", "RANDOM_GREMLIN", "GREMLIN_LEADER"),
	SLAVERS: L("BLUE_SLAVER", "TASKMASTER", "RED_SLAVER"),
	BOOK_OF_STABBING: L("BOOK_OF_STABBING"),
	AUTOMATON: L("EMPTY", "BRONZE_AUTOMATON", "EMPTY"),
	COLLECTOR: L("EMPTY", "EMPTY", "THE_COLLECTOR"),
	CHAMP: L("THE_CHAMP"),
	MASKED_BANDITS_EVENT: L("POINTY", "ROMEO", "BEAR"),
	// ── Act 3 (MonsterGroup.cpp; layouts in data-reference/monsters-act34.json) ──
	THREE_DARKLINGS: L("DARKLING", "DARKLING", "DARKLING"),
	ORB_WALKER: L("ORB_WALKER"),
	THREE_SHAPES: L("SHAPE_POOL", "SHAPE_POOL", "SHAPE_POOL"),
	SPIRE_GROWTH: L("SPIRE_GROWTH"),
	TRANSIENT: L("TRANSIENT"),
	FOUR_SHAPES: L("SHAPE_POOL", "SHAPE_POOL", "SHAPE_POOL", "SHAPE_POOL"),
	MAW: L("THE_MAW"),
	SPHERE_AND_TWO_SHAPES: L("RANDOM_SHAPE", "RANDOM_SHAPE", "SPHERIC_GUARDIAN"),
	JAW_WORM_HORDE: L("JAW_WORM", "JAW_WORM", "JAW_WORM"), // buffs: encounterSetup.ts
	WRITHING_MASS: L("WRITHING_MASS"),
	GIANT_HEAD: L("GIANT_HEAD"),
	NEMESIS: L("NEMESIS"),
	REPTOMANCER: L("EMPTY", "DAGGER", "REPTOMANCER", "EMPTY", "DAGGER"),
	AWAKENED_ONE: L("CULTIST", "CULTIST", "AWAKENED_ONE"),
	TIME_EATER: L("TIME_EATER"),
	DONU_AND_DECA: L("DECA", "DONU"),
	MYSTERIOUS_SPHERE_EVENT: L("ORB_WALKER", "ORB_WALKER"),
};

export function getEncounterMonsters(encounterId: string): EncounterSlot[] {
	return ENCOUNTER_MONSTERS[encounterId] ?? [];
}

export interface WeightedEncounter {
	readonly id: string;
	readonly weight: number;
}

export interface ActEncounterPool {
	readonly weak: readonly WeightedEncounter[];
	readonly weakCount: number;
	/** Already in normalizeWeights order (ascending weight, stable). */
	readonly strong: readonly WeightedEncounter[];
	readonly elites: readonly string[];
	readonly bosses: readonly string[];
	/** generateExclusions: last weak encounter → strong encounters the first strong may not be. */
	readonly firstStrongExclusions: Readonly<Record<string, readonly string[]>>;
}

const even = (...ids: string[]): WeightedEncounter[] =>
	ids.map((id) => ({ id, weight: 1 / ids.length }));
const weighted = (total: number, entries: [string, number][]): WeightedEncounter[] =>
	entries.map(([id, w]) => ({ id, weight: w / total }));

export const ACT_ENCOUNTER_POOLS: Readonly<Record<number, ActEncounterPool>> = {
	1: {
		weak: even("CULTIST", "JAW_WORM", "TWO_LOUSE", "SMALL_SLIMES"),
		weakCount: 3,
		strong: weighted(32, [
			["GREMLIN_GANG", 2],
			["LOTS_OF_SLIMES", 2],
			["RED_SLAVER", 2],
			["EXORDIUM_THUGS", 3],
			["EXORDIUM_WILDLIFE", 3],
			["BLUE_SLAVER", 4],
			["LOOTER", 4],
			["LARGE_SLIME", 4],
			["THREE_LOUSE", 4],
			["TWO_FUNGI_BEASTS", 4],
		]),
		elites: ["GREMLIN_NOB", "LAGAVULIN", "SENTRY"],
		bosses: ["THE_GUARDIAN", "SLIME_BOSS", "HEXAGHOST"],
		firstStrongExclusions: {
			SMALL_SLIMES: ["LARGE_SLIME", "LOTS_OF_SLIMES"],
			TWO_LOUSE: ["THREE_LOUSE"],
		},
	},
	2: {
		weak: even("SPHERIC_GUARDIAN", "CHOSEN", "SHELL_PARASITE", "THREE_BYRDS", "TWO_THIEVES"),
		weakCount: 2,
		strong: weighted(29, [
			["CHOSEN_AND_BYRDS", 2],
			["SENTRY_AND_SPHERE", 2],
			["CULTIST_AND_CHOSEN", 3],
			["THREE_CULTIST", 3],
			["SHELLED_PARASITE_AND_FUNGI", 3],
			["SNECKO", 4],
			["SNAKE_PLANT", 6],
			["CENTURION_AND_HEALER", 6],
		]),
		elites: ["GREMLIN_LEADER", "SLAVERS", "BOOK_OF_STABBING"],
		bosses: ["AUTOMATON", "COLLECTOR", "CHAMP"],
		firstStrongExclusions: {
			SPHERIC_GUARDIAN: ["SENTRY_AND_SPHERE"],
			THREE_BYRDS: ["CHOSEN_AND_BYRDS"],
			CHOSEN: ["CHOSEN_AND_BYRDS", "CULTIST_AND_CHOSEN"],
		},
	},
};

/**
 * Act 3 (TheBeyond). Weights from MonsterEncounters.h; exclusions from
 * TheBeyond.generateExclusions (via spire-engine acts.rs). Joins
 * ACT_ENCOUNTER_POOLS (key 3) once every Act 3 monster has an AI; until then
 * the run ends after the Act 2 boss.
 */
export const ACT3_ENCOUNTER_POOL: ActEncounterPool = {
	weak: even("THREE_DARKLINGS", "ORB_WALKER", "THREE_SHAPES"),
	weakCount: 2,
	strong: even(
		"SPIRE_GROWTH",
		"TRANSIENT",
		"FOUR_SHAPES",
		"MAW",
		"SPHERE_AND_TWO_SHAPES",
		"JAW_WORM_HORDE",
		"THREE_DARKLINGS",
		"WRITHING_MASS",
	),
	elites: ["GIANT_HEAD", "NEMESIS", "REPTOMANCER"],
	bosses: ["AWAKENED_ONE", "TIME_EATER", "DONU_AND_DECA"],
	firstStrongExclusions: {
		THREE_DARKLINGS: ["THREE_DARKLINGS"],
		ORB_WALKER: ["ORB_WALKER"],
		THREE_SHAPES: ["FOUR_SHAPES"],
	},
};

export interface EncounterLists {
	weak: string[];
	strong: string[];
	elites: string[];
	boss: string;
}

/**
 * Weak and strong encounters share one history in the game (populateMonsterList
 * appends to a single monsterList), so the no-repeat rule spans the boundary.
 */
export function generateEncounterLists(
	rng: RngState,
	act = 1,
): { lists: EncounterLists; rng: RngState } {
	const pool = ACT_ENCOUNTER_POOLS[act] ?? ACT_ENCOUNTER_POOLS[1];
	if (!pool) throw new Error(`no encounter pool for act ${act}`);
	let r = rng;
	const history: string[] = [];

	for (let i = 0; i < pool.weakCount; i++) {
		const result = rollWeightedAvoidRepeat(r, pool.weak, history);
		history.push(result.id);
		r = result.rng;
	}
	const weak = [...history];

	const excluded = pool.firstStrongExclusions[weak[weak.length - 1] ?? ""] ?? [];
	let first = rollWeighted(r, pool.strong);
	r = first.rng;
	for (let attempts = 0; excluded.includes(first.id) && attempts < 100; attempts++) {
		first = rollWeighted(r, pool.strong);
		r = first.rng;
	}
	history.push(first.id);

	for (let i = 0; i < 12; i++) {
		const result = rollWeightedAvoidRepeat(r, pool.strong, history);
		history.push(result.id);
		r = result.rng;
	}
	const strong = history.slice(weak.length);

	const elites: string[] = [];
	for (let i = 0; i < 10; i++) {
		const result = rollElite(r, pool.elites, elites);
		elites.push(result.id);
		r = result.rng;
	}

	const bossResult = rollBoss(r, pool.bosses);
	r = bossResult.rng;

	return { lists: { weak, strong, elites, boss: bossResult.id }, rng: r };
}

function rollWeighted(
	rng: RngState,
	pool: readonly WeightedEncounter[],
): { id: string; rng: RngState } {
	const result = randomFloat(rng);
	const roll = result.value;
	let cumulative = 0;
	for (const entry of pool) {
		cumulative += entry.weight;
		if (roll < cumulative) return { id: entry.id, rng: result.state };
	}
	return { id: pool[pool.length - 1]?.id ?? "", rng: result.state };
}

function rollWeightedAvoidRepeat(
	rng: RngState,
	pool: readonly WeightedEncounter[],
	history: string[],
): { id: string; rng: RngState } {
	const last = history[history.length - 1];
	const secondLast = history[history.length - 2];
	let result = rollWeighted(rng, pool);
	let attempts = 0;
	while ((result.id === last || result.id === secondLast) && attempts < 20) {
		result = rollWeighted(result.rng, pool);
		attempts++;
	}
	return result;
}

function rollElite(
	rng: RngState,
	pool: readonly string[],
	history: string[],
): { id: string; rng: RngState } {
	const last = history[history.length - 1];
	let result = random(rng, pool.length - 1);
	let id = pool[result.value] ?? pool[0] ?? "";
	let r = result.state;
	let attempts = 0;
	while (id === last && attempts < 20) {
		result = random(r, pool.length - 1);
		id = pool[result.value] ?? pool[0] ?? "";
		r = result.state;
		attempts++;
	}
	return { id, rng: r };
}

function rollBoss(rng: RngState, pool: readonly string[]): { id: string; rng: RngState } {
	const result = random(rng, pool.length - 1);
	return { id: pool[result.value] ?? pool[0] ?? "", rng: result.state };
}
