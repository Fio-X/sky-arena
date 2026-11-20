/**
 * The 23 potions added on 2026-11-20, each through the real `usePotion` /
 * `chooseCard` / `endTurn` commands.
 */
import { beforeAll, describe, expect, it } from "vitest";
import potionsJson from "../../../data-reference/potions.json";
import {
	card,
	endTurn,
	forceMove,
	loadAllData,
	playCard,
	powerAmount,
	runState,
	startFight,
} from "../core/fightTestHelpers";
import { canUsePotion, initPotionPool, rollPotionDrop } from "../core/potion";
import { step } from "../core/step";
import type { CardInstance, GameState, PotionId, RelicId } from "../core/types";
import { getCard, loadPotions } from "./loader";

beforeAll(() => {
	loadAllData();
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
});

const P = (id: string) => id as PotionId;

function withPotions(s: GameState, potions: string[], relics: string[] = []): GameState {
	const slots = [...potions.map(P), null, null, null].slice(0, 3) as (PotionId | null)[];
	return {
		...s,
		potions: slots,
		relics: relics.map((id) => ({ id: id as RelicId, counter: -1 })),
	};
}

function drink(s: GameState, slot = 0, target = 0): GameState {
	return step(s, { type: "usePotion", index: slot, targetIndex: target }).state;
}

function choose(s: GameState, indices: number[]): GameState {
	return step(s, { type: "chooseCard", indices }).state;
}

function fight(potions: string[], relics: string[] = [], deck?: CardInstance[]) {
	return withPotions(startFight("JAW_WORM", 1n, deck), potions, relics);
}

const combat = (s: GameState) => {
	if (!s.combat) throw new Error("no combat");
	return s.combat;
};
const handIds = (s: GameState) => combat(s).hand.map((c) => c.id as string);

describe("simple potions", () => {
	it("Ambrosia enters Divinity (+3 energy)", () => {
		const s = drink(fight(["AMBROSIA"]));
		expect(combat(s).player.stance).toBe("divinity");
		expect(combat(s).energy).toBe(6);
	});

	it("Focus Potion, Ghost in a Jar, Duplication Potion: amounts, doubled by Sacred Bark", () => {
		const s = drink(drink(fight(["FOCUS_POTION", "GHOST_IN_A_JAR"]), 0), 1);
		expect(powerAmount(combat(s).player, "FOCUS")).toBe(2);
		expect(powerAmount(combat(s).player, "INTANGIBLE")).toBe(1);
		const b = drink(fight(["FOCUS_POTION"], ["SACRED_BARK"]));
		expect(powerAmount(combat(b).player, "FOCUS")).toBe(4);
	});

	it("Poison Potion: 6 Poison (12 with Sacred Bark)", () => {
		expect(powerAmount(combat(drink(fight(["POISON_POTION"]))).monsters[0]!, "POISON")).toBe(6);
		const b = drink(fight(["POISON_POTION"], ["SACRED_BARK"]));
		expect(powerAmount(combat(b).monsters[0]!, "POISON")).toBe(12);
	});

	it("Bottled Miracle / Cunning Potion add cards (count doubled by Sacred Bark)", () => {
		expect(
			handIds(drink(fight(["BOTTLED_MIRACLE"]))).filter((id) => id === "MIRACLE"),
		).toHaveLength(2);
		const shivs = combat(drink(fight(["CUNNING_POTION"]))).hand.filter((c) => c.id === "SHIV");
		expect(shivs).toHaveLength(3);
		expect(shivs.every((c) => c.upgraded)).toBe(true);
		const b = drink(fight(["CUNNING_POTION"], ["SACRED_BARK"]));
		expect(handIds(b).filter((id) => id === "SHIV")).toHaveLength(5); // hand limit 10
	});

	it("Potion of Capacity and Essence of Darkness (one Dark per orb slot)", () => {
		const base = fight(["POTION_OF_CAPACITY", "ESSENCE_OF_DARKNESS"]);
		const s = drink(base, 0);
		expect(combat(s).player.orbSlots).toBe(combat(base).player.orbSlots + 2);
		const d = drink(s, 1);
		expect(combat(d).player.orbs.filter((o) => o.type === "dark")).toHaveLength(
			combat(s).player.orbSlots,
		);
	});
});

describe("hand and piles", () => {
	it("Blessing of the Forge upgrades the hand; curses stay", () => {
		const deck = [card("BODY_SLAM", 1), card("STRIKE_RED", 2), card("DECAY", 3)];
		let s = fight(["BLESSING_OF_THE_FORGE"], [], deck);
		s = drink(s);
		const hand = combat(s).hand;
		expect(hand.find((c) => c.id === "STRIKE_RED")?.upgraded).toBe(true);
		expect(hand.find((c) => c.id === "DECAY")?.upgraded).toBe(false);
		const slam = hand.find((c) => c.id === "BODY_SLAM");
		expect(slam?.upgraded).toBe(true);
		expect(slam?.costForTurn).toBe(0); // upgrade lowers the cost
	});

	it("Elixir exhausts any chosen cards", () => {
		let s = drink(fight(["ELIXIR_POTION"]));
		expect(s.phase).toMatchObject({ type: "cardSelect", task: "elixir" });
		const before = combat(s).hand.length;
		s = choose(s, [0, 2]);
		expect(s.phase.type).toBe("combat");
		expect(combat(s).hand).toHaveLength(before - 2);
		expect(combat(s).exhaustPile).toHaveLength(2);
	});

	it("Elixir with zero picks exhausts nothing", () => {
		const s = choose(drink(fight(["ELIXIR_POTION"])), []);
		expect(s.phase.type).toBe("combat");
		expect(combat(s).exhaustPile).toHaveLength(0);
	});

	it("Gambler's Brew discards the chosen cards and draws that many", () => {
		let s = drink(fight(["GAMBLERS_BREW"]));
		expect(s.phase).toMatchObject({ type: "cardSelect", task: "gamble" });
		s = choose(s, [0, 1, 2]);
		expect(combat(s).hand).toHaveLength(5);
		expect(combat(s).discardPile).toHaveLength(3);
	});

	it("Liquid Memories: choice when the discard pile is bigger, cost 0 this turn", () => {
		let s = fight(["LIQUID_MEMORIES"]);
		s = playCard(playCard(s, "STRIKE_RED"), "DEFEND_RED");
		const defend = combat(s).discardPile[1]!;
		s = drink(s);
		expect(s.phase).toMatchObject({ type: "cardSelect", task: "liquidMemories" });
		s = choose(s, [1]);
		const back = combat(s).hand.find((c) => c.uniqueId === defend.uniqueId);
		expect(back?.costForTurn).toBe(0);
		expect(combat(s).discardPile.map((c) => c.id)).toEqual(["STRIKE_RED"]);
	});

	it("Liquid Memories: a single discarded card comes back without a choice", () => {
		let s = playCard(fight(["LIQUID_MEMORIES"]), "STRIKE_RED");
		s = drink(s);
		expect(s.phase.type).toBe("combat");
		expect(combat(s).discardPile).toHaveLength(0);
		expect(combat(s).hand).toHaveLength(5);
	});

	it("Snecko Oil draws 5 and gives every hand card a combat cost in 0..3", () => {
		const s = drink(fight(["SNECKO_OIL"]));
		const hand = combat(s).hand;
		expect(hand).toHaveLength(10);
		for (const c of hand) {
			expect(c.costForTurn).toBeGreaterThanOrEqual(0);
			expect(c.costForTurn).toBeLessThanOrEqual(3);
		}
		expect(hand.some((c) => c.costOverride !== null)).toBe(true);
	});
});

describe("playing cards", () => {
	it("Distilled Chaos plays the top 3 cards for free", () => {
		const deck = [...Array(10).keys()].map((i) => card("STRIKE_RED", i + 1));
		const s0 = fight(["DISTILLED_CHAOS"], [], deck);
		const hp0 = combat(s0).monsters[0]!.currentHp;
		const s = drink(s0);
		expect(combat(s).drawPile).toHaveLength(combat(s0).drawPile.length - 3);
		expect(combat(s).energy).toBe(combat(s0).energy);
		expect(combat(s).monsters[0]!.currentHp).toBe(hp0 - 18);
		expect(combat(s).discardPile).toHaveLength(3);
		expect(combat(s).discardPile.every((c) => !c.freeToPlay)).toBe(true);
		expect(combat(s).autoplayTop ?? 0).toBe(0);
	});

	it("Distilled Chaos: an unplayable top card goes to the discard pile", () => {
		// 10 cards: no reshuffle during the 3 plays
		const deck = [...Array(9).keys()].map((i) => card("STRIKE_RED", i + 1));
		let s = fight(["DISTILLED_CHAOS"], [], [...deck, card("WOUND", 50)]);
		// put the Wound on top of the draw pile
		const c = combat(s);
		const wound = [...c.hand, ...c.drawPile].find((x) => x.id === "WOUND")!;
		s = {
			...s,
			combat: {
				...c,
				hand: c.hand.filter((x) => x !== wound),
				drawPile: [...c.drawPile.filter((x) => x !== wound), wound],
			},
		};
		s = drink(s);
		expect(combat(s).discardPile.some((x) => x.id === "WOUND")).toBe(true);
		expect(combat(s).hand.some((x) => x.id === "WOUND")).toBe(false);
	});

	it("Duplication Potion plays the next card twice, then is gone", () => {
		let s = drink(fight(["DUPLICATION_POTION"]));
		const hp0 = combat(s).monsters[0]!.currentHp;
		s = playCard(s, "STRIKE_RED");
		expect(combat(s).monsters[0]!.currentHp).toBe(hp0 - 12);
		expect(powerAmount(combat(s).player, "DUPLICATION")).toBeUndefined();
	});

	it("Duplication Potion expires at the end of the round", () => {
		let s = drink(fight(["DUPLICATION_POTION"]));
		s = endTurn(s);
		expect(powerAmount(combat(s).player, "DUPLICATION")).toBeUndefined();
	});
});

describe("choices", () => {
	it("Attack Potion offers 3 different red attacks; the pick costs 0 this turn", () => {
		let s = drink(fight(["ATTACK_POTION"]));
		expect(s.phase).toMatchObject({ type: "cardSelect", task: "potionDiscovery" });
		const options = (s.phase as { options: CardInstance[] }).options;
		expect(new Set(options.map((o) => o.id)).size).toBe(3);
		for (const o of options) {
			const def = getCard(o.id);
			expect(def?.type).toBe("attack");
			expect(def?.color).toBe("red");
			expect(def?.flags).not.toContain("tag:healing");
		}
		s = choose(s, [1]);
		const added = combat(s).hand[combat(s).hand.length - 1]!;
		expect(added.id).toBe(options[1]!.id);
		expect(added.costForTurn).toBe(0);
	});

	it("Sacred Bark: the Discovery potion adds two copies", () => {
		let s = drink(fight(["SKILL_POTION"], ["SACRED_BARK"]));
		const pick = (s.phase as { options: CardInstance[] }).options[0]!;
		s = choose(s, [0]);
		expect(combat(s).hand.filter((c) => c.id === pick.id)).toHaveLength(2);
	});

	it("Colorless Potion offers colorless cards", () => {
		const s = drink(fight(["COLORLESS_POTION"]));
		for (const o of (s.phase as { options: CardInstance[] }).options) {
			expect(getCard(o.id)?.color).toBe("colorless");
		}
	});

	it("Stance Potion: choose Wrath", () => {
		let s = drink(fight(["STANCE_POTION"]));
		expect(s.phase).toMatchObject({ type: "cardSelect", task: "stancePotion" });
		s = choose(s, [1]);
		expect(combat(s).player.stance).toBe("wrath");
	});
});

describe("run-level potions", () => {
	it("Entropic Brew fills every empty slot in combat; nothing with Sozu", () => {
		const s = drink(fight(["ENTROPIC_BREW"]));
		expect(s.potions.every((p) => p !== null)).toBe(true);
		expect(s.potions).not.toContain("FRUIT_JUICE");
		const sozu = drink(fight(["ENTROPIC_BREW"], ["SOZU"]));
		expect(sozu.potions.every((p) => p === null)).toBe(true);
	});

	it("Entropic Brew outside combat leaves its own slot empty", () => {
		const s = drink(withPotions(runState(3n), ["ENTROPIC_BREW"]));
		expect(s.potions.filter((p) => p === null)).toHaveLength(1);
	});

	it("Fruit Juice and Blood Potion work outside combat; Fire Potion does not", () => {
		const out = withPotions(runState(3n), ["FRUIT_JUICE", "FIRE_POTION"]);
		const s = drink(out, 0);
		expect(s.maxHp).toBe(out.maxHp + 5);
		expect(canUsePotion(s, P("FIRE_POTION"))).toBe(false);
		expect(drink(s, 1).potions[1]).toBe("FIRE_POTION");
	});

	it("Smoke Bomb ends a normal fight with no rewards, but not a boss fight", () => {
		const s = drink(fight(["SMOKE_BOMB"]));
		expect(s.combat).toBeNull();
		expect(s.phase.type).toBe("map");
		const boss = fight(["SMOKE_BOMB"]);
		const inBoss: GameState = {
			...boss,
			map: {
				nodes: [[{ x: 0, y: 0, type: "boss", edges: [] }]] as never,
				currentNode: { x: 0, y: 0 },
				visitedNodes: [],
			},
		};
		expect(drink(inBoss).combat).not.toBeNull();
	});

	it("Fairy in a Bottle: lethal damage heals to 30% max HP and uses the potion", () => {
		let s = fight(["FAIRY_POTION"]);
		s = { ...s, maxHp: 100, currentHp: 1 };
		expect(canUsePotion(s, P("FAIRY_POTION"))).toBe(false);
		s = endTurn(forceMove(s, 0, "JAW_WORM_CHOMP"));
		expect(s.currentHp).toBe(30);
		expect(s.potions[0]).toBeNull();
		expect(s.phase.type).not.toBe("gameOver");
	});

	it("Fairy in a Bottle comes before Lizard Tail", () => {
		let s = fight(["FAIRY_POTION"], ["LIZARD_TAIL"]);
		s = { ...s, maxHp: 100, currentHp: 1 };
		s = endTurn(forceMove(s, 0, "JAW_WORM_CHOMP"));
		expect(s.currentHp).toBe(30);
		expect(s.relics[0]?.counter).toBe(-1);
	});

	it("Potion drops use the character's pool", () => {
		const seen = (character: string) => {
			const found = new Set<string>();
			let rng = runState(5n).rng.potionRng;
			for (let i = 0; i < 400; i++) {
				const r = rollPotionDrop(rng, 100, character);
				rng = r.rng;
				if (r.potion) found.add(r.potion);
			}
			return found;
		};
		const silent = seen("SILENT");
		expect(silent.has("POISON_POTION")).toBe(true);
		expect(silent.has("BLOOD_POTION")).toBe(false);
		expect(seen("IRONCLAD").has("POISON_POTION")).toBe(false);
	});
});
