/**
 * Card-based damage modifiers through real card plays: the damage pipeline now
 * knows which card an attack comes from (Akabeko, Pen Nib, Strike Dummy,
 * Phantasmal Killer), and Weak / Vulnerable multiply without rounding in between.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
	card,
	endTurn,
	forceMove,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
	runState,
} from "../core/fightTestHelpers";
import { fireHook } from "../core/hooks";
import type { CardInstance, GameState, PowerId, RelicId } from "../core/types";
import { getEncounterMonsters } from "./encounters";
import { initCombat } from "./init";

beforeAll(loadAllData);

const DECK = [
	"STRIKE_RED",
	"STRIKE_RED",
	"TWIN_STRIKE",
	"POMMEL_STRIKE",
	"BASH",
	"DEFEND_RED",
	"DEFEND_RED",
	"PHANTASMAL_KILLER",
	"DEFEND_RED",
	"DEFEND_RED",
].map((id, i) => card(id, i + 1));

/** A real fight (relics fire their battle-start hooks); monsters get 500 HP and no block. */
function fight(
	relics: string[] = [],
	encounter = "JAW_WORM",
	deck: CardInstance[] = DECK,
	counters: Record<string, number> = {},
): GameState {
	const base = runState(1n, deck);
	const withRelics: GameState = {
		...base,
		relics: relics.map((id) => ({ id: id as RelicId, counter: counters[id] ?? -1 })),
	};
	let s = initCombat(withRelics, getEncounterMonsters(encounter), encounter);
	s = fireHook(s, { type: "player" }, "atBattleStart"); // as step.ts does on entering the room
	const c = s.combat;
	if (c) s = { ...s, combat: { ...c, energy: 99 } };
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		s = patchMonster(s, i, { currentHp: 500, maxHp: 500, block: 0 });
	}
	return s;
}

function withPlayerPowers(s: GameState, powers: Record<string, number>): GameState {
	const c = s.combat;
	if (!c) return s;
	const list = Object.entries(powers).map(([id, amount]) => ({
		id: id as PowerId,
		amount,
		justApplied: false,
	}));
	return { ...s, combat: { ...c, player: { ...c.player, powers: [...c.player.powers, ...list] } } };
}

function withMonsterPowers(s: GameState, i: number, powers: Record<string, number>): GameState {
	const list = Object.entries(powers).map(([id, amount]) => ({
		id: id as PowerId,
		amount,
		justApplied: false,
	}));
	return patchMonster(s, i, { powers: [...monsterAt(s, i).powers, ...list] });
}

/** HP the monster at `i` loses when the card is played (its block cleared first). */
function hit(s: GameState, cardId: string, i = 0): { lost: number; after: GameState } {
	const unblocked = patchMonster(s, i, { block: 0 });
	const before = monsterAt(unblocked, i).currentHp;
	const after = playCard(unblocked, cardId, i);
	return { lost: before - monsterAt(after, i).currentHp, after };
}

/** HP the player loses when the Jaw Worm Chomps (11). */
function chomped(s: GameState): number {
	const after = endTurn(forceMove(s, 0, "JAW_WORM_CHOMP"));
	return s.currentHp - after.currentHp;
}

describe("Weak and Vulnerable: one rounding at the end", () => {
	it("9 damage, attacker Weak, target Vulnerable → 10 (9 × 0.75 × 1.5 = 10.125)", () => {
		let s = withPlayerPowers(fight(), { strength: 3, weak: 2 });
		s = withMonsterPowers(s, 0, { vulnerable: 2 });
		expect(hit(s, "STRIKE_RED").lost).toBe(10);
	});

	it("Paper Krane: an enemy's Weak is ×0.6 (Chomp 11 → 6, plain Weak → 8)", () => {
		const weak = (relics: string[]) => withMonsterPowers(fight(relics), 0, { weak: 2 });
		expect(chomped(weak([]))).toBe(8);
		expect(chomped(weak(["PAPER_KRANE"]))).toBe(6);
	});

	it("Odd Mushroom: the player's Vulnerable is ×1.25 (Chomp 11 → 13, plain → 16)", () => {
		const vuln = (relics: string[]) => withPlayerPowers(fight(relics), { vulnerable: 2 });
		expect(chomped(vuln([]))).toBe(16);
		expect(chomped(vuln(["ODD_MUSHROOM"]))).toBe(13);
	});

	it("Paper Phrog: ×1.75 on whichever enemy is Vulnerable, not only the first", () => {
		let s = fight(["PAPER_PHROG"], "EXORDIUM_WILDLIFE");
		s = withMonsterPowers(s, 1, { vulnerable: 2 });
		expect(hit(s, "STRIKE_RED", 1).lost).toBe(10); // 6 × 1.75 = 10.5
		expect(hit(s, "STRIKE_RED", 0).lost).toBe(6);
		const plain = withMonsterPowers(fight([], "EXORDIUM_WILDLIFE"), 1, { vulnerable: 2 });
		expect(hit(plain, "STRIKE_RED", 1).lost).toBe(9);
	});
});

describe("Akabeko: 8 Vigor at the start of combat", () => {
	it("every hit of the first Attack gets +8; a Skill first does not use it", () => {
		let s = fight(["AKABEKO"]);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "VIGOR")).toBe(8);
		s = playCard(s, "DEFEND_RED");
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "VIGOR")).toBe(8);
		const first = hit(s, "TWIN_STRIKE");
		expect(first.lost).toBe(26); // (5 + 8) × 2
		expect(powerAmount(first.after.combat?.player ?? { powers: [] }, "VIGOR")).toBeUndefined();
		expect(hit(first.after, "STRIKE_RED").lost).toBe(6);
	});
});

describe("Pen Nib: the 10th Attack deals double damage", () => {
	it("counter 8 → the next Attack is normal, the one after is doubled, then it wraps to 0", () => {
		let s = fight(["PEN_NIB"], "JAW_WORM", DECK, { PEN_NIB: 8 });
		const ninth = hit(s, "STRIKE_RED");
		expect(ninth.lost).toBe(6);
		s = playCard(ninth.after, "DEFEND_RED"); // Skills do not count
		expect(s.relics[0]?.counter).toBe(9);
		const tenth = hit(s, "TWIN_STRIKE");
		expect(tenth.lost).toBe(20); // both hits doubled
		expect(tenth.after.relics[0]?.counter).toBe(0);
		expect(hit(tenth.after, "STRIKE_RED").lost).toBe(6);
	});

	it("a counter of 9 carried into a new combat doubles its first Attack", () => {
		const s = fight(["PEN_NIB"], "JAW_WORM", DECK, { PEN_NIB: 9 });
		expect(hit(s, "STRIKE_RED").lost).toBe(12);
	});
});

describe("Strike Dummy: +3 on cards tagged Strike, before Weak", () => {
	it("Strike 9, Pommel Strike 12, Bash unchanged; with Weak (6 + 3) × 0.75 → 6", () => {
		const s = fight(["STRIKE_DUMMY"]);
		expect(hit(s, "STRIKE_RED").lost).toBe(9);
		expect(hit(s, "POMMEL_STRIKE").lost).toBe(12);
		expect(hit(s, "BASH").lost).toBe(8);
		expect(hit(withPlayerPowers(s, { weak: 2 }), "STRIKE_RED").lost).toBe(6);
	});
});

describe("The Boot: 1–4 unblocked attack damage becomes 5", () => {
	it("counts after block; fully blocked hits stay 0", () => {
		const s = fight(["THE_BOOT"]);
		const blockedTo2 = playCard(patchMonster(s, 0, { block: 4 }), "STRIKE_RED");
		expect(500 - monsterAt(blockedTo2, 0).currentHp).toBe(5);
		const allBlocked = playCard(patchMonster(s, 0, { block: 10 }), "STRIKE_RED");
		expect(monsterAt(allBlocked, 0).currentHp).toBe(500);
		expect(hit(withPlayerPowers(s, { weak: 2 }), "STRIKE_RED").lost).toBe(5); // 4.5 → 4 → 5
		expect(hit(s, "STRIKE_RED").lost).toBe(6);
	});
});

describe("Phantasmal Killer: next turn, attacks deal double damage", () => {
	it("this turn normal, next turn doubled (every hit), the turn after normal", () => {
		let s = playCard(fight(), "PHANTASMAL_KILLER");
		expect(hit(s, "STRIKE_RED").lost).toBe(6);
		s = endTurn(s);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "DOUBLE_DAMAGE")).toBe(1);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "PHANTASMAL")).toBeUndefined();
		const doubled = hit(s, "TWIN_STRIKE");
		expect(doubled.lost).toBe(20);
		expect(hit(doubled.after, "STRIKE_RED").lost).toBe(12);
		s = endTurn(doubled.after);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "DOUBLE_DAMAGE")).toBeUndefined();
		expect(hit(s, "STRIKE_RED").lost).toBe(6);
	});

	it("two copies give two turns of double damage", () => {
		let s = playCard(fight(), "PHANTASMAL_KILLER");
		s = playCard(s, "PHANTASMAL_KILLER");
		s = endTurn(s);
		expect(hit(s, "STRIKE_RED").lost).toBe(12);
		s = endTurn(s);
		expect(hit(s, "STRIKE_RED").lost).toBe(12);
		s = endTurn(s);
		expect(hit(s, "STRIKE_RED").lost).toBe(6);
	});
});
