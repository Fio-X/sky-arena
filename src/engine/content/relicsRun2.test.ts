/**
 * Run-level relics in rooms, rest sites, treasure chests, combat rewards and
 * shops, exercised through step() commands.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { patchMonster, playCard, runState } from "../core/fightTestHelpers";
import type { GameState, MapNode } from "../core/types";
import { getCard } from "./loader";
import {
	base,
	cardItem,
	counter,
	enter,
	linearMap,
	loadRunData,
	relicItem,
	run,
	shopWith,
	winFight,
} from "./relicsRunTestHelpers";

beforeEach(loadRunData);

const toMap = (s: GameState): GameState => ({ ...s, phase: { type: "map" } });

describe("rooms and map", () => {
	it("Maw Bank +12 per floor until gold is spent at a shop", () => {
		let s = enter(base(["event", "shop", "event"], ["MAW_BANK"]), 0);
		expect(s.gold).toBe(112);
		s = enter(toMap(s), 1);
		expect(s.gold).toBe(124);
		const shop = s.phase.type === "shop" ? s.phase.shop : null;
		const potionIdx = shop ? shop.cards.length + shop.relics.length : 0;
		s = run(s, { type: "chooseShopItem", index: potionIdx }, { type: "leaveShop" });
		expect(counter(s, "MAW_BANK")).toBe(-2);
		expect(enter(s, 2).gold).toBe(s.gold);
	});

	it("Ssserpent Head +50 on ? rooms; Meal Ticket heals 15 at shops", () => {
		expect(enter(base(["event"], ["SSSERPENT_HEAD"]), 0).gold).toBe(150);
		expect(enter(base(["shop"], ["MEAL_TICKET"]), 0).currentHp).toBe(65);
	});

	it("Eternal Feather heals 3 per 5 cards entering a rest site", () => {
		expect(enter(base(["rest"], ["ETERNAL_FEATHER"]), 0).currentHp).toBe(56);
	});

	it("Ancient Tea Set: after a rest site, the next combat only starts with +2 energy", () => {
		let s = run(enter(base(["rest", "monster", "monster"], ["ANCIENT_TEA_SET"]), 0), {
			type: "proceed",
		});
		s = enter(s, 1);
		expect(s.combat?.energy).toBe(5);
		s = playCard1(s);
		s = enter(run(s, { type: "skipCardReward" }), 2);
		expect(s.combat?.energy).toBe(3);
	});

	it("Tiny Chest: the 4th ? room is a treasure room", () => {
		let s = base(["event", "event", "event", "event"], ["TINY_CHEST"]);
		for (let y = 0; y < 3; y++) {
			s = enter(s, y);
			expect(s.phase.type).toBe("event");
			s = toMap(s);
		}
		s = enter(s, 3);
		expect(s.phase.type).toBe("reward");
		expect(s.relics).toHaveLength(2);
		expect(counter(s, "TINY_CHEST")).toBe(0);
	});

	it("Wing Boots: fly to an unconnected node of the next row", () => {
		const extra: MapNode[] = [
			{ x: 1, y: 0, type: "event", edges: [{ x: 1, y: 1 }] },
			{ x: 1, y: 1, type: "event", edges: [] },
		];
		const map = linearMap(["event", "event"], extra);
		let s = enter({ ...base([], ["WING_BOOTS"]), map }, 0);
		expect(counter(s, "WING_BOOTS")).toBe(3);
		s = enter(toMap(s), 1, 1);
		expect(s.map.currentNode).toEqual({ x: 1, y: 1 });
		expect(counter(s, "WING_BOOTS")).toBe(2);
		const noBoots = enter(toMap(enter({ ...base([]), map }, 0)), 1, 1);
		expect(noBoots.map.currentNode).toEqual({ x: 0, y: 0 });
	});
});

/** Win the current fight (already entered) with one Strike. */
const playCard1 = (s: GameState) => playCard(patchMonster(s, 0, { currentHp: 1 }), "STRIKE_RED");

describe("treasure chests", () => {
	it("Cursed Key adds a curse; Matryoshka adds a second relic", () => {
		const s = enter(base(["treasure"], ["CURSED_KEY", "MATRYOSHKA"]), 0);
		expect(s.deck.some((c) => getCard(c.id)?.type === "curse")).toBe(true);
		expect(s.relics).toHaveLength(4);
		expect(counter(s, "MATRYOSHKA")).toBe(1);
	});

	it("N'loth's Hungry Face: the next chest is empty", () => {
		let s = enter(base(["treasure", "treasure"], ["NLOTHS_HUNGRY_FACE"]), 0);
		expect(s.relics).toHaveLength(1);
		expect(counter(s, "NLOTHS_HUNGRY_FACE")).toBe(-2);
		s = enter(run(s, { type: "proceed" }), 1);
		expect(s.relics).toHaveLength(2);
	});
});

describe("rest site", () => {
	it("Regal Pillow +15; Dream Catcher opens a card reward", () => {
		const low = { ...base(["rest"], ["REGAL_PILLOW", "DREAM_CATCHER"]), currentHp: 20 };
		let s = run(enter(low, 0), { type: "rest" });
		expect(s.currentHp).toBe(20 + 24 + 15);
		expect(s.phase.type === "reward" && s.phase.cardRewards.length).toBe(3);
		s = run(s, { type: "chooseCardReward", index: 0 });
		expect(s.deck).toHaveLength(11);
		expect(s.phase.type).toBe("map");
	});

	it("Girya: Lift up to 3 times, +1 Strength per Lift in combat", () => {
		let s = base(["rest", "rest", "rest", "rest", "monster"], ["GIRYA"]);
		for (let y = 0; y < 4; y++) s = run(enter(s, y), { type: "restOption", option: "lift" });
		expect(counter(s, "GIRYA")).toBe(3);
		expect(s.phase.type).toBe("rest");
		s = enter(run(s, { type: "proceed" }), 4);
		expect(s.combat?.player.powers.find((p) => p.id === "strength")?.amount).toBe(3);
	});

	it("Peace Pipe: Toke removes a chosen card (Back returns to the fire)", () => {
		const s = run(enter(base(["rest"], ["PEACE_PIPE"]), 0), { type: "restOption", option: "toke" });
		expect(s.phase.type).toBe("deckSelect");
		expect(run(s, { type: "chooseDeckCards", indices: [] }).phase.type).toBe("rest");
		const toked = run(s, { type: "chooseDeckCards", indices: [3] });
		expect(toked.deck).toHaveLength(9);
		expect(toked.phase.type).toBe("map");
	});

	it("Shovel: Dig obtains a relic", () => {
		const dug = run(enter(base(["rest"], ["SHOVEL"]), 0), { type: "restOption", option: "dig" });
		expect(dug.relics).toHaveLength(2);
		expect(run(dug, { type: "proceed" }).phase.type).toBe("map");
		const noShovel = run(enter(base(["rest"]), 0), { type: "restOption", option: "dig" });
		expect(noShovel.phase.type).toBe("rest");
	});
});

const rewardCards = (s: GameState) => (s.phase.type === "reward" ? s.phase.cardRewards : []);

describe("combat rewards", () => {
	it("Prayer Wheel: a second card reward after normal fights", () => {
		let s = winFight(base(["monster"], ["PRAYER_WHEEL"]), 0);
		s = run(s, { type: "chooseCardReward", index: 0 });
		expect(rewardCards(s)).toHaveLength(3);
		s = run(s, { type: "chooseCardReward", index: 0 });
		expect(s.deck).toHaveLength(12);
		expect(s.phase.type).toBe("map");
	});

	it("Black Star: elites give an extra relic", () => {
		const s = winFight(base(["elite"], ["BLACK_STAR"]), 0);
		expect(s.phase.type).toBe("reward");
		expect(s.relics).toHaveLength(2);
		expect(winFight(base(["elite"]), 0).relics).toHaveLength(0);
	});

	it("White Beast Statue: a potion after every fight", () => {
		for (const seed of [1n, 2n, 3n, 4n, 5n]) {
			const s = winFight(
				{ ...base(["monster"], ["WHITE_BEAST_STATUE"]), rng: runState(seed).rng },
				0,
			);
			expect(s.phase.type === "reward" && s.phase.potionReward).not.toBeNull();
		}
	});

	it("Golden Idol: +25% combat gold", () => {
		const plain = winFight(base(["monster"]), 0);
		const idol = winFight(base(["monster"], ["GOLDEN_IDOL"]), 0);
		const g = plain.phase.type === "reward" ? plain.phase.gold : 0;
		const expected = g + Math.floor(g * 0.25 + 0.5);
		expect(idol.phase.type === "reward" && idol.phase.gold).toBe(expected);
		expect(idol.gold - 100).toBe(expected);
	});

	it("N'loth's Gift raises rare odds; Prismatic Shard offers other colors", () => {
		let rares = 0;
		let giftRares = 0;
		let foreign = 0;
		const rareCount = (s: GameState) =>
			rewardCards(s).filter((c) => getCard(c)?.rarity === "rare").length;
		for (let i = 0; i < 40; i++) {
			const rng = runState(BigInt(100 + i)).rng;
			rares += rareCount(winFight({ ...base(["monster"]), rng }, 0));
			giftRares += rareCount(winFight({ ...base(["monster"], ["NLOTHS_GIFT"]), rng }, 0));
			const p = winFight({ ...base(["monster"], ["PRISMATIC_SHARD"]), rng }, 0);
			foreign += rewardCards(p).filter((c) => getCard(c)?.color !== "red").length;
		}
		expect(giftRares).toBeGreaterThan(rares);
		expect(foreign).toBeGreaterThan(0);
	});
});

describe("shop prices", () => {
	const shopOf = (s: GameState) => {
		if (s.phase.type !== "shop") throw new Error("expected a shop");
		return s.phase.shop;
	};

	it("Membership Card halves, The Courier takes 20% off, Smiling Mask purge = 50", () => {
		const plain = shopOf(enter(base(["shop"]), 0));
		const member = shopOf(enter(base(["shop"], ["MEMBERSHIP_CARD", "SMILING_MASK"]), 0));
		const courier = shopOf(enter(base(["shop"], ["THE_COURIER"]), 0));
		const p0 = plain.cards[0]?.price ?? 0;
		expect(member.cards[0]?.price).toBe(Math.floor(p0 * 0.5 + 0.5));
		expect(courier.cards[0]?.price).toBe(Math.floor(p0 * 0.8 + 0.5));
		expect(member.purgePrice).toBe(50);
		expect(courier.purgePrice).toBe(60);
	});

	it("The Courier restocks a bought card with one of the same type", () => {
		const s = shopWith({ cards: [cardItem("ANGER", 50), cardItem("FLEX", 50)] }, ["THE_COURIER"]);
		const shop = shopOf(run(s, { type: "chooseShopItem", index: 0 }));
		expect(shop.cards[0]?.sold).toBe(false);
		expect(shop.cards[0]?.cardId).not.toBe("ANGER");
		expect(getCard(shop.cards[0]?.cardId ?? "")?.type).toBe("attack");
	});

	it("Buying Membership Card discounts the shop at once", () => {
		const s = shopWith({
			cards: [cardItem("ANGER", 60)],
			relics: [relicItem("MEMBERSHIP_CARD", 10)],
		});
		const shop = shopOf(run(s, { type: "chooseShopItem", index: 1 }));
		expect(shop.cards[0]?.price).toBe(30);
		expect(shop.purgePrice).toBe(38);
		expect(shop.relics[0]?.sold).toBe(true);
	});
});
