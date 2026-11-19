import { beforeAll, describe, expect, it } from "vitest";
import {
	endTurn,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
} from "../core/fightTestHelpers";
import { obtainRelic } from "../core/obtain";
import { step } from "../core/step";
import type { RelicId } from "../core/types";
import { getCard } from "./loader";
import { USED_UP } from "./relicsCombatRules";
import { combat, counterOf, deckOf, enter, roomState, withCombat } from "./relicsCombatTestHelpers";

const player = (s: Parameters<typeof combat>[0]) => combat(s).player;

describe("Combat relics: start of combat", () => {
	beforeAll(loadAllData);

	it("Bag of Preparation draws 2 more on turn 1 only", () => {
		const s = enter(["BAG_OF_PREPARATION"]);
		expect(combat(s).hand).toHaveLength(7);
		expect(combat(endTurn(s)).hand).toHaveLength(5);
	});

	it("Blood Vial heals 2; Magic Flower makes it 3; Mark of the Bloom makes it 0", () => {
		expect(enter(["BLOOD_VIAL"], { hp: 50, maxHp: 80 }).currentHp).toBe(52);
		expect(enter(["BLOOD_VIAL", "MAGIC_FLOWER"], { hp: 50, maxHp: 80 }).currentHp).toBe(53);
		expect(enter(["BLOOD_VIAL", "MARK_OF_THE_BLOOM"], { hp: 50, maxHp: 80 }).currentHp).toBe(50);
	});

	it("Clockwork Souvenir: 1 Artifact, which cancels Gremlin Visage's Weak", () => {
		expect(powerAmount(player(enter(["CLOCKWORK_SOUVENIR"])), "ARTIFACT")).toBe(1);
		expect(powerAmount(player(enter(["GREMLIN_VISAGE"])), "WEAK")).toBe(1);
		const both = player(enter(["CLOCKWORK_SOUVENIR", "GREMLIN_VISAGE"]));
		expect(powerAmount(both, "WEAK")).toBeUndefined();
		expect(powerAmount(both, "ARTIFACT")).toBeUndefined();
	});

	it("Data Disk: 1 Focus", () => {
		expect(powerAmount(player(enter(["DATA_DISK"])), "FOCUS")).toBe(1);
	});

	it("Mutagenic Strength: 3 Strength, lost at the end of turn 1", () => {
		const s = enter(["MUTAGENIC_STRENGTH"]);
		expect(powerAmount(player(s), "STRENGTH")).toBe(3);
		expect(powerAmount(player(endTurn(s)), "STRENGTH")).toBe(0);
	});

	it("Sling of Courage: 2 Strength in elite rooms only", () => {
		const elite = enter(["SLING_OF_COURAGE"], { room: "elite", enc: "GREMLIN_NOB" });
		expect(powerAmount(player(elite), "STRENGTH")).toBe(2);
		expect(powerAmount(player(enter(["SLING_OF_COURAGE"])), "STRENGTH")).toBeUndefined();
	});

	it("Red Mask: 1 Weak on every enemy", () => {
		const s = enter(["RED_MASK"], { enc: "EXORDIUM_THUGS" });
		expect(combat(s).monsters.map((m) => powerAmount(m, "WEAK"))).toEqual([1, 1]);
	});

	it("Twisted Funnel: 4 Poison on every enemy; Snecko Skull adds 1", () => {
		const s = enter(["TWISTED_FUNNEL"], { enc: "EXORDIUM_THUGS" });
		expect(combat(s).monsters.map((m) => powerAmount(m, "POISON"))).toEqual([4, 4]);
		expect(powerAmount(monsterAt(enter(["TWISTED_FUNNEL", "SNECKO_SKULL"]), 0), "POISON")).toBe(5);
	});

	it("Holy Water adds 3 Miracles, Ninja Scroll 3 Shivs", () => {
		const count = (ids: string[], id: string) => ids.filter((x) => x === id).length;
		const holy = combat(enter(["HOLY_WATER"])).hand.map((c) => c.id as string);
		expect(count(holy, "MIRACLE")).toBe(3);
		const ninja = combat(enter(["NINJA_SCROLL"])).hand.map((c) => c.id as string);
		expect(count(ninja, "SHIV")).toBe(3);
	});

	it("Nuclear Battery channels Plasma, Symbiotic Virus Dark; Runic Capacitor +3 slots", () => {
		expect(player(enter(["NUCLEAR_BATTERY"])).orbs.map((o) => o.type)).toEqual(["plasma"]);
		expect(player(enter(["SYMBIOTIC_VIRUS"])).orbs.map((o) => o.type)).toEqual(["dark"]);
		expect(player(enter(["RUNIC_CAPACITOR"])).orbSlots).toBe(6);
	});

	it("Teardrop Locket starts in Calm; Violet Lotus adds 1 energy on leaving it", () => {
		const deck = deckOf(["ERUPTION", ...Array(9).fill("DEFEND_RED")]);
		const s = enter(["TEARDROP_LOCKET"], { deck });
		expect(player(s).stance).toBe("calm");
		// 3 - 2 (Eruption) + 2 (leave Calm) = 3; Violet Lotus: 4
		expect(combat(playCard(s, "ERUPTION")).energy).toBe(3);
		const lotus = enter(["TEARDROP_LOCKET", "VIOLET_LOTUS"], { deck });
		expect(combat(playCard(lotus, "ERUPTION")).energy).toBe(4);
	});

	it("Pantograph heals 25 in boss rooms only", () => {
		const opts = { hp: 50, maxHp: 100, enc: "HEXAGHOST" };
		expect(enter(["PANTOGRAPH"], { ...opts, room: "boss" }).currentHp).toBe(75);
		expect(enter(["PANTOGRAPH"], opts).currentHp).toBe(50);
	});

	it("Preserved Insect: elite enemies at 75% of max HP", () => {
		const m = monsterAt(enter(["PRESERVED_INSECT"], { room: "elite", enc: "GREMLIN_NOB" }), 0);
		expect(m.currentHp).toBe(Math.floor(m.maxHp * 0.75));
		const normal = monsterAt(enter(["PRESERVED_INSECT"]), 0);
		expect(normal.currentHp).toBe(normal.maxHp);
	});

	it("Neow's Lament: 3 on pickup; enemies at 1 HP for 3 combats, then used up", () => {
		let s = obtainRelic(roomState([]), "NEOWS_LAMENT" as RelicId);
		expect(counterOf(s, "NEOWS_LAMENT")).toBe(3);
		const enterWith = (st: typeof s) => step(st, { type: "chooseMapNode", x: 0, y: 0 }).state;
		for (const left of [2, 1, USED_UP]) {
			const fought = enterWith(s);
			expect(monsterAt(fought, 0).currentHp).toBe(1);
			expect(counterOf(fought, "NEOWS_LAMENT")).toBe(left);
			s = { ...s, relics: fought.relics };
		}
		expect(monsterAt(enterWith(s), 0).currentHp).toBeGreaterThan(1);
	});

	it("Runic Dome: +1 energy every turn; Slaver's Collar only in elite/boss rooms", () => {
		const dome = enter(["RUNIC_DOME"]);
		expect(combat(dome).energy).toBe(4);
		expect(combat(endTurn(dome)).energy).toBe(4);
		expect(combat(enter(["SLAVERS_COLLAR"])).energy).toBe(3);
		const elite = enter(["SLAVERS_COLLAR"], { room: "elite", enc: "GREMLIN_NOB" });
		expect(combat(endTurn(elite)).energy).toBe(4);
	});

	it("Enchiridion adds a class Power card that costs 0 this turn", () => {
		const hand = combat(enter(["ENCHIRIDION"])).hand;
		expect(hand).toHaveLength(6);
		const added = hand.find((c) => getCard(c.id)?.type === "power");
		expect(getCard(added?.id ?? "")?.color).toBe("red");
		expect(added?.costForTurn).toBe(0);
	});

	it("Gambling Chip: choose cards to discard, draw that many", () => {
		const s = enter(["GAMBLING_CHIP"]);
		expect(s.phase).toMatchObject({ type: "cardSelect", task: "gamble" });
		const after = step(s, { type: "chooseCard", indices: [0, 1] }).state;
		expect(after.phase.type).toBe("combat");
		expect(combat(after).hand).toHaveLength(5);
		expect(combat(after).discardPile).toHaveLength(2);
	});

	it("Toolbox: choose 1 of 3 distinct colorless cards into hand", () => {
		const s = enter(["TOOLBOX"]);
		if (s.phase.type !== "cardSelect") throw new Error("no choice");
		const options = s.phase.options ?? [];
		expect(new Set(options.map((c) => c.id)).size).toBe(3);
		expect(options.every((c) => getCard(c.id)?.color === "colorless")).toBe(true);
		const after = step(s, { type: "chooseCard", indices: [1] }).state;
		expect(combat(after).hand.map((c) => c.id)).toContain(options[1]?.id);
	});
});

describe("Combat relics: start of turn", () => {
	beforeAll(loadAllData);

	it("Brimstone: +2 Strength (enemies +1) every turn, turn 1 included", () => {
		const s = enter(["BRIMSTONE"]);
		expect(powerAmount(player(s), "STRENGTH")).toBe(2);
		expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(1);
		expect(powerAmount(player(endTurn(s)), "STRENGTH")).toBe(4);
	});

	it("Damaru: 1 Mantra every turn", () => {
		const s = enter(["DAMARU"], { character: "WATCHER" });
		expect(powerAmount(player(s), "MANTRA")).toBe(1);
		expect(powerAmount(player(endTurn(s)), "MANTRA")).toBe(2);
	});

	it("Inserter: +1 orb slot every 2 turns", () => {
		const s = enter(["INSERTER"]);
		expect(player(s).orbSlots).toBe(3);
		expect(player(endTurn(s)).orbSlots).toBe(4);
	});

	it("Warped Tongs upgrades a random card in hand each turn", () => {
		const s = enter(["WARPED_TONGS"]);
		expect(combat(s).hand.filter((c) => c.upgraded)).toHaveLength(1);
		expect(combat(enter([])).hand.filter((c) => c.upgraded)).toHaveLength(0);
	});

	it("Ring of the Serpent draws 1 more every turn", () => {
		const s = enter(["RING_OF_THE_SERPENT"]);
		expect(combat(s).hand).toHaveLength(6);
		expect(combat(endTurn(s)).hand).toHaveLength(6);
	});

	it("Necronomicon replays the first 2+-cost Attack each turn", () => {
		const deck = deckOf(Array(10).fill("CARNAGE"));
		let s = enter(["NECRONOMICON"], { deck });
		s = patchMonster(withCombat(s, { energy: 10 }), 0, { currentHp: 200, maxHp: 200 });
		const hp0 = monsterAt(s, 0).currentHp;
		s = playCard(s, "CARNAGE");
		expect(hp0 - monsterAt(s, 0).currentHp).toBe(40);
		const hp1 = monsterAt(s, 0).currentHp;
		s = playCard(s, "CARNAGE");
		expect(hp1 - monsterAt(s, 0).currentHp).toBe(20);
	});
});

describe("Combat relics: energy / potions", () => {
	beforeAll(loadAllData);

	it("Chemical X: X-cost effects +2 (Whirlwind with 3 energy hits 5 times)", () => {
		const deck = deckOf(Array(10).fill("WHIRLWIND"));
		const hits = (relics: string[]) => {
			const s = enter(relics, { deck });
			const hp0 = monsterAt(s, 0).currentHp;
			const after = playCard(s, "WHIRLWIND");
			expect(combat(after).energy).toBe(0);
			return hp0 - monsterAt(after, 0).currentHp;
		};
		expect(hits([])).toBe(15);
		expect(hits(["CHEMICAL_X"])).toBe(25);
	});
});
