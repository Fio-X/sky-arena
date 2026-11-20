/**
 * Per-encounter adjustments made after the monsters are built and before their
 * first intents are rolled (MonsterGroup.cpp createMonsters special cases).
 */
import { canonicalPowerId } from "../core/hooks";
import type { GameState, MonsterMoveId, MonsterState } from "../core/types";

type EncounterSetup = (state: GameState) => GameState;

function mapMonsters(state: GameState, fn: (m: MonsterState) => MonsterState): GameState {
	const combat = state.combat;
	if (!combat) return state;
	return { ...state, combat: { ...combat, monsters: combat.monsters.map(fn) } };
}

const SETUPS: Record<string, EncounterSetup> = {
	/**
	 * Act 3 hard-pool Jaw Worms: Strength 3/4/5 and Block 5/6/9 (base/A2/A17), and
	 * moveHistory pre-filled with a sentinel so the "Chomp on turn 1" rule is skipped.
	 */
	JAW_WORM_HORDE: (state) => {
		const asc = state.ascension;
		const strength = asc >= 17 ? 5 : asc >= 2 ? 4 : 3;
		const block = asc >= 17 ? 9 : asc >= 2 ? 6 : 5;
		return mapMonsters(state, (m) =>
			m.alive
				? {
						...m,
						block: m.block + block,
						powers: [
							...m.powers,
							{ id: canonicalPowerId("STRENGTH"), amount: strength, justApplied: false },
						],
						moveHistory: ["HORDE_SENTINEL" as MonsterMoveId],
					}
				: m,
		);
	},
};

/** Content files add setups for their own encounters (Act 4: Surrounded). */
export function registerEncounterSetup(encounterId: string, setup: EncounterSetup): void {
	SETUPS[encounterId] = setup;
}

export function applyEncounterSetup(state: GameState, encounterId: string): GameState {
	const setup = SETUPS[encounterId];
	return setup ? setup(state) : state;
}
