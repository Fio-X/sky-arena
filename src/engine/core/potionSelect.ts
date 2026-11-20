/**
 * Card choices opened by potions: Elixir (exhaust any number), Liquid Memories
 * (discard → hand), Attack/Skill/Power/Colorless Potion (DiscoveryAction) and
 * Stance Potion (ChooseOneAction: Calm or Wrath). Gambler's Brew reuses "gamble".
 */
import { getCard } from "../content/loader";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { fireHook } from "./hooks";
import { hasRelic } from "./obtain";
import type {
	CardInstance,
	CardSelectTask,
	CombatState,
	GameEvent,
	GameState,
	StanceId,
} from "./types";

export const STANCE_CHOICES: Record<string, StanceId> = {
	STANCE_CALM: "calm",
	STANCE_WRATH: "wrath",
};

/** Cards a potion choice picks from (the UI shows the same list). */
export function potionSelectSource(task: CardSelectTask, c: CombatState): CardInstance[] | null {
	if (task === "elixir") return c.hand;
	if (task === "liquidMemories") return c.discardPile;
	return null;
}

/** How many cards the choice takes: Elixir/Gamble any number, Liquid Memories 1 (Sacred Bark 2). */
export function potionSelectLimits(
	state: GameState,
	task: CardSelectTask,
	sourceSize: number,
): { min: number; max: number } | null {
	if (task === "elixir" || task === "gamble") return { min: 0, max: sourceSize };
	if (task === "liquidMemories") {
		const n = Math.min(sourceSize, hasRelic(state, "SACRED_BARK") ? 2 : 1);
		return { min: n, max: n };
	}
	return null;
}

/** setCostForTurn(0): only cards with a real cost (not X, not unplayable). */
export function freeThisTurn(card: CardInstance): CardInstance {
	return card.costForTurn >= 0 ? { ...card, costForTurn: 0 } : card;
}

function toCombat(s: GameState): GameState {
	return s.combat ? { ...s, phase: { type: "combat", turn: s.combat.turn } } : s;
}

function picked<T>(pile: readonly T[], indices: number[]): { chosen: T[]; rest: T[] } {
	const set = new Set(indices);
	return {
		chosen: pile.filter((_, i) => set.has(i)),
		rest: pile.filter((_, i) => !set.has(i)),
	};
}

function handleElixir(s: GameState, c: CombatState, indices: number[], events: GameEvent[]) {
	const { chosen, rest } = picked(c.hand, indices);
	let st: GameState = {
		...s,
		combat: { ...c, hand: rest, exhaustPile: [...c.exhaustPile, ...chosen] },
	};
	for (const card of chosen) {
		events.push({ type: "cardExhausted", card });
		st = fireHook(st, { type: "player" }, "onExhaust", card);
	}
	return toCombat(st);
}

/** Move cards from the discard pile to the hand at 0 cost this turn (hand limit 10). */
export function returnFromDiscard(s: GameState, indices: number[]): GameState {
	const c = s.combat;
	if (!c) return s;
	const { chosen } = picked(c.discardPile, indices);
	const room = Math.max(0, 10 - c.hand.length);
	const moved = chosen.slice(0, room);
	const ids = new Set(moved.map((x) => x.uniqueId));
	return {
		...s,
		combat: {
			...c,
			discardPile: c.discardPile.filter((x) => !ids.has(x.uniqueId)),
			hand: [...c.hand, ...moved.map(freeThisTurn)],
		},
	};
}

function nextUid(c: CombatState): number {
	let uid = 1;
	for (const card of [...c.hand, ...c.drawPile, ...c.discardPile, ...c.exhaustPile]) {
		if (card.uniqueId >= uid) uid = card.uniqueId + 1;
	}
	return uid;
}

/** DiscoveryAction: 1 copy (Sacred Bark: 2), cost 0 this turn; Master Reality upgrades; full hand → discard. */
function handleDiscovery(s: GameState, c: CombatState, idx: number): GameState | null {
	const choice = (s.phase as { options?: CardInstance[] }).options?.[idx];
	if (!choice) return null;
	const copies = hasRelic(s, "SACRED_BARK") ? 2 : 1;
	const upgrade = c.player.powers.some((p) => p.id === "MASTER_REALITY");
	let hand = c.hand;
	let discardPile = c.discardPile;
	let uid = nextUid(c);
	for (let i = 0; i < copies; i++) {
		const card = freeThisTurn({
			...choice,
			uniqueId: uid++,
			upgraded: choice.upgraded || (upgrade && getCard(choice.id)?.type !== "curse"),
		});
		if (hand.length < 10) hand = [...hand, card];
		else discardPile = [...discardPile, card];
	}
	return toCombat({ ...s, combat: { ...c, hand, discardPile } });
}

function handleStance(s: GameState, c: CombatState, idx: number, events: GameEvent[]) {
	const choice = (s.phase as { options?: CardInstance[] }).options?.[idx];
	const stance = choice ? STANCE_CHOICES[choice.id] : undefined;
	if (!stance) return null;
	const st = toCombat({ ...s, combat: addToBot(c, { type: "changeStance", stance }) });
	return drainActions(st, events).state;
}

/** Returns null when the task is not a potion choice (or the pick is invalid). */
export function stepPotionSelect(
	state: GameState,
	indices: number[],
	events: GameEvent[],
): GameState | null {
	const c = state.combat;
	if (state.phase.type !== "cardSelect" || !c) return null;
	switch (state.phase.task) {
		case "elixir":
			return handleElixir(state, c, indices, events);
		case "liquidMemories":
			return toCombat(returnFromDiscard(state, indices));
		case "potionDiscovery":
			return handleDiscovery(state, c, indices[0] ?? -1);
		case "stancePotion":
			return handleStance(state, c, indices[0] ?? -1, events);
		default:
			return null;
	}
}
