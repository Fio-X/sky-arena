import { getAllRelics } from "../content/loader";
import { random } from "../rng/stsRandom";
import type { GameEvent, GamePhase, GameState, RelicId, StepResult } from "./types";

export function rollGoldReward(state: GameState): { gold: number; rng: typeof state.rng.miscRng } {
	const node = state.map.currentNode;
	const roomType = node ? state.map.nodes[node.y]?.[node.x]?.type : "monster";

	if (roomType === "boss") return { gold: 100, rng: state.rng.miscRng };
	let min: number;
	let max: number;
	if (roomType === "elite") {
		min = 25;
		max = 35;
	} else {
		min = 10;
		max = 20;
	}
	const result = random(state.rng.miscRng, max - min);
	return { gold: min + result.value, rng: result.state };
}

export function getCurrentRoomType(state: GameState): string {
	const node = state.map.currentNode;
	return node ? (state.map.nodes[node.y]?.[node.x]?.type ?? "monster") : "monster";
}

export function afterRewardPhase(state: GameState): GamePhase {
	if (getCurrentRoomType(state) === "boss") {
		const choices = generateBossRelicChoices(state);
		return { type: "bossReward", relics: choices.relics };
	}
	return { type: "map" };
}

function generateBossRelicChoices(state: GameState): { relics: RelicId[] } {
	const owned = new Set(state.relics.map((r) => r.id as string));
	const pool = getAllRelics().filter(
		(r) => r.tier === "boss" && !r.unobtainable && !owned.has(r.id as string),
	);

	const relics: RelicId[] = [];
	const used = new Set<string>();
	let rng = state.rng.relicRng;

	for (let i = 0; i < 3 && pool.length > used.size; i++) {
		const available = pool.filter((r) => !used.has(r.id as string));
		if (available.length === 0) break;
		const r = random(rng, available.length - 1);
		rng = r.state;
		const relic = available[r.value];
		if (relic) {
			relics.push(relic.id);
			used.add(relic.id as string);
		}
	}

	return { relics };
}

export function stepChooseBossRelic(
	state: GameState,
	index: number,
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "bossReward") return { state, events };
	const relicId = state.phase.relics[index];
	if (!relicId) return { state, events };

	return {
		state: {
			...state,
			relics: [...state.relics, { id: relicId, counter: 0 }],
			phase: { type: "gameOver", victory: true },
		},
		events,
	};
}
