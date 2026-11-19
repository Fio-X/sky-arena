import { drainActions } from "../core/actionExecutor";
import { addToBot } from "../core/actionQueue";
import { foldHook } from "../core/hooks";
import type { CombatState, GameState, MonsterId, MonsterState, RngState } from "../core/types";
import { random, stsShuffle } from "../rng/stsRandom";
import { applyEncounterSetup } from "./encounterSetup";
import type { EncounterSlot } from "./encounters";
import {
	createMonster,
	emptySlot,
	pickGremlin,
	rollFirstIntent,
	withMinion,
} from "./monsterFactory";

/** createShapes pool (MonsterGroup.cpp:508): drawn without replacement, removal shifts left. */
const SHAPE_POOL = ["REPULSOR", "REPULSOR", "EXPLODER", "EXPLODER", "SPIKER", "SPIKER"];
/** getAncientShape (MonsterGroup.cpp:532): uniform, with replacement. */
const ANCIENT_SHAPES = ["SPIKER", "REPULSOR", "EXPLODER"];

/** Resolve random slots with miscRng, in slot order. */
export function resolveEncounterSlots(
	slots: readonly EncounterSlot[],
	rng: RngState,
): { ids: (MonsterId | null)[]; rng: RngState } {
	let miscRng = rng;
	const shapePool = [...SHAPE_POOL];
	const ids = slots.map((slot): MonsterId | null => {
		switch (slot) {
			case "EMPTY":
				return null;
			case "RANDOM_GREMLIN": {
				const pick = pickGremlin(miscRng);
				miscRng = pick.rng;
				return pick.id;
			}
			case "SHAPE_POOL": {
				const r = random(miscRng, shapePool.length - 1);
				miscRng = r.state;
				return shapePool.splice(r.value, 1)[0] as MonsterId;
			}
			case "RANDOM_SHAPE": {
				const r = random(miscRng, ANCIENT_SHAPES.length - 1);
				miscRng = r.state;
				return ANCIENT_SHAPES[r.value] as MonsterId;
			}
			default:
				return slot;
		}
	});
	return { ids, rng: miscRng };
}

/**
 * @param encounterId optional; enables per-encounter setup (e.g. JAW_WORM_HORDE
 * pre-buffs). Fights started from bare slot lists skip it.
 */
export function initCombat(
	state: GameState,
	slots: readonly EncounterSlot[],
	encounterId?: string,
): GameState {
	let hpRng = state.rng.monsterHpRng;
	const monsters: MonsterState[] = [];

	// Random picks first (miscRng), then HP rolls in slot order (monsterHpRng).
	const resolved = resolveEncounterSlots(slots, state.rng.miscRng);
	const ids = resolved.ids;
	const miscRng = resolved.rng;

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
	if (encounterId) s = applyEncounterSetup(s, encounterId);

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

	// gameHandSize: 5, adjusted by modifyDrawPerTurn (Snecko Eye +2 from turn 1).
	const draw = foldHook(s, { type: "player" }, "modifyDrawPerTurn", 5);
	s = draw.state;
	const count = Math.max(0, draw.value);
	s = { ...s, combat: addToBot(s.combat as CombatState, { type: "drawCards", count }) };
	const drained = drainActions(s, []);
	return drained.state;
}
