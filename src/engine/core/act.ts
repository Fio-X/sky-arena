/**
 * Act transition (GameContext::transitionToAct in sts_lightspeed).
 *
 * After the boss relic is chosen: the boss treasure room counts as a floor,
 * cardRng's counter jumps to the next 250 boundary, a new map and encounter
 * lists are generated, and the player heals (full, or 75% of missing HP at A5+).
 */
import { ACT_ENCOUNTER_POOLS, generateEncounterLists } from "../combat/encounters";
import { generateMap } from "../map/generate";
import { randomBoolean } from "../rng/stsRandom";
import type { GameState, RngState } from "./types";

/** An act is playable once its encounter pool exists. */
export function hasNextAct(state: GameState): boolean {
	return ACT_ENCOUNTER_POOLS[state.act + 1] !== undefined;
}

export function startNextAct(state: GameState): GameState {
	const act = state.act + 1;
	const encounters = generateEncounterLists(state.rng.monsterRng, act);
	const missing = state.maxHp - state.currentHp;
	const heal = state.ascension >= 5 ? Math.round(missing * 0.75) : missing;

	return {
		...state,
		act,
		floor: state.floor + 1, // boss treasure room
		currentHp: state.currentHp + heal,
		map: generateMap(state.seed, act, state.ascension),
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

/** Random.setCounter(250 / 500 / 750): calls randomBoolean until the counter is reached. */
function advanceToNextCardBoundary(rng: RngState): RngState {
	const target = [250, 500, 750].find((b) => rng.counter < b);
	let r = rng;
	while (target !== undefined && r.counter < target) r = randomBoolean(r).state;
	return r;
}
