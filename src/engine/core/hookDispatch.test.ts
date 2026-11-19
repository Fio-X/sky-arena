/**
 * Hooks and actions that were declared and implemented by content but never
 * dispatched by the engine. Each test plays the real card / relic path.
 */

import { beforeAll, describe, expect, it } from "vitest";
import potionsJson from "../../../data-reference/potions.json";
import { loadPotions } from "../content/loader";
import { generateMap } from "../map/generate";
import {
	card,
	endTurn,
	forceMove,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
	startFight,
} from "./fightTestHelpers";
import { registerRelicHooks } from "./hooks";
import { obtainCard, obtainRelic } from "./obtain";
import { step } from "./step";
import type { GameState, PotionId, RelicId } from "./types";

beforeAll(() => {
	loadAllData();
	loadPotions(potionsJson as never);
});

const strikes = (n: number) => Array.from({ length: n }, (_, i) => card("STRIKE_RED", i + 1));
const withRelic = (s: GameState, id: string): GameState => ({
	...s,
	relics: [...s.relics, { id: id as RelicId, counter: 0 }],
});
const withEnergy = (s: GameState, energy: number): GameState =>
	s.combat ? { ...s, combat: { ...s.combat, energy } } : s;

describe("actions that had no executor", () => {
	it("Feed kill raises max HP (gainMaxHp)", () => {
		let s = startFight("CULTIST", 1n, [...strikes(4), card("FEED", 50)]);
		s = patchMonster(s, 0, { currentHp: 5, block: 0 });
		const max = s.maxHp;
		s = playCard(s, "FEED", 0);
		expect(s.maxHp).toBe(max + 3);
	});

	it("Hand of Greed kill gives gold (gainGold)", () => {
		let s = startFight("THREE_CULTIST", 1n, [...strikes(4), card("HAND_OF_GREED", 50)]);
		s = patchMonster(s, 0, { currentHp: 5, block: 0 });
		const gold = s.gold;
		s = withEnergy(playCard(withEnergy(s, 3), "HAND_OF_GREED", 0), 3);
		expect(s.gold).toBe(gold + 20);
	});

	it("Deep Breath shuffles the discard pile into the draw pile", () => {
		let s = startFight("CULTIST", 1n, [...strikes(9), card("DEEP_BREATH", 50)]);
		const c = s.combat;
		if (!c) throw new Error("no combat");
		// Move the draw pile to the discard pile so the shuffle is observable.
		s = { ...s, combat: { ...c, discardPile: c.drawPile, drawPile: [] } };
		s = playCard(s, "DEEP_BREATH");
		expect(s.combat?.discardPile.map((x) => x.id)).toEqual(["DEEP_BREATH"]);
		expect((s.combat?.drawPile.length ?? 0) + (s.combat?.hand.length ?? 0)).toBe(9);
	});
});

describe("hook dispatch", () => {
	it("Rupture: losing HP from a card gives Strength (onLoseHp)", () => {
		let s = startFight("CULTIST", 1n, [...strikes(3), card("RUPTURE", 50), card("OFFERING", 51)]);
		s = withEnergy(s, 5);
		s = playCard(s, "RUPTURE");
		s = playCard(s, "OFFERING");
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "STRENGTH")).toBe(1);
	});

	it("Ectoplasm: no gold from combat rewards (onGainGold)", () => {
		let s = withRelic(startFight("CULTIST", 1n, strikes(5)), "ECTOPLASM");
		s = patchMonster(s, 0, { currentHp: 1, block: 0 });
		const gold = s.gold;
		s = playCard(s, "STRIKE_RED", 0);
		expect(s.phase.type).toBe("reward");
		expect(s.gold).toBe(gold);
	});

	it("Toy Ornithopter heals when a potion is used (onUsePotion)", () => {
		let s = withRelic(startFight("CULTIST", 1n, strikes(5)), "TOY_ORNITHOPTER");
		s = { ...s, currentHp: 50, potions: ["BLOCK_POTION" as PotionId, null, null] };
		s = step(s, { type: "usePotion", index: 0, targetIndex: 0 }).state;
		expect(s.currentHp).toBe(55);
	});

	it("Gremlin Horn: energy + draw on a kill, but not on the last kill", () => {
		let s = withRelic(startFight("THREE_CULTIST", 1n, strikes(10)), "GREMLIN_HORN");
		s = patchMonster(s, 0, { currentHp: 1, block: 0 });
		const energy = s.combat?.energy ?? 0;
		const hand = s.combat?.hand.length ?? 0;
		s = playCard(s, "STRIKE_RED", 0);
		expect(s.combat?.energy).toBe(energy - 1 + 1);
		expect(s.combat?.hand.length).toBe(hand - 1 + 1);
	});

	it("poison and orbs are not the only killers that fire death hooks: monster died event", () => {
		let s = startFight("CULTIST", 1n, strikes(5));
		s = patchMonster(s, 0, { currentHp: 1, block: 0 });
		const r = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(r.events.some((e) => e.type === "monsterDied")).toBe(true);
		expect(monsterAt(r.state, 0).alive).toBe(false);
	});

	it("drawing from an empty pile reshuffles and fires onShuffle once", () => {
		let s = startFight("CULTIST", 1n, strikes(6));
		s = endTurn(s); // 5 drawn of 6 at start; turn 2 needs a reshuffle
		expect(s.combat?.hand.length).toBe(5);
	});
});

describe("obtain entry points (core/obtain.ts)", () => {
	registerRelicHooks("TEST_FISH", () => ({
		relicId: "TEST_FISH",
		hooks: {
			onObtainCard: (ctx) => ({ ...ctx.state, gold: ctx.state.gold + 9 }),
			onEquip: (ctx) => ({ ...ctx.state, maxHp: ctx.state.maxHp + 7 }),
		},
	}));

	it("onEquip fires once for the new relic; onObtainCard for each card", () => {
		let s = startFight("CULTIST", 1n, strikes(5));
		s = { ...s, combat: null, phase: { type: "map" } };
		const max = s.maxHp;
		s = obtainRelic(s, "TEST_FISH" as RelicId);
		expect(s.maxHp).toBe(max + 7);
		expect(s.combat).toBeNull();
		const gold = s.gold;
		s = obtainCard(s, "BASH" as never);
		s = obtainCard(s, "BASH" as never);
		expect(s.gold).toBe(gold + 18);
		expect(new Set(s.deck.map((c) => c.uniqueId)).size).toBe(s.deck.length);
	});
});

describe("turn-boundary hooks (core/turn.ts)", () => {
	it("Ice Cream keeps unspent energy", () => {
		let s = withRelic(startFight("CULTIST", 1n, strikes(10)), "ICE_CREAM");
		s = playCard(s, "STRIKE_RED", 0); // 3 → 2
		s = endTurn(s);
		expect(s.combat?.energy).toBe(5);
	});

	it("Runic Pyramid keeps the whole hand; draw adds on top", () => {
		let s = withRelic(startFight("CULTIST", 1n, strikes(15)), "RUNIC_PYRAMID");
		const kept = s.combat?.hand.map((c) => c.uniqueId) ?? [];
		s = endTurn(s);
		const hand = s.combat?.hand.map((c) => c.uniqueId) ?? [];
		expect(hand.slice(0, kept.length)).toEqual(kept);
		expect(hand.length).toBe(10);
	});

	it("onEnterRoom fires with the room type when moving on the map", () => {
		const seen: string[] = [];
		registerRelicHooks("TEST_ROOM", () => ({
			relicId: "TEST_ROOM",
			hooks: {
				onEnterRoom: (ctx, roomType) => {
					seen.push(roomType);
					return ctx.state;
				},
			},
		}));
		let s = withRelic(startFight("CULTIST", 1n, strikes(5)), "TEST_ROOM");
		s = { ...s, combat: null, phase: { type: "map" }, map: generateMap(1n, 1) };
		const first = s.map.nodes[0]?.find((n) => n && n.edges.length > 0);
		if (!first) throw new Error("no start node");
		const floor = s.floor;
		s = step(s, { type: "chooseMapNode", x: first.x, y: 0 }).state;
		expect(seen).toEqual([first.type]);
		expect(s.floor).toBe(floor + 1);
	});
});

describe("block timing (core/turn.ts)", () => {
	const defends = () => Array.from({ length: 5 }, (_, i) => card("DEFEND_RED", i + 1));

	it("player block lasts through the monsters' turn, then clears at turn start", () => {
		let s = forceMove(startFight("JAW_WORM", 1n, defends()), 0, "JAW_WORM_CHOMP");
		s = playCard(s, "DEFEND_RED");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(11 - 5);
		expect(s.combat?.player.block).toBe(0);
	});

	it("monster block clears before the monsters act; Jaw Worm's Bellow block survives your turn", () => {
		let s = forceMove(startFight("JAW_WORM", 1n, defends()), 0, "JAW_WORM_BELLOW");
		s = endTurn(s);
		expect(monsterAt(s, 0).block).toBeGreaterThan(0);
	});
});

describe("softlocks", () => {
	it("Dual Wield with no Attack or Power in hand does nothing (no stuck choice)", () => {
		const deck = [
			card("DUAL_WIELD", 1),
			...Array.from({ length: 4 }, (_, i) => card("DEFEND_RED", i + 2)),
		];
		const s = playCard(startFight("CULTIST", 1n, deck), "DUAL_WIELD");
		expect(s.phase.type).toBe("combat");
	});
});
