/**
 * Playing cards from the top of the draw pile (PlayTopCardAction): Distilled Chaos.
 * The potion sets `combat.autoplayTop`; step() drains it once the current
 * command has resolved, like the original's card queue.
 */

import { allMonstersGone } from "../combat/death";
import { random } from "../rng/stsRandom";
import { executeShuffle } from "./playerActions";
import type { CardInstance, GameEvent, GameState, StepResult } from "./types";

type PlayFn = (
	state: GameState,
	handIndex: number,
	targetIndex: number,
	events: GameEvent[],
) => StepResult;

/** getRandomMonster(null, true, cardRandomRng): a random targetable monster. */
function randomTarget(state: GameState): { target: number; state: GameState } {
	const alive = state.combat?.monsters.filter((m) => m.alive) ?? [];
	if (alive.length === 0) return { target: 0, state };
	const r = random(state.rng.cardRandomRng, alive.length - 1);
	return {
		target: alive[r.value]?.index ?? 0,
		state: { ...state, rng: { ...state.rng, cardRandomRng: r.state } },
	};
}

function withoutFreePlay(state: GameState, uid: number): GameState {
	const c = state.combat;
	if (!c) return state;
	const fix = (pile: CardInstance[]) =>
		pile.map((x) => (x.uniqueId === uid ? { ...x, freeToPlay: false } : x));
	return {
		...state,
		combat: {
			...c,
			hand: fix(c.hand),
			drawPile: fix(c.drawPile),
			discardPile: fix(c.discardPile),
			exhaustPile: fix(c.exhaustPile),
		},
	};
}

/** Take the top card (reshuffling an empty draw pile first) and play it for free. */
function playTopCard(state: GameState, events: GameEvent[], play: PlayFn): GameState {
	let s = state;
	if (s.combat && s.combat.drawPile.length === 0) s = executeShuffle(s, events).state;
	const c = s.combat;
	const top = c?.drawPile[c.drawPile.length - 1];
	if (!c || !top) return s;
	const picked = randomTarget(s);
	const hand = [...c.hand, { ...top, freeToPlay: true }];
	s = { ...picked.state, combat: { ...c, drawPile: c.drawPile.slice(0, -1), hand } };
	const played = play(s, hand.length - 1, picked.target, events).state;
	const pc = played.combat;
	if (pc?.hand.some((x) => x.uniqueId === top.uniqueId)) {
		// Could not be played (unplayable, no target): it goes to the discard pile.
		const rest = pc.hand.filter((x) => x.uniqueId !== top.uniqueId);
		return {
			...played,
			combat: {
				...pc,
				hand: rest,
				discardPile: [...pc.discardPile, { ...top, freeToPlay: false }],
			},
		};
	}
	return withoutFreePlay(played, top.uniqueId);
}

export function drainAutoplay(result: StepResult, play: PlayFn): StepResult {
	let s = result.state;
	while (
		s.combat?.autoplayTop &&
		s.phase.type === "combat" &&
		s.currentHp > 0 &&
		!allMonstersGone(s)
	) {
		s = { ...s, combat: { ...s.combat, autoplayTop: s.combat.autoplayTop - 1 } };
		s = playTopCard(s, result.events, play);
	}
	if (s.combat?.autoplayTop && (allMonstersGone(s) || s.currentHp <= 0)) {
		s = { ...s, combat: { ...s.combat, autoplayTop: 0 } };
	}
	return { state: s, events: result.events };
}
