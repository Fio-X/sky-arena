import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import "./ironcladCards";
import "./ironcladUncommonCards";
import "./ironcladRareCards";
import "./statusCards";
import { step } from "../core/step";
import { makeCombat, makeState } from "../core/testHelpers";
import type { CardId, CardInstance } from "../core/types";
import { loadCards } from "./loader";

function card(id: string, overrides: Partial<CardInstance> = {}): CardInstance {
	return {
		id: id as CardId,
		uniqueId: 50,
		upgraded: false,
		costOverride: null,
		costForTurn: 1,
		freeToPlay: false,
		misc: 0,
		...overrides,
	};
}

describe("Ironclad card effects", () => {
	beforeEach(() => {
		loadCards(cardsJson as never);
	});

	it("IRON_WAVE deals damage and gains block", () => {
		const combat = makeCombat({ hand: [card("IRON_WAVE")], energy: 3 });
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.player.block).toBeGreaterThan(0);
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
	});

	it("RECKLESS_CHARGE deals damage and adds Dazed to draw pile", () => {
		const combat = makeCombat({
			hand: [card("RECKLESS_CHARGE", { costForTurn: 0 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
		expect(c.drawPile.some((c) => c.id === "DAZED")).toBe(true);
	});

	it("POWER_THROUGH adds 2 Wounds to hand and gains block", () => {
		const combat = makeCombat({ hand: [card("POWER_THROUGH")], energy: 3 });
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = result.state.combat!;
		expect(c.player.block).toBeGreaterThan(0);
		const wounds = c.hand.filter((c) => c.id === "WOUND");
		expect(wounds.length).toBe(2);
	});

	it("LIMIT_BREAK doubles strength", () => {
		const combat = makeCombat({
			hand: [card("LIMIT_BREAK")],
			energy: 3,
			player: {
				block: 0,
				powers: [{ id: "strength" as never, amount: 4, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = result.state.combat!;
		const str = c.player.powers.find((p) => p.id === ("strength" as never));
		expect(str?.amount).toBe(8);
	});

	it("SEVER_SOUL exhausts non-attacks and deals damage", () => {
		const combat = makeCombat({
			hand: [
				card("SEVER_SOUL", { uniqueId: 1, costForTurn: 2 }),
				card("DEFEND_RED", { uniqueId: 2 }),
				card("STRIKE_RED", { uniqueId: 3 }),
			],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
		expect(c.exhaustPile.some((c) => c.id === ("DEFEND_RED" as CardId))).toBe(true);
		expect(c.hand.some((c) => c.id === ("STRIKE_RED" as CardId))).toBe(true);
	});

	it("SECOND_WIND exhausts non-attacks and gains block per card", () => {
		const combat = makeCombat({
			hand: [
				card("SECOND_WIND", { uniqueId: 1 }),
				card("DEFEND_RED", { uniqueId: 2 }),
				card("FLEX", { uniqueId: 3 }),
			],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = result.state.combat!;
		expect(c.exhaustPile.length).toBe(2);
		expect(c.player.block).toBeGreaterThanOrEqual(10);
	});

	it("FIEND_FIRE exhausts hand and deals damage per card", () => {
		const combat = makeCombat({
			hand: [
				card("FIEND_FIRE", { uniqueId: 1, costForTurn: 2 }),
				card("STRIKE_RED", { uniqueId: 2 }),
				card("DEFEND_RED", { uniqueId: 3 }),
				card("BASH", { uniqueId: 4 }),
			],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.hand.length).toBe(0);
		expect(c.exhaustPile.length).toBeGreaterThanOrEqual(3);
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
	});

	it("BLUDGEON deals high damage (generic handler)", () => {
		const combat = makeCombat({
			hand: [card("BLUDGEON", { costForTurn: 3 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBeLessThanOrEqual(44 - 32);
	});

	it("DUAL_WIELD enters cardSelect phase", () => {
		const combat = makeCombat({
			hand: [
				card("DUAL_WIELD", { uniqueId: 1, costForTurn: 1 }),
				card("STRIKE_RED", { uniqueId: 2 }),
			],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		expect(result.state.phase).toEqual({ type: "cardSelect", task: "dualWield" });
		// Choose the Strike (now index 0 since Dual Wield was removed from hand)
		const result2 = step(result.state, { type: "chooseCard", indices: [0] });
		const c = result2.state.combat!;
		const strikes = c.hand.filter((x) => x.id === ("STRIKE_RED" as CardId));
		expect(strikes.length).toBe(2);
		expect(result2.state.phase.type).toBe("combat");
	});

	it("HAVOC plays top of draw pile for free", () => {
		const topCard = card("STRIKE_RED", { uniqueId: 10, costForTurn: 1 });
		const combat = makeCombat({
			hand: [card("HAVOC", { uniqueId: 1, costForTurn: 1 })],
			drawPile: [topCard],
			energy: 1,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = result.state.combat!;
		// Top card should be in hand with freeToPlay
		const inHand = c.hand.find((x) => x.uniqueId === 10);
		expect(inHand?.freeToPlay).toBe(true);
	});

	it("BARRICADE applies barricade power", () => {
		const combat = makeCombat({
			hand: [card("BARRICADE", { costForTurn: 3 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = result.state.combat!;
		expect(c.player.powers.some((p) => p.id === ("barricade" as never))).toBe(true);
	});

	it("ARMAMENTS unupgraded enters cardSelect, upgrades chosen card", () => {
		const combat = makeCombat({
			hand: [
				card("ARMAMENTS", { uniqueId: 1, costForTurn: 1, upgraded: false }),
				card("STRIKE_RED", { uniqueId: 2, upgraded: false }),
			],
			energy: 3,
		});
		const state = makeState(combat);
		const r1 = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		expect(r1.state.phase).toEqual({ type: "cardSelect", task: "armaments" });
		const r2 = step(r1.state, { type: "chooseCard", indices: [0] });
		const c = r2.state.combat!;
		expect(c.hand[0]?.upgraded).toBe(true);
		expect(r2.state.phase.type).toBe("combat");
	});

	it("HEADBUTT enters cardSelect for discard pile", () => {
		const discarded = card("DEFEND_RED", { uniqueId: 5 });
		const combat = makeCombat({
			hand: [card("HEADBUTT", { uniqueId: 1, costForTurn: 1 })],
			discardPile: [discarded],
			energy: 3,
		});
		const state = makeState(combat);
		const r1 = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(r1.state.phase).toEqual({ type: "cardSelect", task: "headbutt" });
		// discard pile now has: [DEFEND(5), HEADBUTT(1)], choose index 0 = DEFEND
		const r2 = step(r1.state, { type: "chooseCard", indices: [0] });
		const c = r2.state.combat!;
		expect(c.drawPile[c.drawPile.length - 1]?.uniqueId).toBe(5);
		expect(c.discardPile.length).toBe(1);
	});

	it("WARCRY enters cardSelect to put card on draw pile", () => {
		const combat = makeCombat({
			hand: [card("WARCRY", { uniqueId: 1, costForTurn: 0 }), card("STRIKE_RED", { uniqueId: 2 })],
			drawPile: [card("DEFEND_RED", { uniqueId: 3 }), card("BASH", { uniqueId: 4 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r1 = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		expect(r1.state.phase).toEqual({ type: "cardSelect", task: "warcry" });
		// hand has: STRIKE(2) + drawn card; choose index 0 = STRIKE
		const r2 = step(r1.state, { type: "chooseCard", indices: [0] });
		const c = r2.state.combat!;
		expect(c.drawPile[c.drawPile.length - 1]?.uniqueId).toBe(2);
	});

	it("EXHUME enters cardSelect for exhaust pile", () => {
		const exhausted = card("BASH", { uniqueId: 5 });
		const combat = makeCombat({
			hand: [card("EXHUME", { uniqueId: 1, costForTurn: 2 })],
			exhaustPile: [exhausted],
			energy: 3,
		});
		const state = makeState(combat);
		const r1 = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		expect(r1.state.phase).toEqual({ type: "cardSelect", task: "exhume" });
		// exhaustPile: [BASH(5), EXHUME(1)]; choose index 0 = BASH
		const r2 = step(r1.state, { type: "chooseCard", indices: [0] });
		const c = r2.state.combat!;
		expect(c.hand.some((x) => x.uniqueId === 5)).toBe(true);
		expect(c.exhaustPile.length).toBe(1);
	});

	it("BURNING_PACT exhaust+draw via cardSelect", () => {
		const combat = makeCombat({
			hand: [
				card("BURNING_PACT", { uniqueId: 1, costForTurn: 1 }),
				card("STRIKE_RED", { uniqueId: 2 }),
			],
			drawPile: [card("DEFEND_RED", { uniqueId: 3 }), card("BASH", { uniqueId: 4 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r1 = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		expect(r1.state.phase.type).toBe("cardSelect");
		const r2 = step(r1.state, { type: "chooseCard", indices: [0] });
		const c = r2.state.combat!;
		expect(c.exhaustPile.some((x) => x.uniqueId === 2)).toBe(true);
		expect(c.hand.length).toBe(2);
	});
});
