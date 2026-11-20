import { getAllPotions, getAllRelics, getCard } from "../content/loader";
import { random } from "../rng/stsRandom";
import { type EventChoice, getEventHandler } from "./eventRegistry";
import { hasRelic, obtainCard, obtainRelic } from "./obtain";
import { gainGold } from "./playerActions";
import type { CardId, GameEvent, GameState, RngState, StepResult } from "./types";

// ── Event definition (loaded from JSON) ─────────────────

export interface EventOutcome {
	readonly effect: string;
	readonly amount: number | string | null;
	readonly id: string | null;
	readonly rounding?: string;
	readonly detail?: string;
}

export interface EventOption {
	readonly label: string;
	readonly requires: string | null;
	readonly outcomes: EventOutcome[];
}

export interface EventDef {
	readonly id: string;
	readonly name: string;
	readonly pool: string;
	readonly acts: number[];
	readonly summary: string;
	readonly options: EventOption[];
	readonly canSpawn: Readonly<Record<string, unknown>> | null;
}

// ── Event registry ──────────────────────────────────────

const events = new Map<string, EventDef>();
const shrinePool: string[] = [];

export function loadEvents(data: { events: EventDef[] }): void {
	events.clear();
	shrinePool.length = 0;
	for (const e of data.events) {
		events.set(e.id, e);
		if (e.pool === "shrine") shrinePool.push(e.id);
	}
}

export function allEventDefs(): EventDef[] {
	return [...events.values()];
}

/** Act pool + one-time events allowed in this act, in data order. */
function eventPoolForAct(act: number): string[] {
	const all = [...events.values()];
	const actPool = all.filter((e) => e.pool === `act${act}`).map((e) => e.id);
	const oneTime = all.filter((e) => e.pool === "oneTime" && e.acts.includes(act)).map((e) => e.id);
	return [...actPool, ...oneTime];
}

export function getEvent(id: string): EventDef | undefined {
	return events.get(id);
}

// ── Pick random event ───────────────────────────────────

const SHRINE_CHANCE = 0.25;

export function pickEvent(rng: RngState, act = 1): { eventId: string; rng: RngState } {
	const shrineRoll = random(rng, 99);
	rng = shrineRoll.state;

	let pool: string[];
	if (shrineRoll.value < SHRINE_CHANCE * 100 && shrinePool.length > 0) {
		pool = shrinePool;
	} else {
		pool = eventPoolForAct(act);
	}

	if (pool.length === 0) {
		return { eventId: "BIG_FISH", rng };
	}

	const eventRoll = random(rng, pool.length - 1);
	rng = eventRoll.state;
	const eventId = pool[eventRoll.value] ?? pool[0] ?? "BIG_FISH";
	return { eventId, rng };
}

// ── Execute event option ────────────────────────────────

export function stepChooseEventOption(
	state: GameState,
	optionIndex: number,
	events_: GameEvent[],
): StepResult {
	if (state.phase.type !== "event") return { state, events: events_ };
	const handler = getEventHandler(state.phase.eventId);
	if (handler) {
		const choice = handler.options(state)[optionIndex];
		if (!choice || choice.disabled) return { state, events: events_ };
		return { state: handler.choose(state, optionIndex, events_), events: events_ };
	}

	const def = getEvent(state.phase.eventId);
	if (!def) return { state: { ...state, phase: { type: "map" } }, events: events_ };

	const option = def.options[optionIndex];
	if (!option) return { state, events: events_ };

	// Next phase first, so a relic pickup choice (obtainRelic) runs before it.
	let s: GameState = { ...state, phase: { type: "map" } };
	for (const outcome of option.outcomes) {
		s = applyOutcome(s, outcome, events_);
	}

	return { state: s, events: events_ };
}

function applyOutcome(state: GameState, outcome: EventOutcome, events: GameEvent[]): GameState {
	const amount = resolveAmount(outcome.amount, state);

	switch (outcome.effect) {
		case "healHp": {
			const healed = Math.min(amount, state.maxHp - state.currentHp);
			if (healed > 0) {
				events.push({ type: "healed", target: { type: "player" }, amount: healed });
			}
			return { ...state, currentHp: Math.min(state.maxHp, state.currentHp + amount) };
		}
		case "loseHp": {
			const newHp = Math.max(0, state.currentHp - amount);
			events.push({ type: "hpLost", target: { type: "player" }, amount });
			return { ...state, currentHp: newHp };
		}
		case "gainMaxHp": {
			return { ...state, maxHp: state.maxHp + amount, currentHp: state.currentHp + amount };
		}
		case "loseMaxHp": {
			const newMax = Math.max(1, state.maxHp - amount);
			return { ...state, maxHp: newMax, currentHp: Math.min(state.currentHp, newMax) };
		}
		case "gainGold":
			return gainGold(state, amount, events);
		case "loseGold": {
			const lost = Math.min(amount, state.gold);
			events.push({ type: "goldChanged", delta: -lost });
			return { ...state, gold: state.gold - lost };
		}
		case "obtainCurse": {
			const curseId = (outcome.id ?? "REGRET") as CardId;
			return addCardToDeck(state, curseId);
		}
		case "obtainCard": {
			const cardId = outcome.id as CardId | null;
			if (cardId) return addCardToDeck(state, cardId);
			return state;
		}
		case "upgradeCard": {
			return upgradeRandomCard(state);
		}
		case "removeCard": {
			if (state.deck.length <= 1) return state;
			const r = random(state.rng.miscRng, state.deck.length - 1);
			const newDeck = state.deck.filter((_, i) => i !== r.value);
			return { ...state, deck: newDeck, rng: { ...state.rng, miscRng: r.state } };
		}
		case "obtainRelic": {
			return obtainRandomRelic(state);
		}
		case "obtainPotion": {
			return obtainRandomPotion(state);
		}
		default:
			return state;
	}
}

function resolveAmount(raw: number | string | null, state: GameState): number {
	if (raw === null) return 0;
	if (typeof raw === "number") return raw;
	if (typeof raw === "string" && raw.startsWith("pct:")) {
		const pct = Number.parseFloat(raw.slice(4));
		return Math.floor(state.maxHp * pct);
	}
	return Number(raw) || 0;
}

function addCardToDeck(state: GameState, cardId: CardId): GameState {
	return obtainCard(state, cardId);
}

function upgradeRandomCard(state: GameState): GameState {
	const upgradable = state.deck
		.map((c, i) => ({ card: c, index: i }))
		.filter(({ card }) => !card.upgraded);
	if (upgradable.length === 0) return state;

	const r = random(state.rng.miscRng, upgradable.length - 1);
	const target = upgradable[r.value];
	if (!target) return state;

	const def = getCard(target.card.id as string);
	const newCost = def?.upgrade.cost ?? target.card.costForTurn;
	const newDeck = [...state.deck];
	newDeck[target.index] = { ...target.card, upgraded: true, costForTurn: newCost };
	return { ...state, deck: newDeck, rng: { ...state.rng, miscRng: r.state } };
}

/** Choices on the current event screen: the handler's, or the data options. */
export function eventOptions(state: GameState): EventChoice[] {
	if (state.phase.type !== "event") return [];
	const handler = getEventHandler(state.phase.eventId);
	if (handler) return handler.options(state);
	return (getEvent(state.phase.eventId)?.options ?? []).map((o) => ({ label: o.label }));
}

/** returnRandomRelicTier (50% common / 33% uncommon / 17% rare) unless a tier is given. */
export function obtainRandomRelicOfTier(
	state: GameState,
	tier: "random" | "common" | "uncommon" | "rare",
): GameState {
	return tier === "random" ? obtainRandomRelic(state) : obtainRandomRelic(state, tier);
}

export function obtainRandomRelic(
	state: GameState,
	fixedTier?: "common" | "uncommon" | "rare",
): GameState {
	const owned = new Set(state.relics.map((r) => r.id as string));
	const pool = getAllRelics().filter(
		(r) =>
			!r.unobtainable &&
			!owned.has(r.id as string) &&
			r.tier !== "boss" &&
			r.tier !== "event" &&
			r.tier !== "starter" &&
			r.tier !== "special",
	);
	if (pool.length === 0) return state;

	let rng = state.rng.relicRng;
	let tier: string;
	if (fixedTier) tier = fixedTier;
	else {
		const tierRoll = random(rng, 99);
		rng = tierRoll.state;
		if (tierRoll.value < 50) tier = "common";
		else if (tierRoll.value < 83) tier = "uncommon";
		else tier = "rare";
	}

	const tierPool = pool.filter((r) => r.tier === tier);
	const finalPool = tierPool.length > 0 ? tierPool : pool;
	const relicRoll = random(rng, finalPool.length - 1);
	rng = relicRoll.state;
	const relic = finalPool[relicRoll.value];
	if (!relic) return state;

	return obtainRelic({ ...state, rng: { ...state.rng, relicRng: rng } }, relic.id);
}

export function obtainRandomPotion(state: GameState): GameState {
	const emptySlot = state.potions.indexOf(null);
	if (emptySlot < 0 || hasRelic(state, "SOZU")) return state;

	const potionPool = getAllPotions().filter((p) => p.class === "shared" || p.class === "red");
	if (potionPool.length === 0) return state;

	const r = random(state.rng.potionRng, potionPool.length - 1);
	const potion = potionPool[r.value];
	if (!potion) return state;

	const newPotions = [...state.potions];
	newPotions[emptySlot] = potion.id;
	return { ...state, potions: newPotions, rng: { ...state.rng, potionRng: r.state } };
}
