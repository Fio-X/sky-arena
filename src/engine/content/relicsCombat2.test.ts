import { beforeAll, describe, expect, it } from "vitest";
import potionsJson from "../../../data-reference/potions.json";
import {
	endTurn,
	forceMove,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
} from "../core/fightTestHelpers";
import { step } from "../core/step";
import type { CardInstance, GameState, PotionId, PowerId } from "../core/types";
import { loadPotions } from "./loader";
import { USED_UP } from "./relicsCombatRules";
import { combat, counterOf, deckCard, deckOf, enter, withCombat } from "./relicsCombatTestHelpers";

const player = (s: GameState) => combat(s).player;
const ids = (cards: readonly CardInstance[]) => cards.map((c) => c.id as string);
const pw = (id: string, amount: number) => ({ id: id as PowerId, amount, justApplied: false });

function withPlayerPowers(s: GameState, powers: ReturnType<typeof pw>[]): GameState {
	return withCombat(s, { player: { ...player(s), powers } });
}

/** Jaw Worm fight with Chomp (11) forced, ended once. */
function takeChomp(s: GameState): GameState {
	return endTurn(forceMove(s, 0, "JAW_WORM_CHOMP"));
}

describe("Combat relics: card play", () => {
	beforeAll(loadAllData);

	it("Blue Candle: Curses are playable, cost 1 HP and exhaust", () => {
		const deck = deckOf(["INJURY", ...Array(9).fill("DEFEND_RED")]);
		const without = enter([], { deck });
		expect(ids(combat(playCard(without, "INJURY")).hand)).toContain("INJURY");
		const s = playCard(enter(["BLUE_CANDLE"], { deck }), "INJURY");
		expect(s.currentHp).toBe(998);
		expect(ids(combat(s).exhaustPile)).toEqual(["INJURY"]);
	});

	it("Medical Kit: Statuses are playable without effect and exhaust", () => {
		const deck = deckOf(["BURN", ...Array(9).fill("DEFEND_RED")]);
		const s = playCard(enter(["MEDICAL_KIT"], { deck }), "BURN");
		expect(s.currentHp).toBe(999);
		expect(ids(combat(s).exhaustPile)).toEqual(["BURN"]);
	});

	it("Duality: an Attack gives 1 Dexterity until end of turn", () => {
		const s = playCard(enter(["DUALITY"]), "STRIKE_RED");
		expect(powerAmount(player(s), "DEXTERITY")).toBe(1);
		expect(powerAmount(player(endTurn(s)), "DEXTERITY") ?? 0).toBe(0);
	});

	it("Mummified Hand: a Power makes a random 1+-cost card in hand cost 0", () => {
		const deck = deckOf(["INFLAME", ...Array(9).fill("STRIKE_RED")]);
		const s = playCard(enter(["MUMMIFIED_HAND"], { deck }), "INFLAME");
		expect(combat(s).hand.filter((c) => c.costForTurn === 0)).toHaveLength(1);
	});

	it("Orange Pellets: Attack + Skill + Power in a turn removes debuffs", () => {
		const deck = deckOf(["INFLAME", "STRIKE_RED", "DEFEND_RED", ...Array(7).fill("DEFEND_RED")]);
		let s = enter(["ORANGE_PELLETS", "GREMLIN_VISAGE"], { deck });
		s = withCombat(s, { energy: 10 });
		s = playCard(playCard(s, "STRIKE_RED"), "DEFEND_RED");
		expect(powerAmount(player(s), "WEAK")).toBe(1);
		s = playCard(s, "INFLAME");
		expect(powerAmount(player(s), "WEAK")).toBeUndefined();
		expect(powerAmount(player(s), "STRENGTH")).toBe(2);
	});

	it("Wrist Blade: 0-cost Attacks deal 4 more", () => {
		const zero = { ...deckCard("STRIKE_RED", 1), costForTurn: 0 };
		const deck = [
			zero,
			...deckOf(Array(9).fill("DEFEND_RED")).map((c, i) => ({ ...c, uniqueId: i + 2 })),
		];
		const dealt = (relics: string[]) => {
			const s = enter(relics, { deck });
			return monsterAt(s, 0).currentHp - monsterAt(playCard(s, "STRIKE_RED"), 0).currentHp;
		};
		expect(dealt([])).toBe(6);
		expect(dealt(["WRIST_BLADE"])).toBe(10);
	});

	it("Strange Spoon: exhausted cards are sometimes discarded instead", () => {
		const deck = deckOf(Array(10).fill("IMPERVIOUS"));
		const playAll = (relics: string[]) => {
			let s = withCombat(enter(relics, { deck }), { energy: 20 });
			for (let i = 0; i < 5; i++) s = playCard(s, "IMPERVIOUS");
			return combat(s);
		};
		expect(playAll([]).exhaustPile).toHaveLength(5);
		const spoon = playAll(["STRANGE_SPOON"]);
		expect(spoon.discardPile.length).toBeGreaterThan(0);
		expect(spoon.discardPile.length + spoon.exhaustPile.length).toBe(5);
	});

	it("Champion Belt: applying Vulnerable also applies 1 Weak", () => {
		const deck = deckOf(["BASH", ...Array(9).fill("DEFEND_RED")]);
		const m = monsterAt(playCard(enter(["CHAMPION_BELT"], { deck }), "BASH"), 0);
		expect(powerAmount(m, "VULNERABLE")).toBe(2);
		expect(powerAmount(m, "WEAK")).toBe(1);
	});

	it("Hand Drill: breaking an enemy's Block applies 2 Vulnerable", () => {
		const s = patchMonster(enter(["HAND_DRILL"]), 0, { block: 5 });
		expect(powerAmount(monsterAt(playCard(s, "STRIKE_RED"), 0), "VULNERABLE")).toBe(2);
		const kept = patchMonster(enter(["HAND_DRILL"]), 0, { block: 10 });
		expect(powerAmount(monsterAt(playCard(kept, "STRIKE_RED"), 0), "VULNERABLE")).toBeUndefined();
	});
});

describe("Combat relics: discard / shuffle / scry", () => {
	beforeAll(loadAllData);
	const deck = deckOf(["SURVIVOR", ...Array(9).fill("DEFEND_RED")]);
	const survive = (relics: string[]) => {
		const s = playCard(enter(relics, { deck }), "SURVIVOR");
		expect(s.phase).toMatchObject({ type: "cardSelect", task: "survivor" });
		return step(s, { type: "chooseCard", indices: [0] }).state;
	};

	it("Hovering Kite: first discard each turn gives 1 energy", () => {
		expect(combat(survive([])).energy).toBe(2);
		expect(combat(survive(["HOVERING_KITE"])).energy).toBe(3);
	});

	it("Tingsha: each discard deals 3 to a random enemy", () => {
		const hp = (relics: string[]) => monsterAt(survive(relics), 0).currentHp;
		expect(hp([]) - hp(["TINGSHA"])).toBe(3);
	});

	it("Tough Bandages: each discard gives 3 Block", () => {
		expect(player(survive([])).block).toBe(8);
		expect(player(survive(["TOUGH_BANDAGES"])).block).toBe(11);
	});

	/** Empty hand and draw pile, 10 Wounds in the discard pile: the next draw shuffles. */
	function shuffleNextTurn(relics: string[], counters?: Record<string, number>): GameState {
		const s = enter(relics, { counters });
		const wounds = deckOf(Array(10).fill("WOUND")).map((c, i) => ({ ...c, uniqueId: 100 + i }));
		return endTurn(withCombat(s, { hand: [], drawPile: [], discardPile: wounds }));
	}

	it("The Abacus: 6 Block on shuffle", () => {
		expect(player(shuffleNextTurn([])).block).toBe(0);
		expect(player(shuffleNextTurn(["THE_ABACUS"])).block).toBe(6);
	});

	it("Sundial: every 3rd shuffle gives 2 energy", () => {
		const s = shuffleNextTurn(["SUNDIAL"], { SUNDIAL: 2 });
		expect(combat(s).energy).toBe(5);
		expect(counterOf(s, "SUNDIAL")).toBe(0);
		expect(counterOf(shuffleNextTurn(["SUNDIAL"]), "SUNDIAL")).toBe(1);
	});

	it("Melange scries 3 on shuffle; Golden Eye scries 2 more", () => {
		expect(combat(shuffleNextTurn([])).drawPile).toHaveLength(5);
		expect(combat(shuffleNextTurn(["MELANGE"])).drawPile).toHaveLength(2);
		expect(combat(shuffleNextTurn(["MELANGE", "GOLDEN_EYE"])).drawPile).toHaveLength(0);
	});
});

describe("Combat relics: orbs / end of turn", () => {
	beforeAll(loadAllData);
	const frost = { type: "frost" as const, passive: 2, evoke: 5 };

	it("Cloak Clasp: Block per card in hand at end of turn", () => {
		expect(player(endTurn(enter(["CLOAK_CLASP"]))).block).toBe(5);
		expect(player(endTurn(enter([]))).block).toBe(0);
	});

	it("Gold-Plated Cables: the rightmost orb's passive triggers again", () => {
		const block = (relics: string[]) => {
			const s = enter(relics);
			return player(endTurn(withCombat(s, { player: { ...player(s), orbs: [frost] } }))).block;
		};
		expect(block([])).toBe(2);
		expect(block(["GOLD_PLATED_CABLES"])).toBe(4);
	});

	it("Frozen Core channels Frost at end of turn with an empty slot", () => {
		const s = endTurn(enter(["FROZEN_CORE"]));
		expect(player(s).orbs.map((o) => o.type)).toEqual(["frost"]);
	});

	it("Emotion Chip: after losing HP, orb passives trigger at turn start", () => {
		const run = (relics: string[]) => {
			const s = enter(relics, { enc: "JAW_WORM" });
			return takeChomp(withCombat(s, { player: { ...player(s), orbs: [frost] } }));
		};
		expect(run([]).currentHp).toBe(999 - 9);
		expect(player(run([])).block).toBe(0);
		expect(player(run(["EMOTION_CHIP"])).block).toBe(2);
	});
});

describe("Combat relics: damage, healing, death", () => {
	beforeAll(loadAllData);

	it("Odd Mushroom: Vulnerable player takes 25% more instead of 50%", () => {
		const hit = (relics: string[]) => {
			const s = enter(relics, { enc: "JAW_WORM" });
			return 999 - takeChomp(withPlayerPowers(s, [pw("vulnerable", 2)])).currentHp;
		};
		expect(hit([])).toBe(16);
		expect(hit(["ODD_MUSHROOM"])).toBe(13);
	});

	it("Paper Krane: Weak enemies deal 40% less instead of 25%", () => {
		const hit = (relics: string[]) => {
			const s = patchMonster(enter(relics, { enc: "JAW_WORM" }), 0, {
				powers: [pw("weak", 2)],
			});
			return 999 - takeChomp(s).currentHp;
		};
		expect(hit([])).toBe(8);
		expect(hit(["PAPER_KRANE"])).toBe(6);
	});

	it("Lizard Tail: the first death heals to 50% max HP instead", () => {
		const s = takeChomp(enter(["LIZARD_TAIL"], { enc: "JAW_WORM", hp: 5, maxHp: 80 }));
		expect(s.phase.type).toBe("combat");
		expect(s.currentHp).toBe(40);
		expect(counterOf(s, "LIZARD_TAIL")).toBe(USED_UP);
		const again = takeChomp({ ...s, currentHp: 5 });
		expect(again.phase).toEqual({ type: "gameOver", victory: false });
		const none = takeChomp(enter([], { enc: "JAW_WORM", hp: 5, maxHp: 80 }));
		expect(none.phase).toEqual({ type: "gameOver", victory: false });
	});

	it("Lizard Tail also saves from HP loss set directly by powers (combat-end check)", () => {
		const s = enter(["LIZARD_TAIL"], { hp: 1, maxHp: 80 });
		const after = step({ ...s, currentHp: 0 }, { type: "endTurn" }).state;
		expect(after.currentHp).toBe(40);
	});

	it("Face of Cleric: +1 max HP after a won combat", () => {
		const s = patchMonster(enter(["FACE_OF_CLERIC"], { hp: 50, maxHp: 80 }), 0, { currentHp: 1 });
		const won = playCard(s, "STRIKE_RED");
		expect(won.phase.type).toBe("reward");
		expect([won.maxHp, won.currentHp]).toEqual([81, 51]);
	});

	it("The Specimen: a dying enemy's Poison moves to another enemy", () => {
		let s = enter(["THE_SPECIMEN"], { enc: "EXORDIUM_THUGS" });
		s = patchMonster(s, 0, { currentHp: 1, powers: [pw("POISON", 5)] });
		s = playCard(s, "STRIKE_RED", 0);
		expect(monsterAt(s, 0).alive).toBe(false);
		expect(powerAmount(monsterAt(s, 1), "POISON")).toBe(5);
	});

	it("Sacred Bark doubles potion potency", () => {
		loadPotions(potionsJson as never);
		const block = (relics: string[]) => {
			const s = enter(relics);
			const withPotion = { ...s, potions: ["BLOCK_POTION" as PotionId, null, null] };
			return player(step(withPotion, { type: "usePotion", index: 0, targetIndex: 0 }).state).block;
		};
		expect(block([])).toBe(12);
		expect(block(["SACRED_BARK"])).toBe(24);
	});
});
