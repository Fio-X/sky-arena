/** Act 1 events and shrines, driven through step (chooseEventOption / chooseDeckCards / fights). */
import { beforeAll, describe, expect, it } from "vitest";
import { eventOptions } from "../../core/event";
import { newEventPools } from "../../core/eventRoom";
import { card, monsterAt, patchMonster, playCard, powerAmount } from "../../core/fightTestHelpers";
import { obtainRelic } from "../../core/obtain";
import type { GameState, RelicId } from "../../core/types";
import { getAllCards } from "../loader";
import { base, enter, ids, loadRunData, run } from "../relicsRunTestHelpers";

beforeAll(loadRunData);

const inEvent = (
	eventId: string,
	patch: Partial<GameState> = {},
	screen?: number,
	data?: Record<string, number>,
): GameState => ({
	...base(),
	...patch,
	phase: {
		type: "event",
		eventId,
		...(screen === undefined ? {} : { screen }),
		...(data ? { data } : {}),
	},
});
const choose = (s: GameState, index: number) => run(s, { type: "chooseEventOption", index });
const pickDeck = (s: GameState, indices: number[]) => run(s, { type: "chooseDeckCards", indices });
const screen = (s: GameState) => (s.phase.type === "event" ? (s.phase.screen ?? 0) : -1);
const data = (s: GameState) => (s.phase.type === "event" ? (s.phase.data ?? {}) : {});
const labels = (s: GameState) => eventOptions(s).map((o) => o.label);
const disabled = (s: GameState) => eventOptions(s).map((o) => !!o.disabled);

describe('entering a "?" room', () => {
	it("starts the picked Act 1 event", () => {
		const pools = {
			...newEventPools(1),
			chances: { monster: 0, shop: 0, treasure: 0 },
			events: ["BIG_FISH"],
			shrines: [],
			oneTime: [],
		};
		const s = enter({ ...base(["event"]), eventPools: pools }, 0);
		expect(s.phase).toEqual({ type: "event", eventId: "BIG_FISH" });
		expect(labels(s)[0]).toBe("[Banana] Heal 26 HP.");
	});
});

describe("Big Fish", () => {
	it("Banana heals a third of max HP, Donut gives 5 max HP", () => {
		const banana = choose(inEvent("BIG_FISH"), 0);
		expect(banana.currentHp).toBe(76);
		expect(banana.phase.type).toBe("map");
		const donut = choose(inEvent("BIG_FISH"), 1);
		expect([donut.maxHp, donut.currentHp]).toEqual([85, 55]);
	});

	it("Box gives a relic and Regret", () => {
		const s = choose(inEvent("BIG_FISH"), 2);
		expect(s.relics).toHaveLength(1);
		expect(ids(s)).toContain("REGRET");
		expect(s.rng.relicRng.counter).toBeGreaterThan(0);
	});
});

describe("The Cleric", () => {
	it("Heal: 35 gold for 25% of max HP", () => {
		const s = choose(inEvent("THE_CLERIC"), 0);
		expect([s.gold, s.currentHp, s.phase.type]).toEqual([65, 70, "map"]);
	});

	it("Purify: 50 gold (75 on A15), then remove a card", () => {
		let s = choose(inEvent("THE_CLERIC"), 1);
		expect(s.gold).toBe(50);
		expect(s.phase).toMatchObject({ type: "deckSelect", task: "remove" });
		s = pickDeck(s, [0]);
		expect(s.deck).toHaveLength(9);
		expect(s.phase.type).toBe("map");
		expect(choose(inEvent("THE_CLERIC", { ascension: 15 }), 1).gold).toBe(25);
	});

	it("choices need the gold; Leave does nothing", () => {
		expect(disabled(inEvent("THE_CLERIC", { gold: 40 }))).toEqual([false, true, false]);
		expect(disabled(inEvent("THE_CLERIC", { gold: 60, ascension: 15 }))).toEqual([
			false,
			true,
			false,
		]);
		const poor = inEvent("THE_CLERIC", { gold: 30 });
		expect(choose(poor, 0).phase.type).toBe("event");
		const left = choose(poor, 2);
		expect([left.gold, left.phase.type]).toEqual([30, "map"]);
	});
});

describe("Dead Adventurer", () => {
	const setup = { init: 1, r0: 0, r1: 1, r2: 2, enemy: 2, n: 0 };

	it("first choice rolls the rewards and the enemy (miscRng)", () => {
		const s0 = inEvent("DEAD_ADVENTURER");
		expect(labels(s0)[0]).toContain("25%");
		expect(labels(inEvent("DEAD_ADVENTURER", { ascension: 15 }))[0]).toContain("35%");
		const left = choose(s0, 1);
		expect(left.phase.type).toBe("map");
		expect(left.rng.miscRng.counter).toBeGreaterThan(s0.rng.miscRng.counter);
		const searched = choose(s0, 0);
		const d = data(searched);
		if (screen(searched) === 0) {
			expect([d.r0, d.r1, d.r2].sort()).toEqual([0, 1, 2]);
			expect(d.chance).toBe(50);
		}
		expect(searched.phase.type).toBe("event");
	});

	it("three safe searches give the shuffled rewards in order, then leave", () => {
		let s = inEvent("DEAD_ADVENTURER", {}, 0, { ...setup, chance: 0 });
		s = choose(s, 0); // gold
		expect(s.gold).toBe(130);
		expect(data(s)).toMatchObject({ n: 1, chance: 25 });
		s = inEvent("DEAD_ADVENTURER", { gold: s.gold }, 0, { ...data(s), chance: 0 });
		s = choose(s, 0); // nothing
		expect([s.gold, s.relics.length]).toEqual([130, 0]);
		s = inEvent("DEAD_ADVENTURER", { gold: s.gold }, 0, { ...data(s), chance: 0 });
		s = choose(s, 0); // relic
		expect(s.relics).toHaveLength(1);
		expect(s.phase.type).toBe("map");
	});

	it("an ambush fights the awake Lagavulin; unclaimed rewards join the fight's rewards", () => {
		let s = inEvent("DEAD_ADVENTURER", {}, 0, { ...setup, n: 1, chance: 100 });
		s = choose(s, 0);
		expect(screen(s)).toBe(1);
		expect(labels(s)).toEqual(["[Fight!]"]);
		s = choose(s, 0);
		expect(s.phase.type).toBe("combat");
		const lag = monsterAt(s, 0);
		expect(lag.id).toBe("LAGAVULIN");
		expect(lag.block).toBe(0);
		expect(lag.intent?.moveId).toBe("LAGAVULIN_SIPHON_SOUL");
		expect(powerAmount(lag, "ASLEEP")).toBeUndefined();
		expect(powerAmount(lag, "METALLICIZE")).toBeUndefined();
		expect(s.eventCombat).toMatchObject({ relics: ["random"], cardReward: true, elite: true });
		const gold = s.eventCombat?.gold ?? 0;
		expect(gold).toBeGreaterThanOrEqual(25); // gold already claimed: no +30
		expect(gold).toBeLessThanOrEqual(35);
		s = playCard(patchMonster(s, 0, { currentHp: 1 }), "STRIKE_RED");
		expect(s.phase).toMatchObject({ type: "reward", gold });
		expect(s.relics).toHaveLength(1);
		expect((s.phase as { cardRewards: unknown[] }).cardRewards).toHaveLength(3);
	});

	it("enemy 0 is three Sentries; unclaimed gold adds 30", () => {
		let s = inEvent("DEAD_ADVENTURER", {}, 1, { ...setup, enemy: 0, chance: 25 });
		s = choose(s, 0);
		expect(s.combat?.monsters.map((m) => m.id)).toEqual(["SENTRY", "SENTRY", "SENTRY"]);
		expect(s.eventCombat?.gold).toBeGreaterThanOrEqual(55);
	});
});

describe("Golden Idol", () => {
	const take = (patch: Partial<GameState> = {}) => choose(inEvent("GOLDEN_IDOL", patch), 0);

	it("Take gives the idol, then a trap must be answered", () => {
		const s = take();
		expect(s.relics.map((r) => r.id)).toEqual(["GOLDEN_IDOL"]);
		expect(screen(s)).toBe(1);
		expect(ids(choose(s, 0))).toContain("INJURY");
		expect(choose(s, 1).currentHp).toBe(30);
		const hid = choose(s, 2);
		expect([hid.maxHp, hid.phase.type]).toEqual([74, "map"]);
	});

	it("A15: Smash 35%, Hide 10%; Leave takes nothing", () => {
		const s = take({ ascension: 15 });
		expect(choose(s, 1).currentHp).toBe(22);
		expect(choose(s, 2).maxHp).toBe(72);
		expect(choose(inEvent("GOLDEN_IDOL"), 1).relics).toHaveLength(0);
	});
});

describe("Wing Statue", () => {
	it("Pray: lose 7 HP, then remove a card", () => {
		let s = choose(inEvent("WING_STATUE"), 0);
		expect(s.currentHp).toBe(43);
		s = pickDeck(s, [0]);
		expect(s.deck).toHaveLength(9);
	});

	it("Destroy needs an attack with 10+ damage and gives 50-80 gold", () => {
		expect(disabled(inEvent("WING_STATUE"))[1]).toBe(true);
		const bash = { ...card("BASH", 50) };
		expect(disabled(inEvent("WING_STATUE", { deck: [...base().deck, bash] }))[1]).toBe(true);
		const deck = [...base().deck, { ...bash, upgraded: true }];
		const s = choose(inEvent("WING_STATUE", { deck }), 1);
		expect(s.gold).toBeGreaterThanOrEqual(150);
		expect(s.gold).toBeLessThanOrEqual(180);
		expect(s.phase.type).toBe("map");
	});

	it("dying to the 7 damage ends the run", () => {
		expect(choose(inEvent("WING_STATUE", { currentHp: 7 }), 0).phase).toEqual({
			type: "gameOver",
			victory: false,
		});
	});
});

describe("World of Goop", () => {
	it("Gather: 11 damage, 75 gold", () => {
		const s = choose(inEvent("WORLD_OF_GOOP"), 0);
		expect([s.currentHp, s.gold]).toEqual([39, 175]);
	});

	it("Leave It: lose the amount shown (20-50, capped at your gold)", () => {
		const s0 = inEvent("WORLD_OF_GOOP");
		const shown = Number(labels(s0)[1]?.match(/Lose (\d+)/)?.[1]);
		expect(shown).toBeGreaterThanOrEqual(20);
		expect(shown).toBeLessThanOrEqual(50);
		expect(choose(s0, 1).gold).toBe(100 - shown);
		expect(choose(inEvent("WORLD_OF_GOOP", { gold: 5 }), 1).gold).toBe(0);
	});
});

describe("The Ssssserpent", () => {
	it("Agree: Doubt now, then the gold", () => {
		let s = choose(inEvent("THE_SSSSSERPENT"), 0);
		expect(ids(s)).toContain("DOUBT");
		expect(s.gold).toBe(100);
		s = choose(s, 0);
		expect([s.gold, s.phase.type]).toEqual([275, "map"]);
		const a15 = choose(choose(inEvent("THE_SSSSSERPENT", { ascension: 15 }), 0), 0);
		expect(a15.gold).toBe(250);
	});

	it("Disagree: nothing", () => {
		const s = choose(inEvent("THE_SSSSSERPENT"), 1);
		expect([s.gold, s.deck.length, s.phase.type]).toEqual([100, 10, "map"]);
	});
});

describe("Living Wall", () => {
	it("Forget / Change / Grow open the matching deck pick", () => {
		const tasks = [0, 1, 2].map((i) => choose(inEvent("LIVING_WALL"), i).phase);
		expect(tasks.map((p) => (p.type === "deckSelect" ? p.task : p.type))).toEqual([
			"remove",
			"transform",
			"upgrade",
		]);
		const changed = pickDeck(choose(inEvent("LIVING_WALL"), 1), [0]);
		expect(changed.deck).toHaveLength(10);
		expect(changed.deck.filter((c) => c.id === "STRIKE_RED")).toHaveLength(4);
		const grown = pickDeck(choose(inEvent("LIVING_WALL"), 2), [0]);
		expect(grown.deck[0]?.upgraded).toBe(true);
	});

	it("Grow is locked when nothing can be upgraded", () => {
		const deck = base().deck.map((c) => ({ ...c, upgraded: true }));
		expect(disabled(inEvent("LIVING_WALL", { deck }))).toEqual([false, false, true]);
	});
});

describe("Hypnotizing Colored Mushrooms", () => {
	it("Eat: heal 25% and Parasite", () => {
		const s = choose(inEvent("HYPNOTIZING_COLORED_MUSHROOMS"), 1);
		expect(s.currentHp).toBe(70);
		expect(ids(s)).toContain("PARASITE");
	});

	const stompAndWin = (s0: GameState) => {
		let s = choose(choose(s0, 0), 0);
		expect(s.combat?.monsters.map((m) => m.id)).toEqual([
			"FUNGI_BEAST",
			"FUNGI_BEAST",
			"FUNGI_BEAST",
		]);
		s = patchMonster(s, 1, { currentHp: 0, alive: false });
		s = patchMonster(s, 2, { currentHp: 0, alive: false });
		return playCard(patchMonster(s, 0, { currentHp: 1 }), "STRIKE_RED");
	};

	it("Stomp: fight 3 Fungi Beasts for Odd Mushroom and 20-30 gold", () => {
		const s0 = inEvent("HYPNOTIZING_COLORED_MUSHROOMS");
		expect(labels(choose(s0, 0))).toEqual(["[Fight!]"]);
		const s = stompAndWin(s0);
		expect(s.phase.type).toBe("reward");
		expect(s.relics.map((r) => r.id)).toEqual(["ODD_MUSHROOM"]);
		expect(s.gold).toBeGreaterThanOrEqual(120);
		expect(s.gold).toBeLessThanOrEqual(130);
	});

	it("with Odd Mushroom already owned, Circlet instead", () => {
		const owned = obtainRelic(base(), "ODD_MUSHROOM" as RelicId);
		const s = stompAndWin({
			...owned,
			phase: { type: "event", eventId: "HYPNOTIZING_COLORED_MUSHROOMS" },
		});
		expect(s.relics.map((r) => r.id)).toEqual(["ODD_MUSHROOM", "CIRCLET"]);
	});
});

describe("Scrap Ooze", () => {
	it("a miss costs HP and raises damage by 1 and chance by 10", () => {
		const s0 = inEvent("SCRAP_OOZE", {}, 0, { dmg: 3, chance: -1 });
		const s = choose(s0, 0);
		expect(s.currentHp).toBe(47);
		expect(data(s)).toMatchObject({ dmg: 4, chance: 9 });
		expect(choose(s, 0).currentHp).toBe(43);
	});

	it("a hit gives a relic and ends the event; A15 starts at 5 damage", () => {
		const s = choose(inEvent("SCRAP_OOZE", {}, 0, { dmg: 3, chance: 99 }), 0);
		expect([s.relics.length, s.phase.type]).toEqual([1, "map"]);
		expect(labels(inEvent("SCRAP_OOZE"))[0]).toContain("Lose 3 HP. 25%");
		expect(labels(inEvent("SCRAP_OOZE", { ascension: 15 }))[0]).toContain("Lose 5 HP");
		expect(choose(inEvent("SCRAP_OOZE"), 1).phase.type).toBe("map");
	});

	it("repeated reaching eventually finds a relic", () => {
		let s = inEvent("SCRAP_OOZE", { currentHp: 80 });
		for (let i = 0; i < 10 && s.phase.type === "event"; i++) s = choose(s, 0);
		expect(s.relics).toHaveLength(1);
	});
});

describe("Shining Light", () => {
	it("Enter: 20% (rounded) damage, upgrade 2 random cards", () => {
		const s = choose(inEvent("SHINING_LIGHT"), 0);
		expect(s.currentHp).toBe(34);
		expect(s.deck.filter((c) => c.upgraded)).toHaveLength(2);
		expect(labels(inEvent("SHINING_LIGHT", { maxHp: 83 }))[0]).toContain("Take 17 damage");
		expect(labels(inEvent("SHINING_LIGHT", { ascension: 15 }))[0]).toContain("Take 24 damage");
	});

	it("locked without upgradable cards; Leave", () => {
		const deck = base().deck.map((c) => ({ ...c, upgraded: true }));
		expect(disabled(inEvent("SHINING_LIGHT", { deck }))).toEqual([true, false]);
		expect(choose(inEvent("SHINING_LIGHT"), 1).currentHp).toBe(50);
	});
});

describe("Golden Shrine", () => {
	it("Pray 100 gold (A15: 50); Desecrate 275 gold and Regret", () => {
		expect(choose(inEvent("GOLDEN_SHRINE"), 0).gold).toBe(200);
		expect(choose(inEvent("GOLDEN_SHRINE", { ascension: 15 }), 0).gold).toBe(150);
		const s = choose(inEvent("GOLDEN_SHRINE"), 1);
		expect(s.gold).toBe(375);
		expect(ids(s)).toContain("REGRET");
		expect(choose(inEvent("GOLDEN_SHRINE"), 2).gold).toBe(100);
	});
});

describe("Transmogrifier, Purifier, Upgrade Shrine", () => {
	it("each opens its deck pick, or leaves", () => {
		const t = pickDeck(choose(inEvent("TRANSMORGRIFIER"), 0), [9]);
		expect(t.deck.filter((c) => c.id === "DEFEND_RED")).toHaveLength(4);
		expect(t.deck).toHaveLength(10);
		expect(pickDeck(choose(inEvent("PURIFIER"), 0), [0]).deck).toHaveLength(9);
		expect(pickDeck(choose(inEvent("UPGRADE_SHRINE"), 0), [3]).deck[3]?.upgraded).toBe(true);
		for (const id of ["TRANSMORGRIFIER", "PURIFIER", "UPGRADE_SHRINE"]) {
			expect(choose(inEvent(id), 1).phase.type).toBe("map");
		}
		const upgraded = base().deck.map((c) => ({ ...c, upgraded: true }));
		expect(disabled(inEvent("UPGRADE_SHRINE", { deck: upgraded }))).toEqual([true, false]);
	});
});

describe("Wheel of Change", () => {
	it("Play spins (miscRng 0-5); the prize button applies it", () => {
		const s = choose(inEvent("WHEEL_OF_CHANGE"), 0);
		expect(screen(s)).toBe(1);
		expect(data(s).result).toBeGreaterThanOrEqual(0);
		expect(data(s).result).toBeLessThanOrEqual(5);
		expect(choose(s, 0).phase.type).not.toBe("event");
	});

	it("each of the six results", () => {
		const prize = (result: number, patch: Partial<GameState> = {}) =>
			choose(inEvent("WHEEL_OF_CHANGE", patch, 1, { result }), 0);
		expect(prize(0).gold).toBe(200);
		expect(prize(0, { act: 2 }).gold).toBe(300);
		expect(prize(1).relics).toHaveLength(1);
		expect(prize(2).currentHp).toBe(80);
		expect(ids(prize(3))).toContain("DECAY");
		expect(pickDeck(prize(4), [0]).deck).toHaveLength(9);
		expect(prize(5).currentHp).toBe(42);
		expect(prize(5, { ascension: 15 }).currentHp).toBe(38);
	});
});

describe("Match and Keep", () => {
	const board = (s: GameState) => [...Array(12).keys()].map((i) => data(s)[`p${i}`] as number);

	it("deals 6 pairs; a match keeps one copy, a miss keeps nothing; 5 attempts", () => {
		let s = choose(inEvent("MATCH_AND_KEEP"), 0);
		expect(screen(s)).toBe(1);
		expect(labels(s)).toHaveLength(12);
		const b = board(s);
		for (let p = 0; p < 6; p++) expect(b.filter((x) => x === p)).toHaveLength(2);
		expect(s.rng.cardRng.counter).toBeGreaterThan(0);

		// A match: both slots of pair 0.
		const a = b.indexOf(0);
		const a2 = b.indexOf(0, a + 1);
		s = choose(s, a);
		expect(disabled(s)[a]).toBe(true);
		s = choose(s, a2);
		expect(screen(s)).toBe(2);
		expect(s.deck).toHaveLength(11);
		expect(labels(s)[0]).toContain("4 attempts left");
		s = choose(s, 0);
		expect(disabled(s)[a]).toBe(true);
		expect(disabled(s)[a2]).toBe(true);

		// Four misses: pair 1 with pair 2 each time.
		for (let i = 0; i < 4; i++) {
			s = choose(choose(s, b.indexOf(1)), b.indexOf(2));
			expect(s.deck).toHaveLength(11);
			s = choose(s, 0);
		}
		expect(s.phase.type).toBe("map");
	});

	it("the six cards: rare, uncommon, common, colorless, curse, Bash (A15: two curses)", () => {
		const kinds = (s: GameState) =>
			[0, 1, 2, 3, 4, 5].map((p) => {
				const def = getAllCards()[data(s)[`c${p}`] as number];
				return `${def?.color}/${def?.rarity}`;
			});
		const normal = kinds(choose(inEvent("MATCH_AND_KEEP"), 0));
		expect(normal).toEqual([
			"red/rare",
			"red/uncommon",
			"red/common",
			"colorless/uncommon",
			"curse/curse",
			"red/basic",
		]);
		const s15 = kinds(choose(inEvent("MATCH_AND_KEEP", { ascension: 15 }), 0));
		expect(s15[3]).toBe("curse/curse");
		const flipped = choose(choose(inEvent("MATCH_AND_KEEP"), 0), 0);
		expect(labels(flipped)[0]).not.toContain("[Flip]");
	});
});
