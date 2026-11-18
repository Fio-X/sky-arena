import type { MonsterId, RngState } from "../core/types";
import { random, randomFloat } from "../rng/stsRandom";

type EncounterId = string;

const ENCOUNTER_MONSTERS: Record<EncounterId, MonsterId[]> = {
	CULTIST: ["CULTIST" as MonsterId],
	JAW_WORM: ["JAW_WORM" as MonsterId],
	TWO_LOUSE: ["RED_LOUSE" as MonsterId, "GREEN_LOUSE" as MonsterId],
	SMALL_SLIMES: ["SPIKE_SLIME_M" as MonsterId, "ACID_SLIME_M" as MonsterId],
	// Strong encounters
	GREMLIN_GANG: [
		"MAD_GREMLIN" as MonsterId,
		"SNEAKY_GREMLIN" as MonsterId,
		"FAT_GREMLIN" as MonsterId,
		"SHIELD_GREMLIN" as MonsterId,
	],
	LOTS_OF_SLIMES: [
		"SPIKE_SLIME_S" as MonsterId,
		"ACID_SLIME_S" as MonsterId,
		"SPIKE_SLIME_M" as MonsterId,
		"ACID_SLIME_S" as MonsterId,
		"SPIKE_SLIME_S" as MonsterId,
	],
	RED_SLAVER: ["RED_SLAVER" as MonsterId],
	EXORDIUM_THUGS: ["LOOTER" as MonsterId, "CULTIST" as MonsterId],
	EXORDIUM_WILDLIFE: ["FUNGI_BEAST" as MonsterId, "JAW_WORM" as MonsterId],
	BLUE_SLAVER: ["BLUE_SLAVER" as MonsterId],
	LOOTER: ["LOOTER" as MonsterId],
	LARGE_SLIME: ["ACID_SLIME_L" as MonsterId],
	THREE_LOUSE: ["RED_LOUSE" as MonsterId, "RED_LOUSE" as MonsterId, "GREEN_LOUSE" as MonsterId],
	TWO_FUNGI_BEASTS: ["FUNGI_BEAST" as MonsterId, "FUNGI_BEAST" as MonsterId],
	// Elites
	GREMLIN_NOB: ["GREMLIN_NOB" as MonsterId],
	LAGAVULIN: ["LAGAVULIN" as MonsterId],
	SENTRY: ["SENTRY" as MonsterId, "SENTRY" as MonsterId, "SENTRY" as MonsterId],
	// Bosses
	SLIME_BOSS: ["SLIME_BOSS" as MonsterId],
	THE_GUARDIAN: ["THE_GUARDIAN" as MonsterId],
	HEXAGHOST: ["HEXAGHOST" as MonsterId],
};

export function getEncounterMonsters(encounterId: string): MonsterId[] {
	return ENCOUNTER_MONSTERS[encounterId] ?? [];
}

interface WeightedEncounter {
	id: string;
	weight: number;
}

const ACT1_WEAK: WeightedEncounter[] = [
	{ id: "CULTIST", weight: 1 / 4 },
	{ id: "JAW_WORM", weight: 1 / 4 },
	{ id: "TWO_LOUSE", weight: 1 / 4 },
	{ id: "SMALL_SLIMES", weight: 1 / 4 },
];

const ACT1_STRONG: WeightedEncounter[] = [
	{ id: "GREMLIN_GANG", weight: 2 / 32 },
	{ id: "LOTS_OF_SLIMES", weight: 2 / 32 },
	{ id: "RED_SLAVER", weight: 2 / 32 },
	{ id: "EXORDIUM_THUGS", weight: 3 / 32 },
	{ id: "EXORDIUM_WILDLIFE", weight: 3 / 32 },
	{ id: "BLUE_SLAVER", weight: 2 / 32 },
	{ id: "LOOTER", weight: 2 / 32 },
	{ id: "LARGE_SLIME", weight: 2 / 32 },
	{ id: "THREE_LOUSE", weight: 2 / 32 },
	{ id: "TWO_FUNGI_BEASTS", weight: 2 / 32 },
];

const ACT1_ELITES = ["GREMLIN_NOB", "LAGAVULIN", "SENTRY"];
const ACT1_BOSSES = ["THE_GUARDIAN", "SLIME_BOSS", "HEXAGHOST"];

export interface EncounterLists {
	weak: string[];
	strong: string[];
	elites: string[];
	boss: string;
}

export function generateEncounterLists(rng: RngState): { lists: EncounterLists; rng: RngState } {
	let r = rng;

	// Generate 3 weak encounters
	const weak: string[] = [];
	for (let i = 0; i < 3; i++) {
		const result = rollWeightedAvoidRepeat(r, ACT1_WEAK, weak);
		weak.push(result.id);
		r = result.rng;
	}

	// Generate first strong (avoid slime/louse overlap with last weak)
	let firstStrong = rollWeighted(r, ACT1_STRONG);
	r = firstStrong.rng;
	const lastWeak = weak[weak.length - 1] ?? "";
	if (shouldRerollFirstStrong(firstStrong.id, lastWeak)) {
		firstStrong = rollWeighted(r, ACT1_STRONG);
		r = firstStrong.rng;
	}

	// Generate 12 more strong encounters
	const strong: string[] = [firstStrong.id];
	for (let i = 0; i < 12; i++) {
		const result = rollWeightedAvoidRepeat(r, ACT1_STRONG, strong);
		strong.push(result.id);
		r = result.rng;
	}

	// Generate 10 elite encounters (equal chance, no consecutive repeats)
	const elites: string[] = [];
	for (let i = 0; i < 10; i++) {
		const result = rollElite(r, ACT1_ELITES, elites);
		elites.push(result.id);
		r = result.rng;
	}

	// Boss selection: shuffle indices
	const bossResult = rollBoss(r, ACT1_BOSSES);
	r = bossResult.rng;

	return {
		lists: { weak, strong, elites, boss: bossResult.id },
		rng: r,
	};
}

function rollWeighted(rng: RngState, pool: WeightedEncounter[]): { id: string; rng: RngState } {
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
	pool: WeightedEncounter[],
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

function shouldRerollFirstStrong(strongId: string, lastWeakId: string): boolean {
	if (
		lastWeakId === "SMALL_SLIMES" &&
		(strongId === "LARGE_SLIME" || strongId === "LOTS_OF_SLIMES")
	) {
		return true;
	}
	if (lastWeakId === "TWO_LOUSE" && strongId === "THREE_LOUSE") return true;
	return false;
}

function rollElite(
	rng: RngState,
	pool: string[],
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

function rollBoss(rng: RngState, pool: string[]): { id: string; rng: RngState } {
	const result = random(rng, pool.length - 1);
	return { id: pool[result.value] ?? pool[0] ?? "", rng: result.state };
}
