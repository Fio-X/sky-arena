import { getMonster } from "../content/loader";
import type { MonsterAiContext } from "../content/monsterAi";
import { getMonsterAi } from "../content/monsterAi";
import { drainActions } from "../core/actionExecutor";
import { addToBot } from "../core/actionQueue";
import type {
	CombatState,
	GameState,
	MonsterId,
	MonsterMoveId,
	MonsterState,
	PowerId,
	PowerInstance,
	RngState,
} from "../core/types";
import { random, stsShuffle } from "../rng/stsRandom";
import { rollMonsterMiscInfo } from "./monsterTurn";

interface PrebattlePower {
	readonly power: string;
	readonly amount: number | [number, number] | null;
	readonly asc?: Record<string, number | [number, number]>;
}

export function initCombat(state: GameState, monsterIds: MonsterId[]): GameState {
	let hpRng = state.rng.monsterHpRng;
	const monsters: MonsterState[] = [];

	for (let i = 0; i < monsterIds.length; i++) {
		const id = monsterIds[i];
		if (!id) continue;
		const result = createMonster(id, i, state.ascension, hpRng);
		if (!result) continue;
		monsters.push(result.monster);
		hpRng = result.rng;
	}

	const combat: CombatState = {
		turn: 1,
		player: { block: 0, powers: [], stance: "neutral", orbs: [], orbSlots: 3 },
		monsters,
		drawPile: [],
		hand: [],
		discardPile: [],
		exhaustPile: [],
		energy: 3,
		maxEnergy: 3,
		actionQueue: [],
		cardQueue: [],
		cardsPlayedThisTurn: 0,
	};

	let s: GameState = {
		...state,
		combat,
		rng: { ...state.rng, monsterHpRng: hpRng },
		phase: { type: "combat", turn: 1 },
	};

	for (let i = 0; i < monsters.length; i++) {
		s = rollFirstIntent(s, i);
	}

	s = shuffleAndDraw(s);
	return s;
}

function createMonster(
	id: MonsterId,
	index: number,
	ascension: number,
	rng: RngState,
): { monster: MonsterState; rng: RngState } | null {
	const def = getMonster(id);
	if (!def) return null;

	const hpRange = ascension >= def.hp.ascLevel ? def.hp.asc : def.hp.base;
	const hpRoll = rollRange(rng, hpRange[0], hpRange[1]);
	let nextRng = hpRoll.rng;

	const miscRoll = rollMonsterMiscInfo(id, ascension, nextRng);
	nextRng = miscRoll.rng;

	const prebattle = (def.prebattle ?? []) as PrebattlePower[];
	const powersResult = resolvePrebattlePowers(prebattle, ascension, nextRng);
	nextRng = powersResult.rng;

	return {
		monster: {
			id,
			index,
			maxHp: hpRoll.value,
			currentHp: hpRoll.value,
			block: 0,
			powers: powersResult.powers,
			intent: {
				moveId: "" as MonsterMoveId,
				baseDamage: null,
				hits: 1,
				isAttack: false,
				isDebuff: false,
				isBuff: false,
			},
			moveHistory: [],
			alive: true,
			halfDead: false,
			miscInfo: miscRoll.miscInfo,
		},
		rng: nextRng,
	};
}

function resolvePrebattlePowers(
	prebattle: PrebattlePower[],
	ascension: number,
	rng: RngState,
): { powers: PowerInstance[]; rng: RngState } {
	const powers: PowerInstance[] = [];
	let nextRng = rng;

	for (const pb of prebattle) {
		if (pb.amount == null) continue;
		const resolved = resolvePrebattleAmount(pb, ascension, nextRng);
		nextRng = resolved.rng;
		powers.push({
			id: pb.power.toLowerCase() as PowerId,
			amount: resolved.value,
			justApplied: false,
		});
	}

	return { powers, rng: nextRng };
}

function resolvePrebattleAmount(
	pb: PrebattlePower,
	ascension: number,
	rng: RngState,
): { value: number; rng: RngState } {
	if (Array.isArray(pb.amount)) {
		let range = pb.amount as [number, number];
		if (pb.asc) {
			for (const [threshold, override] of Object.entries(pb.asc)) {
				if (ascension >= Number(threshold)) {
					range = override as [number, number];
				}
			}
		}
		return rollRange(rng, range[0], range[1]);
	}

	let amt = pb.amount as number;
	if (pb.asc) {
		for (const [threshold, override] of Object.entries(pb.asc)) {
			if (ascension >= Number(threshold)) {
				amt = override as number;
			}
		}
	}
	return { value: amt, rng };
}

function rollFirstIntent(state: GameState, monsterIndex: number): GameState {
	const combat = state.combat;
	if (!combat) return state;
	const monster = combat.monsters[monsterIndex];
	if (!monster) return state;

	const aiFn = getMonsterAi(monster.id);
	if (!aiFn) return state;

	const ctx: MonsterAiContext = { state, monsterIndex, aiRng: state.rng.aiRng };
	const result = aiFn(ctx);

	const def = getMonster(monster.id);
	const moveDef = def?.moves[result.moveId as string];
	const intent = (moveDef?.intent ?? "").toUpperCase();

	let baseDamage: number | null = null;
	if (moveDef?.damage != null) {
		baseDamage = Array.isArray(moveDef.damage) ? monster.miscInfo : (moveDef.damage as number);
	}
	const hits = typeof moveDef?.hits === "number" ? moveDef.hits : 1;

	const monsters = [...combat.monsters];
	monsters[monsterIndex] = {
		...monster,
		intent: {
			moveId: result.moveId,
			baseDamage,
			hits,
			isAttack: intent.includes("ATTACK"),
			isDebuff: intent.includes("DEBUFF"),
			isBuff: intent.includes("BUFF"),
		},
	};

	return {
		...state,
		combat: { ...combat, monsters },
		rng: { ...state.rng, aiRng: result.aiRng },
	};
}

function shuffleAndDraw(state: GameState): GameState {
	const combat = state.combat;
	if (!combat) return state;

	const shuffled = stsShuffle([...state.deck], state.rng.shuffleRng);

	let s: GameState = {
		...state,
		combat: { ...combat, drawPile: shuffled.result },
		rng: { ...state.rng, shuffleRng: shuffled.rng },
	};

	s = { ...s, combat: addToBot(s.combat as CombatState, { type: "drawCards", count: 5 }) };
	const drained = drainActions(s, []);
	return drained.state;
}

function rollRange(rng: RngState, min: number, max: number): { value: number; rng: RngState } {
	const roll = random(rng, max - min);
	return { value: min + roll.value, rng: roll.state };
}
