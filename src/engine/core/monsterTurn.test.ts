import { beforeEach, describe, expect, it } from "vitest";
import cardsJson from "../../../data-reference/cards.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import powersJson from "../../../data-reference/powers.json";
import "../content/corePowers";
import "../content/jawWormAi";
import "../content/slimeAi";
import { resolveMonsterMove, rollMonsterMiscInfo } from "../combat/monsterTurn";
import { loadCards, loadMonsters, loadPowers } from "../content/loader";
import { createRng } from "../rng/stsRandom";
import { step } from "./step";
import { at, baseMonster, getCombat, makeCards, makeCombat, makeState } from "./testHelpers";
import type { MonsterId, MonsterMoveId, MonsterState } from "./types";

beforeEach(() => {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadPowers(powersJson as never);
});

describe("monster turn — Jaw Worm", () => {
	it("first turn always CHOMP: deals 11 damage to player", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			monsters: [
				{
					...baseMonster(),
					intent: {
						moveId: "JAW_WORM_CHOMP" as MonsterMoveId,
						baseDamage: 11,
						hits: 1,
						isAttack: true,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: [],
				},
			],
		});
		const rng = createRng(1n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });

		expect(result.state.currentHp).toBe(80 - 11);
		const dmgEvents = result.events.filter((e) => e.type === "damageDealt");
		expect(dmgEvents.length).toBeGreaterThanOrEqual(1);
	});

	it("BELLOW gives strength to itself", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			monsters: [
				{
					...baseMonster(),
					intent: {
						moveId: "JAW_WORM_BELLOW" as MonsterMoveId,
						baseDamage: null,
						hits: 1,
						isAttack: false,
						isDebuff: false,
						isBuff: true,
					},
					moveHistory: ["JAW_WORM_CHOMP" as MonsterMoveId],
				},
			],
		});
		const rng = createRng(1n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });

		const m = at(getCombat(result).monsters, 0);
		const str = m.powers.find((p) => p.id === "strength");
		expect(str).toBeDefined();
		expect(str?.amount).toBe(3);
	});

	it("THRASH deals damage to player", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			monsters: [
				{
					...baseMonster(),
					intent: {
						moveId: "JAW_WORM_THRASH" as MonsterMoveId,
						baseDamage: 7,
						hits: 1,
						isAttack: true,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: ["JAW_WORM_CHOMP" as MonsterMoveId],
				},
			],
		});
		const rng = createRng(1n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });

		expect(result.state.currentHp).toBe(80 - 7);
	});

	it("updates moveHistory after executing", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(10, "D"),
			monsters: [
				{
					...baseMonster(),
					intent: {
						moveId: "JAW_WORM_CHOMP" as MonsterMoveId,
						baseDamage: 11,
						hits: 1,
						isAttack: true,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: [],
				},
			],
		});
		const rng = createRng(1n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });

		const m = at(getCombat(result).monsters, 0);
		expect(m.moveHistory).toContain("JAW_WORM_CHOMP");
	});
});

// ── Status cards from monster moves ─────────────────────

function makeMonsterForMove(id: string): MonsterState {
	return { ...baseMonster(), id: id as MonsterId, index: 0 };
}

describe("status cards from monster moves", () => {
	it("Sentry BOLT adds 2 Dazed to discard pile", () => {
		const m = makeMonsterForMove("SENTRY");
		const actions = resolveMonsterMove(m, "SENTRY_BOLT" as MonsterMoveId, 0);
		const cardActions = actions.filter((a) => a.type === "addCardToDiscardPile");
		expect(cardActions.length).toBe(2);
		for (const a of cardActions) {
			if (a.type === "addCardToDiscardPile") {
				expect(a.cardId).toBe("DAZED");
			}
		}
	});

	it("Acid Slime M Corrosive Spit adds 1 Slimed", () => {
		const m = makeMonsterForMove("ACID_SLIME_M");
		const actions = resolveMonsterMove(m, "ACID_SLIME_M_CORROSIVE_SPIT" as MonsterMoveId, 0);
		const cardActions = actions.filter((a) => a.type === "addCardToDiscardPile");
		expect(cardActions.length).toBe(1);
		if (cardActions[0]?.type === "addCardToDiscardPile") {
			expect(cardActions[0].cardId).toBe("SLIMED");
		}
	});

	it("Acid Slime L Corrosive Spit adds 2 Slimed", () => {
		const m = makeMonsterForMove("ACID_SLIME_L");
		const actions = resolveMonsterMove(m, "ACID_SLIME_L_CORROSIVE_SPIT" as MonsterMoveId, 0);
		const cardActions = actions.filter((a) => a.type === "addCardToDiscardPile");
		expect(cardActions.length).toBe(2);
	});

	it("Spike Slime M Flame Tackle adds 1 Slimed", () => {
		const m = makeMonsterForMove("SPIKE_SLIME_M");
		const actions = resolveMonsterMove(m, "SPIKE_SLIME_M_FLAME_TACKLE" as MonsterMoveId, 0);
		const cardActions = actions.filter((a) => a.type === "addCardToDiscardPile");
		expect(cardActions.length).toBe(1);
	});

	it("Slime Boss Goop Spray adds 3 Slimed", () => {
		const m = makeMonsterForMove("SLIME_BOSS");
		const actions = resolveMonsterMove(m, "SLIME_BOSS_GOOP_SPRAY" as MonsterMoveId, 0);
		const cardActions = actions.filter((a) => a.type === "addCardToDiscardPile");
		expect(cardActions.length).toBe(3);
	});

	it("Hexaghost Sear adds 1 Burn", () => {
		const m = makeMonsterForMove("HEXAGHOST");
		const actions = resolveMonsterMove(m, "HEXAGHOST_SEAR" as MonsterMoveId, 0);
		const cardActions = actions.filter((a) => a.type === "addCardToDiscardPile");
		expect(cardActions.length).toBe(1);
		if (cardActions[0]?.type === "addCardToDiscardPile") {
			expect(cardActions[0].cardId).toBe("BURN");
		}
	});

	it("Looter MUG generates loseGold action", () => {
		const m = makeMonsterForMove("LOOTER");
		const actions = resolveMonsterMove(m, "LOOTER_MUG" as MonsterMoveId, 0);
		const goldActions = actions.filter((a) => a.type === "loseGold");
		expect(goldActions.length).toBe(1);
		if (goldActions[0]?.type === "loseGold") {
			expect(goldActions[0].amount).toBe(15);
		}
	});
});

// ── Dynamic damage ─────────────────────────────────────────

describe("dynamic damage — Louse", () => {
	it("rollMonsterMiscInfo returns value in [5, 7] for RED_LOUSE", () => {
		const results = new Set<number>();
		let rng = createRng(1n);
		for (let i = 0; i < 50; i++) {
			const roll = rollMonsterMiscInfo("RED_LOUSE", 0, rng);
			results.add(roll.miscInfo);
			rng = roll.rng;
		}
		for (const v of results) {
			expect(v).toBeGreaterThanOrEqual(5);
			expect(v).toBeLessThanOrEqual(7);
		}
		expect(results.size).toBeGreaterThan(1);
	});

	it("rollMonsterMiscInfo returns value in [5, 7] for GREEN_LOUSE", () => {
		const roll = rollMonsterMiscInfo("GREEN_LOUSE", 0, createRng(42n));
		expect(roll.miscInfo).toBeGreaterThanOrEqual(5);
		expect(roll.miscInfo).toBeLessThanOrEqual(7);
	});

	it("resolveMonsterMove uses miscInfo for range damage", () => {
		const m: MonsterState = { ...makeMonsterForMove("RED_LOUSE"), miscInfo: 6 };
		const actions = resolveMonsterMove(m, "RED_LOUSE_BITE" as MonsterMoveId, 0);
		const dmg = actions.find((a) => a.type === "damage");
		expect(dmg).toBeDefined();
		if (dmg?.type === "damage") {
			expect(dmg.baseDamage).toBe(6);
		}
	});

	it("rollMonsterMiscInfo returns 0 for monsters without range damage", () => {
		const roll = rollMonsterMiscInfo("JAW_WORM", 0, createRng(1n));
		expect(roll.miscInfo).toBe(0);
	});
});

describe("dynamic damage — Hexaghost Divider", () => {
	it("resolveMonsterMove calculates floor(playerHp/12)+1 per hit", () => {
		const m = makeMonsterForMove("HEXAGHOST");
		const actions = resolveMonsterMove(m, "HEXAGHOST_DIVIDER" as MonsterMoveId, 0, 80);
		const dmg = actions.find((a) => a.type === "damage");
		expect(dmg).toBeDefined();
		if (dmg?.type === "damage") {
			expect(dmg.baseDamage).toBe(Math.floor(80 / 12) + 1); // 7
			expect(dmg.hits).toBe(6);
		}
	});

	it("Divider damage scales with player HP", () => {
		const m = makeMonsterForMove("HEXAGHOST");
		const actions = resolveMonsterMove(m, "HEXAGHOST_DIVIDER" as MonsterMoveId, 0, 36);
		const dmg = actions.find((a) => a.type === "damage");
		if (dmg?.type === "damage") {
			expect(dmg.baseDamage).toBe(Math.floor(36 / 12) + 1); // 4
		}
	});

	it("HEXAGHOST_INFERNO still works with static damage", () => {
		const m = makeMonsterForMove("HEXAGHOST");
		const actions = resolveMonsterMove(m, "HEXAGHOST_INFERNO" as MonsterMoveId, 0);
		const dmg = actions.find((a) => a.type === "damage");
		expect(dmg).toBeDefined();
		if (dmg?.type === "damage") {
			expect(dmg.baseDamage).toBe(2);
			expect(dmg.hits).toBe(6);
		}
	});
});

describe("status cards execute correctly", () => {
	it("addCardToDiscardPile adds card to player discard", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(5, "D"),
			monsters: [
				{
					...baseMonster(),
					id: "SENTRY" as MonsterId,
					intent: {
						moveId: "SENTRY_BOLT" as MonsterMoveId,
						baseDamage: 9,
						hits: 1,
						isAttack: true,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: [],
				},
			],
		});
		const rng = createRng(42n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });
		const discard = getCombat(result).discardPile;
		const dazedCards = discard.filter((c) => c.id === "DAZED");
		expect(dazedCards.length).toBe(2);
	});

	it("loseGold reduces player gold", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(5, "D"),
			monsters: [
				{
					...baseMonster(),
					id: "LOOTER" as MonsterId,
					intent: {
						moveId: "LOOTER_MUG" as MonsterMoveId,
						baseDamage: 10,
						hits: 1,
						isAttack: true,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: [],
				},
			],
		});
		const rng = createRng(1n);
		const state = {
			...makeState(combat),
			gold: 50,
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });
		expect(result.state.gold).toBe(35);
	});
});

// ── Split mechanic ────────────────────────────────────────

describe("split mechanic — resolveMonsterMove", () => {
	it("Acid Slime L SPLIT generates split action with 2 M slimes", () => {
		const m: MonsterState = { ...makeMonsterForMove("ACID_SLIME_L"), currentHp: 20, maxHp: 65 };
		const actions = resolveMonsterMove(m, "ACID_SLIME_L_SPLIT" as MonsterMoveId, 0);
		const splits = actions.filter((a) => a.type === "split");
		expect(splits.length).toBe(1);
		if (splits[0]?.type === "split") {
			expect(splits[0].spawnId).toBe("ACID_SLIME_M");
			expect(splits[0].count).toBe(2);
		}
	});

	it("Spike Slime L SPLIT generates split action with 2 M slimes", () => {
		const m: MonsterState = { ...makeMonsterForMove("SPIKE_SLIME_L"), currentHp: 15, maxHp: 64 };
		const actions = resolveMonsterMove(m, "SPIKE_SLIME_L_SPLIT" as MonsterMoveId, 0);
		const splits = actions.filter((a) => a.type === "split");
		expect(splits.length).toBe(1);
		if (splits[0]?.type === "split") {
			expect(splits[0].spawnId).toBe("SPIKE_SLIME_M");
			expect(splits[0].count).toBe(2);
		}
	});

	it("Slime Boss SPLIT generates two split actions (Acid L + Spike L)", () => {
		const m: MonsterState = { ...makeMonsterForMove("SLIME_BOSS"), currentHp: 50, maxHp: 140 };
		const actions = resolveMonsterMove(m, "SLIME_BOSS_SPLIT" as MonsterMoveId, 0);
		const splits = actions.filter((a) => a.type === "split");
		expect(splits.length).toBe(2);
		const spawnIds = splits.map((a) => (a.type === "split" ? a.spawnId : ""));
		expect(spawnIds).toContain("ACID_SLIME_L");
		expect(spawnIds).toContain("SPIKE_SLIME_L");
	});
});

describe("split mechanic — integration via step", () => {
	it("Acid Slime L splits when splitPending, spawning 2 M slimes with its HP", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(5, "D"),
			monsters: [
				{
					...baseMonster(),
					id: "ACID_SLIME_L" as MonsterId,
					maxHp: 65,
					currentHp: 20,
					halfDead: false,
					splitPending: true,
					intent: {
						moveId: "ACID_SLIME_L_SPLIT" as MonsterMoveId,
						baseDamage: null,
						hits: 1,
						isAttack: false,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: [],
				},
			],
		});
		const rng = createRng(1n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });
		const c = getCombat(result);

		// Source is dead
		expect(c.monsters[0]?.alive).toBe(false);

		// 2 new M slimes spawned
		const newSlimes = c.monsters.filter((m) => m.id === ("ACID_SLIME_M" as MonsterId));
		expect(newSlimes.length).toBe(2);
		for (const s of newSlimes) {
			expect(s.alive).toBe(true);
			expect(s.currentHp).toBe(20);
			expect(s.maxHp).toBe(20);
		}

		// monsterSplit event emitted
		const splitEvents = result.events.filter((e) => e.type === "monsterSplit");
		expect(splitEvents.length).toBe(1);
	});

	it("splitPending is set when large slime HP drops to 50%", () => {
		const combat = makeCombat({
			hand: [
				{
					id: "STRIKE_RED" as never,
					uniqueId: 1,
					upgraded: false,
					costOverride: null,
					costForTurn: 1,
					freeToPlay: false,
					misc: 0,
				},
			],
			drawPile: makeCards(5, "D"),
			monsters: [
				{
					...baseMonster(),
					id: "ACID_SLIME_L" as MonsterId,
					maxHp: 60,
					currentHp: 36,
					intent: {
						moveId: "ACID_SLIME_L_LICK" as MonsterMoveId,
						baseDamage: null,
						hits: 1,
						isAttack: false,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: [],
				},
			],
		});
		const state = makeState(combat);
		// Strike does 6 damage → 36 - 6 = 30 = 50% of 60
		const result = step(state, { type: "playCard", handIndex: 0, targetIndex: 0 });
		const m = getCombat(result).monsters[0];
		expect(m?.splitPending).toBe(true);
		expect(m?.currentHp).toBe(30);
	});
});

// ── Escape mechanic ───────────────────────────────────────

describe("escape mechanic", () => {
	it("resolveMonsterMove generates escape action for ESCAPE intent", () => {
		const m = makeMonsterForMove("LOOTER");
		const actions = resolveMonsterMove(m, "LOOTER_ESCAPE" as MonsterMoveId, 0);
		const escapes = actions.filter((a) => a.type === "escape");
		expect(escapes.length).toBe(1);
		if (escapes[0]?.type === "escape") {
			expect(escapes[0].monsterIndex).toBe(0);
		}
	});

	it("Looter escapes during its turn via step", () => {
		const combat = makeCombat({
			hand: [],
			drawPile: makeCards(5, "D"),
			monsters: [
				{
					...baseMonster(),
					id: "LOOTER" as MonsterId,
					intent: {
						moveId: "LOOTER_ESCAPE" as MonsterMoveId,
						baseDamage: null,
						hits: 1,
						isAttack: false,
						isDebuff: false,
						isBuff: false,
					},
					moveHistory: [
						"LOOTER_MUG" as MonsterMoveId,
						"LOOTER_MUG" as MonsterMoveId,
						"LOOTER_SMOKE_BOMB" as MonsterMoveId,
					],
				},
			],
		});
		const rng = createRng(1n);
		const state = {
			...makeState(combat),
			rng: { ...makeState(combat).rng, aiRng: rng },
		};
		const result = step(state, { type: "endTurn" });
		const c = getCombat(result);

		expect(c.monsters[0]?.alive).toBe(false);
		const escapeEvents = result.events.filter((e) => e.type === "monsterEscaped");
		expect(escapeEvents.length).toBe(1);
	});

	it("SMOKE_BOMB gives block but no escape", () => {
		const m = makeMonsterForMove("LOOTER");
		const actions = resolveMonsterMove(m, "LOOTER_SMOKE_BOMB" as MonsterMoveId, 0);
		const escapes = actions.filter((a) => a.type === "escape");
		expect(escapes.length).toBe(0);
	});
});
