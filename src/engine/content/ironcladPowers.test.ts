import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import "./corePowers";
import "./monsterPowers";
import "./ironcladCards";
import "./ironcladUncommonCards";
import "./ironcladRareCards";
import "./statusCards";
import { step } from "../core/step";
import { makeCombat, makeState, makeStrike } from "../core/testHelpers";
import type { CardId, CardInstance, PowerInstance } from "../core/types";
import { loadCards, loadMonsters } from "./loader";

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

function withPower(id: string, amount: number): { powers: PowerInstance[] } {
	return { powers: [{ id: id as never, amount, justApplied: false }] };
}

describe("Ironclad power hooks", () => {
	beforeEach(() => {
		loadCards(cardsJson as never);
		loadMonsters(monstersAct1Json as never);
	});

	it("metallicize grants block at end of turn", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				...withPower("metallicize", 4),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		expect(c.player.block).toBeGreaterThanOrEqual(4);
	});

	it("demonForm grants strength at start of turn", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				powers: [{ id: "demonForm" as never, amount: 3, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		const str = c.player.powers.find((p) => p.id === ("strength" as never));
		expect(str?.amount).toBe(3);
	});

	it("feelNoPain grants block when card exhausted", () => {
		const combat = makeCombat({
			hand: [
				card("SEVER_SOUL", { uniqueId: 1, costForTurn: 2 }),
				card("DEFEND_RED", { uniqueId: 2 }),
			],
			energy: 3,
			player: {
				block: 0,
				...withPower("feelNoPain", 3),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		// Defend exhausted → feelNoPain grants 3 block, plus Sever_Soul doesn't add block
		expect(c.player.block).toBeGreaterThanOrEqual(3);
	});

	it("barricade retains block between turns", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 10,
				powers: [{ id: "barricade" as never, amount: 1, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		expect(c.player.block).toBeGreaterThanOrEqual(10);
	});

	it("rage grants block when attack is played", () => {
		const combat = makeCombat({
			hand: [makeStrike()],
			energy: 3,
			player: {
				block: 0,
				...withPower("rage", 5),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		expect(c.player.block).toBeGreaterThanOrEqual(5);
	});

	it("berserk grants energy at start of turn", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				powers: [{ id: "berserk" as never, amount: 1, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			energy: 3,
			maxEnergy: 3,
		});
		const state = makeState(combat);
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		// New turn: 3 base energy + 1 berserk = 4
		expect(c.energy).toBe(4);
	});

	it("flameBarrier damages attacker", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				powers: [{ id: "flameBarrier" as never, amount: 7, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			monsters: [
				{
					id: "JAW_WORM" as never,
					index: 0,
					maxHp: 44,
					currentHp: 44,
					block: 0,
					powers: [],
					intent: {
						moveId: "JAW_WORM_CHOMP" as never,
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
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		expect(c.monsters[0]!.currentHp).toBeLessThanOrEqual(44 - 7);
	});

	it("corruption makes skills cost 0 and exhaust on play", () => {
		const combat = makeCombat({
			hand: [card("DEFEND_RED", { uniqueId: 1, costForTurn: 1 })],
			energy: 1,
			player: {
				block: 0,
				...withPower("corruption", 1),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: -1 });
		const c = result.state.combat!;
		expect(c.exhaustPile.some((x) => x.id === ("DEFEND_RED" as never))).toBe(true);
		expect(c.player.block).toBeGreaterThan(0);
	});

	it("doubleTap replays the next attack", () => {
		const combat = makeCombat({
			hand: [makeStrike()],
			energy: 3,
			player: {
				block: 0,
				...withPower("doubleTap", 1),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
		});
		const state = makeState(combat);
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const c = result.state.combat!;
		// Strike deals 6 damage, played twice = 12 total
		expect(c.monsters[0]!.currentHp).toBeLessThanOrEqual(44 - 12);
		// doubleTap counter should have decremented
		const dt = c.player.powers.find((p) => p.id === ("doubleTap" as never));
		expect(dt?.amount).toBe(0);
	});

	it("intangible reduces damage to 1", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				...withPower("intangible", 1),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			monsters: [
				{
					id: "JAW_WORM" as never,
					index: 0,
					maxHp: 44,
					currentHp: 44,
					block: 0,
					powers: [],
					intent: {
						moveId: "JAW_WORM_CHOMP" as never,
						baseDamage: 20,
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
		const result = step(state, { type: "endTurn" });
		// 20 damage reduced to 1 by intangible
		expect(result.state.currentHp).toBe(79);
	});

	it("platedArmor grants block at end of turn and loses stack on HP loss", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				...withPower("platedArmor", 5),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			monsters: [
				{
					id: "JAW_WORM" as never,
					index: 0,
					maxHp: 44,
					currentHp: 44,
					block: 0,
					powers: [],
					intent: {
						moveId: "JAW_WORM_CHOMP" as never,
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
		const result = step(state, { type: "endTurn" });
		const c = result.state.combat!;
		// Plated armor gave 5 block, monster dealt 11 → 6 unblocked → HP 74
		// Plated armor should drop to 4 from unblocked damage
		const pa = c.player.powers.find((p) => p.id === ("platedArmor" as never));
		expect(pa?.amount).toBe(4);
		expect(result.state.currentHp).toBeLessThan(80);
	});

	it("buffer prevents HP loss once", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				powers: [{ id: "BUFFER" as never, amount: 1, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			monsters: [
				{
					id: "JAW_WORM" as never,
					index: 0,
					maxHp: 44,
					currentHp: 44,
					block: 0,
					powers: [],
					intent: {
						moveId: "JAW_WORM_CHOMP" as never,
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
		const result = step(state, { type: "endTurn" });
		// Buffer should prevent all HP loss
		expect(result.state.currentHp).toBe(80);
		// Buffer should be consumed
		const buf = result.state.combat!.player.powers.find((p) => p.id === ("BUFFER" as never));
		expect(buf).toBeUndefined();
	});

	it("regen heals at end of turn", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				...withPower("regen", 3),
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			monsters: [
				{
					id: "JAW_WORM" as never,
					index: 0,
					maxHp: 44,
					currentHp: 44,
					block: 0,
					powers: [],
					intent: {
						moveId: "chomp" as never,
						baseDamage: 0,
						hits: 0,
						isAttack: false,
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
		const state = { ...makeState(combat), currentHp: 70 };
		const result = step(state, { type: "endTurn" });
		expect(result.state.currentHp).toBe(73);
		// regen is turnBased, should decrement to 2
		const rg = result.state.combat!.player.powers.find((p) => p.id === ("regen" as never));
		expect(rg?.amount).toBe(2);
	});

	it("ritual grants strength each round", () => {
		const combat = makeCombat({
			hand: [],
			player: {
				block: 0,
				powers: [{ id: "ritual" as never, amount: 2, justApplied: false }],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			monsters: [
				{
					id: "JAW_WORM" as never,
					index: 0,
					maxHp: 44,
					currentHp: 44,
					block: 0,
					powers: [],
					intent: {
						moveId: "chomp" as never,
						baseDamage: 0,
						hits: 0,
						isAttack: false,
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
		const result = step(state, { type: "endTurn" });
		const str = result.state.combat!.player.powers.find((p) => p.id === ("strength" as never));
		expect(str?.amount).toBe(2);
	});
});
