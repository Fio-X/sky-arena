import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import "./watcherCards";
import "./watcherUncommonCards";
import "./watcherRareCards";
import "./watcherPowers";
import "./statusCards";
import { step } from "../core/step";
import { makeCombat, makeState } from "../core/testHelpers";
import type { CardId, CardInstance, StanceId } from "../core/types";
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

function withStance(stance: StanceId) {
	return { block: 0, powers: [] as never[], stance, orbs: [], orbSlots: 3 };
}

function findPower(result: ReturnType<typeof step>, id: string) {
	return result.state.combat!.player.powers.find((p) => p.id === (id as never));
}

describe("Watcher uncommon/rare/power/scry tests", () => {
	beforeEach(() => {
		loadCards(cardsJson as never);
	});

	describe("Uncommon and Rare cards", () => {
		it("INDIGNATION applies Vulnerable when in Wrath, else enters Wrath", () => {
			const combat1 = makeCombat({
				hand: [card("INDIGNATION", { costForTurn: 1 })],
				energy: 3,
				player: withStance("wrath"),
			});
			const state1 = makeState(combat1);
			const result1 = step(state1, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const vuln = result1.state.combat!.monsters[0]!.powers.find(
				(p) => p.id === ("vulnerable" as never),
			);
			expect(vuln?.amount).toBe(3);

			const combat2 = makeCombat({
				hand: [card("INDIGNATION", { costForTurn: 1 })],
				energy: 3,
			});
			const state2 = makeState(combat2);
			const result2 = step(state2, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			expect(result2.state.combat!.player.stance).toBe("wrath");
		});

		it("EMPTY_MIND exits stance and draws 2 (cost 1)", () => {
			const combat = makeCombat({
				hand: [card("EMPTY_MIND", { costForTurn: 1 })],
				drawPile: [
					card("STRIKE_PURPLE", { uniqueId: 10 }),
					card("STRIKE_PURPLE", { uniqueId: 11 }),
				],
				energy: 3,
				player: withStance("calm"),
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const c = result.state.combat!;
			expect(c.player.stance).toBe("neutral");
			expect(c.hand.length).toBe(2);
			expect(c.energy).toBe(4);
		});

		it("FEAR_NO_EVIL deals damage, enters Calm if enemy intends attack", () => {
			const combat = makeCombat({
				hand: [card("FEAR_NO_EVIL", { costForTurn: 1 })],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: 0,
			});
			const c = result.state.combat!;
			expect(c.monsters[0]!.currentHp).toBe(44 - 8);
			expect(c.player.stance).toBe("calm");
		});

		it("WALLOP deals 9 damage and gains block equal to HP lost (cost 2)", () => {
			const combat = makeCombat({
				hand: [card("WALLOP", { costForTurn: 2 })],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: 0,
			});
			const c = result.state.combat!;
			expect(c.monsters[0]!.currentHp).toBe(44 - 9);
			expect(c.player.block).toBe(9);
		});

		it("JUDGMENT kills enemy at or below 30 HP (cost 1)", () => {
			const combat = makeCombat({
				hand: [card("JUDGMENT", { costForTurn: 1 })],
				energy: 3,
				monsters: [
					{
						id: "JAW_WORM" as never,
						index: 0,
						maxHp: 44,
						currentHp: 25,
						block: 0,
						powers: [],
						intent: {
							moveId: "chomp" as never,
							baseDamage: 11,
							hits: 1,
							isAttack: true,
							isDebuff: false,
							isBuff: false,
						},
						moveHistory: [],
						alive: true,
						halfDead: false,
						miscInfo: 0,
					},
				],
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: 0,
			});
			const c = result.state.combat!;
			expect(c.monsters[0]!.currentHp).toBe(0);
			expect(c.monsters[0]!.alive).toBe(false);
		});

		it("JUDGMENT does nothing if enemy HP > 30", () => {
			const combat = makeCombat({
				hand: [card("JUDGMENT", { costForTurn: 1 })],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: 0,
			});
			const c = result.state.combat!;
			expect(c.monsters[0]!.currentHp).toBe(44);
			expect(c.monsters[0]!.alive).toBe(true);
		});

		it("SPIRIT_SHIELD gains 3 block per card in hand (cost 2)", () => {
			const combat = makeCombat({
				hand: [
					card("SPIRIT_SHIELD", { uniqueId: 1, costForTurn: 2 }),
					card("STRIKE_PURPLE", { uniqueId: 2 }),
					card("STRIKE_PURPLE", { uniqueId: 3 }),
					card("STRIKE_PURPLE", { uniqueId: 4 }),
				],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const c = result.state.combat!;
			expect(c.player.block).toBe(9);
		});

		it("CONCLUDE deals 12 damage to all enemies (cost 1)", () => {
			const combat = makeCombat({
				hand: [card("CONCLUDE", { costForTurn: 1 })],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: 0,
			});
			const c = result.state.combat!;
			expect(c.monsters[0]!.currentHp).toBe(44 - 12);
		});

		it("MIRACLE gains 1 energy (cost 0)", () => {
			const combat = makeCombat({
				hand: [card("MIRACLE", { costForTurn: 0 })],
				energy: 1,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			expect(result.state.combat!.energy).toBe(2);
		});

		it("FOLLOW_UP gains 1 energy if last card was an Attack", () => {
			const combat = makeCombat({
				hand: [card("FOLLOW_UP", { costForTurn: 1 })],
				discardPile: [card("STRIKE_PURPLE", { uniqueId: 10 })],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: 0,
			});
			const c = result.state.combat!;
			expect(c.monsters[0]!.currentHp).toBe(44 - 7);
			expect(c.energy).toBe(3);
		});

		it("EVALUATE gains 6 block and shuffles Insight into draw pile", () => {
			const combat = makeCombat({
				hand: [card("EVALUATE", { costForTurn: 1 })],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const c = result.state.combat!;
			expect(c.player.block).toBe(6);
			expect(c.drawPile.some((x) => x.id === ("INSIGHT" as CardId))).toBe(true);
		});
	});

	describe("Power cards", () => {
		it("DEVOTION applies DEVOTION power with amount 2", () => {
			const combat = makeCombat({
				hand: [card("DEVOTION", { costForTurn: 1 })],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const pow = findPower(result, "DEVOTION");
			expect(pow?.amount).toBe(2);
		});

		it("MENTAL_FORTRESS applies power that grants block on stance change", () => {
			const combat = makeCombat({
				hand: [
					card("MENTAL_FORTRESS", { uniqueId: 1, costForTurn: 1 }),
					card("CRESCENDO", { uniqueId: 2, costForTurn: 1 }),
				],
				energy: 3,
			});
			const state = makeState(combat);
			const r1 = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			expect(findPower(r1, "MENTAL_FORTRESS")?.amount).toBe(4);
			const r2 = step(r1.state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const c = r2.state.combat!;
			expect(c.player.block).toBe(4);
			expect(c.player.stance).toBe("wrath");
		});

		it("RUSHDOWN draws 2 cards when entering Wrath", () => {
			const combat = makeCombat({
				hand: [
					card("RUSHDOWN", { uniqueId: 1, costForTurn: 1 }),
					card("CRESCENDO", { uniqueId: 2, costForTurn: 1 }),
				],
				drawPile: [
					card("STRIKE_PURPLE", { uniqueId: 10 }),
					card("STRIKE_PURPLE", { uniqueId: 11 }),
				],
				energy: 3,
			});
			const state = makeState(combat);
			const r1 = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			expect(findPower(r1, "RUSHDOWN")?.amount).toBe(2);
			const r2 = step(r1.state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const c = r2.state.combat!;
			expect(c.player.stance).toBe("wrath");
			expect(c.hand.length).toBe(2);
		});
	});

	describe("Scry mechanic", () => {
		it("Scry discards status and curse cards from top of draw pile", () => {
			const combat = makeCombat({
				hand: [card("THIRD_EYE", { costForTurn: 1 })],
				drawPile: [
					card("STRIKE_PURPLE", { uniqueId: 10 }),
					card("DAZED", { uniqueId: 11, costForTurn: -2 }),
					card("STRIKE_PURPLE", { uniqueId: 12 }),
				],
				energy: 3,
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const c = result.state.combat!;
			expect(c.discardPile.some((x) => x.id === ("DAZED" as CardId))).toBe(true);
			expect(c.drawPile.length).toBe(2);
		});
	});

	describe("Energy interactions with stance changes", () => {
		it("Calm→Divinity (via Blasphemy) gives 2 (exit Calm) + 3 (enter Divinity) = 5 extra energy", () => {
			const combat = makeCombat({
				hand: [card("BLASPHEMY", { costForTurn: 1 })],
				energy: 3,
				player: withStance("calm"),
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: -1,
			});
			const c = result.state.combat!;
			expect(c.energy).toBe(7);
			expect(c.player.stance).toBe("divinity");
		});

		it("EMPTY_FIST from Calm: exit gives 2 energy", () => {
			const combat = makeCombat({
				hand: [card("EMPTY_FIST", { costForTurn: 1 })],
				energy: 3,
				player: withStance("calm"),
			});
			const state = makeState(combat);
			const result = step(state, {
				type: "playCard",
				handIndex: 0,
				targetIndex: 0,
			});
			const c = result.state.combat!;
			expect(c.energy).toBe(4);
			expect(c.player.stance).toBe("neutral");
		});
	});
});
