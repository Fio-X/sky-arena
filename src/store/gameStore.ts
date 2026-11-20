import { create } from "zustand";
import cardsJson from "../../data-reference/cards.json";
import eventsJson from "../../data-reference/events.json";
import monstersAct1Json from "../../data-reference/monsters-act1.json";
import monstersAct2Json from "../../data-reference/monsters-act2.json";
import monstersAct34Json from "../../data-reference/monsters-act34.json";
import potionsJson from "../../data-reference/potions.json";
import powersJson from "../../data-reference/powers.json";
import relicsJson from "../../data-reference/relics.json";
import "../engine/content";
import {
	loadCards,
	loadMonsters,
	loadPotions,
	loadPowers,
	loadRelics,
} from "../engine/content/loader";
import { loadEvents } from "../engine/core/event";
import { createRun } from "../engine/core/newRun";
import { initPotionPool } from "../engine/core/potion";
import { step } from "../engine/core/step";
import type { Command, GameEvent, GameState } from "../engine/core/types";

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

interface GameStore {
	state: GameState | null;
	events: GameEvent[];
	history: GameState[];

	startGame: (seed: bigint, character: GameState["character"], ascension?: number) => void;
	dispatch: (command: Command) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
	state: null,
	events: [],
	history: [],

	startGame: (seed, character, ascension = 0) => {
		ensureContent();
		const state = createRun(seed, character, ascension);
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
