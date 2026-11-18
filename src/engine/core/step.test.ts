import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import relicsJson from "../../../data-reference/relics.json";
import "../content/corePowers";
import "../content/relicHooks";
import { loadCards, loadMonsters, loadRelics } from "../content/loader";
import { createRng } from "../rng/stsRandom";
import { step } from "./step";
import {
	at,
	baseMonster,
	getCombat,
	makeCards,
	makeCombat,
	makeDefend,
	makeState,
	makeStrike,
} from "./testHelpers";

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadRelics(relicsJson as never);
});

describe("stepPlayCard — Strike", () => {
	it("deals 6 damage to monster", () => {
		const state = makeState(makeCombat());
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		const combat = getCombat(result);
		expect(at(combat.monsters, 0).currentHp).toBe(44 - 6);
		expect(at(combat.monsters, 0).alive).toBe(true);
	});

	it("costs 1 energy", () => {
		const state = makeState(makeCombat());
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		expect(getCombat(result).energy).toBe(2);
	});

	it("removes card from hand and adds to discard", () => {
		const state = makeState(makeCombat());
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		const combat = getCombat(result);
		expect(combat.hand).toHaveLength(0);
		expect(combat.discardPile).toHaveLength(1);
		expect(at(combat.discardPile, 0).id).toBe("STRIKE_RED");
	});

	it("generates cardPlayed and damageDealt events", () => {
		const state = makeState(makeCombat());
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		expect(result.events).toHaveLength(2);
		expect(at(result.events, 0).type).toBe("cardPlayed");
		expect(at(result.events, 1).type).toBe("damageDealt");
		const dmgEvent = at(result.events, 1);
		if (dmgEvent.type === "damageDealt") {
			expect(dmgEvent.amount).toBe(6);
			expect(dmgEvent.blocked).toBe(0);
		}
	});

	it("refuses to play with insufficient energy", () => {
		const combat = makeCombat({ energy: 0 });
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		expect(at(getCombat(result).monsters, 0).currentHp).toBe(44);
		expect(result.events).toHaveLength(0);
	});

	it("increments cardsPlayedThisTurn", () => {
		const state = makeState(makeCombat());
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		expect(getCombat(result).cardsPlayedThisTurn).toBe(1);
	});

	it("plays from correct hand index with multiple cards", () => {
		const combat = makeCombat({ hand: [makeDefend(), makeStrike()] });
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 1, targetIndex: 0 });

		const c = getCombat(result);
		expect(at(c.monsters, 0).currentHp).toBe(44 - 6);
		expect(c.hand).toHaveLength(1);
		expect(at(c.hand, 0).id).toBe("DEFEND_RED");
	});
});

describe("stepPlayCard — Defend", () => {
	it("gives 5 block to player", () => {
		const combat = makeCombat({ hand: [makeDefend()] });
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });

		expect(getCombat(result).player.block).toBe(5);
	});
});

describe("block absorbs damage", () => {
	it("monster block absorbs Strike damage", () => {
		const combat = makeCombat({
			monsters: [{ ...baseMonster(), block: 4 }],
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		const m = at(getCombat(result).monsters, 0);
		expect(m.currentHp).toBe(44 - 2);
		expect(m.block).toBe(0);
	});

	it("full block absorbs all damage", () => {
		const combat = makeCombat({
			monsters: [{ ...baseMonster(), block: 10 }],
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		const m = at(getCombat(result).monsters, 0);
		expect(m.currentHp).toBe(44);
		expect(m.block).toBe(4);
	});
});

describe("damage pipeline — Vulnerable", () => {
	it("Vulnerable increases damage by 50%", () => {
		const combat = makeCombat({
			monsters: [
				{
					...baseMonster(),
					powers: [{ id: "vulnerable" as never, amount: 2, justApplied: false }],
				},
			],
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		expect(at(getCombat(result).monsters, 0).currentHp).toBe(44 - 9);
	});
});

describe("damage pipeline — Weak", () => {
	it("Weak reduces attack damage by 25%", () => {
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [{ id: "weak" as never, amount: 2, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		expect(at(getCombat(result).monsters, 0).currentHp).toBe(44 - 4);
	});
});

describe("damage pipeline — Strength", () => {
	it("Strength adds flat damage", () => {
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [{ id: "strength" as never, amount: 3, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		expect(at(getCombat(result).monsters, 0).currentHp).toBe(44 - 9);
	});

	it("Strength + Weak: (base+str)*0.75 floored", () => {
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [
					{ id: "strength" as never, amount: 3, justApplied: false },
					{ id: "weak" as never, amount: 2, justApplied: false },
				],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		// (6+3)*0.75 = 6.75 → floor → 6
		expect(at(getCombat(result).monsters, 0).currentHp).toBe(44 - 6);
	});
});

describe("block pipeline — Dexterity and Frail", () => {
	it("Dexterity adds flat block", () => {
		const combat = makeCombat({
			hand: [makeDefend()],
			player: {
				block: 0,
				powers: [{ id: "dexterity" as never, amount: 2, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });

		expect(getCombat(result).player.block).toBe(7);
	});

	it("Frail reduces block by 25%", () => {
		const combat = makeCombat({
			hand: [makeDefend()],
			player: {
				block: 0,
				powers: [{ id: "frail" as never, amount: 2, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });

		// 5 * 0.75 = 3.75 → floor → 3
		expect(getCombat(result).player.block).toBe(3);
	});
});

describe("endTurn — discard hand and draw", () => {
	it("discards hand and draws 5 from drawPile", () => {
		const drawCards = makeCards(10, "DRAW");
		const handCards = [makeStrike(), makeDefend()];
		const combat = makeCombat({
			hand: handCards,
			drawPile: drawCards,
			discardPile: [],
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });

		const c = getCombat(result);
		expect(c.hand).toHaveLength(5);
		expect(c.drawPile).toHaveLength(5);
		expect(c.discardPile).toHaveLength(2);
	});

	it("clears player and monster block", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			player: { block: 8, powers: [], stance: "neutral", orbs: [], orbSlots: 3 },
			monsters: [{ ...baseMonster(), block: 5 }],
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });

		const c = getCombat(result);
		expect(c.player.block).toBe(0);
		expect(at(c.monsters, 0).block).toBe(0);
	});

	it("restores energy to maxEnergy", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			energy: 0,
			maxEnergy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });

		expect(getCombat(result).energy).toBe(3);
	});

	it("increments turn counter", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			turn: 1,
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });

		expect(getCombat(result).turn).toBe(2);
	});

	it("shuffles discard into draw when draw is empty", () => {
		const discardCards = makeCards(8, "DISC");
		const combat = makeCombat({
			hand: [makeStrike()],
			drawPile: [],
			discardPile: discardCards,
		});
		const rng = createRng(42n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, shuffleRng: rng },
		};
		const result = step(state, { type: "endTurn" });

		const c = getCombat(result);
		expect(c.hand).toHaveLength(5);
		expect(c.drawPile).toHaveLength(4);
		expect(c.discardPile).toHaveLength(0);
		const hasShuffled = result.events.some((e) => e.type === "shuffled");
		expect(hasShuffled).toBe(true);
	});

	it("resets cardsPlayedThisTurn", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			cardsPlayedThisTurn: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });

		expect(getCombat(result).cardsPlayedThisTurn).toBe(0);
	});
});

describe("combat end — monster killed", () => {
	it("monster dies when HP reaches 0", () => {
		const combat = makeCombat({
			hand: [makeStrike()],
			monsters: [{ ...baseMonster(), currentHp: 5 }],
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });

		const m = at(getCombat(result).monsters, 0);
		expect(m.currentHp).toBe(0);
		expect(m.alive).toBe(false);
		const diedEvent = result.events.find((e) => e.type === "monsterDied");
		expect(diedEvent).toBeDefined();
	});
});

describe("Burning Blood relic", () => {
	it("heals 6 HP after combat victory", () => {
		const combat = makeCombat({
			hand: [makeStrike()],
			monsters: [{ ...baseMonster(), currentHp: 5 }],
		});
		const state = {
			...makeState(combat),
			currentHp: 50,
			relics: [{ id: "BURNING_BLOOD" as never, counter: 0 }],
		};
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(result.state.currentHp).toBe(56);
		const healEvent = result.events.find((e) => e.type === "healed");
		expect(healEvent).toBeDefined();
	});

	it("does not overheal past maxHp", () => {
		const combat = makeCombat({
			hand: [makeStrike()],
			monsters: [{ ...baseMonster(), currentHp: 5 }],
		});
		const state = {
			...makeState(combat),
			currentHp: 78,
			maxHp: 80,
			relics: [{ id: "BURNING_BLOOD" as never, counter: 0 }],
		};
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(result.state.currentHp).toBe(80);
	});

	it("does not heal without relic", () => {
		const combat = makeCombat({
			hand: [makeStrike()],
			monsters: [{ ...baseMonster(), currentHp: 5 }],
		});
		const state = { ...makeState(combat), currentHp: 50, relics: [] };
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(result.state.currentHp).toBe(50);
	});
});
