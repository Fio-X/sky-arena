/** Act 3 pool + one-time events of the events batch, driven through step(). */
import { beforeAll, describe, expect, it } from "vitest";
import { eventOptions } from "../../core/event";
import { newEventPools } from "../../core/eventRoom";
import { obtainCard, obtainRelic } from "../../core/obtain";
import type { CardId, GameState, PotionId, RelicId } from "../../core/types";
import { randomBooleanWithChance } from "../../rng/stsRandom";
import { getCard } from "../loader";
import { base, enter, ids, linearMap, loadRunData, run } from "../relicsRunTestHelpers";
import "./act3Events";

beforeAll(loadRunData);

const at = (
	s: GameState,
	eventId: string,
	screen?: number,
	data?: Record<string, number>,
): GameState => ({ ...s, phase: { type: "event", eventId, screen, data } });
const choose = (s: GameState, ...indices: number[]): GameState =>
	run(s, ...indices.map((index) => ({ type: "chooseEventOption" as const, index })));
const labels = (s: GameState) => eventOptions(s).map((o) => o.label);
const enabled = (s: GameState) => eventOptions(s).map((o) => !o.disabled);
const relicIds = (s: GameState) => s.relics.map((r) => r.id as string);
const withCards = (s: GameState, ...cards: string[]) =>
	cards.reduce((st, id) => obtainCard(st, id as CardId), s);
const withRelics = (s: GameState, ...relics: string[]) =>
	relics.reduce((st, id) => obtainRelic(st, id as RelicId), s);
const pick = (s: GameState, ...indices: number[]) => run(s, { type: "chooseDeckCards", indices });
const skipRewards = (s: GameState): GameState => {
	let st = s;
	while (st.phase.type === "reward") st = run(st, { type: "skipCardReward" });
	return st;
};

describe("entering a ? room", () => {
	it("an Act 3 event comes from the pool and its handler runs", () => {
		const pools = {
			...newEventPools(3),
			events: ["WINDING_HALLS"],
			shrines: [],
			oneTime: [],
			chances: { monster: 0, shop: 0, treasure: 0 },
		};
		const s = enter({ ...base(["event"]), act: 3, eventPools: pools }, 0);
		expect(s.phase).toMatchObject({ type: "event", eventId: "WINDING_HALLS" });
		expect(labels(s)).toEqual(["[Continue]"]);
	});
});

describe("Falling", () => {
	it("one random card per type is shown; landing loses the skill", () => {
		let s = choose(at(base(), "FALLING"), 0);
		const misc = s.rng.miscRng.counter;
		expect(misc).toBe(base().rng.miscRng.counter + 2); // attack + skill, no power
		expect(enabled(s)).toEqual([true, false, true]);
		expect(labels(s)[0]).toBe("[Land] Lose Defend.");
		const shown = s.phase.type === "event" ? s.phase.data?.skill : -1;
		s = choose(s, 1); // disabled: nothing happens
		expect(s.phase.type).toBe("event");
		s = choose(s, 0);
		expect(s.deck).toHaveLength(9);
		expect(s.deck.some((c) => c.uniqueId === shown)).toBe(false);
		expect(s.phase.type).toBe("map");
	});

	it("strike loses the attack; no attack/skill/power at all lands on your head", () => {
		const s = choose(at(base(), "FALLING"), 0, 2);
		expect(ids(s).filter((id) => id === "STRIKE_RED")).toHaveLength(4);
		const curses = { ...base(), deck: withCards({ ...base(), deck: [] }, "REGRET").deck };
		const head = choose(at(curses, "FALLING"), 0);
		expect(labels(head)).toEqual(["[Land on your head] Lose nothing."]);
		expect(choose(head, 0).deck).toHaveLength(1);
	});
});

describe("Mind Bloom", () => {
	it("I am War: a random Act 1 boss with gold, a rare relic and a card reward", () => {
		let s = choose(at(base(), "MINDBLOOM"), 0);
		expect(labels(s)).toEqual(["[Fight!]"]);
		expect(s.rng.miscRng.counter).toBe(base().rng.miscRng.counter + 1);
		s = choose(s, 0);
		expect(s.phase.type).toBe("combat");
		expect(["THE_GUARDIAN", "HEXAGHOST", "SLIME_BOSS"]).toContain(s.combat?.monsters[0]?.id);
		expect(s.eventCombat).toMatchObject({ gold: 50, relics: ["rare"], cardReward: true });
		const a13 = choose(at({ ...base(), ascension: 13 }, "MINDBLOOM"), 0, 0);
		expect(a13.eventCombat?.gold).toBe(25);
	});

	it("I am Awake upgrades every card and gives Mark of the Bloom", () => {
		const s = choose(at(withCards(base(), "REGRET"), "MINDBLOOM"), 1);
		expect(s.deck.filter((c) => c.upgraded)).toHaveLength(10);
		expect(s.deck.find((c) => c.id === "REGRET")?.upgraded).toBe(false);
		expect(relicIds(s)).toContain("MARK_OF_THE_BLOOM");
		expect(s.phase.type).toBe("map");
	});

	it("I am Rich up to floor 40, I am Healthy after", () => {
		const rich = choose(at({ ...base(), floor: 40 }, "MINDBLOOM"), 2);
		expect(rich.gold).toBe(1099);
		expect(ids(rich).filter((id) => id === "NORMALITY")).toHaveLength(2);
		const s = at({ ...base(), floor: 41 }, "MINDBLOOM");
		expect(labels(s)[2]).toMatch(/I am Healthy/);
		const healthy = choose(s, 2);
		expect(healthy.currentHp).toBe(80);
		expect(ids(healthy)).toContain("DOUBT");
	});
});

describe("The Moai Head", () => {
	it("jump: lose 12.5% max HP (18% at A15), heal to full", () => {
		const s = choose(at(base(), "THE_MOAI_HEAD"), 0);
		expect([s.maxHp, s.currentHp]).toEqual([70, 70]);
		const a15 = choose(at({ ...base(), ascension: 15 }, "THE_MOAI_HEAD"), 0);
		expect(a15.maxHp).toBe(66);
		const bloom = choose(at(withRelics(base(), "MARK_OF_THE_BLOOM"), "THE_MOAI_HEAD"), 0);
		expect([bloom.maxHp, bloom.currentHp]).toEqual([70, 50]);
	});

	it("the Golden Idol trade needs the idol", () => {
		expect(enabled(at(base(), "THE_MOAI_HEAD"))).toEqual([true, false, true]);
		const s = choose(at(withRelics(base(), "GOLDEN_IDOL"), "THE_MOAI_HEAD"), 1);
		expect(s.gold).toBe(433);
		expect(relicIds(s)).not.toContain("GOLDEN_IDOL");
		expect(choose(at(base(), "THE_MOAI_HEAD"), 2).phase.type).toBe("map");
	});
});

describe("Mysterious Sphere", () => {
	it("open, then fight two Orb Walkers for 45-55 gold and a rare relic", () => {
		let s = choose(at(base(), "MYSTERIOUS_SPHERE"), 0);
		expect(labels(s)).toEqual(["[Fight!]"]);
		s = choose(s, 0);
		expect(s.combat?.monsters.map((m) => m.id)).toEqual(["ORB_WALKER", "ORB_WALKER"]);
		const gold = s.eventCombat?.gold ?? 0;
		expect(gold).toBeGreaterThanOrEqual(45);
		expect(gold).toBeLessThanOrEqual(55);
		expect(s.eventCombat).toMatchObject({ relics: ["rare"], cardReward: true, potion: true });
		expect(choose(at(base(), "MYSTERIOUS_SPHERE"), 1)).toMatchObject({ gold: 100 });
	});
});

describe("Sensory Stone", () => {
	it("recall 3: lose 10 HP, three colorless card rewards in a row", () => {
		let s = choose(at(base(), "SENSORY_STONE"), 0, 2);
		expect(s.currentHp).toBe(40);
		for (let i = 0; i < 3; i++) {
			expect(s.phase.type).toBe("reward");
			const cards = s.phase.type === "reward" ? s.phase.cardRewards : [];
			expect(cards).toHaveLength(3);
			expect(new Set(cards).size).toBe(3);
			for (const id of cards) expect(getCard(id)?.color).toBe("colorless");
			s = run(s, { type: i === 0 ? "chooseCardReward" : "skipCardReward", index: 0 } as never);
		}
		expect(s.phase.type).toBe("map");
		expect(s.deck).toHaveLength(11);
	});

	it("recall 1 costs nothing", () => {
		const s = choose(at(base(), "SENSORY_STONE"), 0, 0);
		expect(s.currentHp).toBe(50);
		expect(skipRewards(s).phase.type).toBe("map");
	});
});

describe("Tomb of Lord Red Mask", () => {
	it("without the mask: offer all gold for it", () => {
		const s = at(base(), "TOMB_OF_LORD_RED_MASK");
		expect(enabled(s)).toEqual([false, true, true]);
		const after = choose(s, 1);
		expect(after.gold).toBe(0);
		expect(relicIds(after)).toContain("RED_MASK");
	});

	it("with the mask: 222 gold", () => {
		const s = at(withRelics(base(), "RED_MASK"), "TOMB_OF_LORD_RED_MASK");
		expect(labels(s)).toHaveLength(2);
		expect(choose(s, 0).gold).toBe(322);
	});
});

describe("Winding Halls", () => {
	const halls = (s = base()) => choose(at(s, "WINDING_HALLS"), 0);
	it("madness: lose 10 HP, two Madness", () => {
		const s = choose(halls(), 0);
		expect(s.currentHp).toBe(40);
		expect(ids(s).filter((id) => id === "MADNESS")).toHaveLength(2);
	});
	it("press on: heal 25% (20% at A15) and Writhe", () => {
		const s = choose(halls(), 1);
		expect(s.currentHp).toBe(70);
		expect(ids(s)).toContain("WRITHE");
		expect(choose(halls({ ...base(), ascension: 15 }), 1).currentHp).toBe(66);
	});
	it("retrace: lose 5% max HP", () => {
		expect(choose(halls(), 2).maxHp).toBe(76);
	});
});

describe("Ominous Forge", () => {
	it("forge upgrades a chosen card; rummage gives Warped Tongs and Pain", () => {
		let s = choose(at(base(), "OMINOUS_FORGE"), 0);
		expect(s.phase).toMatchObject({ type: "deckSelect", task: "upgrade", count: 1 });
		s = pick(s, 3);
		expect(s.deck[3]?.upgraded).toBe(true);
		expect(s.phase.type).toBe("map");
		const r = choose(at(base(), "OMINOUS_FORGE"), 1);
		expect(ids(r)).toContain("PAIN");
		expect(relicIds(r)).toContain("WARPED_TONGS");
	});
});

describe("Bonfire Spirits", () => {
	const offer = (s: GameState, card: string) => {
		const st = choose(at(withCards(s, card), "BONFIRE_SPIRITS"), 0, 0);
		expect(st.phase).toMatchObject({ type: "deckSelect", task: "bonfire" });
		return pick(st, st.deck.length - 1);
	};
	it("reward by rarity", () => {
		expect(relicIds(offer(base(), "REGRET"))).toContain("SPIRIT_POOP");
		expect(offer(base(), "SHRUG_IT_OFF").currentHp).toBe(55); // common
		expect(offer(base(), "SHOCKWAVE").currentHp).toBe(80); // uncommon
		const rare = offer(base(), "DEMON_FORM");
		expect([rare.maxHp, rare.currentHp]).toEqual([90, 90]);
		const basic = pick(choose(at(base(), "BONFIRE_SPIRITS"), 0, 0), 0);
		expect([basic.deck.length, basic.currentHp, basic.phase.type]).toEqual([9, 50, "map"]);
	});
});

describe("Designer In-Spire", () => {
	const shop = (data: Record<string, number>, s = base()) => at(s, "DESIGNER_IN_SPIRE", 1, data);
	it("continue rolls the two service variants (miscRng)", () => {
		const s = choose(at(base(), "DESIGNER_IN_SPIRE"), 0);
		expect(s.rng.miscRng.counter).toBe(base().rng.miscRng.counter + 2);
		expect(labels(s)).toHaveLength(4);
	});
	it("adjustments: upgrade a chosen card, or 2 random cards", () => {
		const one = choose(shop({ upgradeOne: 1, removes: 1 }), 0);
		expect(one.gold).toBe(60);
		expect(one.phase).toMatchObject({ type: "deckSelect", task: "upgrade" });
		const two = choose(shop({ upgradeOne: 0, removes: 1 }), 0);
		expect(two.deck.filter((c) => c.upgraded)).toHaveLength(2);
		expect(two.phase.type).toBe("map");
	});
	it("clean up: remove one, or transform two", () => {
		const rm = choose(shop({ upgradeOne: 1, removes: 1 }), 1);
		expect(rm.gold).toBe(40);
		expect(pick(rm, 0).deck).toHaveLength(9);
		const tf = choose(shop({ upgradeOne: 1, removes: 0 }), 1);
		expect(tf.phase).toMatchObject({ type: "deckSelect", task: "transform", count: 2 });
	});
	it("full service: remove, then upgrade a random card; punch; gold locks", () => {
		const full = pick(choose(shop({ upgradeOne: 1, removes: 1 }), 2), 0);
		expect(full.gold).toBe(10);
		expect(full.deck).toHaveLength(9);
		expect(full.deck.filter((c) => c.upgraded)).toHaveLength(1);
		expect(choose(shop({}), 3).currentHp).toBe(47);
		const poor = shop({ upgradeOne: 1, removes: 1 }, { ...base(), gold: 50 });
		expect(enabled(poor)).toEqual([true, false, false, true]);
		const a15 = shop({}, { ...base(), ascension: 15 });
		expect(labels(a15)[3]).toBe("[Punch] Lose 5 HP.");
		expect(labels(a15)[2]).toMatch(/110 Gold/);
	});
});

describe("Duplicator", () => {
	it("copies a chosen card", () => {
		const s = pick(choose(at(base(), "DUPLICATOR"), 0), 9);
		expect(s.deck).toHaveLength(11);
		expect(choose(at(base(), "DUPLICATOR"), 1).deck).toHaveLength(10);
	});
});

describe("Face Trader", () => {
	it("touch: lose 10% max HP, gain 75 gold (50 at A15)", () => {
		const s = choose(at(base(), "FACE_TRADER"), 0, 0);
		expect([s.currentHp, s.gold]).toEqual([42, 175]);
		expect(choose(at({ ...base(), ascension: 15 }, "FACE_TRADER"), 0, 0).gold).toBe(150);
	});
	it("trade: a random face you do not own, Circlet when you own them all", () => {
		const s = choose(at(base(), "FACE_TRADER"), 0, 1);
		const faces = ["CULTIST_HEADPIECE", "FACE_OF_CLERIC", "GREMLIN_VISAGE"];
		const all = [...faces, "NLOTHS_HUNGRY_FACE", "SSSERPENT_HEAD"];
		expect(all).toContain(relicIds(s).at(-1));
		expect(s.rng.miscRng.counter).toBe(base().rng.miscRng.counter + 1);
		const full = choose(at(withRelics(base(), ...all), "FACE_TRADER"), 0, 1);
		expect(relicIds(full).at(-1)).toBe("CIRCLET");
	});
});

describe("The Divine Fountain", () => {
	it("removes every curse except the unremovable ones", () => {
		const s = withCards(base(), "REGRET", "PAIN", "ASCENDERS_BANE");
		const after = choose(at(s, "THE_DIVINE_FOUNTAIN"), 0);
		expect(ids(after).filter((id) => getCard(id)?.type === "curse")).toEqual(["ASCENDERS_BANE"]);
		expect(after.deck).toHaveLength(11);
	});
});

describe("Knowing Skull", () => {
	it("each purchase costs one more HP; the event stays until you leave", () => {
		let s = choose(at(base(), "KNOWING_SKULL"), 0, 0, 0);
		expect([s.currentHp, s.gold]).toEqual([37, 280]);
		expect(labels(s)[0]).toMatch(/Lose 8 HP/);
		s = choose(s, 1);
		expect(s.currentHp).toBe(31);
		const card = getCard(s.deck.at(-1)?.id ?? "");
		expect([card?.color, card?.rarity]).toEqual(["colorless", "uncommon"]);
		s = choose(s, 2);
		expect(s.potions.filter(Boolean)).toHaveLength(1);
		s = choose(s, 3);
		expect([s.currentHp, s.phase.type]).toEqual([19, "map"]);
	});
	it("paying with your last HP ends the run", () => {
		const s = choose(at({ ...base(), currentHp: 6 }, "KNOWING_SKULL", 1), 0);
		expect(s.phase).toEqual({ type: "gameOver", victory: false });
	});
});

describe("Lab", () => {
	it("three potions (two at A15), one reward screen each", () => {
		let s = choose(at(base(), "LAB"), 0);
		for (let i = 0; i < 3; i++) {
			expect(s.phase).toMatchObject({ type: "reward", cardRewards: [] });
			s = run(s, { type: "obtainPotionReward" }, { type: "proceed" });
		}
		expect(s.potions.filter(Boolean)).toHaveLength(3);
		expect(s.phase.type).toBe("map");
		const a15 = run(choose(at({ ...base(), ascension: 15 }, "LAB"), 0), { type: "proceed" });
		expect(a15.phase.type).toBe("reward");
		expect(run(a15, { type: "proceed" }).phase.type).toBe("map");
	});
});

describe("N'loth", () => {
	const nloth = () =>
		at(withRelics(base(), "ANCHOR", "VAJRA", "LANTERN"), "NLOTH", undefined, undefined);
	it("two of your relics are offered; the one given is traded for N'loth's Gift", () => {
		const s = nloth();
		const offered = labels(s)
			.slice(0, 2)
			.map((l) => l.match(/^\[Offer (.+?)\]/)?.[1]);
		expect(new Set(offered).size).toBe(2);
		const after = choose(s, 0);
		expect(after.relics).toHaveLength(3);
		expect(relicIds(after)).toContain("NLOTHS_GIFT");
		expect(after.rng.miscRng.counter).toBe(s.rng.miscRng.counter + 1);
		expect(choose(s, 2).rng.miscRng.counter).toBe(s.rng.miscRng.counter + 1);
	});
});

describe("Note For Yourself", () => {
	it("take Iron Wave, leave a card behind", () => {
		let s = choose(at(base(), "NOTE_FOR_YOURSELF"), 0, 0);
		expect(s.phase).toMatchObject({ type: "deckSelect", task: "noteForYourself" });
		s = pick(s, 0);
		expect(s.deck).toHaveLength(10);
		expect(ids(s)).toContain("IRON_WAVE");
		expect(ids(s).filter((id) => id === "STRIKE_RED")).toHaveLength(4);
		expect(choose(at(base(), "NOTE_FOR_YOURSELF"), 0, 1).deck).toHaveLength(10);
	});
});

describe("Secret Portal", () => {
	it("the next room is the act boss", () => {
		const map = {
			...linearMap(["event", "monster", "rest", "monster", "boss"]),
			currentNode: { x: 0, y: 0 },
		};
		let s = choose(at({ ...base(), map }, "SECRET_PORTAL"), 0);
		expect(s.phase.type).toBe("map");
		expect(s.map.currentNode).toEqual({ x: 0, y: 3 });
		s = enter(s, 4);
		expect(s.phase.type).toBe("combat");
		expect(s.combat?.monsters[0]?.id).toBe("THE_GUARDIAN");
		expect(choose(at({ ...base(), map }, "SECRET_PORTAL"), 1).map.currentNode).toEqual({
			x: 0,
			y: 0,
		});
	});
});

describe("The Joust", () => {
	it("pay 50; the owner wins 30% of the time (miscRng)", () => {
		const s = choose(at(base(), "THE_JOUST"), 0);
		const ownerWins = randomBooleanWithChance(s.rng.miscRng, 0.3).value;
		expect(choose(s, 0).gold).toBe(ownerWins ? 50 : 150);
		expect(choose(s, 1).gold).toBe(ownerWins ? 300 : 50);
	});
});

describe("We Meet Again!", () => {
	const rich = (): GameState => ({
		...withCards(base(), "SHRUG_IT_OFF"),
		gold: 200,
		potions: ["FIRE_POTION" as PotionId, null, null],
	});
	it("give a potion, gold or a card for a relic", () => {
		const s = at(rich(), "WE_MEET_AGAIN");
		expect(enabled(s)).toEqual([true, true, true, true]);
		const potion = choose(s, 0);
		expect(potion.potions).toEqual([null, null, null]);
		expect(potion.relics).toHaveLength(1);
		const gold = choose(s, 1);
		const paid = 200 - gold.gold;
		expect(paid).toBeGreaterThanOrEqual(50);
		expect(paid).toBeLessThanOrEqual(150);
		expect(labels(s)[1]).toBe(`[Give ${paid} Gold] Obtain a Relic.`);
		const card = choose(s, 2);
		expect(ids(card)).not.toContain("SHRUG_IT_OFF");
		expect(card.relics).toHaveLength(1);
		const attack = choose(s, 3);
		expect([attack.relics.length, attack.gold, attack.phase.type]).toEqual([0, 200, "map"]);
		expect(attack.rng.miscRng.counter).toBe(s.rng.miscRng.counter + 3);
	});
	it("each gift is locked without the thing to give", () => {
		expect(enabled(at({ ...base(), gold: 40 }, "WE_MEET_AGAIN"))).toEqual([
			false,
			false,
			false,
			true,
		]);
	});
});

describe("The Woman in Blue", () => {
	it("buy 2 potions for 30 gold; purchases need the gold", () => {
		let s = choose(at(base(), "THE_WOMAN_IN_BLUE"), 1);
		expect(s.gold).toBe(70);
		s = run(s, { type: "obtainPotionReward" }, { type: "proceed" });
		s = run(s, { type: "obtainPotionReward" }, { type: "proceed" });
		expect(s.potions.filter(Boolean)).toHaveLength(2);
		expect(s.phase.type).toBe("map");
		expect(enabled(at({ ...base(), gold: 25 }, "THE_WOMAN_IN_BLUE"))).toEqual([
			true,
			false,
			false,
			true,
		]);
	});
	it("leaving costs 5% max HP at A15 only", () => {
		expect(choose(at(base(), "THE_WOMAN_IN_BLUE"), 3).currentHp).toBe(50);
		expect(choose(at({ ...base(), ascension: 15 }, "THE_WOMAN_IN_BLUE"), 3).currentHp).toBe(46);
	});
});
