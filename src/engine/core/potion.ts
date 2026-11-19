import { getPotion } from "../content/loader";
import { getPotionEffect } from "../content/potionEffects";
import { random } from "../rng/stsRandom";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { fireRunHook } from "./hooks";
import { hasRelic } from "./obtain";
import type { GameEvent, GameState, PotionId, RngState, StepResult } from "./types";

// ── Potion pool for Ironclad ─────────────────────────────

const IRONCLAD_POTION_POOL: PotionId[] = [];
let poolInitialized = false;

function ensurePool(): void {
	if (poolInitialized) return;
	poolInitialized = true;
	const potionDefs = import.meta.env?.SSR ? [] : [];
	void potionDefs;
}

export function initPotionPool(
	allPotions: Array<{ id: string; class: string; rarity: string }>,
): void {
	IRONCLAD_POTION_POOL.length = 0;
	for (const p of allPotions) {
		if (p.class === "shared" || p.class === "red") {
			IRONCLAD_POTION_POOL.push(p.id as PotionId);
		}
	}
	poolInitialized = true;
}

// ── Roll potion drop ─────────────────────────────────────
// 40% chance to drop a potion after combat (STS base rate); White Beast Statue: 100.

export function rollPotionDrop(
	rng: RngState,
	_potionSlots: number,
	potions: (PotionId | null)[],
	chance = 40,
): { potion: PotionId | null; rng: RngState } {
	ensurePool();
	const hasEmptySlot = potions.some((p) => p === null);
	if (!hasEmptySlot || IRONCLAD_POTION_POOL.length === 0) {
		return { potion: null, rng };
	}

	const dropRoll = random(rng, 99);
	rng = dropRoll.state;
	if (dropRoll.value >= chance) return { potion: null, rng };

	const potionRoll = random(rng, IRONCLAD_POTION_POOL.length - 1);
	rng = potionRoll.state;
	const potion = IRONCLAD_POTION_POOL[potionRoll.value] ?? null;
	return { potion, rng };
}

// ── Obtain potion ────────────────────────────────────────

export function obtainPotion(state: GameState, potionId: PotionId, events: GameEvent[]): GameState {
	const idx = state.potions.indexOf(null);
	if (idx < 0 || hasRelic(state, "SOZU")) return state;
	const newPotions = [...state.potions];
	newPotions[idx] = potionId;
	events.push({ type: "potionObtained", potionId, slot: idx });
	return { ...state, potions: newPotions };
}

// ── Use potion ───────────────────────────────────────────

export function stepUsePotion(
	state: GameState,
	slot: number,
	targetIndex: number,
	events: GameEvent[],
): StepResult {
	const potionId = state.potions[slot];
	if (!potionId) return { state, events };

	const def = getPotion(potionId);
	if (!def) return { state, events };

	// Only allow targeted potions in combat (or any potion in combat)
	if (def.targeted && !state.combat) return { state, events };

	const newPotions = [...state.potions];
	newPotions[slot] = null;
	let s: GameState = { ...state, potions: newPotions };
	events.push({ type: "potionUsed", potionId, slot });

	const effectFn = getPotionEffect(potionId);
	if (effectFn) {
		const actions = effectFn(s, targetIndex);
		for (const action of actions) {
			if (!s.combat) break;
			s = { ...s, combat: addToBot(s.combat, action) };
		}
		({ state: s } = drainActions(s, events));
	}

	return { state: fireRunHook(s, "onUsePotion", potionId), events };
}

// ── Discard potion ───────────────────────────────────────

export function stepDiscardPotion(state: GameState, slot: number, events: GameEvent[]): StepResult {
	const potionId = state.potions[slot];
	if (!potionId) return { state, events };

	const newPotions = [...state.potions];
	newPotions[slot] = null;
	events.push({ type: "potionDiscarded", potionId, slot });
	return { state: { ...state, potions: newPotions }, events };
}

// ── Pick up potion reward ────────────────────────────────

export function stepObtainPotionReward(state: GameState, events: GameEvent[]): StepResult {
	// Sozu: the reward stays on screen but cannot be taken.
	if (state.phase.type !== "reward" || !state.phase.potionReward || hasRelic(state, "SOZU")) {
		return { state, events };
	}
	const s = obtainPotion(state, state.phase.potionReward, events);
	return {
		state: { ...s, phase: { ...state.phase, potionReward: null } },
		events,
	};
}
