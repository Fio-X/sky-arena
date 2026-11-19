import { create } from "zustand";
import cardsJson from "../../data-reference/cards.json";
import eventsJson from "../../data-reference/events.json";
import monstersAct1Json from "../../data-reference/monsters-act1.json";
import monstersAct2Json from "../../data-reference/monsters-act2.json";
import monstersAct34Json from "../../data-reference/monsters-act34.json";
import potionsJson from "../../data-reference/potions.json";
import powersJson from "../../data-reference/powers.json";
import relicsJson from "../../data-reference/relics.json";
import { generateEncounterLists } from "../engine/combat/encounters";
import "../engine/content";
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
	loadMonsters(monstersAct2Json as never);
	loadMonsters(monstersAct34Json.monsters as never);
	loadPowers(powersJson as never);
	loadRelics(relicsJson as never);
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
	loadEvents(eventsJson as never);
	contentLoaded = true;
}

function makeCard(id: string, uid: number, cost = 1): GameState["deck"][0] {
	return {
		id: id as CardId,
		uniqueId: uid,
		upgraded: false,
		costOverride: null,
		costForTurn: cost,
		freeToPlay: false,
		misc: 0,
	};
}

function makeStarterDeck(character: GameState["character"]): GameState["deck"] {
	let uid = 1;
	if (character === "SILENT") {
		const cards: GameState["deck"] = [];
		for (let i = 0; i < 5; i++) cards.push(makeCard("STRIKE_GREEN", uid++));
		for (let i = 0; i < 5; i++) cards.push(makeCard("DEFEND_GREEN", uid++));
		cards.push(makeCard("SURVIVOR", uid++));
		cards.push(makeCard("NEUTRALIZE", uid++, 0));
		return cards;
	}
	if (character === "DEFECT") {
		const cards: GameState["deck"] = [];
		for (let i = 0; i < 4; i++) cards.push(makeCard("STRIKE_BLUE", uid++));
		for (let i = 0; i < 4; i++) cards.push(makeCard("DEFEND_BLUE", uid++));
		cards.push(makeCard("ZAP", uid++));
		cards.push(makeCard("DUALCAST", uid++));
		return cards;
	}
	if (character === "WATCHER") {
		const cards: GameState["deck"] = [];
		for (let i = 0; i < 4; i++) cards.push(makeCard("STRIKE_PURPLE", uid++));
		for (let i = 0; i < 4; i++) cards.push(makeCard("DEFEND_PURPLE", uid++));
		cards.push(makeCard("ERUPTION", uid++, 2));
		cards.push(makeCard("VIGILANCE", uid++, 2));
		return cards;
	}
	const cards: GameState["deck"] = [];
	for (let i = 0; i < 5; i++) cards.push(makeCard("STRIKE_RED", uid++));
	for (let i = 0; i < 4; i++) cards.push(makeCard("DEFEND_RED", uid++));
	cards.push(makeCard("BASH", uid++, 2));
	return cards;
}

function getStartingStats(character: GameState["character"]) {
	if (character === "SILENT") return { maxHp: 70, relic: "RING_OF_THE_SNAKE" as RelicId };
	if (character === "DEFECT") return { maxHp: 75, relic: "CRACKED_CORE" as RelicId };
	if (character === "WATCHER") return { maxHp: 72, relic: "PURE_WATER" as RelicId };
	return { maxHp: 80, relic: "BURNING_BLOOD" as RelicId };
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
		const stats = getStartingStats(character);

		const state: GameState = {
			seed,
			character,
			ascension: 0,
			act: 1,
			floor: 0,
			gold: 99,
			maxHp: stats.maxHp,
			currentHp: stats.maxHp,
			potionSlots: 3,
			potions: [null, null, null],
			deck: makeStarterDeck(character),
			relics: [{ id: stats.relic, counter: 0 }],
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
