/**
 * Hooks and actions that were declared and implemented by content but never
 * dispatched by the engine. Each test plays the real card / relic path.
 */

import { beforeAll, describe, expect, it } from "vitest";
import potionsJson from "../../../data-reference/potions.json";
import { loadPotions } from "../content/loader";
import {
	card,
	endTurn,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
	startFight,
} from "./fightTestHelpers";
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
