import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import potionsJson from "../../../data-reference/potions.json";
import relicsJson from "../../../data-reference/relics.json";
import "../content/corePowers";
import "../content/potionEffects";
import { loadCards, loadMonsters, loadPotions, loadRelics } from "../content/loader";
import { initPotionPool, stepUsePotion } from "./potion";
import { step } from "./step";
import { at, baseMonster, makeCombat, makeState } from "./testHelpers";
import type { PotionId } from "./types";

function pid(id: string): PotionId {
	return id as PotionId;
}

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadRelics(relicsJson as never);
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
});

describe("usePotion — Fire Potion", () => {
	it("deals 20 damage to target", () => {
		const combat = makeCombat({ monsters: [{ ...baseMonster(), currentHp: 44 }] });
		const state = {
			...makeState(combat),
			potions: [pid("FIRE_POTION"), null, null] as (PotionId | null)[],
		};
		const result = stepUsePotion(state, 0, 0, []);
		const m = at(result.state.combat!.monsters, 0);
		expect(m.currentHp).toBe(24);
		expect(result.state.potions[0]).toBeNull();
	});
});

describe("usePotion — Block Potion", () => {
	it("gives 12 block", () => {
		const combat = makeCombat();
		const state = {
			...makeState(combat),
			potions: [pid("BLOCK_POTION"), null, null] as (PotionId | null)[],
		};
		const result = stepUsePotion(state, 0, 0, []);
		expect(result.state.combat!.player.block).toBe(12);
	});
});

describe("usePotion — Strength Potion", () => {
	it("gives 2 strength", () => {
		const combat = makeCombat();
		const state = {
			...makeState(combat),
			potions: [pid("STRENGTH_POTION"), null, null] as (PotionId | null)[],
		};
		const result = stepUsePotion(state, 0, 0, []);
		const str = result.state.combat!.player.powers.find((p) => p.id === "strength");
		expect(str?.amount).toBe(2);
	});
});

describe("usePotion — Fear Potion", () => {
	it("applies 3 vulnerable to target", () => {
		const combat = makeCombat();
		const state = {
			...makeState(combat),
			potions: [pid("FEAR_POTION"), null, null] as (PotionId | null)[],
		};
		const result = stepUsePotion(state, 0, 0, []);
		const vuln = at(result.state.combat!.monsters, 0).powers.find((p) => p.id === "vulnerable");
		expect(vuln?.amount).toBe(3);
	});
});

describe("usePotion — Blood Potion", () => {
	it("heals 20% of max HP", () => {
		const combat = makeCombat();
		const state = {
			...makeState(combat),
			currentHp: 60,
			maxHp: 80,
			potions: [pid("BLOOD_POTION"), null, null] as (PotionId | null)[],
		};
		const result = stepUsePotion(state, 0, 0, []);
		expect(result.state.currentHp).toBe(76);
	});
});

describe("usePotion — Energy Potion", () => {
	it("gives 2 energy", () => {
		const combat = makeCombat({ energy: 3 });
		const state = {
			...makeState(combat),
			potions: [pid("ENERGY_POTION"), null, null] as (PotionId | null)[],
		};
		const result = stepUsePotion(state, 0, 0, []);
		expect(result.state.combat!.energy).toBe(5);
	});
});

describe("usePotion — Swift Potion", () => {
	it("draws 3 cards", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: Array.from({ length: 5 }, (_, i) => ({
				id: `CARD_${i}` as never,
				uniqueId: 100 + i,
				upgraded: false,
				costOverride: null,
				costForTurn: 1,
				freeToPlay: false,
				misc: 0,
			})),
		});
		const state = {
			...makeState(combat),
			potions: [pid("SWIFT_POTION"), null, null] as (PotionId | null)[],
		};
		const result = stepUsePotion(state, 0, 0, []);
		expect(result.state.combat!.hand.length).toBe(3);
	});
});

describe("discardPotion", () => {
	it("removes potion from slot", () => {
		const state = {
			...makeState(makeCombat()),
			potions: [pid("FIRE_POTION"), null, null] as (PotionId | null)[],
		};
		const result = step(state, { type: "discardPotion", index: 0 });
		expect(result.state.potions[0]).toBeNull();
		expect(result.events.some((e) => e.type === "potionDiscarded")).toBe(true);
	});
});

describe("usePotion events", () => {
	it("generates potionUsed event", () => {
		const combat = makeCombat();
		const state = {
			...makeState(combat),
			potions: [pid("BLOCK_POTION"), null, null] as (PotionId | null)[],
		};
		const events: never[] = [];
		stepUsePotion(state, 0, 0, events);
		expect(events.some((e: { type: string }) => e.type === "potionUsed")).toBe(true);
	});
});
