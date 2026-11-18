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
import type { CardId, MonsterId } from "../core/types";
import { createAllStreams } from "../rng/stsRandom";
import { initCombat } from "./init";

function makeRunState(seed: bigint) {
	const rng = createAllStreams(seed);
	return {
		seed,
		character: "IRONCLAD" as const,
		ascension: 0,
		act: 1,
		floor: 1,
		gold: 99,
		maxHp: 80,
		currentHp: 80,
		potionSlots: 3,
		potions: [null, null, null] as null[],
		deck: makeStarterDeck(),
		relics: [],
		map: { nodes: [] as never[], currentNode: null, visitedNodes: [] as never[] },
		combat: null,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: { weak: [], strong: [], elites: [], boss: "" },
		rng,
		phase: { type: "map" as const },
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

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadPowers(powersJson as never);
});

describe("initCombat", () => {
	it("creates monsters with rolled HP in valid range", () => {
		const state = makeRunState(42n);
		const result = initCombat(state, ["JAW_WORM" as MonsterId]);
		const c = result.combat;
		expect(c).toBeDefined();
		const m = c?.monsters[0];
		expect(m).toBeDefined();
		expect(m?.id).toBe("JAW_WORM");
		expect(m?.currentHp).toBeGreaterThanOrEqual(40);
		expect(m?.currentHp).toBeLessThanOrEqual(44);
		expect(m?.currentHp).toBe(m?.maxHp);
		expect(m?.alive).toBe(true);
	});

	it("sets first intent for each monster", () => {
		const state = makeRunState(1n);
		const result = initCombat(state, ["CULTIST" as MonsterId]);
		const m = result.combat?.monsters[0];
		expect(m?.intent.moveId).not.toBe("");
		// Cultist always starts with INCANTATION
		expect(m?.intent.moveId).toBe("CULTIST_INCANTATION");
		expect(m?.intent.isAttack).toBe(false);
		expect(m?.intent.isBuff).toBe(true);
	});

	it("applies prebattle powers (Louse gets Curl Up)", () => {
		const state = makeRunState(123n);
		const result = initCombat(state, ["RED_LOUSE" as MonsterId]);
		const m = result.combat?.monsters[0];
		const curlUp = m?.powers.find((p) => p.id === "curl_up");
		expect(curlUp).toBeDefined();
		expect(curlUp?.amount).toBeGreaterThanOrEqual(3);
		expect(curlUp?.amount).toBeLessThanOrEqual(7);
	});

	it("rolls miscInfo for Louse (range damage)", () => {
		const state = makeRunState(7n);
		const result = initCombat(state, ["RED_LOUSE" as MonsterId]);
		const m = result.combat?.monsters[0];
		expect(m?.miscInfo).toBeGreaterThanOrEqual(5);
		expect(m?.miscInfo).toBeLessThanOrEqual(7);
	});

	it("initializes multiple monsters", () => {
		const state = makeRunState(99n);
		const result = initCombat(state, ["RED_LOUSE" as MonsterId, "GREEN_LOUSE" as MonsterId]);
		expect(result.combat?.monsters.length).toBe(2);
		expect(result.combat?.monsters[0]?.index).toBe(0);
		expect(result.combat?.monsters[1]?.index).toBe(1);
		expect(result.combat?.monsters[0]?.id).toBe("RED_LOUSE");
		expect(result.combat?.monsters[1]?.id).toBe("GREEN_LOUSE");
	});

	it("shuffles deck and draws 5 cards", () => {
		const state = makeRunState(42n);
		const result = initCombat(state, ["JAW_WORM" as MonsterId]);
		const c = result.combat;
		expect(c?.hand.length).toBe(5);
		expect(c?.drawPile.length).toBe(5); // 10 cards - 5 drawn
	});

	it("sets phase to combat", () => {
		const state = makeRunState(1n);
		const result = initCombat(state, ["JAW_WORM" as MonsterId]);
		expect(result.phase).toEqual({ type: "combat", turn: 1 });
	});

	it("Sentry gets Artifact prebattle power", () => {
		const state = makeRunState(55n);
		const result = initCombat(state, ["SENTRY" as MonsterId]);
		const m = result.combat?.monsters[0];
		const artifact = m?.powers.find((p) => p.id === "artifact");
		expect(artifact).toBeDefined();
		expect(artifact?.amount).toBe(1);
	});

	it("Lagavulin gets Asleep and Metallicize", () => {
		const state = makeRunState(10n);
		const result = initCombat(state, ["LAGAVULIN" as MonsterId]);
		const m = result.combat?.monsters[0];
		const asleep = m?.powers.find((p) => p.id === "asleep");
		const metallicize = m?.powers.find((p) => p.id === "metallicize");
		expect(asleep).toBeDefined();
		expect(metallicize).toBeDefined();
		expect(metallicize?.amount).toBe(8);
	});
});
