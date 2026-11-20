/**
 * The three keys that open Act 4 (the final act is always available here).
 * - Ruby: rest site option Recall, instead of resting.
 * - Emerald: one burning elite per act (marked by generateMap), buffed at the
 *   start of the fight; beating it offers the key on the reward screen.
 * - Sapphire: a chest offers it in place of its relic (one or the other).
 */
import { random } from "../rng/stsRandom";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { canonicalPowerId } from "./hooks";
import { obtainRelic } from "./obtain";
import type { Action, GameEvent, GameState, KeyState, StepResult } from "./types";

export type KeyId = keyof KeyState;

const NO_KEYS: KeyState = { ruby: false, emerald: false, sapphire: false };

export function hasKey(state: GameState, key: KeyId): boolean {
	return state.keys?.[key] ?? false;
}

export function hasAllKeys(state: GameState): boolean {
	return hasKey(state, "ruby") && hasKey(state, "emerald") && hasKey(state, "sapphire");
}

export function obtainKey(state: GameState, key: KeyId): GameState {
	return { ...state, keys: { ...(state.keys ?? NO_KEYS), [key]: true } };
}

/** The current room is this act's burning elite and the Emerald Key is still missing. */
export function inEmeraldElite(state: GameState): boolean {
	const at = state.map.currentNode;
	const node = at ? state.map.nodes[at.y]?.[at.x] : undefined;
	return !!node?.emerald && node.type === "elite" && !hasKey(state, "emerald");
}

/**
 * MonsterRoomElite.applyEmeraldEliteBuff: mapRng.random(0, 3) picks one buff
 * for every monster — Strength act+1, +25% max HP (healed), Metallicize
 * act×2+2, or Regenerate 1+act×2.
 */
export function applyEmeraldEliteBuff(state: GameState, events: GameEvent[]): GameState {
	const c = state.combat;
	if (!c || !inEmeraldElite(state)) return state;
	const roll = random(state.rng.mapRng, 3);
	let s: GameState = { ...state, rng: { ...state.rng, mapRng: roll.state } };
	const act = state.act;
	if (roll.value === 1) {
		const monsters = c.monsters.map((m) => {
			if (!m.alive) return m;
			const extra = Math.floor(m.maxHp * 0.25);
			return { ...m, maxHp: m.maxHp + extra, currentHp: m.currentHp + extra };
		});
		return { ...s, combat: { ...c, monsters } };
	}
	const [powerId, amount] =
		roll.value === 0
			? ["STRENGTH", act + 1]
			: roll.value === 2
				? ["METALLICIZE", act * 2 + 2]
				: ["REGENERATE", 1 + act * 2];
	let combat = c;
	for (const m of c.monsters) {
		if (!m.alive) continue;
		const self = { type: "monster" as const, index: m.index };
		const action: Action = {
			type: "applyPower",
			source: self,
			target: self,
			powerId: canonicalPowerId(powerId),
			amount,
		};
		combat = addToBot(combat, action);
	}
	s = { ...s, combat };
	return drainActions(s, events).state;
}

// ── Reward screen ────────────────────────────────────────

export function stepTakeKey(
	state: GameState,
	key: "emerald" | "sapphire",
	events: GameEvent[],
): StepResult {
	const phase = state.phase;
	if (phase.type !== "reward") return { state, events };
	if (key === "emerald" && phase.emeraldKey) {
		const s = obtainKey(state, "emerald");
		return { state: { ...s, phase: { ...phase, emeraldKey: false } }, events };
	}
	if (key === "sapphire" && phase.sapphireKey) {
		const s = obtainKey(state, "sapphire");
		return {
			state: { ...s, phase: { ...phase, sapphireKey: false, chestRelic: undefined } },
			events,
		};
	}
	return { state, events };
}

export function stepTakeChestRelic(state: GameState, events: GameEvent[]): StepResult {
	const phase = state.phase;
	if (phase.type !== "reward" || !phase.chestRelic) return { state, events };
	const relic = phase.chestRelic;
	// Clear the offer first: a pickup choice (Astrolabe…) may replace the phase.
	const cleared: GameState = {
		...state,
		phase: { ...phase, chestRelic: undefined, sapphireKey: false },
	};
	return { state: obtainRelic(cleared, relic), events };
}
