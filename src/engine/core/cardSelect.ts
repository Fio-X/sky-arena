import { getCard } from "../content/loader";
import type { CardInstance, CombatState, GameEvent, GameState, StepResult } from "./types";

function nextUid(combat: CombatState): number {
	let uid = 1;
	for (const card of [
		...combat.hand,
		...combat.drawPile,
		...combat.discardPile,
		...combat.exhaustPile,
	]) {
		if (card.uniqueId >= uid) uid = card.uniqueId + 1;
	}
	return uid;
}

function toCombat(s: GameState): GameState {
	if (!s.combat) return s;
	return { ...s, phase: { type: "combat", turn: s.combat.turn } };
}

function drawN(combat: CombatState, n: number): CombatState {
	let c = combat;
	for (let i = 0; i < n; i++) {
		if (c.hand.length >= 10 || c.drawPile.length === 0) break;
		const card = c.drawPile[c.drawPile.length - 1];
		if (!card) break;
		c = { ...c, drawPile: c.drawPile.slice(0, -1), hand: [...c.hand, card] };
	}
	return c;
}

// ── Handlers ────────────────────────────────────────────

function handleDualWield(s: GameState, c: CombatState, idx: number): GameState | null {
	const source = c.hand[idx];
	if (!source) return null;
	const def = getCard(source.id);
	if (def?.type !== "attack" && def?.type !== "power") return null;
	const copy = { ...source, uniqueId: nextUid(c) };
	const hand = c.hand.length < 10 ? [...c.hand, copy] : c.hand;
	return { ...s, combat: { ...c, hand }, phase: { type: "combat", turn: c.turn } };
}

function handleArmaments(s: GameState, c: CombatState, idx: number): GameState | null {
	const card = c.hand[idx];
	if (!card || card.upgraded) return null;
	const hand = c.hand.map((cc, i) => (i === idx ? { ...cc, upgraded: true } : cc));
	return toCombat({ ...s, combat: { ...c, hand } });
}

function handleHeadbutt(s: GameState, c: CombatState, idx: number): GameState | null {
	const card = c.discardPile[idx];
	if (!card) return null;
	const discardPile = c.discardPile.filter((_, i) => i !== idx);
	return toCombat({ ...s, combat: { ...c, discardPile, drawPile: [...c.drawPile, card] } });
}

function handleWarcry(s: GameState, c: CombatState, idx: number): GameState | null {
	const card = c.hand[idx];
	if (!card) return null;
	const hand = c.hand.filter((_, i) => i !== idx);
	return toCombat({ ...s, combat: { ...c, hand, drawPile: [...c.drawPile, card] } });
}

function handleExhaust(s: GameState, c: CombatState, idx: number): GameState {
	const card = c.hand[idx];
	if (!card) return s;
	const hand = c.hand.filter((_, i) => i !== idx);
	const exhaustPile = [...c.exhaustPile, card];
	const drawAfter = (s.phase as { drawAfter?: number }).drawAfter ?? 0;
	const nc = drawN({ ...c, hand, exhaustPile }, drawAfter);
	return toCombat({ ...s, combat: nc });
}

function handleExhume(s: GameState, c: CombatState, idx: number): GameState {
	const card = c.exhaustPile[idx];
	if (!card || c.hand.length >= 10) return toCombat(s);
	const exhaustPile = c.exhaustPile.filter((_, i) => i !== idx);
	return toCombat({ ...s, combat: { ...c, exhaustPile, hand: [...c.hand, card] } });
}

function handleForethought(s: GameState, c: CombatState, idx: number): GameState | null {
	const card = c.hand[idx];
	if (!card) return null;
	const hand = c.hand.filter((_, i) => i !== idx);
	const bottomCard: CardInstance = { ...card, costOverride: 0 };
	return toCombat({ ...s, combat: { ...c, hand, drawPile: [bottomCard, ...c.drawPile] } });
}

function handleGamble(s: GameState, c: CombatState, indices: number[]): GameState {
	const toDiscard = indices.map((i) => c.hand[i]).filter((cc): cc is CardInstance => cc != null);
	const hand = c.hand.filter((_, i) => !indices.includes(i));
	const discardPile = [...c.discardPile, ...toDiscard];
	const nc = drawN({ ...c, hand, discardPile }, toDiscard.length);
	return toCombat({ ...s, combat: nc });
}

function handleRecycle(s: GameState, c: CombatState, idx: number): GameState | null {
	const card = c.hand[idx];
	if (!card) return null;
	const def = getCard(card.id);
	const cost = card.costOverride ?? def?.cost ?? 0;
	const hand = c.hand.filter((_, i) => i !== idx);
	const exhaustPile = [...c.exhaustPile, card];
	const energy = c.energy + Math.max(0, cost);
	return toCombat({ ...s, combat: { ...c, hand, exhaustPile, energy } });
}

function handleDiscard(s: GameState, c: CombatState, indices: number[]): GameState {
	const toDiscard = indices.map((i) => c.hand[i]).filter((cc): cc is CardInstance => cc != null);
	if (toDiscard.length === 0) return toCombat(s);
	const hand = c.hand.filter((_, i) => !indices.includes(i));
	const discardPile = [...c.discardPile, ...toDiscard];
	const nc = {
		...c,
		hand,
		discardPile,
		cardsDiscardedThisTurn: c.cardsDiscardedThisTurn + toDiscard.length,
	};
	return toCombat({ ...s, combat: nc });
}

function handleCodexOrDiscovery(
	s: GameState,
	c: CombatState,
	idx: number,
	task: "codex" | "discovery",
): GameState {
	const options = (s.phase as { options?: CardInstance[] }).options;
	if (!options) return toCombat(s);
	const chosen = options[idx];
	if (!chosen) return s;
	const newCard: CardInstance = { ...chosen, uniqueId: nextUid(c) };
	if (task === "codex") {
		return toCombat({ ...s, combat: { ...c, drawPile: [...c.drawPile, newCard] } });
	}
	const hand = c.hand.length < 10 ? [...c.hand, newCard] : c.hand;
	return toCombat({ ...s, combat: { ...c, hand } });
}

// ── Entry ───────────────────────────────────────────────

export function stepChooseCard(
	state: GameState,
	indices: number[],
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "cardSelect" || !state.combat) return { state, events };
	const idx = indices[0] ?? -1;
	const c = state.combat;
	let result: GameState | null = null;

	switch (state.phase.task) {
		case "dualWield":
			result = handleDualWield(state, c, idx);
			break;
		case "armaments":
			result = handleArmaments(state, c, idx);
			break;
		case "headbutt":
			result = handleHeadbutt(state, c, idx);
			break;
		case "warcry":
			result = handleWarcry(state, c, idx);
			break;
		case "exhaust":
			result = handleExhaust(state, c, idx);
			break;
		case "exhume":
			result = handleExhume(state, c, idx);
			break;
		case "forethought":
			result = handleForethought(state, c, idx);
			break;
		case "gamble":
			result = handleGamble(state, c, indices);
			break;
		case "recycle":
			result = handleRecycle(state, c, idx);
			break;
		case "codex":
		case "discovery":
			result = handleCodexOrDiscovery(state, c, idx, state.phase.task);
			break;
		case "survivor":
		case "daggerThrow":
			result = handleDiscard(state, c, [idx]);
			break;
		case "prepared":
			result = handleDiscard(state, c, indices);
			break;
		default:
			return { state, events };
	}

	return { state: result ?? state, events };
}
