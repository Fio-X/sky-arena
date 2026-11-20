/**
 * "?" rooms (EventHelper.roll) and event selection (AbstractDungeon.generateEvent).
 *
 * - roll: eventRng.random() against a 100-slot table — monster (starts 10%),
 *   shop (3%), treasure (2%), the rest events. A result's chance resets when
 *   it happens and grows by its base step otherwise. Tiny Chest forces a
 *   treasure every 4th "?"; Juzu Bracelet turns a monster into an event.
 * - generateEvent: 25% shrine roll (shrines + one-time events), else the act
 *   pool; the picked event is removed. Only events whose spawn conditions
 *   hold are eligible. Act pool, shrines and chances reset every act; the
 *   one-time list lasts the whole run.
 */
import { getCard } from "../content/loader";
import { relicVal, setRelicCounter } from "../content/relicHelpers";
import { random, randomFloat } from "../rng/stsRandom";
import { allEventDefs } from "./event";
import { hasRelic } from "./obtain";
import type { EventPoolState, GameState } from "./types";

export type QuestionRoom = "monster" | "shop" | "treasure" | "event";

const BASE = { monster: 0.1, shop: 0.03, treasure: 0.02 };

function poolIds(pool: string): string[] {
	return allEventDefs()
		.filter((e) => e.pool === pool)
		.map((e) => e.id);
}

/** Fresh lists for an act (one-time events carry over from `prev`). */
export function newEventPools(act: number, prev?: EventPoolState): EventPoolState {
	return {
		act,
		events: poolIds(`act${act}`),
		shrines: poolIds("shrine"),
		oneTime: prev?.oneTime ?? poolIds("oneTime"),
		chances: { ...BASE },
	};
}

function poolsOf(state: GameState): EventPoolState {
	const p = state.eventPools;
	return p && p.act === state.act ? p : newEventPools(state.act, p);
}

// ── "?" room roll ────────────────────────────────────────

function tinyChestForces(state: GameState): { state: GameState; force: boolean } {
	if (!hasRelic(state, "TINY_CHEST")) return { state, force: false };
	const r = state.relics.find((x) => x.id === "TINY_CHEST");
	const count = (r?.counter ?? 0) + 1;
	const every = relicVal("TINY_CHEST", 0, 4);
	const force = count >= every;
	return { state: setRelicCounter(state, "TINY_CHEST", force ? 0 : count), force };
}

export function rollQuestionRoom(state: GameState): { state: GameState; room: QuestionRoom } {
	const pools = poolsOf(state);
	const f = randomFloat(state.rng.eventRng);
	let s: GameState = { ...state, rng: { ...state.rng, eventRng: f.state } };
	const tiny = tinyChestForces(s);
	s = tiny.state;

	const monster = Math.trunc(pools.chances.monster * 100);
	const shop = Math.trunc(pools.chances.shop * 100);
	const treasure = Math.trunc(pools.chances.treasure * 100);
	const slot = Math.trunc(f.value * 100);
	let room: QuestionRoom =
		slot < monster
			? "monster"
			: slot < monster + shop
				? "shop"
				: slot < monster + shop + treasure
					? "treasure"
					: "event";
	if (tiny.force) room = "treasure";

	const c = pools.chances;
	let monsterChance = c.monster + BASE.monster;
	if (room === "monster") {
		monsterChance = BASE.monster;
		if (hasRelic(s, "JUZU_BRACELET")) room = "event";
	}
	const chances = {
		monster: monsterChance,
		shop: room === "shop" ? BASE.shop : c.shop + BASE.shop,
		treasure: room === "treasure" ? BASE.treasure : c.treasure + BASE.treasure,
	};
	return { state: { ...s, eventPools: { ...pools, chances } }, room };
}

// ── Spawn conditions (data `canSpawn`) ───────────────────

type Cond = Record<string, unknown>;

function deckHasCurse(state: GameState): boolean {
	return state.deck.some((c) => getCard(c.id)?.type === "curse");
}

function holds(state: GameState, key: string, v: unknown): boolean {
	switch (key) {
		case "acts":
			return (v as number[]).includes(state.act);
		case "minGold":
			return state.gold >= (v as number);
		case "minCurHp":
			return state.currentHp >= (v as number);
		case "minRelics":
			return state.relics.length >= (v as number);
		case "minFloor":
			return state.floor >= (v as number);
		case "maxAscension":
			return state.ascension <= (v as number);
		case "deckHasCurse":
			return deckHasCurse(state) === v;
		case "mapRowGreaterThan":
			return (state.map.currentNode?.y ?? 0) > (v as number);
		case "curHpAtMostPctOfMax":
			return state.currentHp <= state.maxHp * (v as number);
		case "hasRelic":
			return hasRelic(state, v as string);
		case "anyOf":
			return (v as Cond[]).some((c) => canSpawnWith(state, c));
		default:
			// minPlaytimeSeconds (Secret Portal) and notes: no clock here, always allowed.
			return true;
	}
}

function canSpawnWith(state: GameState, cond: Cond | null | undefined): boolean {
	if (!cond) return true;
	return Object.entries(cond).every(([k, v]) => holds(state, k, v));
}

function eligible(state: GameState, ids: readonly string[]): string[] {
	const defs = new Map(allEventDefs().map((e) => [e.id, e]));
	return ids.filter((id) => canSpawnWith(state, defs.get(id)?.canSpawn as Cond | null));
}

// ── Event selection ──────────────────────────────────────

const SHRINE_CHANCE = 0.25;

function pickFrom(state: GameState, candidates: string[]): { state: GameState; id: string | null } {
	if (candidates.length === 0) return { state, id: null };
	const r = random(state.rng.eventRng, candidates.length - 1);
	return {
		state: { ...state, rng: { ...state.rng, eventRng: r.state } },
		id: candidates[r.value] ?? null,
	};
}

function pickShrine(state: GameState, pools: EventPoolState) {
	const picked = pickFrom(state, eligible(state, [...pools.shrines, ...pools.oneTime]));
	if (!picked.id) return { ...picked, pools };
	const without = (l: string[]) => l.filter((x) => x !== picked.id);
	return {
		...picked,
		pools: { ...pools, shrines: without(pools.shrines), oneTime: without(pools.oneTime) },
	};
}

function pickActEvent(state: GameState, pools: EventPoolState) {
	const picked = pickFrom(state, eligible(state, pools.events));
	if (!picked.id) return { ...picked, pools };
	return { ...picked, pools: { ...pools, events: pools.events.filter((x) => x !== picked.id) } };
}

export function generateEvent(state: GameState): { state: GameState; eventId: string } {
	const pools = poolsOf(state);
	const f = randomFloat(state.rng.eventRng);
	const s: GameState = { ...state, rng: { ...state.rng, eventRng: f.state } };
	const shrineFirst = f.value < SHRINE_CHANCE;
	const first = shrineFirst ? pickShrine(s, pools) : pickActEvent(s, pools);
	const result = first.id
		? first
		: shrineFirst
			? pickActEvent(first.state, first.pools)
			: pickShrine(first.state, first.pools);
	return {
		state: { ...result.state, eventPools: result.pools },
		eventId: result.id ?? "BIG_FISH",
	};
}
