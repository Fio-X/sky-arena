import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import eventsJson from "../../../data-reference/events.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import potionsJson from "../../../data-reference/potions.json";
import powersJson from "../../../data-reference/powers.json";
import relicsJson from "../../../data-reference/relics.json";
import { generateEncounterLists } from "../combat/encounters";
import "../content";
import {
	getCard,
	loadCards,
	loadMonsters,
	loadPotions,
	loadPowers,
	loadRelics,
} from "../content/loader";
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

function findWeakestTarget(state: GameState): number {
	const monsters = state.combat?.monsters ?? [];
	let best = 0;
	let bestHp = Number.MAX_SAFE_INTEGER;
	for (let i = 0; i < monsters.length; i++) {
		const m = monsters[i];
		if (m && m.currentHp > 0 && m.currentHp < bestHp) {
			bestHp = m.currentHp;
			best = i;
		}
	}
	return best;
}

function findPlayable(state: GameState, type: string): number {
	const hand = state.combat?.hand ?? [];
	const energy = state.combat?.energy ?? 0;
	for (let i = 0; i < hand.length; i++) {
		const c = hand[i];
		if (!c) continue;
		const cost = c.freeToPlay ? 0 : c.costForTurn;
		if (cost > energy) continue;
		const def = getCard(c.id);
		if (def?.type === type) return i;
	}
	return -1;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test helper
function autoFight(state: GameState, maxTurns = 30): GameState {
	let s = state;
	for (let turn = 0; turn < maxTurns; turn++) {
		if (s.phase.type !== "combat" || !s.combat) break;
		if (s.currentHp <= 0) break;

		for (let attempt = 0; attempt < 20; attempt++) {
			if (s.phase.type !== "combat" || !s.combat) break;
			// Try attack first (kill faster = less damage taken), then skill
			let idx = findPlayable(s, "attack");
			if (idx >= 0) {
				const target = findWeakestTarget(s);
				s = step(s, { type: "playCard", handIndex: idx, targetIndex: target }).state;
			} else {
				idx = findPlayable(s, "skill");
				if (idx === -1) break;
				s = step(s, { type: "playCard", handIndex: idx, targetIndex: -1 }).state;
			}
			if (s.phase.type !== "combat") return s;
		}

		if (s.phase.type !== "combat") break;
		s = step(s, { type: "endTurn" }).state;
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

	it("event: Golden Shrine at (0,1) gives +100 gold", () => {
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
			{ type: "chooseMapNode", x: 0, y: 1 },
		];
		const s = run(createGame(42n), cmds);
		expect(s.phase.type).toBe("event");
		const after = step(s, { type: "chooseEventOption", index: 0 }).state;
		expect(after.phase.type).toBe("map");
		expect(after.gold).toBe(s.gold + 100);
	});

	it("shop: enter at (1,2) and leave returns to map", () => {
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
			{ type: "chooseMapNode", x: 0, y: 1 },
			{ type: "chooseEventOption", index: 0 },
			{ type: "chooseMapNode", x: 1, y: 2 },
		];
		const s = run(createGame(42n), cmds);
		expect(s.phase.type).toBe("shop");
		const shop = (s.phase as unknown as { type: "shop"; shop: { cards: unknown[] } }).shop;
		expect(shop.cards.length).toBeGreaterThan(0);
		const after = step(s, { type: "leaveShop" }).state;
		expect(after.phase.type).toBe("map");
	});

	it("rest: heals 30% maxHp", () => {
		let s = run(createGame(42n), [{ type: "chooseNeowBlessing", index: 0 }]);
		s = { ...s, currentHp: 50, phase: { type: "rest" } as GameState["phase"] };
		const after = step(s, { type: "rest" }).state;
		expect(after.phase.type).toBe("map");
		expect(after.currentHp).toBe(74);
	});

	it("treasure: grants a relic", () => {
		let s = run(createGame(42n), [{ type: "chooseNeowBlessing", index: 0 }]);
		const relicsBefore = s.relics.length;
		// Simulate entering a treasure room by navigating to one
		// Use direct state manipulation since reaching (0,8) requires many fights
		const treasureNode = { x: 0, y: 8 };
		s = {
			...s,
			map: {
				...s.map,
				currentNode: { x: 0, y: 7 },
				visitedNodes: [...s.map.visitedNodes, { x: 0, y: 7 }],
			},
			floor: 8,
		};
		// Verify (0,8) is treasure
		expect(s.map.nodes[8]?.[0]?.type).toBe("treasure");
		s = step(s, { type: "chooseMapNode", x: treasureNode.x, y: treasureNode.y }).state;
		expect(s.phase.type).toBe("reward");
		expect(s.relics.length).toBe(relicsBefore + 1);
	});

	it("smith: upgrades a card at rest site", () => {
		let s = run(createGame(42n), [{ type: "chooseNeowBlessing", index: 0 }]);
		s = { ...s, phase: { type: "rest" } as GameState["phase"] };
		const before = s.deck[0];
		expect(before?.upgraded).toBe(false);
		const after = step(s, { type: "smith", cardIndex: 0 }).state;
		expect(after.phase.type).toBe("map");
		expect(after.deck[0]?.upgraded).toBe(true);
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

describe("integration: seed=42 full Act 1 auto-play", () => {
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: integration test with multi-phase navigation
	it("navigates from Neow through multiple floors using autoFight", () => {
		let s = createGame(42n);
		s = step(s, { type: "chooseNeowBlessing", index: 0 }).state;
		expect(s.phase.type).toBe("map");
		expect(s.gold).toBe(199);

		const visited: string[] = [];
		let floors = 0;

		for (let i = 0; i < 16 && s.currentHp > 0; i++) {
			if (s.phase.type !== "map") break;

			const current = s.map.currentNode;
			const currentNode = current ? s.map.nodes[current.y]?.[current.x] : null;
			const edges = currentNode?.edges ?? [];

			let nextX = -1;
			let nextY = -1;

			if (current === null) {
				nextX = 1;
				nextY = 0;
			} else if (edges.length > 0) {
				const priority = ["rest", "event", "shop", "treasure", "monster", "elite"];
				let bestEdge = edges[0] ?? { x: 0, y: 0 };
				let bestPri = 99;
				for (const e of edges) {
					const t = s.map.nodes[e.y]?.[e.x]?.type ?? "monster";
					const pri = priority.indexOf(t);
					if (pri >= 0 && pri < bestPri) {
						bestPri = pri;
						bestEdge = e;
					}
				}
				nextX = bestEdge.x;
				nextY = bestEdge.y;
			} else {
				break;
			}

			const targetNode = s.map.nodes[nextY]?.[nextX];
			if (!targetNode) break;

			visited.push(`(${nextX},${nextY})=${targetNode.type}`);
			s = step(s, { type: "chooseMapNode", x: nextX, y: nextY }).state;
			floors++;

			switch (s.phase.type) {
				case "combat":
					s = autoFight(s);
					if (s.currentHp <= 0) break;
					if (s.phase.type === "reward") {
						s = step(s, { type: "chooseCardReward", index: 0 }).state;
					}
					break;
				case "event":
					s = step(s, { type: "chooseEventOption", index: 0 }).state;
					break;
				case "shop":
					s = step(s, { type: "leaveShop" }).state;
					break;
				case "rest":
					s = step(s, { type: "rest" }).state;
					break;
				case "reward":
					s = step(s, { type: "skipCardReward" }).state;
					break;
			}
		}

		expect(floors).toBe(16);
		expect(visited.length).toBe(floors);
		const types = new Set(visited.map((v) => v.split("=")[1]));
		expect(types.has("monster")).toBe(true);
		expect(types.has("event")).toBe(true);
		expect(types.has("shop")).toBe(true);
		expect(types.has("rest")).toBe(true);
		expect(types.has("treasure")).toBe(true);
		expect(types.has("boss")).toBe(true);
		expect(s.currentHp).toBe(0);
		expect(s.phase.type).toBe("gameOver");
	});
});
