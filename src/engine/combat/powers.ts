import { fireHook, vetoHook } from "../core/hooks";
import type { ActorRef, GameState, PowerId, PowerInstance } from "../core/types";

const DEBUFF_IDS = new Set(["vulnerable", "weak", "frail", "ENTANGLED"]);

/**
 * Apply a power to an actor. Handles:
 * - Veto check (onApplyPower hook — Artifact consumes before debuff)
 * - Stacking rules (intensity: add, duration: add, none: replace)
 * - justApplied flag for turnBased powers
 */
export function applyPower(
	state: GameState,
	_source: ActorRef,
	target: ActorRef,
	powerId: PowerId,
	amount: number,
): GameState {
	if (!state.combat) return state;

	// Artifact: consume a stack when blocking a debuff
	if (DEBUFF_IDS.has(powerId)) {
		const artifact = getPowers(state, target).find((p) => p.id === "ARTIFACT");
		if (artifact && artifact.amount > 0) {
			const newAmount = artifact.amount - 1;
			const powers = getPowers(state, target);
			const newPowers =
				newAmount > 0
					? powers.map((p) => (p.id === "ARTIFACT" ? { ...p, amount: newAmount } : p))
					: powers.filter((p) => p.id !== "ARTIFACT");
			return setPowers(state, target, newPowers);
		}
	}

	// Veto check (other onApplyPower hooks)
	const allowed = vetoHook(state, target, "onApplyPower", powerId, amount);
	if (!allowed) return state;

	// Get current powers list
	const powers = getPowers(state, target);
	const existing = powers.find((p) => p.id === powerId);

	let newPowers: PowerInstance[];
	if (existing) {
		newPowers = powers.map((p) => (p.id === powerId ? { ...p, amount: p.amount + amount } : p));
	} else {
		newPowers = [...powers, { id: powerId, amount, justApplied: true }];
	}

	return setPowers(state, target, newPowers);
}

/**
 * Reduce a power's amount. Removes at 0 or below.
 */
export function reducePower(
	state: GameState,
	target: ActorRef,
	powerId: PowerId,
	amount: number,
): GameState {
	const powers = getPowers(state, target);
	const newPowers = powers
		.map((p) => (p.id === powerId ? { ...p, amount: p.amount - amount } : p))
		.filter((p) => p.id !== powerId || p.amount > 0);
	return setPowers(state, target, newPowers);
}

/**
 * Remove a power entirely.
 */
export function removePower(state: GameState, target: ActorRef, powerId: PowerId): GameState {
	const powers = getPowers(state, target).filter((p) => p.id !== powerId);
	return setPowers(state, target, powers);
}

/**
 * Tick turnBased powers at end of round.
 * Skip if justApplied, then decrement, remove at 0.
 */
export function tickTurnBasedPowers(
	state: GameState,
	target: ActorRef,
	turnBasedIds: Set<string>,
): GameState {
	const powers = getPowers(state, target);
	const newPowers = powers
		.map((p) => {
			if (!turnBasedIds.has(p.id)) return p;
			if (p.justApplied) return { ...p, justApplied: false };
			return { ...p, amount: p.amount - 1 };
		})
		.filter((p) => !turnBasedIds.has(p.id) || p.amount > 0);

	let newState = setPowers(state, target, newPowers);
	newState = fireHook(newState, target, "atEndOfRound");
	return newState;
}

// ── Helpers ───────────────────────────────────────────────

function getPowers(state: GameState, actor: ActorRef): PowerInstance[] {
	if (!state.combat) return [];
	if (actor.type === "player") return state.combat.player.powers;
	return state.combat.monsters[actor.index]?.powers ?? [];
}

function setPowers(state: GameState, actor: ActorRef, powers: PowerInstance[]): GameState {
	if (!state.combat) return state;

	if (actor.type === "player") {
		return {
			...state,
			combat: {
				...state.combat,
				player: { ...state.combat.player, powers },
			},
		};
	}

	const monsters = [...state.combat.monsters];
	const m = monsters[actor.index];
	if (!m) return state;
	monsters[actor.index] = { ...m, powers };
	return { ...state, combat: { ...state.combat, monsters } };
}
