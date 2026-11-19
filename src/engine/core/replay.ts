import { resolveCardEffect } from "../content/cardEffects";
import { getCard } from "../content/loader";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import type { CardInstance, GameEvent, GameState } from "./types";

export function replayIfDoubleTap(
	s: GameState,
	card: CardInstance,
	targetIndex: number,
	events: GameEvent[],
): GameState {
	if (!s.combat) return s;
	const def = getCard(card.id);
	if (def?.type !== "attack") return s;
	const dtIdx = s.combat.player.powers.findIndex((p) => p.id === "doubleTap" && p.amount > 0);
	if (dtIdx < 0) return s;
	const powers = [...s.combat.player.powers];
	const dt = powers[dtIdx]!;
	powers[dtIdx] = { ...dt, amount: dt.amount - 1 };
	s = { ...s, combat: { ...s.combat, player: { ...s.combat.player, powers } } };
	const replayActions = resolveCardEffect(s, card, targetIndex);
	for (const action of replayActions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}
	({ state: s } = drainActions(s, events));
	return s;
}

export function replayIfBurst(
	s: GameState,
	card: CardInstance,
	targetIndex: number,
	events: GameEvent[],
): GameState {
	if (!s.combat) return s;
	const def = getCard(card.id);
	if (def?.type !== "skill") return s;
	const bIdx = s.combat.player.powers.findIndex((p) => p.id === "BURST" && p.amount > 0);
	if (bIdx < 0) return s;
	const powers = [...s.combat.player.powers];
	const b = powers[bIdx]!;
	powers[bIdx] = { ...b, amount: b.amount - 1 };
	s = { ...s, combat: { ...s.combat, player: { ...s.combat.player, powers } } };
	const replayActions = resolveCardEffect(s, card, targetIndex);
	for (const action of replayActions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}
	({ state: s } = drainActions(s, events));
	return s;
}

export function replayIfEchoForm(
	s: GameState,
	card: CardInstance,
	targetIndex: number,
	events: GameEvent[],
): GameState {
	if (!s.combat) return s;
	const efIdx = s.combat.player.powers.findIndex((p) => p.id === "ECHO_FORM_READY" && p.amount > 0);
	if (efIdx < 0) return s;
	const powers = [...s.combat.player.powers];
	const ef = powers[efIdx];
	if (!ef) return s;
	powers[efIdx] = { ...ef, amount: ef.amount - 1 };
	s = { ...s, combat: { ...s.combat, player: { ...s.combat.player, powers } } };
	const replayActions = resolveCardEffect(s, card, targetIndex);
	for (const action of replayActions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}
	({ state: s } = drainActions(s, events));
	return s;
}

export function replayIfAmplify(
	s: GameState,
	card: CardInstance,
	targetIndex: number,
	events: GameEvent[],
): GameState {
	if (!s.combat) return s;
	const def = getCard(card.id);
	if (def?.type !== "power") return s;
	const aIdx = s.combat.player.powers.findIndex((p) => p.id === "AMPLIFY" && p.amount > 0);
	if (aIdx < 0) return s;
	const powers = [...s.combat.player.powers];
	const a = powers[aIdx];
	if (!a) return s;
	powers[aIdx] = { ...a, amount: a.amount - 1 };
	s = { ...s, combat: { ...s.combat, player: { ...s.combat.player, powers } } };
	const replayActions = resolveCardEffect(s, card, targetIndex);
	for (const action of replayActions) {
		if (!s.combat) break;
		s = { ...s, combat: addToBot(s.combat, action) };
	}
	({ state: s } = drainActions(s, events));
	return s;
}
