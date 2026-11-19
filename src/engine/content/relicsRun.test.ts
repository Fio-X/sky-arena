/**
 * Run-level relics (pickups, card obtain, energy boss relics), exercised
 * through step() commands. Rooms/rest/rewards/shop: relicsRun2.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { GameState, RelicId } from "../core/types";
import { getCard } from "./loader";
import {
	base,
	buyRelic,
	cardItem,
	counter,
	enter,
	ids,
	loadRunData,
	potionItem,
	rewardPhase,
	run,
	shopWith,
	winFight,
} from "./relicsRunTestHelpers";

beforeEach(loadRunData);

describe("+1 Energy boss relics", () => {
	for (const id of ["BUSTED_CROWN", "COFFEE_DRIPPER", "CURSED_KEY", "FUSION_HAMMER", "SOZU"]) {
		it(`${id}: 4 energy on turn 1 and after a turn`, () => {
			let s = enter(base(["monster"], [id]), 0);
			expect(s.combat?.energy).toBe(4);
			expect(s.combat?.maxEnergy).toBe(4);
			s = run(s, { type: "endTurn" });
			expect(s.combat?.energy).toBe(4);
		});
	}

	it("Busted Crown: 1 card per reward; Question Card: 4", () => {
		const crown = winFight(base(["monster"], ["BUSTED_CROWN"]), 0);
		expect(crown.phase.type === "reward" && crown.phase.cardRewards.length).toBe(1);
		const card = winFight(base(["monster"], ["QUESTION_CARD"]), 0);
		expect(card.phase.type === "reward" && card.phase.cardRewards.length).toBe(4);
	});

	it("Coffee Dripper blocks Rest; Fusion Hammer blocks Smith", () => {
		const coffee = enter(base(["rest"], ["COFFEE_DRIPPER"]), 0);
		expect(run(coffee, { type: "rest" }).phase.type).toBe("rest");
		const hammer = enter(base(["rest"], ["FUSION_HAMMER"]), 0);
		const smithed = run(hammer, { type: "smith", cardIndex: 0 });
		expect(smithed.phase.type).toBe("rest");
		expect(smithed.deck[0]?.upgraded).toBe(false);
	});

	it("Sozu: potion rewards and shop potions cannot be taken", () => {
		const s = { ...base([], ["SOZU"]), phase: rewardPhase(["ANGER"], "FIRE_POTION") };
		expect(run(s, { type: "obtainPotionReward" }).potions).toEqual([null, null, null]);
		const shop = run(shopWith({ potions: [potionItem("FIRE_POTION", 20)] }, ["SOZU"]), {
			type: "chooseShopItem",
			index: 0,
		});
		expect(shop.potions).toEqual([null, null, null]);
		expect(shop.gold).toBe(100);
	});
});

describe("pickup effects", () => {
	it("Strawberry / Pear / Mango raise and heal Max HP; Lee's Waffle heals to full", () => {
		expect(buyRelic("STRAWBERRY").maxHp).toBe(87);
		expect(buyRelic("PEAR").currentHp).toBe(60);
		expect(buyRelic("MANGO").maxHp).toBe(94);
		const waffle = buyRelic("LEES_WAFFLE");
		expect(waffle.maxHp).toBe(87);
		expect(waffle.currentHp).toBe(87);
	});

	it("Old Coin: +300 gold (Bloody Idol heals on it)", () => {
		expect(buyRelic("OLD_COIN").gold).toBe(400);
		const idol = buyRelic("OLD_COIN", base([], ["BLOODY_IDOL"]));
		expect(idol.currentHp).toBe(55);
	});

	it("Potion Belt: +2 slots; Cauldron fills empty slots", () => {
		const belt = buyRelic("POTION_BELT");
		expect(belt.potionSlots).toBe(5);
		expect(belt.potions).toHaveLength(5);
		const cauldron = buyRelic("CAULDRON", belt);
		expect(cauldron.potions.every((p) => p !== null)).toBe(true);
	});

	it("Whetstone / War Paint upgrade 2 attacks / 2 skills", () => {
		const whet = buyRelic("WHETSTONE");
		expect(whet.deck.filter((c) => c.upgraded && c.id === "STRIKE_RED")).toHaveLength(2);
		expect(whet.deck.filter((c) => c.upgraded)).toHaveLength(2);
		const paint = buyRelic("WAR_PAINT");
		expect(paint.deck.filter((c) => c.upgraded && c.id === "DEFEND_RED")).toHaveLength(2);
	});

	it("Pandora's Box transforms every Strike and Defend (Ceramic Fish pays per card)", () => {
		const s = buyRelic("PANDORAS_BOX", base([], ["CERAMIC_FISH"]));
		expect(s.deck).toHaveLength(10);
		expect(ids(s).some((id) => /^(STRIKE|DEFEND)_RED$/.test(id))).toBe(false);
		expect(s.deck.every((c) => getCard(c.id)?.color === "red")).toBe(true);
		expect(s.gold).toBe(100 + 90);
	});

	it("Calling Bell: Curse of the Bell + common, uncommon and rare relics", () => {
		const s = buyRelic("CALLING_BELL");
		expect(ids(s)).toContain("CURSE_OF_THE_BELL");
		const tiers = s.relics.slice(1).map((r) => r.id);
		expect(tiers).toHaveLength(3);
	});

	it("Tiny House: +5 Max HP, 50 gold, 1 upgrade, then a card + potion reward", () => {
		const boss = {
			...base([]),
			phase: { type: "bossReward" as const, relics: ["TINY_HOUSE" as RelicId] },
		};
		const s = run(boss, { type: "chooseBossRelic", index: 0 });
		expect(s.act).toBe(2);
		expect(s.maxHp).toBe(85);
		expect(s.gold).toBe(150);
		expect(s.deck.filter((c) => c.upgraded)).toHaveLength(1);
		expect(s.phase.type === "reward" && s.phase.cardRewards.length).toBe(3);
		expect(s.phase.type === "reward" && s.phase.potionReward).not.toBeNull();
		const after = run(s, { type: "chooseCardReward", index: 0 });
		expect(after.deck).toHaveLength(11);
		expect(after.phase.type).toBe("map");
	});

	it("Orrery: five card rewards in a row, then back to the shop", () => {
		let s = buyRelic("ORRERY");
		for (let i = 0; i < 5; i++) {
			expect(s.phase.type).toBe("reward");
			s = run(s, { type: "chooseCardReward", index: 0 });
		}
		expect(s.deck).toHaveLength(15);
		expect(s.phase.type).toBe("shop");
	});
});

describe("deck selection pickups", () => {
	it("Astrolabe (boss): transform and upgrade 3 chosen cards, then the next act", () => {
		const boss = {
			...base([]),
			phase: { type: "bossReward" as const, relics: ["ASTROLABE" as RelicId] },
		};
		let s = run(boss, { type: "chooseBossRelic", index: 0 });
		expect(s.phase.type === "deckSelect" && s.phase.count).toBe(3);
		expect(run(s, { type: "chooseDeckCards", indices: [0, 1] }).phase.type).toBe("deckSelect");
		s = run(s, { type: "chooseDeckCards", indices: [0, 1, 2] });
		expect(s.phase.type).toBe("map");
		expect(s.act).toBe(2);
		expect(s.deck).toHaveLength(10);
		expect(s.deck.filter((c) => c.upgraded)).toHaveLength(3);
		expect(ids(s).filter((id) => id === "STRIKE_RED")).toHaveLength(2);
	});

	it("Empty Cage removes 2; Dolly's Mirror copies 1 (with its upgrade)", () => {
		const cage = run(buyRelic("EMPTY_CAGE"), { type: "chooseDeckCards", indices: [0, 5] });
		expect(cage.deck).toHaveLength(8);
		expect(cage.phase.type).toBe("shop");
		let mirror = buyRelic("WHETSTONE");
		mirror = buyRelic("DOLLYS_MIRROR", { ...mirror, phase: { type: "map" } });
		const upIdx = mirror.deck.findIndex((c) => c.upgraded);
		mirror = run(mirror, { type: "chooseDeckCards", indices: [upIdx] });
		expect(mirror.deck).toHaveLength(11);
		expect(mirror.deck.at(-1)?.upgraded).toBe(true);
	});
});

describe("card obtain effects", () => {
	const choose = (relics: string[], card: string) =>
		run(
			{ ...base([], relics), phase: rewardPhase([card]) },
			{ type: "chooseCardReward", index: 0 },
		);

	it("eggs upgrade the matching card type only", () => {
		expect(choose(["MOLTEN_EGG"], "ANGER").deck.at(-1)?.upgraded).toBe(true);
		expect(choose(["MOLTEN_EGG"], "FLEX").deck.at(-1)?.upgraded).toBe(false);
		expect(choose(["TOXIC_EGG"], "FLEX").deck.at(-1)?.upgraded).toBe(true);
		expect(choose(["FROZEN_EGG"], "BARRICADE").deck.at(-1)?.upgraded).toBe(true);
	});

	it("Ceramic Fish +9 gold per card", () => {
		expect(choose(["CERAMIC_FISH"], "ANGER").gold).toBe(109);
	});

	it("Omamori negates 2 curses (no Darkstone); then Darkstone +6 Max HP", () => {
		let s = base(["event", "event", "event"], ["OMAMORI", "DARKSTONE_PERIAPT"]);
		expect(counter(s, "OMAMORI")).toBe(2);
		const buyCurse = (st: GameState) =>
			run(shopWith({ cards: [cardItem("REGRET", 0)] }, [], st), {
				type: "chooseShopItem",
				index: 0,
			});
		s = buyCurse(buyCurse(s));
		expect(ids(s)).not.toContain("REGRET");
		expect(counter(s, "OMAMORI")).toBe(0);
		expect(s.maxHp).toBe(80);
		s = buyCurse(s);
		expect(ids(s)).toContain("REGRET");
		expect(s.maxHp).toBe(86);
	});

	it("Singing Bowl: +2 Max HP instead of the card", () => {
		const s = run(
			{ ...base([], ["SINGING_BOWL"]), phase: rewardPhase(["ANGER"]) },
			{ type: "singingBowl" },
		);
		expect(s.maxHp).toBe(82);
		expect(s.deck).toHaveLength(10);
		expect(s.phase.type).toBe("map");
	});
});
