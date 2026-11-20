/** Act 2 event pool, driven through step: choices, screens, fights and deck picks. */
import { beforeAll, describe, expect, it } from "vitest";
import { patchMonster, playCard } from "../../core/fightTestHelpers";
import { obtainRelic } from "../../core/obtain";
import type { GameState, RelicId } from "../../core/types";
import { createAllStreams, randomBoolean } from "../../rng/stsRandom";
import { getCard } from "../loader";
import { base, ids, loadRunData, run } from "../relicsRunTestHelpers";

beforeAll(loadRunData);

const inEvent = (eventId: string, patch: Partial<GameState> = {}, relics: string[] = []) => {
	let s: GameState = { ...base(), ...patch };
	for (const id of relics) s = obtainRelic(s, id as RelicId);
	return { ...s, phase: { type: "event", eventId } } as GameState;
};
const choose = (s: GameState, ...indices: number[]) =>
	run(s, ...indices.map((index) => ({ type: "chooseEventOption", index }) as const));
const relicIds = (s: GameState) => s.relics.map((r) => r.id as string);
const count = (s: GameState, id: string) => ids(s).filter((c) => c === id).length;
const monsterIds = (s: GameState) => s.combat?.monsters.map((m) => m.id as string);

/** Every monster but the first is gone; the first dies to one Strike. */
function winFight(s: GameState): GameState {
	let f = s;
	const n = s.combat?.monsters.length ?? 0;
	for (let i = 1; i < n; i++) f = patchMonster(f, i, { alive: false, currentHp: 0 });
	return playCard(patchMonster(f, 0, { currentHp: 1 }), "STRIKE_RED");
}

describe("Pleading Vagrant", () => {
	it("offer gold needs 85 gold; gold for a relic", () => {
		const poor = inEvent("PLEADING_VAGRANT", { gold: 50 });
		expect(choose(poor, 0)).toEqual(poor);
		const s = choose(inEvent("PLEADING_VAGRANT"), 0);
		expect(s.gold).toBe(15);
		expect(s.relics).toHaveLength(1);
		expect(s.phase.type).toBe("map");
	});

	it("rob: a relic and Shame; leave: nothing", () => {
		const s = choose(inEvent("PLEADING_VAGRANT"), 1);
		expect(s.relics).toHaveLength(1);
		expect(count(s, "SHAME")).toBe(1);
		expect(s.gold).toBe(100);
		const left = choose(inEvent("PLEADING_VAGRANT"), 2);
		expect(left.phase.type).toBe("map");
		expect(left.deck).toHaveLength(10);
	});

	it("the relic roll never gives a Bottled relic or Whetstone", () => {
		const banned = ["BOTTLED_FLAME", "BOTTLED_LIGHTNING", "BOTTLED_TORNADO", "WHETSTONE"];
		for (let seed = 1n; seed <= 40n; seed++) {
			const s = choose(inEvent("PLEADING_VAGRANT", { rng: createAllStreams(seed) }), 1);
			expect(relicIds(s).filter((r) => banned.includes(r))).toEqual([]);
		}
	});
});

describe("Ancient Writing", () => {
	it("elegance removes a chosen card", () => {
		let s = choose(inEvent("ANCIENT_WRITING"), 0);
		expect(s.phase).toMatchObject({ type: "deckSelect", task: "remove", count: 1 });
		s = run(s, { type: "chooseDeckCards", indices: [0] });
		expect(s.deck).toHaveLength(9);
		expect(s.phase.type).toBe("map");
	});

	it("simplicity upgrades every starter Strike and Defend only", () => {
		const start = inEvent("ANCIENT_WRITING");
		const withBash = {
			...start,
			deck: [...start.deck, { ...start.deck[0], id: "BASH", uniqueId: 99 }],
		};
		const s = choose(withBash as GameState, 1);
		expect(s.deck.filter((c) => c.id !== "BASH").every((c) => c.upgraded)).toBe(true);
		expect(s.deck.find((c) => c.id === "BASH")?.upgraded).toBe(false);
		expect(s.phase.type).toBe("map");
	});
});

describe("Old Beggar", () => {
	it("75 gold, then remove a card", () => {
		expect(choose(inEvent("OLD_BEGGAR", { gold: 74 }), 0).phase.type).toBe("event");
		let s = choose(inEvent("OLD_BEGGAR"), 0);
		expect(s.gold).toBe(25);
		expect(s.phase).toMatchObject({ type: "deckSelect", task: "remove" });
		s = run(s, { type: "chooseDeckCards", indices: [9] });
		expect(s.deck).toHaveLength(9);
		expect(choose(inEvent("OLD_BEGGAR"), 1).phase.type).toBe("map");
	});
});

describe("The Colosseum", () => {
	it("forced Slaver fight without rewards, then Cowardice", () => {
		let s = choose(inEvent("COLOSSEUM"), 0);
		expect(monsterIds(s)).toEqual(["BLUE_SLAVER", "RED_SLAVER"]);
		const gold = s.gold;
		s = winFight(s);
		expect(s.phase).toEqual({ type: "event", eventId: "COLOSSEUM", screen: 1 });
		expect(s.gold).toBe(gold);
		expect(s.combat).toBeNull();
		s = choose(s, 0);
		expect(s.phase.type).toBe("map");
	});

	it("Victory: Taskmaster + Gremlin Nob for 100 gold, two relics and a card reward", () => {
		let s = choose(inEvent("COLOSSEUM"), 0);
		s = choose(winFight(s), 1);
		expect(monsterIds(s)).toEqual(["TASKMASTER", "GREMLIN_NOB"]);
		expect(s.eventCombat).toMatchObject({ gold: 100, relics: ["rare", "uncommon"], elite: true });
		s = winFight(s);
		expect(s.phase).toMatchObject({ type: "reward", gold: 100 });
		expect(s.phase.type === "reward" && s.phase.cardRewards.length).toBe(3);
		expect(s.gold).toBe(200);
		expect(s.relics).toHaveLength(2);
	});
});

describe("Cursed Tome", () => {
	it("read three pages (1, 2, 3 HP), then take a book (10 HP)", () => {
		let s = choose(inEvent("CURSED_TOME"), 0);
		expect(s.phase).toMatchObject({ screen: 1 });
		expect(s.currentHp).toBe(50);
		s = choose(s, 0, 0, 0);
		expect(s.phase).toMatchObject({ screen: 4 });
		expect(s.currentHp).toBe(44);
		s = choose(s, 0);
		expect(s.currentHp).toBe(34);
		expect(
			relicIds(s).some((r) => ["NECRONOMICON", "ENCHIRIDION", "NILRYS_CODEX"].includes(r)),
		).toBe(true);
		expect(s.phase.type).toBe("map");
	});

	it("stop costs 3 HP; A15 take costs 15; leave at once costs nothing", () => {
		expect(choose(inEvent("CURSED_TOME"), 0, 0, 0, 0, 1).currentHp).toBe(41);
		const hard = choose(inEvent("CURSED_TOME", { ascension: 15 }), 0, 0, 0, 0, 0);
		expect(hard.currentHp).toBe(29);
		const left = choose(inEvent("CURSED_TOME"), 1);
		expect(left.currentHp).toBe(50);
		expect(left.phase.type).toBe("map");
	});

	it("owned books are skipped; all three owned gives Circlet", () => {
		const two = inEvent("CURSED_TOME", {}, ["NECRONOMICON", "ENCHIRIDION"]);
		expect(relicIds(choose(two, 0, 0, 0, 0, 0))).toContain("NILRYS_CODEX");
		const all = inEvent("CURSED_TOME", {}, ["NECRONOMICON", "ENCHIRIDION", "NILRYS_CODEX"]);
		expect(relicIds(choose(all, 0, 0, 0, 0, 0))).toContain("CIRCLET");
	});

	it("Tungsten Rod takes 1 off each page; a page can kill", () => {
		const rod = choose(inEvent("CURSED_TOME", {}, ["TUNGSTEN_ROD"]), 0, 0, 0, 0);
		expect(rod.currentHp).toBe(47);
		const dead = choose(inEvent("CURSED_TOME", { currentHp: 3 }), 0, 0, 0);
		expect(dead.currentHp).toBe(0);
		expect(dead.phase).toEqual({ type: "gameOver", victory: false });
	});
});

describe("Augmenter", () => {
	it("J.A.X., transform 2, Mutagenic Strength (Circlet if owned)", () => {
		expect(count(choose(inEvent("AUGMENTER"), 0), "JAX")).toBe(1);
		let s = choose(inEvent("AUGMENTER"), 1);
		expect(s.phase).toMatchObject({ type: "deckSelect", task: "transform", count: 2 });
		s = run(s, { type: "chooseDeckCards", indices: [0, 1] });
		expect(s.deck).toHaveLength(10);
		expect(count(s, "STRIKE_RED")).toBe(3);
		expect(relicIds(choose(inEvent("AUGMENTER"), 2))).toEqual(["MUTAGENIC_STRENGTH"]);
		const owned = inEvent("AUGMENTER", {}, ["MUTAGENIC_STRENGTH"]);
		expect(relicIds(choose(owned, 2))).toEqual(["MUTAGENIC_STRENGTH", "CIRCLET"]);
	});

	it("the transform needs two removable cards", () => {
		const one = inEvent("AUGMENTER", { deck: base().deck.slice(0, 1) });
		expect(choose(one, 1).phase.type).toBe("event");
	});
});

describe("Forgotten Altar", () => {
	it("the Golden Idol becomes the Bloody Idol in its slot", () => {
		expect(choose(inEvent("FORGOTTEN_ALTAR"), 0).phase.type).toBe("event");
		const s = choose(inEvent("FORGOTTEN_ALTAR", {}, ["GOLDEN_IDOL", "ANCHOR"]), 0);
		expect(relicIds(s)).toEqual(["BLOODY_IDOL", "ANCHOR"]);
	});

	it("sacrifice: +5 Max HP, lose 25% (A15 35%) of the old Max HP; desecrate: Decay", () => {
		const s = choose(inEvent("FORGOTTEN_ALTAR"), 1);
		expect(s.maxHp).toBe(85);
		expect(s.currentHp).toBe(35); // 50 + 5 − 20
		expect(choose(inEvent("FORGOTTEN_ALTAR", { ascension: 15 }), 1).currentHp).toBe(27); // − 28
		expect(count(choose(inEvent("FORGOTTEN_ALTAR"), 2), "DECAY")).toBe(1);
	});
});

describe("Council of Ghosts", () => {
	it("half the Max HP for 5 Apparitions (A15: 3); refuse", () => {
		const s = choose(inEvent("GHOSTS"), 0);
		expect(s.maxHp).toBe(40);
		expect(s.currentHp).toBe(40);
		expect(count(s, "APPARITION")).toBe(5);
		const odd = choose(inEvent("GHOSTS", { maxHp: 75, ascension: 15 }), 0);
		expect(odd.maxHp).toBe(37); // ceil(37.5) lost
		expect(count(odd, "APPARITION")).toBe(3);
		expect(choose(inEvent("GHOSTS"), 1).maxHp).toBe(80);
	});
});

describe("Masked Bandits", () => {
	it("pay: lose all gold", () => {
		const s = choose(inEvent("MASKED_BANDITS"), 0);
		expect(s.gold).toBe(0);
		expect(s.phase.type).toBe("map");
	});

	it("fight: 25-35 gold, a card reward, then the Red Mask (Circlet if owned)", () => {
		const start = inEvent("MASKED_BANDITS");
		let s = choose(start, 1);
		expect(monsterIds(s)).toEqual(["POINTY", "ROMEO", "BEAR"]);
		const gold = s.eventCombat?.gold ?? 0;
		expect(gold).toBeGreaterThanOrEqual(25);
		expect(gold).toBeLessThanOrEqual(35);
		expect(s.rng.miscRng).not.toEqual(start.rng.miscRng);
		s = winFight(s);
		expect(s.phase).toMatchObject({ type: "reward", gold });
		expect(s.gold).toBe(100 + gold);
		s = run(s, { type: "proceed" });
		expect(s.phase).toEqual({ type: "event", eventId: "MASKED_BANDITS", screen: 1 });
		s = choose(s, 0);
		expect(relicIds(s)).toEqual(["RED_MASK"]);
		expect(s.phase.type).toBe("map");
		const owned = inEvent("MASKED_BANDITS", {}, ["RED_MASK"]);
		const again = choose(
			{ ...owned, phase: { type: "event", eventId: "MASKED_BANDITS", screen: 1 } },
			0,
		);
		expect(relicIds(again)).toEqual(["RED_MASK", "CIRCLET"]);
	});
});

describe("The Nest", () => {
	it("99 gold (A15 50), or 6 damage and the Ritual Dagger", () => {
		expect(choose(inEvent("THE_NEST"), 0).gold).toBe(199);
		expect(choose(inEvent("THE_NEST", { ascension: 15 }), 0).gold).toBe(150);
		const s = choose(inEvent("THE_NEST"), 1);
		expect(s.currentHp).toBe(44);
		expect(count(s, "RITUAL_DAGGER")).toBe(1);
		expect(s.phase.type).toBe("map");
	});
});

describe("The Library", () => {
	it("read: pick 1 of 20 distinct class cards", () => {
		const start = inEvent("THE_LIBRARY");
		let s = choose(start, 0);
		if (s.phase.type !== "reward") throw new Error("no reward");
		const cards = s.phase.cardRewards;
		expect(cards).toHaveLength(20);
		expect(new Set(cards).size).toBe(20);
		expect(cards.every((c) => getCard(c)?.color === "red")).toBe(true);
		expect(s.rng.cardRng).not.toEqual(start.rng.cardRng);
		s = run(s, { type: "chooseCardReward", index: 0 });
		expect(ids(s)).toContain(cards[0]);
		expect(s.deck).toHaveLength(11);
		expect(s.phase.type).toBe("map");
	});

	it("sleep: heal 33% of Max HP (A15 20%)", () => {
		expect(choose(inEvent("THE_LIBRARY"), 1).currentHp).toBe(76); // round(26.4)
		expect(choose(inEvent("THE_LIBRARY", { ascension: 15 }), 1).currentHp).toBe(66);
	});
});

describe("The Mausoleum", () => {
	it("a relic; Writhe on a miscRng coin flip (always at A15)", () => {
		const outcomes = new Set<boolean>();
		for (let seed = 1n; seed <= 10n; seed++) {
			const start = inEvent("THE_MAUSOLEUM", { rng: createAllStreams(seed) });
			const s = choose(start, 0);
			const cursed = randomBoolean(start.rng.miscRng).value;
			outcomes.add(cursed);
			expect(s.relics).toHaveLength(1);
			expect(count(s, "WRITHE")).toBe(cursed ? 1 : 0);
		}
		expect(outcomes.size).toBe(2);
		const hard = choose(inEvent("THE_MAUSOLEUM", { ascension: 15 }), 0);
		expect(count(hard, "WRITHE")).toBe(1);
		expect(choose(inEvent("THE_MAUSOLEUM"), 1).relics).toHaveLength(0);
	});
});

describe("Vampires(?)", () => {
	it("accept: 30% Max HP, Strikes become 5 Bites", () => {
		const s0 = inEvent("VAMPIRES");
		expect(run(s0, { type: "chooseEventOption", index: 2 })).toEqual(s0); // no vial: 2 choices
		const s = choose(s0, 0);
		expect(s.maxHp).toBe(56);
		expect(count(s, "STRIKE_RED")).toBe(0);
		expect(count(s, "BITE")).toBe(5);
		expect(count(s, "DEFEND_RED")).toBe(5);
		expect(choose(inEvent("VAMPIRES"), 1).deck).toHaveLength(10);
	});

	it("the Blood Vial can pay instead", () => {
		const s = choose(inEvent("VAMPIRES", {}, ["BLOOD_VIAL"]), 1);
		expect(relicIds(s)).toEqual([]);
		expect(s.maxHp).toBe(80);
		expect(count(s, "BITE")).toBe(5);
		expect(choose(inEvent("VAMPIRES", {}, ["BLOOD_VIAL"]), 2).deck).toHaveLength(10);
	});
});
