import type { Action, CombatState } from "./types";

export function addToTop(combat: CombatState, action: Action): CombatState {
	return {
		...combat,
		actionQueue: [action, ...combat.actionQueue],
	};
}

export function addToBot(combat: CombatState, action: Action): CombatState {
	return {
		...combat,
		actionQueue: [...combat.actionQueue, action],
	};
}

export function popAction(combat: CombatState): {
	action: Action | undefined;
	combat: CombatState;
} {
	const [action, ...rest] = combat.actionQueue;
	return {
		action,
		combat: { ...combat, actionQueue: rest },
	};
}

export function clearQueue(combat: CombatState): CombatState {
	return { ...combat, actionQueue: [] };
}

export function queueSize(combat: CombatState): number {
	return combat.actionQueue.length;
}
