/**
 * One place that decides what happens when a monster's HP reaches 0.
 *
 * halfDead (original AbstractMonster.halfDead): the monster is at 0 HP and
 * cannot be targeted or damaged (alive = false), but it still takes its turns
 * and the fight is not won while it is halfDead. Darkling (Regrow) and the
 * Awakened One (rebirth) use it. A move that revives sets alive = true and
 * halfDead = false.
 *
 * Interceptors are registered per monster id by content files. Returning null
 * lets the monster die normally.
 */
import { fireHook } from "../core/hooks";
import type { GameEvent, GameState } from "../core/types";

export type DeathInterceptor = (state: GameState, monsterIndex: number) => GameState | null;

const interceptors = new Map<string, DeathInterceptor>();

export function registerDeathInterceptor(monsterId: string, fn: DeathInterceptor): void {
	interceptors.set(monsterId, fn);
}

/**
 * Call exactly once, right after damage or HP loss took a living monster to
 * 0 HP (applyDamage has already set alive = false). Callers must check the
 * monster was alive before the hit: an already-dead monster would fire its
 * death again. Runs the monster's interceptor; if it does not take over,
 * fires onMonsterDeath on the dying monster, then on the player, and records
 * the death.
 *
 * @param intercept false for deaths that bypass damage() in the original
 * (SuicideAction sets HP to 0 and calls die() directly).
 */
export function resolveMonsterDeath(
	state: GameState,
	monsterIndex: number,
	events: GameEvent[],
	intercept = true,
): GameState {
	const monster = state.combat?.monsters[monsterIndex];
	if (!monster || monster.alive || monster.halfDead) return state;

	const interceptor = intercept ? interceptors.get(monster.id) : undefined;
	const intercepted = interceptor?.(state, monsterIndex);
	if (intercepted) return intercepted;

	// The dying monster's powers first (Spore Cloud, Minion Leader…), then the
	// player's powers and relics (Gremlin Horn, The Specimen).
	const self = { type: "monster" as const, index: monsterIndex };
	let s = fireHook(state, self, "onMonsterDeath", monsterIndex);
	s = fireHook(s, { type: "player" }, "onMonsterDeath", monsterIndex);
	events.push({ type: "monsterDied", index: monsterIndex });
	return s;
}

/** Fight is over only when nobody is alive or halfDead. */
export function allMonstersGone(state: GameState): boolean {
	return (state.combat?.monsters ?? []).every((m) => !m.alive && !m.halfDead);
}

/** Takes turns this round: alive, or halfDead (Regrow / Rebirth countdown). */
export function takesTurns(m: { alive: boolean; halfDead: boolean } | undefined): boolean {
	return !!m && (m.alive || m.halfDead);
}
