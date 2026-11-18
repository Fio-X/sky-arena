import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import potionsJson from "../../../data-reference/potions.json";
import relicsJson from "../../../data-reference/relics.json";
import "../content/corePowers";
import "../content/potionEffects";
import "../content/relicHooks";
import { loadCards, loadMonsters, loadPotions, loadRelics } from "../content/loader";
import { initPotionPool } from "./potion";
import { generateShop } from "./shop";
import { step } from "./step";
import { makeState, makeStrike } from "./testHelpers";
import type { CardId, RelicId, ShopData } from "./types";

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadRelics(relicsJson as never);
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
});

describe("generateShop", () => {
	it("generates 5 cards, up to 3 relics, and 3 potions", () => {
		const state = makeState(null);
		const { shop } = generateShop(state);
		expect(shop.cards.length).toBe(5);
		expect(shop.relics.length).toBeGreaterThanOrEqual(1);
		expect(shop.relics.length).toBeLessThanOrEqual(3);
		expect(shop.potions.length).toBe(3);
		expect(shop.purgePrice).toBe(75);
		expect(shop.purgeUsed).toBe(false);
	});

	it("cards have valid prices", () => {
		const state = makeState(null);
		const { shop } = generateShop(state);
		for (const card of shop.cards) {
			expect(card.price).toBeGreaterThanOrEqual(50);
			expect(card.price).toBeLessThanOrEqual(182);
			expect(card.sold).toBe(false);
		}
	});

	it("does not include already-owned relics", () => {
		const state = {
			...makeState(null),
			relics: [{ id: "AKABEKO" as RelicId, counter: 0 }],
		};
		const { shop } = generateShop(state);
		const relicIds = shop.relics.map((r) => r.relicId);
		expect(relicIds).not.toContain("AKABEKO");
	});
});

describe("shop buy card", () => {
	it("buys a card, deducts gold, marks sold", () => {
		const shop: ShopData = {
			cards: [{ kind: "card", cardId: "ANGER" as never, price: 50, sold: false }],
			relics: [],
			potions: [],
			purgePrice: 75,
			purgeUsed: false,
		};
		const state = { ...makeState(null), gold: 100, phase: { type: "shop" as const, shop } };
		const result = step(state, { type: "chooseShopItem", index: 0 });
		expect(result.state.gold).toBe(50);
		expect(result.state.deck.some((c) => (c.id as string) === "ANGER")).toBe(true);
		if (result.state.phase.type === "shop") {
			expect(result.state.phase.shop.cards[0]?.sold).toBe(true);
		}
	});

	it("cannot buy if not enough gold", () => {
		const shop: ShopData = {
			cards: [{ kind: "card", cardId: "ANGER" as never, price: 200, sold: false }],
			relics: [],
			potions: [],
			purgePrice: 75,
			purgeUsed: false,
		};
		const state = { ...makeState(null), gold: 100, phase: { type: "shop" as const, shop } };
		const result = step(state, { type: "chooseShopItem", index: 0 });
		expect(result.state.gold).toBe(100);
	});
});

describe("shop purge", () => {
	it("removes a card from deck and deducts gold", () => {
		const shop: ShopData = {
			cards: [],
			relics: [],
			potions: [],
			purgePrice: 75,
			purgeUsed: false,
		};
		const deck = [makeStrike(), { ...makeStrike(), id: "DEFEND_RED" as CardId, uniqueId: 2 }];
		const state = { ...makeState(null), gold: 100, deck, phase: { type: "shop" as const, shop } };
		const deckSize = state.deck.length;
		const result = step(state, { type: "shopPurge", cardIndex: 0 });
		expect(result.state.deck.length).toBe(deckSize - 1);
		expect(result.state.gold).toBe(25);
		if (result.state.phase.type === "shop") {
			expect(result.state.phase.shop.purgeUsed).toBe(true);
		}
	});

	it("cannot purge twice", () => {
		const shop: ShopData = {
			cards: [],
			relics: [],
			potions: [],
			purgePrice: 75,
			purgeUsed: true,
		};
		const state = { ...makeState(null), gold: 200, phase: { type: "shop" as const, shop } };
		const result = step(state, { type: "shopPurge", cardIndex: 0 });
		expect(result.state.deck.length).toBe(state.deck.length);
	});
});

describe("leaveShop", () => {
	it("returns to map", () => {
		const shop: ShopData = {
			cards: [],
			relics: [],
			potions: [],
			purgePrice: 75,
			purgeUsed: false,
		};
		const state = { ...makeState(null), phase: { type: "shop" as const, shop } };
		const result = step(state, { type: "leaveShop" });
		expect(result.state.phase.type).toBe("map");
	});
});
