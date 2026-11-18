import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import eventsJson from "../../../data-reference/events.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import potionsJson from "../../../data-reference/potions.json";
import powersJson from "../../../data-reference/powers.json";
import relicsJson from "../../../data-reference/relics.json";
import { generateEncounterLists } from "../combat/encounters";
import "../content";
import { loadCards, loadMonsters, loadPotions, loadPowers, loadRelics } from "../content/loader";
import { generateMap } from "../map/generate";
import { createAllStreams } from "../rng/stsRandom";
import { loadEvents } from "./event";
import { initPotionPool } from "./potion";
import { step } from "./step";
import type { CardId, Command, GameState, RelicId } from "./types";

function loadAll() {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadPowers(powersJson as never);
	loadRelics(relicsJson as never);
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
	loadEvents(eventsJson as never);
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

function createGame(seed: bigint): GameState {
	const rng = createAllStreams(seed);
	const encResult = generateEncounterLists(rng.monsterRng);
	const map = generateMap(seed, 1);
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
		relics: [{ id: "BURNING_BLOOD" as RelicId, counter: 0 }],
		map,
		combat: null,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: encResult.lists,
		rng: { ...rng, monsterRng: encResult.rng },
		phase: { type: "neow" },
	};
}

function run(state: GameState, commands: Command[]): GameState {
	let s = state;
	for (const cmd of commands) {
		s = step(s, cmd).state;
	}
	return s;
}

beforeEach(() => loadAll());

describe("integration: seed=42 full Act 1 loop", () => {
	it("Neow blessing gives +100 gold", () => {
		const s = run(createGame(42n), [{ type: "chooseNeowBlessing", index: 0 }]);
		expect(s.phase.type).toBe("map");
		expect(s.gold).toBe(199);
	});

	it("first combat: Cultist killed in 4 turns, Burning Blood heals", () => {
		const cmds: Command[] = [
			{ type: "chooseNeowBlessing", index: 0 },
			{ type: "chooseMapNode", x: 1, y: 0 },
			{ type: "playCard", handIndex: 1, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
		];
		const s = run(createGame(42n), cmds);
		expect(s.phase.type).toBe("reward");
		expect(s.currentHp).toBe(74);
		expect(s.gold).toBe(214);
	});

	it("reward → map → second combat starts correctly", () => {
		const cmds: Command[] = [
			{ type: "chooseNeowBlessing", index: 0 },
			{ type: "chooseMapNode", x: 1, y: 0 },
			{ type: "playCard", handIndex: 1, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "skipCardReward" },
			{ type: "chooseMapNode", x: 2, y: 1 },
		];
		const s = run(createGame(42n), cmds);
		expect(s.phase.type).toBe("combat");
		expect(s.floor).toBe(2);
		expect(s.combat?.monsters.length).toBe(2);
	});

	it("attack on dead monster is rejected", () => {
		const cmds: Command[] = [
			{ type: "chooseNeowBlessing", index: 0 },
			{ type: "chooseMapNode", x: 1, y: 0 },
			{ type: "playCard", handIndex: 1, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "skipCardReward" },
			{ type: "chooseMapNode", x: 2, y: 1 },
		];
		let s = run(createGame(42n), cmds);
		// Play through to kill Spike Slime (monster 0)
		const fight2: Command[] = [
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 1, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 1, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 2, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 1, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
		];
		s = run(s, fight2);
		// Spike Slime should be dead
		expect(s.combat?.monsters[0]?.currentHp).toBe(0);
		// Try attacking dead monster — should be no-op
		const before = s;
		s = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 }).state;
		expect(s.combat?.energy).toBe(before.combat?.energy);
		expect(s.combat?.hand.length).toBe(before.combat?.hand.length);
	});

	it("endTurn in reward phase is no-op", () => {
		const cmds: Command[] = [
			{ type: "chooseNeowBlessing", index: 0 },
			{ type: "chooseMapNode", x: 1, y: 0 },
			{ type: "playCard", handIndex: 1, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "playCard", handIndex: 0, targetIndex: 0 },
			{ type: "endTurn" },
		];
		const s = run(createGame(42n), cmds);
		expect(s.phase.type).toBe("reward");
		const hp = s.currentHp;
		const after = step(s, { type: "endTurn" }).state;
		expect(after.phase.type).toBe("reward");
		expect(after.currentHp).toBe(hp);
	});
});
