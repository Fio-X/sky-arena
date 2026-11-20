/**
 * Act transition (GameContext::transitionToAct in sts_lightspeed).
 *
 * After the boss relic is chosen: the boss treasure room counts as a floor,
 * cardRng's counter jumps to the next 250 boundary, a new map and encounter
 * lists are generated, and the player heals (full, or 75% of missing HP at A5+).
 */
import { ACT_ENCOUNTER_POOLS, generateEncounterLists } from "../combat/encounters";
import { generateAct4Map, generateMap } from "../map/generate";
import { random, randomBoolean } from "../rng/stsRandom";
import { hasAllKeys, hasKey } from "./keys";
import type { GameState, MapNode, MapState, RngState } from "./types";

/** Acts 2–3 are playable once their encounter pool exists; Act 4 needs all three keys. */
export function hasNextAct(state: GameState): boolean {
	if (state.act + 1 === 4) return hasAllKeys(state);
	return ACT_ENCOUNTER_POOLS[state.act + 1] !== undefined;
}

/** TheEnding: fixed rooms, no encounter rolls. */
const ACT4_LISTS: GameState["encounterLists"] = {
	weak: [],
	strong: [],
	elites: ["SHIELD_AND_SPEAR"],
	boss: "CORRUPT_HEART",
};

function nextActEncounters(state: GameState, act: number) {
	if (act === 4) return { lists: ACT4_LISTS, rng: state.rng.monsterRng };
	return generateEncounterLists(state.rng.monsterRng, act);
}

export function startNextAct(state: GameState): GameState {
	const act = state.act + 1;
	let encounters = nextActEncounters(state, act);
	let map =
		act === 4
			? generateAct4Map()
			: generateMap(state.seed, act, state.ascension, !hasKey(state, "emerald"));
	if (act === 3 && state.ascension >= 20) {
		encounters = withSecondBoss(encounters);
		map = withSecondBossNode(map);
	}
	const missing = state.maxHp - state.currentHp;
	const heal = state.ascension >= 5 ? Math.round(missing * 0.75) : missing;

	return {
		...state,
		act,
		floor: state.floor + 1, // boss treasure room
		currentHp: state.currentHp + heal,
		map,
		combat: null,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: encounters.lists,
		rng: {
			...state.rng,
			monsterRng: encounters.rng,
			cardRng: advanceToNextCardBoundary(state.rng.cardRng),
		},
		phase: { type: "map" },
	};
}

/** A20: a second, different Act 3 boss (monsterRng, after the first). */
function withSecondBoss(e: { lists: GameState["encounterLists"]; rng: RngState }) {
	const others = ACT_ENCOUNTER_POOLS[3]?.bosses.filter((b) => b !== e.lists.boss) ?? [];
	if (others.length === 0) return e;
	const r = random(e.rng, others.length - 1);
	return { lists: { ...e.lists, boss2: others[r.value] }, rng: r.state };
}

/** The second boss sits one row above the first, linked from it. */
function withSecondBossNode(map: MapState): MapState {
	const y = map.nodes.length;
	const row: MapNode[] = Array.from({ length: 7 }, (_, x) => ({ x, y, type: "boss", edges: [] }));
	const nodes = map.nodes.map((r) =>
		r.map((n) =>
			n.type === "boss" && n.x === 3 && n.y === y - 1 ? { ...n, edges: [{ x: 3, y }] } : n,
		),
	);
	return { ...map, nodes: [...nodes, row] };
}

/** Random.setCounter(250 / 500 / 750): calls randomBoolean until the counter is reached. */
function advanceToNextCardBoundary(rng: RngState): RngState {
	const target = [250, 500, 750].find((b) => rng.counter < b);
	let r = rng;
	while (target !== undefined && r.counter < target) r = randomBoolean(r).state;
	return r;
}
