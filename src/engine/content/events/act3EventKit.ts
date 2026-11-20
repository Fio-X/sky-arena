/**
 * Small helpers shared by the Act 3 / one-time event handlers: a choice list
 * that carries its own effect, gold / HP / relic changes outside combat, Java
 * shuffles seeded from an RNG stream, and chained reward screens.
 */
import { type EventChoice, registerEvent } from "../../core/eventRegistry";
import { hasRelic } from "../../core/obtain";
import { executePlayerHeal, executePlayerLoseHp } from "../../core/playerActions";
import { uniformRandomPotion } from "../../core/potion";
import type {
	CardId,
	CardInstance,
	GameEvent,
	GamePhase,
	GameState,
	PotionId,
	RngStreams,
} from "../../core/types";
import { createJavaRandom, javaShuffle } from "../../rng/javaRandom";
import { randomLong } from "../../rng/stsRandom";
import { getCard } from "../loader";

export type Effect = (s: GameState, events: GameEvent[]) => GameState;

/** A choice of the current screen; no `run` = leave the event. */
export interface Choice extends EventChoice {
	readonly run?: Effect;
}

export const screenOf = (s: GameState): number =>
	s.phase.type === "event" ? (s.phase.screen ?? 0) : 0;

export const dataOf = (s: GameState): Readonly<Record<string, number>> =>
	s.phase.type === "event" ? (s.phase.data ?? {}) : {};

/** Register an event whose choices (per screen) carry their effects. */
export function defineEvent(id: string, build: (s: GameState) => Choice[]): void {
	registerEvent(id, {
		options: (s) => build(s).map(({ run: _run, ...choice }) => choice),
		choose: (s, index, events) => {
			const run = build(s)[index]?.run;
			return run ? run(s, events) : go(s, { type: "map" });
		},
	});
}

/** Next phase, unless an HP loss outside combat killed the player (game over). */
export function go(s: GameState, phase: GamePhase): GameState {
	if (s.currentHp <= 0) return { ...s, phase: { type: "gameOver", victory: false } };
	return { ...s, phase };
}

export const toMap = (s: GameState): GameState => go(s, { type: "map" });

export function loseGold(s: GameState, amount: number, events: GameEvent[]): GameState {
	const lost = Math.min(Math.max(0, amount), s.gold);
	if (lost > 0) events.push({ type: "goldChanged", delta: -lost });
	return { ...s, gold: s.gold - lost };
}

/** HP_LOSS (or event damage, which nothing reduces outside combat). */
export function loseHp(s: GameState, amount: number, events: GameEvent[]): GameState {
	return executePlayerLoseHp(s, amount, events).state;
}

/** AbstractPlayer.heal outside combat: Mark of the Bloom stops every heal. */
export function heal(s: GameState, amount: number, events: GameEvent[]): GameState {
	if (hasRelic(s, "MARK_OF_THE_BLOOM")) return s;
	return executePlayerHeal(s, amount, events).state;
}

/** decreaseMaxHealth: never below 1; current HP follows. */
export function loseMaxHp(s: GameState, amount: number): GameState {
	const maxHp = Math.max(1, s.maxHp - amount);
	return { ...s, maxHp, currentHp: Math.min(s.currentHp, maxHp) };
}

/** AbstractPlayer.loseRelic: the first relic with that id is removed. */
export function loseRelic(s: GameState, relicId: string): GameState {
	const i = s.relics.findIndex((r) => r.id === relicId);
	if (i < 0) return s;
	return { ...s, relics: s.relics.filter((_, j) => j !== i) };
}

export function removeCardByUid(s: GameState, uid: number): GameState {
	return { ...s, deck: s.deck.filter((c) => c.uniqueId !== uid) };
}

/** MathUtils.round (positive values). */
export const roundF = (x: number): number => Math.floor(x + 0.5);

/** Collections.shuffle(list, new Random(stream.randomLong())). */
export function shuffleWith<T>(
	s: GameState,
	stream: keyof RngStreams,
	items: readonly T[],
): { items: T[]; state: GameState } {
	const r = randomLong(s.rng[stream]);
	const list = [...items];
	javaShuffle(list, createJavaRandom(r.value));
	return { items: list, state: { ...s, rng: { ...s.rng, [stream]: r.state } } };
}

/** AbstractCard.canUpgrade for master-deck cards. */
export function canUpgrade(c: CardInstance): boolean {
	const type = getCard(c.id)?.type;
	return !c.upgraded && type !== undefined && type !== "curse" && type !== "status";
}

export const cardName = (id: string): string => getCard(id)?.name ?? id;

/** Reward screens one after another (the engine's reward screen holds one card reward and one potion). */
export function rewardChain(
	s: GameState,
	items: ReadonlyArray<{ cards?: CardId[]; potion?: PotionId | null }>,
	next: GamePhase,
): GameState {
	let phase = next;
	for (const item of [...items].reverse()) {
		phase = {
			type: "reward",
			cardRewards: item.cards ?? [],
			potionReward: item.potion ?? null,
			gold: 0,
			next: phase,
		};
	}
	return go(s, phase);
}

/** `n` potions from PotionHelper.getRandomPotion (potionRng), each on its own reward screen. */
export function potionRewards(s: GameState, n: number): GameState {
	let st = s;
	const items: { potion: PotionId | null }[] = [];
	for (let i = 0; i < n; i++) {
		const p = uniformRandomPotion(st.rng.potionRng, st.character);
		st = { ...st, rng: { ...st.rng, potionRng: p.rng } };
		items.push({ potion: p.potion });
	}
	return rewardChain(st, items, { type: "map" });
}
