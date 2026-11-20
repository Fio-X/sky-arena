/**
 * Per-event handlers (like the monster AI registry): each event decides its
 * choices for the current screen and what a choice does. Events without a
 * handler fall back to the data-driven outcomes in event.ts.
 */
import type { GameEvent, GameState } from "./types";

export interface EventChoice {
	/** English text; `zh` for the Chinese UI. */
	readonly label: string;
	readonly zh?: string;
	/** Shown but not clickable (requirement not met: not enough gold, no card to remove…). */
	readonly disabled?: boolean;
}

export interface EventHandler {
	/** Choices on the current screen (`state.phase.screen`, `state.phase.data`). */
	options(state: GameState): EventChoice[];
	/**
	 * Apply an enabled choice. Return the state with the next phase set: another
	 * event screen (`eventScreen`), a deck selection, an event fight, or the map.
	 */
	choose(state: GameState, index: number, events: GameEvent[]): GameState;
}

const handlers = new Map<string, EventHandler>();

export function registerEvent(eventId: string, handler: EventHandler): void {
	handlers.set(eventId, handler);
}

export function getEventHandler(eventId: string): EventHandler | undefined {
	return handlers.get(eventId);
}

/** Move to another screen of the current event (data merged into the old). */
export function eventScreen(
	state: GameState,
	screen: number,
	data?: Readonly<Record<string, number>>,
): GameState {
	if (state.phase.type !== "event") return state;
	return {
		...state,
		phase: { ...state.phase, screen, data: { ...state.phase.data, ...data } },
	};
}

export function leaveEvent(state: GameState): GameState {
	return { ...state, phase: { type: "map" } };
}
