import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import eventsJson from "../../../data-reference/events.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import potionsJson from "../../../data-reference/potions.json";
import relicsJson from "../../../data-reference/relics.json";
import "../content/corePowers";
import "../content/potionEffects";
import "../content/relicHooks";
import { loadCards, loadMonsters, loadPotions, loadRelics } from "../content/loader";
import { loadEvents, pickEvent, stepChooseEventOption } from "./event";
import { initPotionPool } from "./potion";
import { makeState } from "./testHelpers";

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadRelics(relicsJson as never);
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
	loadEvents(eventsJson as never);
});

describe("pickEvent", () => {
	it("returns a valid event id", () => {
		const state = makeState(null);
		const result = pickEvent(state.rng.eventRng);
		expect(result.eventId).toBeTruthy();
		expect(typeof result.eventId).toBe("string");
	});
});

describe("BIG_FISH event", () => {
	it("option 0 heals 33% maxHp", () => {
		const state = {
			...makeState(null),
			currentHp: 50,
			maxHp: 80,
			phase: { type: "event" as const, eventId: "BIG_FISH" },
		};
		const events: never[] = [];
		const result = stepChooseEventOption(state, 0, events);
		// floor(80 * 0.3333) = 26
		expect(result.state.currentHp).toBe(76);
		expect(result.state.phase.type).toBe("map");
	});

	it("option 1 gains 5 maxHp", () => {
		const state = {
			...makeState(null),
			currentHp: 80,
			maxHp: 80,
			phase: { type: "event" as const, eventId: "BIG_FISH" },
		};
		const result = stepChooseEventOption(state, 1, []);
		expect(result.state.maxHp).toBe(85);
		expect(result.state.currentHp).toBe(85);
	});

	it("option 2 adds a curse", () => {
		const state = {
			...makeState(null),
			phase: { type: "event" as const, eventId: "BIG_FISH" },
		};
		const deckSize = state.deck.length;
		const result = stepChooseEventOption(state, 2, []);
		// Should add both relic and curse
		expect(result.state.deck.length).toBe(deckSize + 1);
		expect(result.state.deck.some((c) => (c.id as string) === "REGRET")).toBe(true);
		expect(result.state.relics.length).toBeGreaterThan(state.relics.length);
	});
});

describe("GOLDEN_SHRINE event", () => {
	it("option 0 gives gold", () => {
		const state = {
			...makeState(null),
			gold: 100,
			phase: { type: "event" as const, eventId: "GOLDEN_SHRINE" },
		};
		const result = stepChooseEventOption(state, 0, []);
		expect(result.state.gold).toBeGreaterThan(100);
		expect(result.state.phase.type).toBe("map");
	});
});

describe("UPGRADE_SHRINE event", () => {
	it("option 0 upgrades a card", () => {
		const state = {
			...makeState(null),
			phase: { type: "event" as const, eventId: "UPGRADE_SHRINE" },
		};
		// makeState has an empty deck, need a card
		const withDeck = {
			...state,
			deck: [
				{
					id: "STRIKE_RED" as never,
					uniqueId: 1,
					upgraded: false,
					costOverride: null,
					costForTurn: 1,
					freeToPlay: false,
					misc: 0,
				},
			],
		};
		const result = stepChooseEventOption(withDeck, 0, []);
		expect(result.state.deck[0]?.upgraded).toBe(true);
	});
});
