/**
 * Act 3 bosses through the real step() loop: Awakened One (Curiosity,
 * Regenerate, half-death and Rebirth), Time Eater (Time Warp, Haste, Head Slam
 * Draw Reduction) and Donu & Deca (alternation, all-monster buffs).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getMonster } from "../content/loader";
import {
	card,
	endTurn,
	forceMove,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
	startFight,
} from "../core/fightTestHelpers";
import type { CardInstance, GameState, MonsterState } from "../core/types";

beforeEach(() => loadAllData());

const AO = 2; // [CULTIST, CULTIST, AWAKENED_ONE]
const DECA = 0;
const DONU = 1;

const deckOf = (ids: string[]): CardInstance[] => ids.map((id, i) => card(id, i + 1));
const strikes = (n: number) => deckOf(Array(n).fill("STRIKE_RED"));

function tank(s: GameState, hp = 20000): GameState {
	return { ...s, currentHp: hp, maxHp: hp };
}

function withEnergy(s: GameState, energy: number): GameState {
	return s.combat ? { ...s, combat: { ...s.combat, energy } } : s;
}

function addPower(s: GameState, i: number, id: string, amount: number): GameState {
	const m = monsterAt(s, i);
	return patchMonster(s, i, {
		powers: [...m.powers, { id: id as never, amount, justApplied: false }],
	});
}

/** Longest run of `id` in the history. */
function longestRun(h: readonly string[], id: string): number {
	let best = 0;
	let run = 0;
	for (const x of h) {
		run = x === id ? run + 1 : 0;
		best = Math.max(best, run);
	}
	return best;
}

function expectValidIntent(m: MonsterState): void {
	expect(
		getMonster(m.id)?.moves[m.intent.moveId as string],
		`${m.id} ${m.intent.moveId}`,
	).toBeDefined();
}

/** Ends `n` turns; after each, every acting monster's intent must be one of its moves. */
function runTurns(s: GameState, n: number, idx: number[]): GameState {
	let st = s;
	for (let t = 0; t < n && st.phase.type === "combat"; t++) {
		st = endTurn(st);
		for (const i of idx) {
			const m = monsterAt(st, i);
			if (m.alive || m.halfDead) expectValidIntent(m);
		}
	}
	return st;
}

/** Kill the phase-1 Awakened One with one Strike (6 damage). */
function halfKill(s: GameState): GameState {
	let st = patchMonster(s, AO, { currentHp: 5, block: 0 });
	st = withEnergy(st, 3);
	return playCard(st, "STRIKE_RED", AO);
}

// ── Awakened One ────────────────────────────────────────────

describe("Awakened One", () => {
	it("prebattle (A0): Strength 0, Curiosity 1, Regenerate 10; opens with Slash", () => {
		const a0 = monsterAt(startFight("AWAKENED_ONE", 1n), AO);
		expect(a0.maxHp).toBe(300);
		expect(powerAmount(a0, "STRENGTH") ?? 0).toBe(0);
		expect(powerAmount(a0, "CURIOSITY")).toBe(1);
		expect(powerAmount(a0, "REGENERATE")).toBe(10);
		expect(a0.intent.moveId).toBe("AWAKENED_ONE_SLASH");
	});

	// Blocked by a shared bug: monsterFactory.resolveAmount assigns Act 3/4
	// prebattle asc overrides ({ amount: X }) as objects. Unskip once fixed.
	it("prebattle asc overrides: Strength 2 (A4), Curiosity 2 and Regenerate 15 (A19)", () => {
		const a19 = monsterAt(startFight("AWAKENED_ONE", 1n, undefined, 19), AO);
		expect(powerAmount(a19, "STRENGTH") ?? 0).toBe(2);
		expect(powerAmount(a19, "CURIOSITY")).toBe(2);
		expect(powerAmount(a19, "REGENERATE")).toBe(15);
		const d19 = startFight("DONU_AND_DECA", 1n, undefined, 19);
		for (const i of [DECA, DONU]) expect(powerAmount(monsterAt(d19, i), "ARTIFACT")).toBe(3);
	});

	it("Curiosity: a Power card gives +X Strength (X = its amount), other cards do not", () => {
		const deck = deckOf(["INFLAME", "STRIKE_RED", "STRIKE_RED", "DEFEND_RED", "DEFEND_RED"]);
		let s = startFight("AWAKENED_ONE", 1n, deck);
		s = playCard(s, "STRIKE_RED", AO);
		expect(powerAmount(monsterAt(s, AO), "STRENGTH") ?? 0).toBe(0);
		s = playCard(s, "INFLAME");
		expect(powerAmount(monsterAt(s, AO), "STRENGTH")).toBe(1);
		// A19: Curiosity 2 (prebattle asc override); Strength starts at 2 from A4.
		let a19 = startFight("AWAKENED_ONE", 1n, deck, 19);
		a19 = playCard(a19, "INFLAME");
		expect(powerAmount(monsterAt(a19, AO), "STRENGTH")).toBe(2 + 2);
	});

	it("Regenerate heals 10 at the end of its turn and stays", () => {
		let s = tank(startFight("AWAKENED_ONE", 1n));
		s = patchMonster(s, AO, { currentHp: 200 });
		s = endTurn(s);
		expect(monsterAt(s, AO).currentHp).toBe(210);
		s = endTurn(s);
		expect(monsterAt(s, AO).currentHp).toBe(220);
		expect(powerAmount(monsterAt(s, AO), "REGENERATE")).toBe(10);
	});

	it("phase-1 death: halfDead, debuffs/Curiosity stripped, positive Strength kept, intent Rebirth", () => {
		let s = startFight("AWAKENED_ONE", 1n, strikes(10));
		s = addPower(s, AO, "weak", 2);
		s = addPower(s, AO, "poison", 5);
		s = addPower(s, AO, "STRENGTH", 3);
		s = halfKill(s);
		const m = monsterAt(s, AO);
		expect(m.alive).toBe(false);
		expect(m.halfDead).toBe(true);
		expect(m.currentHp).toBe(0);
		expect(m.intent.moveId).toBe("AWAKENED_ONE_REBIRTH");
		expect(powerAmount(m, "CURIOSITY")).toBeUndefined();
		expect(powerAmount(m, "WEAK")).toBeUndefined();
		expect(powerAmount(m, "POISON")).toBeUndefined();
		expect(powerAmount(m, "STRENGTH") ?? 0).toBe(3);
		expect(powerAmount(m, "REGENERATE")).toBe(10);
		expect(s.phase.type).toBe("combat");
	});

	it("negative Strength is removed on the phase-1 death", () => {
		let s = startFight("AWAKENED_ONE", 1n, strikes(10));
		s = patchMonster(s, AO, {
			powers: monsterAt(s, AO).powers.map((p) =>
				p.id.toUpperCase() === "STRENGTH" ? { ...p, amount: -4 } : p,
			),
		});
		s = halfKill(s);
		expect(powerAmount(monsterAt(s, AO), "STRENGTH")).toBeUndefined();
	});

	it("the fight is not won while the Awakened One is halfDead", () => {
		let s = startFight("AWAKENED_ONE", 1n, strikes(10));
		for (const i of [0, 1]) s = patchMonster(s, i, { alive: false, currentHp: 0 });
		s = halfKill(s);
		expect(s.phase.type).toBe("combat");
		expect(monsterAt(s, AO).halfDead).toBe(true);
	});

	it("Rebirth: full 300 HP (A9: 320), phase 2, Minion Leader, Cultists marked Minion, then Dark Echo", () => {
		for (const [asc, hp] of [
			[0, 300],
			[9, 320],
		] as const) {
			let s = tank(startFight("AWAKENED_ONE", 1n, strikes(10), asc));
			s = halfKill(s);
			s = endTurn(s); // Rebirth executes
			const m = monsterAt(s, AO);
			expect(m.alive).toBe(true);
			expect(m.halfDead).toBe(false);
			expect(m.maxHp).toBe(hp);
			expect(m.currentHp).toBe(hp);
			expect(m.miscInfo).toBe(1);
			expect(powerAmount(m, "MINION_LEADER")).toBeDefined();
			expect(m.moveHistory.at(-1)).toBe("AWAKENED_ONE_REBIRTH");
			expect(m.intent.moveId).toBe("AWAKENED_ONE_DARK_ECHO");
			for (const i of [0, 1]) expect(powerAmount(monsterAt(s, i), "MINION")).toBeDefined();
		}
	});

	it("Cultists are not minions before the rebirth", () => {
		const s = startFight("AWAKENED_ONE", 1n);
		for (const i of [0, 1]) expect(powerAmount(monsterAt(s, i), "MINION")).toBeUndefined();
	});

	it("Dark Echo hits for 40; phase 2 then rolls Sludge/Tackle", () => {
		let s = tank(startFight("AWAKENED_ONE", 1n, strikes(10)));
		s = halfKill(s);
		s = endTurn(s);
		for (const i of [0, 1]) s = patchMonster(s, i, { alive: false, currentHp: 0 });
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(40);
		expect(["AWAKENED_ONE_SLUDGE", "AWAKENED_ONE_TACKLE"]).toContain(
			monsterAt(s, AO).intent.moveId,
		);
	});

	it("Sludge: 18 damage and a Void shuffled into the draw pile", () => {
		let s = tank(startFight("AWAKENED_ONE", 1n, strikes(10)));
		s = halfKill(s);
		s = endTurn(s);
		for (const i of [0, 1]) s = patchMonster(s, i, { alive: false, currentHp: 0 });
		s = forceMove(s, AO, "AWAKENED_ONE_SLUDGE");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(18);
		const piles = [...(s.combat?.drawPile ?? []), ...(s.combat?.hand ?? [])];
		expect(piles.filter((c) => c.id === "VOID")).toHaveLength(1);
	});

	it("second death is real: the Cultists flee and the fight is won", () => {
		let s = tank(startFight("AWAKENED_ONE", 1n, strikes(10)));
		s = halfKill(s);
		s = endTurn(s);
		s = patchMonster(s, AO, { currentHp: 5, block: 0 });
		s = withEnergy(s, 3);
		s = playCard(s, "STRIKE_RED", AO);
		expect(monsterAt(s, AO).alive).toBe(false);
		expect(monsterAt(s, AO).halfDead).toBe(false);
		expect(s.phase.type).toBe("reward");
	});

	it("20 real turns across both phases keep valid intents and the history rules", () => {
		for (const seed of [1n, 5n, 77n]) {
			let s = tank(startFight("AWAKENED_ONE", seed, strikes(10)), 200000);
			s = runTurns(s, 10, [0, 1, AO]);
			const p1 = monsterAt(s, AO).moveHistory.map(String);
			expect(p1[0]).toBe("AWAKENED_ONE_SLASH");
			expect(longestRun(p1, "AWAKENED_ONE_SLASH")).toBeLessThanOrEqual(2);
			expect(longestRun(p1, "AWAKENED_ONE_SOUL_STRIKE")).toBeLessThanOrEqual(1);
			expect(p1.every((m) => m === "AWAKENED_ONE_SLASH" || m === "AWAKENED_ONE_SOUL_STRIKE")).toBe(
				true,
			);

			s = halfKill(s);
			s = runTurns(s, 10, [0, 1, AO]);
			const h = monsterAt(s, AO).moveHistory.map(String);
			const p2 = h.slice(p1.length);
			expect(p2[0]).toBe("AWAKENED_ONE_REBIRTH");
			expect(p2[1]).toBe("AWAKENED_ONE_DARK_ECHO");
			const rest = p2.slice(2);
			expect(rest.length).toBeGreaterThan(5);
			expect(rest.every((m) => m === "AWAKENED_ONE_SLUDGE" || m === "AWAKENED_ONE_TACKLE")).toBe(
				true,
			);
			expect(longestRun(rest, "AWAKENED_ONE_SLUDGE")).toBeLessThanOrEqual(2);
			expect(longestRun(rest, "AWAKENED_ONE_TACKLE")).toBeLessThanOrEqual(2);
		}
	});
});

// ── Time Eater ──────────────────────────────────────────────

describe("Time Eater", () => {
	it("Time Warp: the 12th card ends the turn, resets the counter and gives +2 Strength", () => {
		let s = tank(startFight("TIME_EATER", 1n, strikes(20)));
		expect(powerAmount(monsterAt(s, 0), "TIME_WARP")).toBe(0);
		s = withEnergy(s, 99);
		const turn = s.combat?.turn;
		for (let k = 0; k < 11; k++) s = playCard(s, "STRIKE_RED", 0);
		expect(powerAmount(monsterAt(s, 0), "TIME_WARP")).toBe(11);
		expect(s.combat?.turn).toBe(turn);
		s = playCard(s, "STRIKE_RED", 0);
		expect(powerAmount(monsterAt(s, 0), "TIME_WARP")).toBe(0);
		expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(2);
		expect(s.combat?.turn).toBe((turn ?? 0) + 1);
		expect(s.combat?.endTurnRequested).toBeFalsy();
	});

	it("Head Slam: 26 damage, next turn draws 4, the turn after draws 5 again", () => {
		let s = tank(startFight("TIME_EATER", 1n, strikes(30)));
		s = forceMove(s, 0, "TIME_EATER_HEAD_SLAM");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(26);
		expect(s.combat?.hand).toHaveLength(4);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "DRAW_REDUCTION")).toBe(1);
		s = forceMove(s, 0, "TIME_EATER_REVERBERATE");
		s = endTurn(s);
		expect(s.combat?.hand).toHaveLength(5);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "DRAW_REDUCTION")).toBeUndefined();
	});

	it("Head Slam A19: 32 damage and 2 Slimed in the discard pile", () => {
		let s = tank(startFight("TIME_EATER", 1n, strikes(30), 19));
		s = forceMove(s, 0, "TIME_EATER_HEAD_SLAM");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(32);
		const slimed = [...(s.combat?.discardPile ?? []), ...(s.combat?.hand ?? [])].filter(
			(c) => c.id === "SLIMED",
		);
		expect(slimed).toHaveLength(2);
	});

	it("Ripple: 20 Block, Weak + Vulnerable (A19 also Frail)", () => {
		for (const asc of [0, 19]) {
			let s = tank(startFight("TIME_EATER", 1n, strikes(30), asc));
			s = forceMove(s, 0, "TIME_EATER_RIPPLE");
			s = endTurn(s);
			const pl = s.combat?.player ?? { powers: [] };
			expect(monsterAt(s, 0).block).toBe(20);
			expect(powerAmount(pl, "WEAK")).toBe(1);
			expect(powerAmount(pl, "VULNERABLE")).toBe(1);
			expect(powerAmount(pl, "FRAIL")).toBe(asc >= 19 ? 1 : undefined);
		}
	});

	it("Haste: chosen below half HP, heals to exactly half, removes debuffs, A19 32 Block, only once", () => {
		for (const asc of [0, 19]) {
			let s = tank(startFight("TIME_EATER", 1n, strikes(30), asc));
			const half = Math.floor(monsterAt(s, 0).maxHp / 2);
			s = patchMonster(s, 0, { currentHp: 100 });
			s = forceMove(s, 0, "TIME_EATER_REVERBERATE");
			s = endTurn(s);
			expect(monsterAt(s, 0).intent.moveId).toBe("TIME_EATER_HASTE");
			s = addPower(s, 0, "weak", 3);
			s = endTurn(s);
			const m = monsterAt(s, 0);
			expect(m.currentHp).toBe(half);
			expect(powerAmount(m, "WEAK")).toBeUndefined();
			expect(m.block).toBe(asc >= 19 ? 32 : 0);
			// Below half again: Haste is never chosen a second time.
			s = patchMonster(s, 0, { currentHp: 50 });
			s = runTurns(s, 8, [0]);
			const h = monsterAt(s, 0).moveHistory.map(String);
			expect(h.filter((x) => x === "TIME_EATER_HASTE")).toHaveLength(1);
		}
	});

	it("10 real turns keep valid intents and the history rules", () => {
		for (const seed of [1n, 2n, 3n, 99n]) {
			let s = tank(startFight("TIME_EATER", seed, strikes(10)), 200000);
			s = runTurns(s, 10, [0]);
			const h = monsterAt(s, 0).moveHistory.map(String);
			expect(h).toHaveLength(10);
			expect(longestRun(h, "TIME_EATER_REVERBERATE")).toBeLessThanOrEqual(2);
			expect(longestRun(h, "TIME_EATER_HEAD_SLAM")).toBeLessThanOrEqual(1);
			expect(longestRun(h, "TIME_EATER_RIPPLE")).toBeLessThanOrEqual(1);
			expect(h).not.toContain("TIME_EATER_HASTE");
		}
	});
});

// ── Donu & Deca ─────────────────────────────────────────────

describe("Donu and Deca", () => {
	it("prebattle Artifact 2; turn 1 intents Deca Beam + Donu Circle of Power", () => {
		const s = startFight("DONU_AND_DECA", 1n);
		expect(monsterAt(s, DECA).id).toBe("DECA");
		expect(monsterAt(s, DONU).id).toBe("DONU");
		expect(monsterAt(s, DECA).intent.moveId).toBe("DECA_BEAM");
		expect(monsterAt(s, DONU).intent.moveId).toBe("DONU_CIRCLE_OF_POWER");
		for (const i of [DECA, DONU]) expect(powerAmount(monsterAt(s, i), "ARTIFACT")).toBe(2);
	});

	it("Artifact negates a debuff on Deca", () => {
		let s = startFight("DONU_AND_DECA", 1n, deckOf(Array(10).fill("BASH")));
		s = playCard(s, "BASH", DECA);
		expect(powerAmount(monsterAt(s, DECA), "VULNERABLE")).toBeUndefined();
		expect(powerAmount(monsterAt(s, DECA), "ARTIFACT")).toBe(1);
	});

	it("turn 1: Deca Beam 10x2 + 2 Dazed; Circle of Power gives +3 Strength to both", () => {
		let s = tank(startFight("DONU_AND_DECA", 1n, strikes(10)));
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(20);
		const dazed = [...(s.combat?.discardPile ?? []), ...(s.combat?.hand ?? [])].filter(
			(c) => c.id === "DAZED",
		);
		expect(dazed).toHaveLength(2);
		for (const i of [DECA, DONU]) expect(powerAmount(monsterAt(s, i), "STRENGTH")).toBe(3);
		expect(monsterAt(s, DECA).intent.moveId).toBe("DECA_SQUARE_OF_PROTECTION");
		expect(monsterAt(s, DONU).intent.moveId).toBe("DONU_BEAM");
	});

	it("turn 2: Square of Protection gives exactly 16 Block to both; Donu Beam 2x(10+3)", () => {
		let s = tank(startFight("DONU_AND_DECA", 1n, strikes(10)));
		s = endTurn(s);
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(26);
		for (const i of [DECA, DONU]) {
			expect(monsterAt(s, i).block).toBe(16);
			expect(powerAmount(monsterAt(s, i), "PLATED_ARMOR")).toBeUndefined();
			expect(powerAmount(monsterAt(s, i), "BLOCK")).toBeUndefined();
		}
	});

	it("A19 Square of Protection: 16 Block and 3 Plated Armor each", () => {
		let s = tank(startFight("DONU_AND_DECA", 1n, strikes(10), 19));
		s = forceMove(s, DECA, "DECA_SQUARE_OF_PROTECTION");
		s = forceMove(s, DONU, "DONU_BEAM");
		s = endTurn(s);
		for (const i of [DECA, DONU]) {
			expect(monsterAt(s, i).block).toBe(16);
			expect(powerAmount(monsterAt(s, i), "PLATED_ARMOR")).toBe(3);
		}
	});

	it("Square of Protection with Donu dead shields only Deca", () => {
		let s = tank(startFight("DONU_AND_DECA", 1n, strikes(10)));
		s = patchMonster(s, DONU, { alive: false, currentHp: 0 });
		s = forceMove(s, DECA, "DECA_SQUARE_OF_PROTECTION");
		s = endTurn(s);
		expect(monsterAt(s, DECA).block).toBe(16);
		expect(monsterAt(s, DONU).block).toBe(0);
	});

	it("their moves consume no aiRng after the first intents", () => {
		let s = tank(startFight("DONU_AND_DECA", 3n, strikes(10)));
		const rng = s.rng.aiRng;
		s = endTurn(s);
		s = endTurn(s);
		expect(s.rng.aiRng).toEqual(rng);
	});

	it("10 real turns: strict alternation for both", () => {
		for (const seed of [1n, 8n, 13n]) {
			let s = tank(startFight("DONU_AND_DECA", seed, strikes(10)), 200000);
			s = runTurns(s, 10, [DECA, DONU]);
			const deca = monsterAt(s, DECA).moveHistory.map(String);
			const donu = monsterAt(s, DONU).moveHistory.map(String);
			expect(deca).toHaveLength(10);
			deca.forEach((m, k) => {
				expect(m).toBe(k % 2 === 0 ? "DECA_BEAM" : "DECA_SQUARE_OF_PROTECTION");
			});
			donu.forEach((m, k) => {
				expect(m).toBe(k % 2 === 0 ? "DONU_CIRCLE_OF_POWER" : "DONU_BEAM");
			});
			expect(powerAmount(monsterAt(s, DECA), "STRENGTH")).toBe(15);
			expect(powerAmount(monsterAt(s, DONU), "STRENGTH")).toBe(15);
		}
	});
});
