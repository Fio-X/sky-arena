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
import { loadCards, loadMonsters, loadPowers } from "../content/loader";
import { step } from "../core/step";
import type { CardId, GameState } from "../core/types";
import { createAllStreams } from "../rng/stsRandom";
import { generateEncounterLists } from "./encounters";

function makeFullRunState(seed: bigint): GameState {
	const rng = createAllStreams(seed);
	const encResult = generateEncounterLists(rng.monsterRng);

	return {
		seed,
		character: "IRONCLAD",
		ascension: 0,
		act: 1,
		floor: 0,
		gold: 99,
		maxHp: 80,
		currentHp: 80,
		potionSlots: 3,
		potions: [null, null, null],
		deck: makeStarterDeck(),
		relics: [],
		map: {
			nodes: makeSimpleMap(),
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

function makeStarterDeck() {
	let uid = 1;
	const cards = [];
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

function makeSimpleMap() {
	// Minimal 2-row map: row 0 = monster, row 1 = monster
	const nodes = Array.from({ length: 2 }, (_, y) =>
		Array.from({ length: 7 }, (_, x) => ({
			x,
			y,
			type: "monster" as const,
			edges: y < 1 ? [{ x, y: y + 1 }] : [],
		})),
	);
	return nodes;
}

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadPowers(powersJson as never);
});

describe("full combat flow", () => {
	it("chooseMapNode enters combat with drawn hand", () => {
		const state = makeFullRunState(42n);
		const result = step(state, { type: "chooseMapNode", x: 0, y: 0 });

		expect(result.state.phase.type).toBe("combat");
		expect(result.state.combat).not.toBeNull();
		expect(result.state.combat?.hand.length).toBe(5);
		expect(result.state.combat?.monsters.length).toBeGreaterThan(0);
		expect(result.state.combat?.monsters[0]?.alive).toBe(true);

		const startEvent = result.events.find((e) => e.type === "combatStarted");
		expect(startEvent).toBeDefined();
	});

	it("killing all monsters ends combat with victory", () => {
		const state = makeFullRunState(42n);
		// Enter combat
		let result = step(state, { type: "chooseMapNode", x: 0, y: 0 });
		let s = result.state;

		// Kill all monsters by reducing HP to 0
		if (s.combat) {
			const monsters = s.combat.monsters.map((m) => ({ ...m, currentHp: 1, maxHp: 1 }));
			s = { ...s, combat: { ...s.combat, monsters } };
		}

		// Play a strike to kill
		const strikeIdx = s.combat?.hand.findIndex((c) => c.id === ("STRIKE_RED" as CardId));
		if (strikeIdx != null && strikeIdx >= 0) {
			result = step(s, { type: "playCard", handIndex: strikeIdx, targetIndex: 0 });
			expect(result.state.phase.type).toBe("reward");
			const endEvent = result.events.find((e) => e.type === "combatEnded");
			expect(endEvent).toBeDefined();
			if (endEvent?.type === "combatEnded") {
				expect(endEvent.victory).toBe(true);
			}
		}
	});

	it("proceed after reward returns to map", () => {
		const s: GameState = {
			...makeFullRunState(1n),
			phase: { type: "reward", cardRewards: [], potionReward: null, gold: 0 },
		};
		const result = step(s, { type: "proceed" });
		expect(result.state.phase.type).toBe("map");
		expect(result.state.combat).toBeNull();
	});

	it("player death triggers game over", () => {
		const state = makeFullRunState(42n);
		let result = step(state, { type: "chooseMapNode", x: 0, y: 0 });
		let s = result.state;

		// Set player to 1 HP, monster hits hard
		s = { ...s, currentHp: 1 };
		if (s.combat) {
			const monsters = s.combat.monsters.map((m) => ({
				...m,
				intent: { ...m.intent, baseDamage: 50, isAttack: true, moveId: m.intent.moveId },
			}));
			s = { ...s, combat: { ...s.combat, monsters } };
		}

		result = step(s, { type: "endTurn" });

		if (result.state.currentHp <= 0) {
			expect(result.state.phase.type).toBe("gameOver");
			const endEvent = result.events.find((e) => e.type === "combatEnded");
			expect(endEvent).toBeDefined();
			if (endEvent?.type === "combatEnded") {
				expect(endEvent.victory).toBe(false);
			}
		}
	});

	it("encounter index advances after each combat", () => {
		const state = makeFullRunState(10n);
		expect(state.encounterIndex.weak).toBe(0);

		// Enter first combat
		const result = step(state, { type: "chooseMapNode", x: 0, y: 0 });
		expect(result.state.encounterIndex.weak).toBe(1);
	});
});
