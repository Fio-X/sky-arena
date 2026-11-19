/**
 * Monster AI registry — maps monster IDs to their AI functions.
 *
 * Each AI function takes the game state, the monster's index,
 * and the per-floor aiRng, and returns the move ID the monster will use.
 *
 * This is where the natural-language pseudocode from data-reference/
 * gets translated into executable logic, one monster at a time.
 */

import type { GameState, MonsterMoveId, RngState } from "../core/types";

export interface MonsterAiContext {
	readonly state: GameState;
	readonly monsterIndex: number;
	readonly aiRng: RngState;
}

export interface MonsterAiResult {
	readonly moveId: MonsterMoveId;
	readonly aiRng: RngState;
	/** New miscInfo for AIs that update state at selection time (Champ phase, Book stab count). */
	readonly miscInfo?: number;
}

export type MonsterAiFn = (ctx: MonsterAiContext) => MonsterAiResult;

const registry = new Map<string, MonsterAiFn>();

export function registerMonsterAi(monsterId: string, ai: MonsterAiFn): void {
	registry.set(monsterId, ai);
}

export function getMonsterAi(monsterId: string): MonsterAiFn | undefined {
	return registry.get(monsterId);
}

export function hasMonsterAi(monsterId: string): boolean {
	return registry.has(monsterId);
}
