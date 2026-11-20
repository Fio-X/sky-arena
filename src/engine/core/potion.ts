import { getPotion } from "../content/loader";
import { getPotionEffect } from "../content/potionEffects";
import { potionPotency } from "../content/relicsCombatRules";
import { random } from "../rng/stsRandom";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { getCurrentRoomType } from "./bossReward";
import { fireHook, fireRunHook } from "./hooks";
import { hasRelic } from "./obtain";
import { executeGainMaxHp, executePlayerHeal } from "./playerActions";
import type { Action, GameEvent, GameState, PotionId, RngState, StepResult } from "./types";

// ── Potion pool ──────────────────────────────────────────
// PotionHelper.getPotions(chosenClass): shared potions + the character's own,
// in data order (Ironclad's pool is unchanged from the old red-only list).

type PoolEntry = { id: PotionId; rarity: string; inClassPool: string[] };
const ALL_POTIONS: PoolEntry[] = [];

const CHARACTER_COLOR: Record<string, string> = {
	IRONCLAD: "red",
	SILENT: "green",
	DEFECT: "blue",
	WATCHER: "purple",
};

export function initPotionPool(
	allPotions: Array<{ id: string; class: string; rarity: string; inClassPool?: string[] }>,
): void {
	ALL_POTIONS.length = 0;
	for (const p of allPotions) {
		const inClassPool =
			p.inClassPool ?? (p.class === "shared" ? Object.values(CHARACTER_COLOR) : [p.class]);
		ALL_POTIONS.push({ id: p.id as PotionId, rarity: p.rarity, inClassPool });
	}
}

function potionPool(character: string): PoolEntry[] {
	const color = CHARACTER_COLOR[character] ?? "red";
	return ALL_POTIONS.filter((p) => p.inClassPool.includes(color));
}

// ── Roll potion drop ─────────────────────────────────────
// 40% chance to drop a potion after combat (STS base rate); White Beast Statue: 100.

export function rollPotionDrop(
	rng: RngState,
	potions: (PotionId | null)[],
	chance: number,
	character: string,
): { potion: PotionId | null; rng: RngState } {
	const pool = potionPool(character);
	const hasEmptySlot = potions.some((p) => p === null);
	if (!hasEmptySlot || pool.length === 0) {
		return { potion: null, rng };
	}

	const dropRoll = random(rng, 99);
	rng = dropRoll.state;
	if (dropRoll.value >= chance) return { potion: null, rng };

	const potionRoll = random(rng, pool.length - 1);
	rng = potionRoll.state;
	const potion = pool[potionRoll.value]?.id ?? null;
	return { potion, rng };
}

/**
 * AbstractDungeon.returnRandomPotion(limited): rarity roll (65 common /
 * 25 uncommon / 10 rare), then random potions until one has that rarity;
 * `limited` also rejects Fruit Juice (Entropic Brew).
 */
export function randomPotion(
	rng: RngState,
	character: string,
	limited: boolean,
): { potion: PotionId | null; rng: RngState } {
	const pool = potionPool(character);
	const r = random(rng, 99);
	const rarity = r.value < 65 ? "common" : r.value < 90 ? "uncommon" : "rare";
	let st = r.state;
	if (!pool.some((p) => p.rarity === rarity && !(limited && p.id === "FRUIT_JUICE"))) {
		return { potion: null, rng: st };
	}
	for (;;) {
		const pick = random(st, pool.length - 1);
		st = pick.state;
		const p = pool[pick.value];
		if (p && p.rarity === rarity && !(limited && p.id === "FRUIT_JUICE")) {
			return { potion: p.id, rng: st };
		}
	}
}

/** PotionHelper.getRandomPotion: uniform over the character's potion pool (potionRng). */
export function uniformRandomPotion(
	rng: RngState,
	character: string,
): { potion: PotionId | null; rng: RngState } {
	const pool = potionPool(character);
	if (pool.length === 0) return { potion: null, rng };
	const r = random(rng, pool.length - 1);
	return { potion: pool[r.value]?.id ?? null, rng: r.state };
}

// ── Obtain potion ────────────────────────────────────────

export function obtainPotion(state: GameState, potionId: PotionId, events: GameEvent[]): GameState {
	const idx = state.potions.indexOf(null);
	if (idx < 0 || hasRelic(state, "SOZU")) return state;
	const newPotions = [...state.potions];
	newPotions[idx] = potionId;
	events.push({ type: "potionObtained", potionId, slot: idx });
	return { ...state, potions: newPotions };
}

// ── Use potion ───────────────────────────────────────────

/** AbstractPotion.canUse overrides that allow drinking outside combat. */
const USABLE_OUTSIDE_COMBAT = new Set(["FRUIT_JUICE", "BLOOD_POTION", "ENTROPIC_BREW"]);

/**
 * Whether the potion can be drunk now. Fairy in a Bottle only triggers on
 * death; Smoke Bomb needs a non-boss fight without Back Attack (Act 4 ambush).
 */
export function canUsePotion(state: GameState, potionId: PotionId): boolean {
	if (potionId === "FAIRY_POTION") return false;
	if (!state.combat) return USABLE_OUTSIDE_COMBAT.has(potionId);
	if (state.phase.type !== "combat") return false;
	if (potionId === "SMOKE_BOMB") {
		if (getCurrentRoomType(state) === "boss") return false;
		return !state.combat.monsters.some((m) =>
			m.powers.some((p) => p.id.toUpperCase() === "BACK_ATTACK"),
		);
	}
	return true;
}

/** Outside combat there is no action queue: run the few actions those potions use directly. */
function runOutsideCombat(state: GameState, actions: Action[], events: GameEvent[]): GameState {
	let s = state;
	for (const a of actions) {
		if (a.type === "heal") s = executePlayerHeal(s, a.amount, events).state;
		else if (a.type === "gainMaxHp") s = executeGainMaxHp(s, a, events).state;
		else if (a.type === "custom") s = a.execute(s);
	}
	return s;
}

export function stepUsePotion(
	state: GameState,
	slot: number,
	targetIndex: number,
	events: GameEvent[],
): StepResult {
	const potionId = state.potions[slot];
	if (!potionId || !canUsePotion(state, potionId)) return { state, events };

	const def = getPotion(potionId);
	if (!def) return { state, events };

	const newPotions = [...state.potions];
	newPotions[slot] = null;
	let s: GameState = { ...state, potions: newPotions };
	events.push({ type: "potionUsed", potionId, slot });

	if (def.targeted && s.combat?.monsters[targetIndex]?.alive) {
		s = fireHook(s, { type: "player" }, "onTargetMonster", targetIndex); // Surrounded: turn around
	}

	const effectFn = getPotionEffect(potionId);
	if (effectFn) {
		const actions = potionPotency(s, effectFn(s, targetIndex));
		if (!s.combat) {
			s = runOutsideCombat(s, actions, events);
		} else {
			for (const action of actions) {
				if (!s.combat) break;
				s = { ...s, combat: addToBot(s.combat, action) };
			}
			({ state: s } = drainActions(s, events));
		}
	}

	return { state: fireRunHook(s, "onUsePotion", potionId), events };
}

// ── Discard potion ───────────────────────────────────────

export function stepDiscardPotion(state: GameState, slot: number, events: GameEvent[]): StepResult {
	const potionId = state.potions[slot];
	if (!potionId) return { state, events };

	const newPotions = [...state.potions];
	newPotions[slot] = null;
	events.push({ type: "potionDiscarded", potionId, slot });
	return { state: { ...state, potions: newPotions }, events };
}

// ── Pick up potion reward ────────────────────────────────

export function stepObtainPotionReward(state: GameState, events: GameEvent[]): StepResult {
	// Sozu: the reward stays on screen but cannot be taken.
	if (state.phase.type !== "reward" || !state.phase.potionReward || hasRelic(state, "SOZU")) {
		return { state, events };
	}
	const s = obtainPotion(state, state.phase.potionReward, events);
	return {
		state: { ...s, phase: { ...state.phase, potionReward: null } },
		events,
	};
}
