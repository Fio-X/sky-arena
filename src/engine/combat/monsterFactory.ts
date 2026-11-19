/**
 * Monster construction shared by combat start (initCombat) and mid-combat
 * summons (spawnMonster). Kept free of actionExecutor imports so the executor
 * can use it without an import cycle.
 */
import { getMonster } from "../content/loader";
import { getMonsterAi } from "../content/monsterAi";
import { canonicalPowerId } from "../core/hooks";
import type {
	GameState,
	MonsterId,
	MonsterMoveId,
	MonsterState,
	PowerInstance,
	RngState,
} from "../core/types";
import { random } from "../rng/stsRandom";
import { buildIntent, rollMonsterMiscInfo } from "./monsterTurn";

export const EMPTY_SLOT = "EMPTY" as MonsterId;

/** getGremlin pool (MonsterGroup.cpp:541-553): uniform over 8 entries. */
export const GREMLIN_POOL = [
	"MAD_GREMLIN",
	"MAD_GREMLIN",
	"SNEAKY_GREMLIN",
	"SNEAKY_GREMLIN",
	"FAT_GREMLIN",
	"FAT_GREMLIN",
	"SHIELD_GREMLIN",
	"GREMLIN_WIZARD",
] as const;

export function pickGremlin(rng: RngState): { id: MonsterId; rng: RngState } {
	const r = random(rng, GREMLIN_POOL.length - 1);
	return { id: (GREMLIN_POOL[r.value] ?? "MAD_GREMLIN") as MonsterId, rng: r.state };
}

/**
 * monsterHpRng parity quirks from the reference specs:
 * - fixed: initHp makes no roll
 * - burnFirst: one extra roll (range) is consumed and discarded before the real roll
 * - rollTwice: the HP range is rolled twice and the second value kept
 */
const HP_QUIRKS: Record<string, { fixed?: true; burnFirst?: [number, number]; rollTwice?: true }> =
	{
		SPHERIC_GUARDIAN: { fixed: true },
		TASKMASTER: { burnFirst: [54, 60] },
		BRONZE_ORB: { burnFirst: [52, 58] },
		TORCH_HEAD: { rollTwice: true }, // construct + initHp again; the second roll is kept
		// Act 3 (monsters-act34.json notes.hpRolls)
		ORB_WALKER: { burnFirst: [90, 96] },
		REPTOMANCER: { burnFirst: [180, 190] },
		THE_MAW: { fixed: true },
		TRANSIENT: { fixed: true },
	};

/**
 * Construction-time roll stored in miscInfo, made with monsterHpRng right after
 * the HP roll (Darkling's Nip damage). Without one, the first ranged-damage
 * move in the data is rolled (Louse BITE).
 */
export type MiscRoll = (ascension: number, rng: RngState) => { miscInfo: number; rng: RngState };

const miscRolls = new Map<string, MiscRoll>();

export function registerMiscRoll(monsterId: string, fn: MiscRoll): void {
	miscRolls.set(monsterId, fn);
}

/** Monster state that starts at a value other than the pre-rolled damage (miscInfo). */
const INITIAL_MISC_INFO: Record<string, number> = {
	BOOK_OF_STABBING: 1, // stabCount
};

interface PrebattleEntry {
	readonly power: string;
	readonly amount: number | [number, number] | null;
	readonly asc?: Record<string, number | [number, number]>;
}

export function emptySlot(index: number): MonsterState {
	return {
		id: EMPTY_SLOT,
		index,
		maxHp: 0,
		currentHp: 0,
		block: 0,
		powers: [],
		intent: blankIntent(),
		moveHistory: [],
		alive: false,
		halfDead: false,
		miscInfo: 0,
	};
}

export function createMonster(
	id: MonsterId,
	index: number,
	ascension: number,
	rng: RngState,
): { monster: MonsterState; rng: RngState } | null {
	const def = getMonster(id);
	if (!def) return null;

	const hp = rollHp(id, ascension >= def.hp.ascLevel ? def.hp.asc : def.hp.base, rng);
	let nextRng = hp.rng;

	const miscRoll = (miscRolls.get(id) ?? ((asc, r) => rollMonsterMiscInfo(id, asc, r)))(
		ascension,
		nextRng,
	);
	nextRng = miscRoll.rng;

	const pre = resolvePrebattle((def.prebattle ?? []) as PrebattleEntry[], ascension, nextRng);
	nextRng = pre.rng;

	return {
		monster: {
			id,
			index,
			maxHp: hp.value,
			currentHp: hp.value,
			block: pre.block,
			powers: pre.powers,
			intent: blankIntent(),
			moveHistory: [],
			alive: true,
			halfDead: false,
			miscInfo: INITIAL_MISC_INFO[id] ?? miscRoll.miscInfo,
		},
		rng: nextRng,
	};
}

function rollHp(
	id: string,
	range: [number, number],
	rng: RngState,
): { value: number; rng: RngState } {
	const quirk = HP_QUIRKS[id];
	if (quirk?.fixed) return { value: range[0], rng };
	let r = rng;
	if (quirk?.burnFirst) r = rollRange(r, quirk.burnFirst[0], quirk.burnFirst[1]).rng;
	if (quirk?.rollTwice) r = rollRange(r, range[0], range[1]).rng;
	return rollRange(r, range[0], range[1]);
}

function resolvePrebattle(
	entries: PrebattleEntry[],
	ascension: number,
	rng: RngState,
): { powers: PowerInstance[]; block: number; rng: RngState } {
	const powers: PowerInstance[] = [];
	let block = 0;
	let nextRng = rng;

	for (const entry of entries) {
		// Powers without a stack count (Barricade, Minion, Painful Stabs…) get 1.
		const resolved =
			entry.amount == null ? { value: 1, rng: nextRng } : resolveAmount(entry, ascension, nextRng);
		nextRng = resolved.rng;
		if (entry.power === "BLOCK") {
			block += resolved.value;
			continue;
		}
		powers.push({ id: canonicalPowerId(entry.power), amount: resolved.value, justApplied: false });
	}

	return { powers, block, rng: nextRng };
}

function resolveAmount(
	entry: PrebattleEntry,
	ascension: number,
	rng: RngState,
): { value: number; rng: RngState } {
	let amount = entry.amount as number | [number, number];
	for (const [threshold, override] of Object.entries(entry.asc ?? {})) {
		if (ascension >= Number(threshold)) amount = override;
	}
	return Array.isArray(amount) ? rollRange(rng, amount[0], amount[1]) : { value: amount, rng };
}

/** Roll a monster's first move (aiRng) and set its intent. No-op for dead slots. */
export function rollFirstIntent(state: GameState, monsterIndex: number): GameState {
	const combat = state.combat;
	const monster = combat?.monsters[monsterIndex];
	if (!combat || !monster?.alive) return state;

	const aiFn = getMonsterAi(monster.id);
	if (!aiFn) return state;

	const result = aiFn({ state, monsterIndex, aiRng: state.rng.aiRng });
	const updated: MonsterState = {
		...monster,
		miscInfo: result.miscInfo ?? monster.miscInfo,
	};
	const monsters = [...combat.monsters];
	monsters[monsterIndex] = {
		...updated,
		intent: buildIntent(updated, result.moveId, state.ascension, state.currentHp),
	};

	return {
		...state,
		combat: { ...combat, monsters },
		rng: { ...state.rng, aiRng: result.aiRng },
	};
}

function blankIntent(): MonsterState["intent"] {
	return {
		moveId: "" as MonsterMoveId,
		baseDamage: null,
		hits: 1,
		isAttack: false,
		isDebuff: false,
		isBuff: false,
	};
}

function rollRange(rng: RngState, min: number, max: number): { value: number; rng: RngState } {
	const roll = random(rng, max - min);
	return { value: min + roll.value, rng: roll.state };
}

/** Mark as a minion; no-op if its data already gives MINION (Torch Head, Bronze Orb). */
export function withMinion(m: MonsterState): MonsterState {
	if (m.powers.some((p) => p.id.toUpperCase() === "MINION")) return m;
	return {
		...m,
		powers: [...m.powers, { id: canonicalPowerId("MINION"), amount: 1, justApplied: false }],
	};
}
