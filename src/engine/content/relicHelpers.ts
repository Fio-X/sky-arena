import type { CardInstance, GameState, PowerId } from "../core/types";
import { getCard, getRelic } from "./loader";

export function heal(state: GameState, amount: number): GameState {
	const healed = Math.min(amount, state.maxHp - state.currentHp);
	return healed > 0 ? { ...state, currentHp: state.currentHp + healed } : state;
}

export function addPlayerBlock(state: GameState, amount: number): GameState {
	if (!state.combat) return state;
	const p = state.combat.player;
	return { ...state, combat: { ...state.combat, player: { ...p, block: p.block + amount } } };
}

export function addPlayerPower(state: GameState, powerId: string, amount: number): GameState {
	if (!state.combat) return state;
	const powers = state.combat.player.powers;
	const existing = powers.find((p) => p.id === powerId);
	const newPowers = existing
		? powers.map((p) => (p.id === powerId ? { ...p, amount: p.amount + amount } : p))
		: [...powers, { id: powerId as PowerId, amount, justApplied: true }];
	return {
		...state,
		combat: { ...state.combat, player: { ...state.combat.player, powers: newPowers } },
	};
}

export function setRelicCounter(state: GameState, relicId: string, counter: number): GameState {
	return {
		...state,
		relics: state.relics.map((r) => (r.id === relicId ? { ...r, counter } : r)),
	};
}

export function damageAllMonsters(state: GameState, amount: number): GameState {
	if (!state.combat) return state;
	const monsters = state.combat.monsters.map((m) => {
		if (!m.alive) return m;
		const newHp = Math.max(0, m.currentHp - amount);
		return { ...m, currentHp: newHp, alive: newHp > 0 };
	});
	return { ...state, combat: { ...state.combat, monsters } };
}

export function drawCards(state: GameState, count: number): GameState {
	if (!state.combat) return state;
	let combat = state.combat;
	for (let i = 0; i < count; i++) {
		if (combat.hand.length >= 10) break;
		if (combat.drawPile.length === 0) break;
		const card = combat.drawPile[combat.drawPile.length - 1];
		if (!card) break;
		combat = {
			...combat,
			drawPile: combat.drawPile.slice(0, -1),
			hand: [...combat.hand, card],
		};
	}
	return { ...state, combat };
}

export function isAttack(card: CardInstance): boolean {
	return getCard(card.id)?.type === "attack";
}

export function isStrike(card: CardInstance): boolean {
	const id = card.id as string;
	return id.startsWith("STRIKE_") || id === "PERFECTED_STRIKE" || id === "TWIN_STRIKE";
}

export function relicVal(id: string, index: number, fallback: number): number {
	return (getRelic(id)?.values?.[index] as number | undefined) ?? fallback;
}
