import { drainActions } from "../core/actionExecutor";
import { addToBot } from "../core/actionQueue";
import type { CombatState, GameState, MonsterId, MonsterState } from "../core/types";
import { stsShuffle } from "../rng/stsRandom";
import type { EncounterSlot } from "./encounters";
import {
	createMonster,
	emptySlot,
	pickGremlin,
	rollFirstIntent,
	withMinion,
} from "./monsterFactory";

export function initCombat(state: GameState, slots: readonly EncounterSlot[]): GameState {
	let hpRng = state.rng.monsterHpRng;
	let miscRng = state.rng.miscRng;
	const monsters: MonsterState[] = [];

	// Random picks first (miscRng), then HP rolls in slot order (monsterHpRng).
	const ids: (MonsterId | null)[] = slots.map((slot) => {
		if (slot === "EMPTY") return null;
		if (slot !== "RANDOM_GREMLIN") return slot;
		const pick = pickGremlin(miscRng);
		miscRng = pick.rng;
		return pick.id;
	});

	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];
		const created = id ? createMonster(id, i, state.ascension, hpRng) : null;
		if (!created) {
			monsters.push(emptySlot(i));
			continue;
		}
		hpRng = created.rng;
		const isGremlinMinion = slots[i] === "RANDOM_GREMLIN";
		monsters.push(isGremlinMinion ? withMinion(created.monster) : created.monster);
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
		cardsDiscardedThisTurn: 0,
		lightningChanneled: 0,
		frostChanneled: 0,
	};

	let s: GameState = {
		...state,
		combat,
		rng: { ...state.rng, monsterHpRng: hpRng, miscRng },
		phase: { type: "combat", turn: 1 },
	};

	for (let i = 0; i < monsters.length; i++) {
		s = rollFirstIntent(s, i);
	}

	return shuffleAndDraw(s);
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
