import { getPower } from "../content/loader";
import { fireHook, foldHook, vetoHook } from "../core/hooks";
import type { ActorRef, GameState, PowerId, PowerInstance } from "../core/types";

const STAT_IDS = new Set(["STRENGTH", "DEXTERITY", "FOCUS"]);

/**
 * PowerType.DEBUFF in the original: powers.json kind "debuff", or a negative
 * Strength/Dexterity/Focus amount (StrengthPower turns into a debuff below 0).
 */
export function isDebuffApplication(powerId: string, amount: number): boolean {
	const id = powerId.toUpperCase();
	if (STAT_IDS.has(id)) return amount < 0;
	return getPower(id)?.kind === "debuff";
}

/**
 * ApplyPowerAction: a debuff on a target with Artifact is negated and one
 * Artifact stack is used. Returns the new state, or null when not negated.
 */
export function negateWithArtifact(
	state: GameState,
	target: ActorRef,
	powerId: string,
	amount: number,
): GameState | null {
	if (!isDebuffApplication(powerId, amount)) return null;
	const powers = getPowers(state, target);
	const artifact = powers.find((p) => p.id.toUpperCase() === "ARTIFACT");
	if (!artifact || artifact.amount <= 0) return null;
	const newPowers =
		artifact.amount > 1
			? powers.map((p) => (p === artifact ? { ...p, amount: p.amount - 1 } : p))
			: powers.filter((p) => p !== artifact);
	return setPowers(state, target, newPowers);
}

export function hasArtifact(state: GameState, target: ActorRef): boolean {
	return getPowers(state, target).some((p) => p.id.toUpperCase() === "ARTIFACT" && p.amount > 0);
}

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

	const negated = negateWithArtifact(state, target, powerId, amount);
	if (negated) return negated;

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

/**
 * End of the player's turn: the player keeps `playerRetained` block; each monster
 * keeps what its modifyBlockRetention allows (Barricade on Spheric Guardian keeps all).
 */
export function clearBlockAtEndOfTurn(state: GameState, playerRetained: number): GameState {
	const c0 = state.combat;
	if (!c0) return state;
	let s: GameState = {
		...state,
		combat: { ...c0, player: { ...c0.player, block: playerRetained } },
	};
	const monsters = s.combat?.monsters ?? [];
	for (const m of monsters) {
		if (!m.alive || m.block === 0) continue;
		const retain = foldHook(s, { type: "monster", index: m.index }, "modifyBlockRetention", 0);
		s = retain.state;
		const c = s.combat;
		if (!c) return s;
		const next = [...c.monsters];
		next[m.index] = { ...m, block: Math.min(retain.value, m.block) };
		s = { ...s, combat: { ...c, monsters: next } };
	}
	return s;
}
