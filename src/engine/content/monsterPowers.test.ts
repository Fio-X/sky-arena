import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import powersJson from "../../../data-reference/powers.json";
import "../content/index";
import { applyPower } from "../combat/powers";
import { loadCards, loadPowers } from "../content/loader";
import { drainActions } from "../core/actionExecutor";
import { addToBot } from "../core/actionQueue";
import { fireHook } from "../core/hooks";
import { step } from "../core/step";
import { makeCombat, makeDefend, makeState, makeStrike } from "../core/testHelpers";
import type {
	Action,
	ActorRef,
	CombatState,
	GameEvent,
	GameState,
	MonsterId,
	MonsterMoveId,
	PowerId,
	PowerInstance,
} from "../core/types";

beforeEach(() => {
	loadCards(cardsJson as never);
	loadPowers(powersJson as never);
});

const PLAYER: ActorRef = { type: "player" };
const M0: ActorRef = { type: "monster", index: 0 };

function monsterWith(powers: PowerInstance[], overrides: Partial<CombatState> = {}) {
	return makeCombat({
		monsters: [
			{
				id: "TEST_MONSTER" as MonsterId,
				index: 0,
				maxHp: 100,
				currentHp: 100,
				block: 0,
				powers,
				intent: {
					moveId: "ATTACK" as MonsterMoveId,
					baseDamage: 10,
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
		...overrides,
	});
}

function pw(id: string, amount: number, justApplied = false): PowerInstance {
	return { id: id as PowerId, amount, justApplied };
}

function dealDamageToMonster(
	state: GameState,
	baseDamage: number,
): { state: GameState; events: GameEvent[] } {
	if (!state.combat) throw new Error("no combat");
	const action: Action = { type: "damage", source: PLAYER, target: M0, baseDamage, hits: 1 };
	const s = { ...state, combat: addToBot(state.combat, action) };
	const events: GameEvent[] = [];
	return drainActions(s, events);
}

// ── Ritual ──────────────────────────────────────────────

describe("Ritual", () => {
	it("skips strength gain on justApplied turn", () => {
		const combat = monsterWith([pw("RITUAL", 3, true)]);
		let s = makeState(combat);
		s = fireHook(s, M0, "atEndOfRound");
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "RITUAL")?.justApplied).toBe(false);
		expect(m.powers.find((p) => p.id === "strength")).toBeUndefined();
	});

	it("gains strength on subsequent rounds", () => {
		const combat = monsterWith([pw("RITUAL", 3, false)]);
		let s = makeState(combat);
		s = fireHook(s, M0, "atEndOfRound");
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")?.amount).toBe(3);
	});

	it("stacks strength across rounds", () => {
		const combat = monsterWith([pw("RITUAL", 2, false), pw("strength", 5)]);
		let s = makeState(combat);
		s = fireHook(s, M0, "atEndOfRound");
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")?.amount).toBe(7);
	});
});

// ── Curl Up ─────────────────────────────────────────────

describe("Curl Up", () => {
	it("gains block and removes self on unblocked hit", () => {
		const combat = monsterWith([pw("CURL_UP", 11)]);
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 5);
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.block).toBe(11);
		expect(m.powers.find((p) => p.id === "CURL_UP")).toBeUndefined();
	});

	it("does not trigger when damage is fully blocked", () => {
		const combat = monsterWith([pw("CURL_UP", 11)], {
			monsters: [
				{
					id: "TEST" as MonsterId,
					index: 0,
					maxHp: 100,
					currentHp: 100,
					block: 20,
					powers: [pw("CURL_UP", 11)],
					intent: {
						moveId: "X" as MonsterMoveId,
						baseDamage: null,
						hits: 1,
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
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 5);
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "CURL_UP")?.amount).toBe(11);
	});
});

// ── Angry ───────────────────────────────────────────────

describe("Angry", () => {
	it("gains strength when hit", () => {
		const combat = monsterWith([pw("ANGRY", 1)]);
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 5);
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")?.amount).toBe(1);
	});

	it("stacks strength on multiple hits", () => {
		const combat = monsterWith([pw("ANGRY", 2)]);
		let s = makeState(combat);
		let result = dealDamageToMonster(s, 3);
		s = result.state;
		result = dealDamageToMonster(s, 3);
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")?.amount).toBe(4);
	});
});

// ── Enrage ──────────────────────────────────────────────

describe("Enrage", () => {
	it("gains strength when player plays a Skill", () => {
		const defend = makeDefend();
		const combat = monsterWith([pw("ENRAGE", 2)], {
			hand: [defend],
			energy: 3,
		});
		let s = makeState(combat);
		const result = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 });
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")?.amount).toBe(2);
	});

	it("does not gain strength when player plays an Attack", () => {
		const strike = makeStrike();
		const combat = monsterWith([pw("ENRAGE", 2)], {
			hand: [strike],
			energy: 3,
		});
		let s = makeState(combat);
		const result = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 });
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")).toBeUndefined();
	});
});

// ── Entangled ───────────────────────────────────────────

describe("Entangled", () => {
	it("prevents playing Attack cards", () => {
		const strike = makeStrike();
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [pw("ENTANGLED", 1)],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			hand: [strike],
			energy: 3,
		});
		const s = makeState(combat);
		const result = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 });
		// Card should not be played — hand unchanged
		expect(result.state.combat!.hand.length).toBe(1);
		expect(result.state.combat!.energy).toBe(3);
	});

	it("allows playing Skill cards", () => {
		const defend = makeDefend();
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [pw("ENTANGLED", 1)],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			hand: [defend],
			energy: 3,
		});
		const s = makeState(combat);
		const result = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(result.state.combat!.hand.length).toBe(0);
	});
});

// ── Metallicize ─────────────────────────────────────────

describe("Metallicize", () => {
	it("gains block at end of turn", () => {
		const combat = monsterWith([pw("METALLICIZE", 8)], {
			hand: [],
			drawPile: [],
		});
		let s = makeState(combat);
		s = fireHook(s, M0, "atEndOfTurn", true);
		expect(s.combat!.monsters[0]!.block).toBe(8);
	});
});

// ── Asleep ──────────────────────────────────────────────

describe("Asleep", () => {
	it("is removed when monster takes unblocked damage", () => {
		const combat = monsterWith([pw("ASLEEP", 1)]);
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 5);
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "ASLEEP")).toBeUndefined();
	});

	it("persists when damage is fully blocked", () => {
		const combat = monsterWith([pw("ASLEEP", 1)], {
			monsters: [
				{
					id: "TEST" as MonsterId,
					index: 0,
					maxHp: 100,
					currentHp: 100,
					block: 50,
					powers: [pw("ASLEEP", 1)],
					intent: {
						moveId: "X" as MonsterMoveId,
						baseDamage: null,
						hits: 1,
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
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 5);
		s = result.state;
		expect(s.combat!.monsters[0]!.powers.find((p) => p.id === "ASLEEP")?.amount).toBe(1);
	});
});

// ── Artifact ────────────────────────────────────────────

describe("Artifact", () => {
	it("blocks a debuff and consumes a stack", () => {
		const combat = monsterWith([pw("ARTIFACT", 2)]);
		let s = makeState(combat);
		s = applyPower(s, PLAYER, M0, "vulnerable" as PowerId, 2);
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "vulnerable")).toBeUndefined();
		expect(m.powers.find((p) => p.id === "ARTIFACT")?.amount).toBe(1);
	});

	it("removes itself when last stack consumed", () => {
		const combat = monsterWith([pw("ARTIFACT", 1)]);
		let s = makeState(combat);
		s = applyPower(s, PLAYER, M0, "weak" as PowerId, 1);
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "weak")).toBeUndefined();
		expect(m.powers.find((p) => p.id === "ARTIFACT")).toBeUndefined();
	});

	it("allows buffs through", () => {
		const combat = monsterWith([pw("ARTIFACT", 1)]);
		let s = makeState(combat);
		s = applyPower(s, PLAYER, M0, "strength" as PowerId, 3);
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")?.amount).toBe(3);
		expect(m.powers.find((p) => p.id === "ARTIFACT")?.amount).toBe(1);
	});
});

// ── Sharp Hide ──────────────────────────────────────────

// Sharp Hide: see combat/act1BossFixes.test.ts (once per Attack card, blockable).

// ── Mode Shift ──────────────────────────────────────────

describe("Mode Shift", () => {
	it("decrements remaining threshold on damage", () => {
		const combat = monsterWith([pw("MODE_SHIFT", 30)]);
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 10);
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "MODE_SHIFT")?.amount).toBe(20);
	});

	it("removes self and grants block when threshold reached", () => {
		const combat = monsterWith([pw("MODE_SHIFT", 10)]);
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 15);
		s = result.state;
		const m = s.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "MODE_SHIFT")).toBeUndefined();
		expect(m.block).toBe(20);
	});
});

// ── Spore Cloud ─────────────────────────────────────────

describe("Spore Cloud", () => {
	it("applies Vulnerable to player on death", () => {
		const combat = monsterWith([pw("SPORE_CLOUD", 2)], {
			monsters: [
				{
					id: "FUNGI_BEAST" as MonsterId,
					index: 0,
					maxHp: 30,
					currentHp: 5,
					block: 0,
					powers: [pw("SPORE_CLOUD", 2)],
					intent: {
						moveId: "BITE" as MonsterMoveId,
						baseDamage: 6,
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
		let s = makeState(combat);
		const result = dealDamageToMonster(s, 20);
		s = result.state;
		const playerVuln = s.combat!.player.powers.find((p) => p.id === "vulnerable");
		expect(playerVuln?.amount).toBe(2);
	});
});

// ── Turn-based power ticking ────────────────────────────

describe("Turn-based power ticking", () => {
	it("decrements Vulnerable at end of round", () => {
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [pw("vulnerable", 2)],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			hand: [],
			drawPile: [],
		});
		const s = makeState(combat);
		const result = step(s, { type: "endTurn" });
		const vuln = result.state.combat!.player.powers.find((p) => p.id === "vulnerable");
		expect(vuln?.amount).toBe(1);
	});

	it("removes Vulnerable when it reaches 0", () => {
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [pw("vulnerable", 1)],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			hand: [],
			drawPile: [],
		});
		const s = makeState(combat);
		const result = step(s, { type: "endTurn" });
		expect(result.state.combat!.player.powers.find((p) => p.id === "vulnerable")).toBeUndefined();
	});

	it("decrements Weak on monster", () => {
		const combat = monsterWith([pw("weak", 3)], { hand: [], drawPile: [] });
		const s = makeState(combat);
		const result = step(s, { type: "endTurn" });
		const m = result.state.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "weak")?.amount).toBe(2);
	});

	it("skips decrement on justApplied turn, then decrements next", () => {
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [pw("frail", 2, true)],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			hand: [],
			drawPile: [],
		});
		const s = makeState(combat);
		let result = step(s, { type: "endTurn" });
		let frail = result.state.combat!.player.powers.find((p) => p.id === "frail");
		expect(frail?.amount).toBe(2);
		expect(frail?.justApplied).toBe(false);
		result = step(result.state, { type: "endTurn" });
		frail = result.state.combat!.player.powers.find((p) => p.id === "frail");
		expect(frail?.amount).toBe(1);
	});

	it("Ritual gains strength during end of round tick", () => {
		const combat = monsterWith([pw("RITUAL", 3, false)], { hand: [], drawPile: [] });
		const s = makeState(combat);
		const result = step(s, { type: "endTurn" });
		const m = result.state.combat!.monsters[0]!;
		expect(m.powers.find((p) => p.id === "strength")?.amount).toBe(3);
	});
});

// ── Entangled removal ───────────────────────────────────

describe("Entangled removal at start of turn", () => {
	it("removes Entangled when new turn begins", () => {
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [pw("ENTANGLED", 1)],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			hand: [],
			drawPile: [],
		});
		const s = makeState(combat);
		const result = step(s, { type: "endTurn" });
		expect(result.state.combat!.player.powers.find((p) => p.id === "ENTANGLED")).toBeUndefined();
	});

	it("blocks Attacks during the turn but allows next turn", () => {
		const strike = makeStrike();
		const combat = makeCombat({
			player: {
				block: 0,
				powers: [pw("ENTANGLED", 1)],
				stance: "neutral",
				orbs: [],
				orbSlots: 3,
			},
			hand: [strike],
			energy: 3,
			drawPile: [makeStrike()],
		});
		const s = makeState(combat);
		let result = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 });
		expect(result.state.combat!.hand.length).toBe(1);
		result = step(result.state, { type: "endTurn" });
		expect(result.state.combat!.player.powers.find((p) => p.id === "ENTANGLED")).toBeUndefined();
	});
});
