import { beforeEach, describe, expect, it } from "vitest";
import eventsJson from "../../../data-reference/events.json";
import potionsJson from "../../../data-reference/potions.json";
import { generateEncounterLists } from "../combat/encounters";
import { getCard, getMonster, loadPotions } from "../content/loader";
import { eligibleIndices } from "../content/relicsRun2";
import { generateMap } from "../map/generate";
import { createAllStreams } from "../rng/stsRandom";
import { loadEvents } from "./event";
import { card, KNOWN_POWER_IDS, loadAllData } from "./fightTestHelpers";
import { initPotionPool } from "./potion";
import { step } from "./step";
import type { Command, GameState, RelicId } from "./types";

beforeEach(() => {
	loadAllData();
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
	loadEvents(eventsJson as never);
});

/** Ironclad run with huge HP: this test checks the act flow, not balance. */
function createGodRun(seed: bigint): GameState {
	const rng = createAllStreams(seed);
	const enc = generateEncounterLists(rng.monsterRng, 1);
	const deck = [
		...[...Array(5).keys()].map((i) => card("STRIKE_RED", i + 1)),
		...[...Array(4).keys()].map((i) => card("DEFEND_RED", i + 6)),
		{ ...card("BASH", 10), costForTurn: 2 },
	];
	return {
		seed,
		character: "IRONCLAD",
		ascension: 0,
		act: 1,
		floor: 0,
		gold: 99,
		maxHp: 99999,
		currentHp: 99999,
		potionSlots: 3,
		potions: [null, null, null],
		deck,
		relics: [{ id: "BURNING_BLOOD" as RelicId, counter: 0 }],
		map: generateMap(seed, 1),
		combat: null,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: enc.lists,
		rng: { ...rng, monsterRng: enc.rng },
		phase: { type: "neow" },
	};
}

const PRIORITY = ["rest", "event", "shop", "treasure", "monster", "elite", "boss"];

function chooseNextNode(s: GameState): GameState {
	const cur = s.map.currentNode;
	const candidates = cur
		? (s.map.nodes[cur.y]?.[cur.x]?.edges ?? [])
		: (s.map.nodes[0] ?? []).filter((n) => n && n.edges.length > 0).map((n) => ({ x: n.x, y: 0 }));
	const ranked = [...candidates].sort(
		(a, b) =>
			PRIORITY.indexOf(s.map.nodes[a.y]?.[a.x]?.type ?? "monster") -
			PRIORITY.indexOf(s.map.nodes[b.y]?.[b.x]?.type ?? "monster"),
	);
	const next = ranked[0];
	if (!next) throw new Error(`no reachable node from ${JSON.stringify(cur)} in act ${s.act}`);
	return step(s, { type: "chooseMapNode", x: next.x, y: next.y }).state;
}

function assertSaneCombat(s: GameState): void {
	for (const m of s.combat?.monsters ?? []) {
		if (!m.alive) continue;
		expect(getMonster(m.id)?.moves[m.intent.moveId as string], `${m.id} intent`).toBeDefined();
		for (const p of m.powers) {
			expect(KNOWN_POWER_IDS.has(p.id.toUpperCase()), `${m.id} power ${p.id}`).toBe(true);
		}
	}
	for (const p of s.combat?.player.powers ?? []) {
		expect(KNOWN_POWER_IDS.has(p.id.toUpperCase()), `player power ${p.id}`).toBe(true);
	}
}

function playable(s: GameState, type: string): number {
	const c = s.combat;
	if (!c) return -1;
	return c.hand.findIndex((h) => {
		const def = getCard(h.id);
		return def?.type === type && def.cost !== -2 && (h.freeToPlay ? 0 : h.costForTurn) <= c.energy;
	});
}

function weakestTarget(s: GameState): number {
	const alive = (s.combat?.monsters ?? []).filter((m) => m.alive);
	return alive.sort((a, b) => a.currentHp - b.currentHp)[0]?.index ?? 0;
}

function fight(s0: GameState, seen: string[]): GameState {
	let s = s0;
	seen.push(...(s.combat?.monsters ?? []).filter((m) => m.alive).map((m) => m.id as string));
	for (let turn = 0; turn < 400 && s.phase.type === "combat"; turn++) {
		assertSaneCombat(s);
		for (let n = 0; n < 12 && s.phase.type === "combat"; n++) {
			const atk = playable(s, "attack");
			const idx = atk >= 0 ? atk : playable(s, "skill");
			if (idx < 0) break;
			const before = s;
			s = step(s, { type: "playCard", handIndex: idx, targetIndex: weakestTarget(s) }).state;
			if (s === before) break;
			if (s.phase.type === "cardSelect") s = settle(s);
		}
		if (s.phase.type === "combat") s = step(s, { type: "endTurn" }).state;
	}
	return s;
}

/** Resolve one non-map, non-combat decision with a fixed simple policy. */
function settle(s: GameState): GameState {
	const tries: Command[] = (() => {
		switch (s.phase.type) {
			case "neow":
				return [{ type: "chooseNeowBlessing", index: 0 }];
			case "reward":
				return s.phase.cardRewards.length > 0
					? [{ type: "chooseCardReward", index: 0 }]
					: [{ type: "skipCardReward" }];
			case "bossReward":
				return [{ type: "chooseBossRelic", index: 0 }];
			case "event":
				return [0, 1, 2, 3].map((index) => ({ type: "chooseEventOption", index }) as Command);
			case "deckSelect":
				return [
					{
						type: "chooseDeckCards",
						indices: eligibleIndices(s, s.phase.task).slice(0, s.phase.count),
					},
				];
			case "shop":
				return [{ type: "leaveShop" }];
			case "rest":
				return [{ type: "rest" }];
			case "cardSelect":
				return [
					...[...Array(10).keys()].map((i) => ({ type: "chooseCard", indices: [i] }) as Command),
					{ type: "chooseCard", indices: [] },
				];
			default:
				return [];
		}
	})();
	for (const cmd of tries) {
		const next = step(s, cmd).state;
		if (next.phase.type !== s.phase.type || next !== s) return next;
	}
	throw new Error(
		`stuck in phase ${JSON.stringify(s.phase)} relics=${s.relics.map((r) => r.id)} act=${s.act} floor=${s.floor}`,
	);
}

describe("act progression: seed=42 Act 1 → Act 3 boss", () => {
	it("goes through Act 2 and Act 3 and wins after the Act 3 boss (no Act 4 yet)", () => {
		let s = createGodRun(42n);
		const seenByAct: Record<number, string[]> = { 1: [], 2: [], 3: [] };
		let transition: GameState | null = null;
		let transition3: GameState | null = null;

		for (let guard = 0; guard < 3000 && s.phase.type !== "gameOver"; guard++) {
			const act = s.act;
			if (s.phase.type === "map") s = chooseNextNode(s);
			else if (s.phase.type === "combat") s = fight(s, seenByAct[act] ?? []);
			else s = settle(s);
			if (act === 1 && s.act === 2) transition = s;
			if (act === 2 && s.act === 3) transition3 = s;
		}

		expect(transition, "entered Act 2").not.toBeNull();
		expect(transition?.floor).toBe(17);
		expect(transition?.currentHp).toBe(transition?.maxHp);
		expect(transition?.map.currentNode).toBeNull();
		expect(transition?.phase.type).toBe("map");
		expect(transition?.rng.cardRng.counter).toBeGreaterThanOrEqual(250);

		const act2 = new Set(seenByAct[2]);
		const act2Only = ["CHOSEN", "BYRD", "SPHERIC_GUARDIAN", "SHELLED_PARASITE", "MUGGER"];
		expect(
			act2Only.some((id) => act2.has(id)),
			`act 2 monsters: ${[...act2]}`,
		).toBe(true);
		const bosses = ["BRONZE_AUTOMATON", "THE_COLLECTOR", "THE_CHAMP"];
		expect(
			bosses.some((id) => act2.has(id)),
			"fought an Act 2 boss",
		).toBe(true);

		expect(transition3, "entered Act 3").not.toBeNull();
		expect(transition3?.floor).toBe(34);
		expect(transition3?.rng.cardRng.counter).toBeGreaterThanOrEqual(500);
		const act3 = new Set(seenByAct[3]);
		const act3Only = [
			"DARKLING",
			"ORB_WALKER",
			"SPIKER",
			"REPULSOR",
			"EXPLODER",
			"TRANSIENT",
			"THE_MAW",
			"SPIRE_GROWTH",
			"WRITHING_MASS",
		];
		expect(
			act3Only.some((id) => act3.has(id)),
			`act 3 monsters: ${[...act3]}`,
		).toBe(true);
		const act3Bosses = ["AWAKENED_ONE", "TIME_EATER", "DONU", "DECA"];
		expect(
			act3Bosses.some((id) => act3.has(id)),
			"fought an Act 3 boss",
		).toBe(true);

		expect(s.phase).toEqual({ type: "gameOver", victory: true });
		expect(s.act).toBe(3);
		expect(s.floor).toBe(50);
	});
});
