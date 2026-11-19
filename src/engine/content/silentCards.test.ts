import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import powersJson from "../../../data-reference/powers.json";
import "./corePowers";
import "./silentCards";
import "./silentPowers";
import { step } from "../core/step";
import { makeCombat, makeState } from "../core/testHelpers";
import type { CardId, CardInstance, PowerId, PowerInstance } from "../core/types";
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

describe("Silent card effects", () => {
	beforeEach(() => {
		loadCards(cardsJson as never);
		loadPowers(powersJson as never);
	});

	// ── Poison mechanic ──────────────────────────────────

	it("DEADLY_POISON applies poison to target", () => {
		const combat = makeCombat({
			hand: [card("DEADLY_POISON")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		const poison = c.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison).toBeDefined();
		expect(poison!.amount).toBe(5);
	});

	it("DEADLY_POISON upgraded applies 7 poison", () => {
		const combat = makeCombat({
			hand: [card("DEADLY_POISON", { upgraded: true })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		const poison = c.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison!.amount).toBe(7);
	});

	it("POISONED_STAB deals damage and applies poison", () => {
		const combat = makeCombat({
			hand: [card("POISONED_STAB")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
		const poison = c.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison).toBeDefined();
		expect(poison!.amount).toBe(3);
	});

	// ── Bane ─────────────────────────────────────────────

	it("BANE deals damage once if enemy has no poison", () => {
		const combat = makeCombat({
			hand: [card("BANE")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		// 44 - 7 = 37
		expect(c.monsters[0]!.currentHp).toBe(37);
	});

	it("BANE deals double damage if enemy has poison", () => {
		const combat = makeCombat({
			hand: [card("BANE")],
			energy: 3,
			monsters: [
				{
					...makeCombat().monsters[0]!,
					powers: [withPower("POISON", 3)],
				},
			],
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		// 44 - 7 - 7 = 30
		expect(c.monsters[0]!.currentHp).toBe(30);
	});

	// ── Shiv mechanic ────────────────────────────────────

	it("BLADE_DANCE adds 2 Shivs to hand (3 upgraded)", () => {
		const combat = makeCombat({
			hand: [card("BLADE_DANCE")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		// Blade Dance discarded, 2 shivs in hand (magic=3 from JSON but
		// unupgraded Blade Dance has magic=3 → adds 3 shivs)
		const shivs = c.hand.filter((c) => c.id === "SHIV");
		expect(shivs.length).toBe(3);
	});

	it("BLADE_DANCE upgraded adds 4 Shivs", () => {
		const combat = makeCombat({
			hand: [card("BLADE_DANCE", { upgraded: true })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		const shivs = c.hand.filter((c) => c.id === "SHIV");
		expect(shivs.length).toBe(4);
	});

	it("CLOAK_AND_DAGGER gains block and adds shiv(s)", () => {
		const combat = makeCombat({
			hand: [card("CLOAK_AND_DAGGER")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.player.block).toBeGreaterThan(0);
		const shivs = c.hand.filter((c) => c.id === "SHIV");
		expect(shivs.length).toBe(1);
	});

	// ── Block cards ──────────────────────────────────────

	it("BACKFLIP gains block and draws 2", () => {
		const combat = makeCombat({
			hand: [card("BACKFLIP")],
			drawPile: [card("STRIKE_GREEN", { uniqueId: 101 }), card("STRIKE_GREEN", { uniqueId: 102 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.player.block).toBe(5);
		expect(c.hand.length).toBe(2);
	});

	it("DEFLECT gains block at 0 cost", () => {
		const combat = makeCombat({
			hand: [card("DEFLECT", { costForTurn: 0 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.player.block).toBe(4);
	});

	// ── Attack cards ─────────────────────────────────────

	it("NEUTRALIZE deals damage and applies weak", () => {
		const combat = makeCombat({
			hand: [card("NEUTRALIZE", { costForTurn: 0 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBe(44 - 3);
		const weak = c.monsters[0]!.powers.find((p) => p.id === "weak");
		expect(weak).toBeDefined();
		expect(weak!.amount).toBe(1);
	});

	it("QUICK_SLASH deals damage and draws 1", () => {
		const combat = makeCombat({
			hand: [card("QUICK_SLASH")],
			drawPile: [card("STRIKE_GREEN", { uniqueId: 101 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBe(44 - 8);
		expect(c.hand.length).toBe(1);
	});

	it("SLICE deals damage at 0 cost", () => {
		const combat = makeCombat({
			hand: [card("SLICE", { costForTurn: 0 })],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBe(44 - 6);
	});

	it("SUCKER_PUNCH deals damage and applies weak", () => {
		const combat = makeCombat({
			hand: [card("SUCKER_PUNCH")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBe(44 - 7);
		const weak = c.monsters[0]!.powers.find((p) => p.id === "weak");
		expect(weak!.amount).toBe(1);
	});

	// ── Dagger Spray (AoE) ───────────────────────────────

	it("DAGGER_SPRAY hits all enemies twice", () => {
		const monster1 = {
			...makeCombat().monsters[0]!,
			index: 0,
		};
		const monster2 = {
			...makeCombat().monsters[0]!,
			index: 1,
			uniqueId: 2,
		};
		const combat = makeCombat({
			hand: [card("DAGGER_SPRAY")],
			energy: 3,
			monsters: [monster1, monster2],
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		// Each monster hit twice for 4 damage = 8 total
		expect(c.monsters[0]!.currentHp).toBe(44 - 8);
		expect(c.monsters[1]!.currentHp).toBe(44 - 8);
	});

	// ── Outmaneuver / Flying Knee (energy next turn) ─────

	it("OUTMANEUVER applies energized power", () => {
		const combat = makeCombat({
			hand: [card("OUTMANEUVER")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		const energized = c.player.powers.find((p) => p.id === "energized");
		expect(energized).toBeDefined();
		expect(energized!.amount).toBe(2);
	});

	it("FLYING_KNEE deals damage and applies energized", () => {
		const combat = makeCombat({
			hand: [card("FLYING_KNEE")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBe(44 - 8);
		const energized = c.player.powers.find((p) => p.id === "energized");
		expect(energized).toBeDefined();
		expect(energized!.amount).toBe(1);
	});

	// ── Dodge and Roll (next turn block) ─────────────────

	it("DODGE_AND_ROLL gains block and applies nextTurnBlock", () => {
		const combat = makeCombat({
			hand: [card("DODGE_AND_ROLL")],
			energy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.player.block).toBe(4);
		const ntb = c.player.powers.find((p) => p.id === "nextTurnBlock");
		expect(ntb).toBeDefined();
		expect(ntb!.amount).toBe(4);
	});
});

describe("Poison power hook", () => {
	beforeEach(() => {
		loadCards(cardsJson as never);
		loadPowers(powersJson as never);
	});

	it("poison deals damage to monster at end of turn and reduces by 1", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: [
				card("STRIKE_GREEN", { uniqueId: 101 }),
				card("STRIKE_GREEN", { uniqueId: 102 }),
				card("STRIKE_GREEN", { uniqueId: 103 }),
				card("STRIKE_GREEN", { uniqueId: 104 }),
				card("STRIKE_GREEN", { uniqueId: 105 }),
			],
			monsters: [
				{
					...makeCombat().monsters[0]!,
					powers: [withPower("POISON", 5)],
				},
			],
			energy: 0,
		});
		const state = makeState(combat);
		// End turn → poison fires during atEndOfTurn for monsters
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		// Monster should have lost 5 HP from poison
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
		// Poison should be reduced to 4
		const poison = c.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison).toBeDefined();
		expect(poison!.amount).toBe(4);
	});

	it("poison at 1 deals 1 damage and removes itself", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: [
				card("STRIKE_GREEN", { uniqueId: 101 }),
				card("STRIKE_GREEN", { uniqueId: 102 }),
				card("STRIKE_GREEN", { uniqueId: 103 }),
				card("STRIKE_GREEN", { uniqueId: 104 }),
				card("STRIKE_GREEN", { uniqueId: 105 }),
			],
			monsters: [
				{
					...makeCombat().monsters[0]!,
					powers: [withPower("POISON", 1)],
				},
			],
			energy: 0,
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		// 1 damage from poison
		expect(c.monsters[0]!.currentHp).toBeLessThan(44);
		// Poison should be removed
		const poison = c.monsters[0]!.powers.find((p) => p.id === "POISON");
		expect(poison).toBeUndefined();
	});

	it("poison bypasses block", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: [
				card("STRIKE_GREEN", { uniqueId: 101 }),
				card("STRIKE_GREEN", { uniqueId: 102 }),
				card("STRIKE_GREEN", { uniqueId: 103 }),
				card("STRIKE_GREEN", { uniqueId: 104 }),
				card("STRIKE_GREEN", { uniqueId: 105 }),
			],
			monsters: [
				{
					...makeCombat().monsters[0]!,
					block: 100,
					powers: [withPower("POISON", 5)],
				},
			],
			energy: 0,
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		// Poison damage bypasses block (goes to HP directly)
		// Block should still be 0 (cleared at start of turn) but HP reduced
		expect(c.monsters[0]!.currentHp).toBe(44 - 5);
	});
});
