import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import powersJson from "../../../data-reference/powers.json";
import "../content/corePowers";
import "../content/monsterPowers";
import "../content/commonMonsterAi";
import "../content/jawWormAi";
import "../content/louseAi";
import "../content/slimeAi";
import "../content/simpleMonsterAi";
import "../content/eliteAi";
import "../content/bossAi";
import "../content/gremlinAi";
import { getCard, loadCards, loadMonsters, loadPowers } from "../content/loader";
import { step } from "../core/step";
import type { CardId, GameState } from "../core/types";
import { createAllStreams } from "../rng/stsRandom";
import { generateCardReward } from "./cardReward";
import { generateEncounterLists } from "./encounters";

function makeRunState(seed: bigint): GameState {
	const rng = createAllStreams(seed);
	const encResult = generateEncounterLists(rng.monsterRng);
	let uid = 1;
	const deck = [];
	for (let i = 0; i < 5; i++) {
		deck.push({
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
		deck.push({
			id: "DEFEND_RED" as CardId,
			uniqueId: uid++,
			upgraded: false,
			costOverride: null,
			costForTurn: 1,
			freeToPlay: false,
			misc: 0,
		});
	}
	deck.push({
		id: "BASH" as CardId,
		uniqueId: uid++,
		upgraded: false,
		costOverride: null,
		costForTurn: 2,
		freeToPlay: false,
		misc: 0,
	});

	return {
		seed,
		character: "IRONCLAD",
		ascension: 0,
		act: 1,
		floor: 1,
		gold: 99,
		maxHp: 80,
		currentHp: 80,
		potionSlots: 3,
		potions: [null, null, null],
		deck,
		relics: [],
		map: {
			nodes: Array.from({ length: 2 }, (_, y) =>
				Array.from({ length: 7 }, (_, x) => ({
					x,
					y,
					type: "monster" as const,
					edges: y < 1 ? [{ x, y: y + 1 }] : [],
				})),
			),
			currentNode: null,
			visitedNodes: [],
		},
		combat: null,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: encResult.lists,
		rng: { ...rng, monsterRng: encResult.rng },
		phase: { type: "map" },
	};
}

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadPowers(powersJson as never);
});

describe("generateCardReward", () => {
	it("returns 3 cards by default", () => {
		const state = makeRunState(42n);
		const result = generateCardReward(state);
		expect(result.cards.length).toBe(3);
	});

	it("returns valid Ironclad cards", () => {
		const state = makeRunState(1n);
		const result = generateCardReward(state);
		for (const cardId of result.cards) {
			const def = getCard(cardId);
			expect(def).toBeDefined();
			expect(def?.color).toBe("red");
			expect(["common", "uncommon", "rare"]).toContain(def?.rarity);
		}
	});

	it("returns no duplicates", () => {
		for (let seed = 1n; seed <= 20n; seed++) {
			const state = makeRunState(seed);
			const result = generateCardReward(state);
			const unique = new Set(result.cards);
			expect(unique.size).toBe(result.cards.length);
		}
	});

	it("advances rng state", () => {
		const state = makeRunState(10n);
		const result = generateCardReward(state);
		expect(result.rng).not.toEqual(state.rng.cardRng);
	});
});

describe("card reward in combat flow", () => {
	it("combat victory offers card rewards", () => {
		const state = makeRunState(42n);
		let result = step(state, { type: "chooseMapNode", x: 0, y: 0 });
		let s = result.state;

		if (s.combat) {
			const monsters = s.combat.monsters.map((m) => ({ ...m, currentHp: 1, maxHp: 1 }));
			s = { ...s, combat: { ...s.combat, monsters } };
		}

		const strikeIdx = s.combat?.hand.findIndex((c) => c.id === ("STRIKE_RED" as CardId));
		if (strikeIdx != null && strikeIdx >= 0) {
			result = step(s, { type: "playCard", handIndex: strikeIdx, targetIndex: 0 });
			expect(result.state.phase.type).toBe("reward");
			if (result.state.phase.type === "reward") {
				expect(result.state.phase.cardRewards.length).toBe(3);
			}
			const offered = result.events.find((e) => e.type === "cardRewardOffered");
			expect(offered).toBeDefined();
		}
	});

	it("chooseCardReward adds card to deck and returns to map", () => {
		const state = makeRunState(42n);
		let result = step(state, { type: "chooseMapNode", x: 0, y: 0 });
		let s = result.state;

		if (s.combat) {
			const monsters = s.combat.monsters.map((m) => ({ ...m, currentHp: 1, maxHp: 1 }));
			s = { ...s, combat: { ...s.combat, monsters } };
		}

		const strikeIdx = s.combat?.hand.findIndex((c) => c.id === ("STRIKE_RED" as CardId));
		if (strikeIdx != null && strikeIdx >= 0) {
			result = step(s, { type: "playCard", handIndex: strikeIdx, targetIndex: 0 });
			s = result.state;

			if (s.phase.type === "reward" && s.phase.cardRewards.length > 0) {
				const chosenCard = s.phase.cardRewards[0];
				const deckSizeBefore = s.deck.length;
				result = step(s, { type: "chooseCardReward", index: 0 });
				expect(result.state.phase.type).toBe("map");
				expect(result.state.deck.length).toBe(deckSizeBefore + 1);
				expect(result.state.deck[result.state.deck.length - 1]?.id).toBe(chosenCard);
				expect(result.state.combat).toBeNull();
			}
		}
	});

	it("skipCardReward returns to map without adding card", () => {
		const state = makeRunState(42n);
		let result = step(state, { type: "chooseMapNode", x: 0, y: 0 });
		let s = result.state;

		if (s.combat) {
			const monsters = s.combat.monsters.map((m) => ({ ...m, currentHp: 1, maxHp: 1 }));
			s = { ...s, combat: { ...s.combat, monsters } };
		}

		const strikeIdx = s.combat?.hand.findIndex((c) => c.id === ("STRIKE_RED" as CardId));
		if (strikeIdx != null && strikeIdx >= 0) {
			result = step(s, { type: "playCard", handIndex: strikeIdx, targetIndex: 0 });
			s = result.state;

			const deckSizeBefore = s.deck.length;
			result = step(s, { type: "skipCardReward" });
			expect(result.state.phase.type).toBe("map");
			expect(result.state.deck.length).toBe(deckSizeBefore);
			expect(result.state.combat).toBeNull();
		}
	});
});
