import type {
	CardId,
	CardInstance,
	CombatState,
	GameState,
	MonsterId,
	MonsterMoveId,
	RngState,
	StepResult,
} from "./types";

export const NULL_RNG: RngState = { seed0: 0n, seed1: 1n, counter: 0 };

export function makeStrike(): CardInstance {
	return {
		id: "STRIKE_RED" as CardId,
		uniqueId: 1,
		upgraded: false,
		costOverride: null,
		costForTurn: 1,
		freeToPlay: false,
		misc: 0,
	};
}

export function makeDefend(): CardInstance {
	return {
		id: "DEFEND_RED" as CardId,
		uniqueId: 2,
		upgraded: false,
		costOverride: null,
		costForTurn: 1,
		freeToPlay: false,
		misc: 0,
	};
}

export function makeCombat(overrides: Partial<CombatState> = {}): CombatState {
	return {
		turn: 1,
		player: { block: 0, powers: [], stance: "neutral", orbs: [], orbSlots: 3 },
		monsters: [
			{
				id: "JAW_WORM" as MonsterId,
				index: 0,
				maxHp: 44,
				currentHp: 44,
				block: 0,
				powers: [],
				intent: {
					moveId: "chomp" as MonsterMoveId,
					baseDamage: 11,
					hits: 1,
					isAttack: true,
					isDebuff: false,
					isBuff: false,
				},
				moveHistory: [],
				alive: true,
				halfDead: false,
				miscInfo: 0,
			},
		],
		drawPile: [],
		hand: [makeStrike()],
		discardPile: [],
		exhaustPile: [],
		energy: 3,
		maxEnergy: 3,
		actionQueue: [],
		cardQueue: [],
		cardsPlayedThisTurn: 0,
		cardsDiscardedThisTurn: 0,
		lightningChanneled: 0,
		frostChanneled: 0,
		...overrides,
	};
}

export function makeState(combat: CombatState | null): GameState {
	return {
		seed: 1n,
		character: "IRONCLAD",
		ascension: 0,
		act: 1,
		floor: 1,
		gold: 99,
		maxHp: 80,
		currentHp: 80,
		potionSlots: 3,
		potions: [null, null, null],
		deck: [],
		relics: [],
		map: { nodes: [], currentNode: null, visitedNodes: [] },
		combat,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: { weak: [], strong: [], elites: [], boss: "" },
		rng: {
			cardRng: NULL_RNG,
			relicRng: NULL_RNG,
			potionRng: NULL_RNG,
			monsterRng: NULL_RNG,
			eventRng: NULL_RNG,
			merchantRng: NULL_RNG,
			treasureRng: NULL_RNG,
			mapRng: NULL_RNG,
			neowRng: NULL_RNG,
			miscRng: NULL_RNG,
			shuffleRng: NULL_RNG,
			cardRandomRng: NULL_RNG,
			aiRng: NULL_RNG,
			monsterHpRng: NULL_RNG,
		},
		phase: { type: "combat", turn: 1 },
	};
}

export function getCombat(result: StepResult): CombatState {
	const c = result.state.combat;
	if (!c) throw new Error("Expected combat state");
	return c;
}

export function at<T>(arr: readonly T[], i: number): T {
	const v = arr[i];
	if (v === undefined) throw new Error(`Expected element at index ${i}`);
	return v;
}

export function baseMonster() {
	return at(makeCombat().monsters, 0);
}

export function makeCards(n: number, prefix: string): CardInstance[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `${prefix}_${i}` as CardId,
		uniqueId: 100 + i,
		upgraded: false,
		costOverride: null,
		costForTurn: 1,
		freeToPlay: false,
		misc: 0,
	}));
}
