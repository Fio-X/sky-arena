import { create } from "zustand";
import cardsJson from "../../data-reference/cards.json";
import eventsJson from "../../data-reference/events.json";
import monstersAct1Json from "../../data-reference/monsters-act1.json";
import potionsJson from "../../data-reference/potions.json";
import powersJson from "../../data-reference/powers.json";
import relicsJson from "../../data-reference/relics.json";
import { generateEncounterLists } from "../engine/combat/encounters";
import "../engine/content/corePowers";
import "../engine/content/monsterPowers";
import "../engine/content/commonMonsterAi";
import "../engine/content/jawWormAi";
import "../engine/content/louseAi";
import "../engine/content/slimeAi";
import "../engine/content/simpleMonsterAi";
import "../engine/content/eliteAi";
import "../engine/content/bossAi";
import "../engine/content/gremlinAi";
import "../engine/content/ironcladCards";
import "../engine/content/potionEffects";
import "../engine/content/relicHooks";
import {
	loadCards,
	loadMonsters,
	loadPotions,
	loadPowers,
	loadRelics,
} from "../engine/content/loader";
import { loadEvents } from "../engine/core/event";
import { initPotionPool } from "../engine/core/potion";
import { step } from "../engine/core/step";
import type { CardId, Command, GameEvent, GameState, RelicId } from "../engine/core/types";
import { generateMap } from "../engine/map/generate";
import { createAllStreams } from "../engine/rng/stsRandom";

let contentLoaded = false;
function ensureContent() {
	if (contentLoaded) return;
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadPowers(powersJson as never);
	loadRelics(relicsJson as never);
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
	loadEvents(eventsJson as never);
	contentLoaded = true;
}

function makeStarterDeck(): GameState["deck"] {
	let uid = 1;
	const cards: GameState["deck"] = [];
	for (let i = 0; i < 5; i++) {
		cards.push({
			id: "STRIKE_RED" as CardId,
			uniqueId: uid++,
			upgraded: false,
			costOverride: null,
			costForTurn: 1,
			freeToPlay: false,
			misc: 0,
		});
	}
	for (let i = 0; i < 4; i++) {
		cards.push({
			id: "DEFEND_RED" as CardId,
			uniqueId: uid++,
			upgraded: false,
			costOverride: null,
			costForTurn: 1,
			freeToPlay: false,
			misc: 0,
		});
	}
	cards.push({
		id: "BASH" as CardId,
		uniqueId: uid++,
		upgraded: false,
		costOverride: null,
		costForTurn: 2,
		freeToPlay: false,
		misc: 0,
	});
	return cards;
}

interface GameStore {
	state: GameState | null;
	events: GameEvent[];
	history: GameState[];

	startGame: (seed: bigint, character: GameState["character"]) => void;
	dispatch: (command: Command) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
	state: null,
	events: [],
	history: [],

	startGame: (seed, character) => {
		ensureContent();
		const rng = createAllStreams(seed);
		const encResult = generateEncounterLists(rng.monsterRng);
		const map = generateMap(seed, 1);

		const state: GameState = {
			seed,
			character,
			ascension: 0,
			act: 1,
			floor: 0,
			gold: 99,
			maxHp: 80,
			currentHp: 80,
			potionSlots: 3,
			potions: [null, null, null],
			deck: makeStarterDeck(),
			relics: [{ id: "BURNING_BLOOD" as RelicId, counter: 0 }],
			map,
			combat: null,
			encounterIndex: { weak: 0, strong: 0, elite: 0 },
			encounterLists: encResult.lists,
			rng: { ...rng, monsterRng: encResult.rng },
			phase: { type: "neow" },
		};

		set({ state, events: [], history: [] });
	},

	dispatch: (command) => {
		const { state } = get();
		if (!state) return;

		const result = step(state, command);
		set({
			state: result.state,
			events: result.events,
			history: [...get().history, state],
		});
	},
}));

if (import.meta.env.DEV) {
	(window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}
