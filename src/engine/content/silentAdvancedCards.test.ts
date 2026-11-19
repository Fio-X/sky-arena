import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import powersJson from "../../../data-reference/powers.json";
import "./corePowers";
import "./silentCards";
import "./silentUncommonCards";
import "./silentRareCards";
import "./silentPowers";
import { step } from "../core/step";
import { makeCombat, makeState } from "../core/testHelpers";
import type { CardId, CardInstance, MonsterState, PowerId, PowerInstance } from "../core/types";
import { loadCards, loadPowers } from "./loader";

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

function withPower(id: string, amount: number): PowerInstance {
	return { id: id as PowerId, amount, justApplied: false };
}

function monster(overrides: Partial<MonsterState> = {}): MonsterState {
	return {
		id: "JAW_WORM" as never,
		index: 0,
		maxHp: 44,
		currentHp: 44,
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
		...overrides,
	};
}

describe("Silent uncommon & rare cards", () => {
	beforeEach(() => {
		loadCards(cardsJson as never);
		loadPowers(powersJson as never);
	});

	// ── Uncommon attacks ────────────────────────────────

	it("Dash deals damage and gains block", () => {
		const combat = makeCombat({
			hand: [card("DASH", { costForTurn: 2 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = r.state.combat!;
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
		expect(c.player.block).toBeGreaterThan(0);
	});

	it("Riddle with Holes hits 5 times", () => {
		const combat = makeCombat({
			hand: [card("RIDDLE_WITH_HOLES", { costForTurn: 2 })],
			energy: 3,
			monsters: [monster({ currentHp: 100, maxHp: 100 })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = r.state.combat!;
		// 5 hits of 3 damage = 15 (without strength/vulnerable modifiers)
		expect(c.monsters[0]!.currentHp).toBe(100 - 15);
	});

	it("Eviscerate hits 3 times", () => {
		const combat = makeCombat({
			hand: [card("EVISCERATE", { costForTurn: 3 })],
			energy: 4,
			monsters: [monster({ currentHp: 100, maxHp: 100 })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = r.state.combat!;
		// 3 hits of 7 damage = 21
		expect(c.monsters[0]!.currentHp).toBe(100 - 21);
	});

	it("Backstab deals damage (innate+exhaust by flags)", () => {
		const combat = makeCombat({
			hand: [card("BACKSTAB", { costForTurn: 0 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(r.state.combat!.monsters[0]!.currentHp).toBeLessThan(44);
	});

	it("Heel Hook grants energy and draw when enemy is Weak", () => {
		const combat = makeCombat({
			hand: [card("HEEL_HOOK", { costForTurn: 1 })],
			energy: 3,
			drawPile: [card("STRIKE_GREEN", { uniqueId: 100, costForTurn: 1 })],
			monsters: [monster({ powers: [withPower("weak", 2)] })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = r.state.combat!;
		// Gains 1 energy (3 - 1 cost + 1 bonus = 3)
		expect(c.energy).toBe(3);
		// Drew 1 card
		expect(c.hand.length).toBe(1);
	});

	// ── Uncommon skills ─────────────────────────────────

	it("Catalyst doubles enemy Poison", () => {
		const combat = makeCombat({
			hand: [card("CATALYST", { costForTurn: 1 })],
			energy: 3,
			monsters: [monster({ powers: [withPower("POISON", 5)] })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const poison = r.state.combat!.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison?.amount).toBe(10);
	});

	it("Catalyst+ triples enemy Poison", () => {
		const combat = makeCombat({
			hand: [card("CATALYST", { costForTurn: 1, upgraded: true })],
			energy: 3,
			monsters: [monster({ powers: [withPower("POISON", 5)] })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const poison = r.state.combat!.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison?.amount).toBe(15);
	});

	it("Leg Sweep applies Weak and gains Block", () => {
		const combat = makeCombat({
			hand: [card("LEG_SWEEP", { costForTurn: 2 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = r.state.combat!;
		expect(c.player.block).toBeGreaterThan(0);
		expect(c.monsters[0]!.powers.some((p) => p.id === "weak")).toBe(true);
	});

	it("Terror applies 99 Vulnerable", () => {
		const combat = makeCombat({
			hand: [card("TERROR", { costForTurn: 1 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const vuln = r.state.combat!.monsters[0]!.powers.find((p) => p.id === "vulnerable");
		expect(vuln?.amount).toBe(99);
	});

	it("Expertise draws up to 6 cards", () => {
		const draws = [1, 2, 3, 4, 5].map((_, i) =>
			card("STRIKE_GREEN", { uniqueId: 100 + i, costForTurn: 1 }),
		);
		const combat = makeCombat({
			hand: [
				card("EXPERTISE", { costForTurn: 1 }),
				card("DEFEND_GREEN", { uniqueId: 60, costForTurn: 1 }),
			],
			drawPile: draws,
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		// Had 2 cards (including Expertise), played 1, so 1 left. Need 5 to reach 6. Draw 5.
		expect(r.state.combat!.hand.length).toBe(6);
	});

	// ── Uncommon powers ─────────────────────────────────

	it("Footwork grants Dexterity", () => {
		const combat = makeCombat({
			hand: [card("FOOTWORK", { costForTurn: 1 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const dex = r.state.combat!.player.powers.find((p) => p.id === "dexterity");
		expect(dex?.amount).toBe(2);
	});

	it("Noxious Fumes applies Poison at start of turn", () => {
		const combat = makeCombat({
			hand: [],
			energy: 0,
			player: {
				block: 0,
				powers: [withPower("NOXIOUS_FUMES", 2)],
				stance: "neutral" as const,
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		// End turn → monster acts → new turn → atStartOfTurn fires Noxious Fumes
		const r = step(state, { type: "endTurn" });
		const poison = r.state.combat!.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison?.amount).toBe(2);
	});

	// ── Rare attacks ────────────────────────────────────

	it("Die Die Die deals damage to all enemies (exhaust)", () => {
		const combat = makeCombat({
			hand: [card("DIE_DIE_DIE", { costForTurn: 1 })],
			energy: 3,
			monsters: [
				monster({ currentHp: 44, maxHp: 44 }),
				monster({ index: 1, currentHp: 30, maxHp: 30 }),
			],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = r.state.combat!;
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
		expect(c.monsters[1]!.currentHp).toBeLessThan(30);
	});

	it("Grand Finale deals 50 damage when draw pile empty", () => {
		const combat = makeCombat({
			hand: [card("GRAND_FINALE", { costForTurn: 0 })],
			drawPile: [],
			energy: 3,
			monsters: [monster({ currentHp: 100, maxHp: 100 })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(r.state.combat!.monsters[0]!.currentHp).toBe(50);
	});

	it("Grand Finale does nothing when draw pile is not empty", () => {
		const combat = makeCombat({
			hand: [card("GRAND_FINALE", { costForTurn: 0 })],
			drawPile: [card("STRIKE_GREEN", { uniqueId: 100 })],
			energy: 3,
			monsters: [monster({ currentHp: 100, maxHp: 100 })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(r.state.combat!.monsters[0]!.currentHp).toBe(100);
	});

	// ── Rare skills ─────────────────────────────────────

	it("Adrenaline gives energy and draws cards", () => {
		const draws = [1, 2].map((_, i) => card("STRIKE_GREEN", { uniqueId: 100 + i, costForTurn: 1 }));
		const combat = makeCombat({
			hand: [card("ADRENALINE", { costForTurn: 0 })],
			drawPile: draws,
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = r.state.combat!;
		expect(c.energy).toBe(4); // 3 - 0 + 1
		expect(c.hand.length).toBe(2);
	});

	it("Burst applies Burst power", () => {
		const combat = makeCombat({
			hand: [card("BURST", { costForTurn: 1 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const burst = r.state.combat!.player.powers.find((p) => p.id === "BURST");
		expect(burst?.amount).toBe(1);
	});

	// ── Rare powers ─────────────────────────────────────

	it("A Thousand Cuts applies power", () => {
		const combat = makeCombat({
			hand: [card("A_THOUSAND_CUTS", { costForTurn: 2 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const p = r.state.combat!.player.powers.find((pp) => pp.id === "A_THOUSAND_CUTS");
		expect(p?.amount).toBe(1);
	});

	// ── Hook mechanics ─────────────────────────────────────

	it("Eviscerate costs less after discarding cards", () => {
		const combat = makeCombat({
			hand: [card("EVISCERATE", { costForTurn: 3 })],
			energy: 3,
			cardsDiscardedThisTurn: 2,
			monsters: [monster({ currentHp: 100, maxHp: 100 })],
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		// Cost 3 - 2 discards = 1, so 3 - 1 = 2 energy left
		expect(r.state.combat!.energy).toBe(2);
		expect(r.state.combat!.monsters[0]!.currentHp).toBeLessThan(100);
	});

	it("Burst replays the next Skill", () => {
		const combat = makeCombat({
			hand: [card("DEFEND_GREEN", { uniqueId: 60, costForTurn: 1 })],
			energy: 3,
			player: {
				block: 0,
				powers: [withPower("BURST", 1)],
				stance: "neutral" as const,
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = r.state.combat!;
		// Defend gives 5 block, played twice = 10
		expect(c.player.block).toBeGreaterThanOrEqual(10);
		// Burst should be consumed
		const burst = c.player.powers.find((p) => p.id === "BURST");
		expect(burst?.amount ?? 0).toBe(0);
	});

	it("Escape Plan draws extra card if first draw is a Skill", () => {
		const combat = makeCombat({
			hand: [card("ESCAPE_PLAN", { costForTurn: 0 })],
			drawPile: [
				card("STRIKE_GREEN", { uniqueId: 101 }),
				card("DEFEND_GREEN", { uniqueId: 102, costForTurn: 1 }),
			],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		// DEFEND_GREEN (top of draw pile) is a Skill → draws extra → 2 cards in hand
		expect(r.state.combat!.hand.length).toBe(2);
	});

	it("Escape Plan does not draw extra if first draw is an Attack", () => {
		const combat = makeCombat({
			hand: [card("ESCAPE_PLAN", { costForTurn: 0 })],
			drawPile: [
				card("DEFEND_GREEN", { uniqueId: 101 }),
				card("STRIKE_GREEN", { uniqueId: 102, costForTurn: 1 }),
			],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		// STRIKE_GREEN (top) is an Attack → no extra draw → 1 card
		expect(r.state.combat!.hand.length).toBe(1);
	});

	it("Well-Laid Plans enters card select on end turn", () => {
		const combat = makeCombat({
			hand: [card("STRIKE_GREEN", { uniqueId: 60 })],
			energy: 0,
			player: {
				block: 0,
				powers: [withPower("WELL_LAID_PLANS", 1)],
				stance: "neutral" as const,
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const r = step(state, { type: "endTurn" });
		expect(r.state.phase.type).toBe("cardSelect");
		if (r.state.phase.type === "cardSelect") {
			expect(r.state.phase.task).toBe("wellLaidPlans");
		}
	});

	it("Wraith Form grants Intangible and Wraith Form power", () => {
		const combat = makeCombat({
			hand: [card("WRAITH_FORM", { costForTurn: 3 })],
			energy: 3,
		});
		const state = makeState(combat);
		const r = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = r.state.combat!;
		const intangible = c.player.powers.find((p) => p.id === "intangible");
		const wraith = c.player.powers.find((p) => p.id === "WRAITH_FORM");
		expect(intangible?.amount).toBe(2);
		expect(wraith?.amount).toBe(1);
	});
});
