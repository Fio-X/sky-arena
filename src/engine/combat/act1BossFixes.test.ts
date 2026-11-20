/**
 * Act 1 behaviour fixes, through real turns: Hexaghost's Inferno (Burn+),
 * the Guardian's Sharp Hide (once per Attack card, blockable) and the
 * Red Slaver's Entangle (once per combat).
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
	startFight,
} from "../core/fightTestHelpers";
import type { CardInstance, GameState, MonsterMoveId } from "../core/types";

beforeAll(loadAllData);

const DECK = [
	"TWIN_STRIKE",
	"STRIKE_RED",
	"STRIKE_RED",
	"DEFEND_RED",
	"DEFEND_RED",
	"DEFEND_RED",
	"DEFEND_RED",
	"BASH",
	"STRIKE_RED",
	"DEFEND_RED",
].map((id, i) => card(id, i + 1));

function allCards(s: GameState): CardInstance[] {
	const c = s.combat;
	return c ? [...c.hand, ...c.drawPile, ...c.discardPile, ...c.exhaustPile] : [];
}
const burns = (s: GameState) => allCards(s).filter((c) => c.id === "BURN");

function withPlayer(s: GameState, patch: { block?: number; energy?: number }): GameState {
	const c = s.combat;
	if (!c) return s;
	return {
		...s,
		combat: {
			...c,
			energy: patch.energy ?? c.energy,
			player: { ...c.player, block: patch.block ?? c.player.block },
		},
	};
}

describe("Hexaghost", () => {
	const hexa = (asc = 0) =>
		patchMonster(startFight("HEXAGHOST", 1n, DECK, asc), 0, { maxHp: 999, currentHp: 999 });
	const monsterDoes = (s: GameState, move: string, history: string[] = []) =>
		endTurn(
			forceMove(
				patchMonster(s, 0, { moveHistory: history as MonsterMoveId[] }),
				0,
				`HEXAGHOST_${move}`,
			),
		);

	it("Sear before any Inferno adds a plain Burn", () => {
		const s = monsterDoes(hexa(), "SEAR", ["HEXAGHOST_ACTIVATE", "HEXAGHOST_DIVIDER"]);
		expect(burns(s).map((b) => b.upgraded)).toEqual([false]);
	});

	it("Inferno upgrades every Burn and adds 3 Burn+", () => {
		let s = monsterDoes(hexa(), "SEAR", ["HEXAGHOST_ACTIVATE", "HEXAGHOST_DIVIDER"]);
		s = monsterDoes(s, "INFERNO", ["HEXAGHOST_ACTIVATE", "HEXAGHOST_DIVIDER", "HEXAGHOST_SEAR"]);
		expect(burns(s)).toHaveLength(4);
		expect(burns(s).every((b) => b.upgraded)).toBe(true);
	});

	it("after an Inferno, Sear's Burns come upgraded (A19: two)", () => {
		const h = ["HEXAGHOST_ACTIVATE", "HEXAGHOST_DIVIDER", "HEXAGHOST_INFERNO"];
		expect(burns(monsterDoes(hexa(), "SEAR", h)).map((b) => b.upgraded)).toEqual([true]);
		expect(burns(monsterDoes(hexa(19), "SEAR", h)).map((b) => b.upgraded)).toEqual([true, true]);
	});
});

describe("The Guardian: Sharp Hide", () => {
	/** Defensive Mode through a real monster turn, then the player's next turn. */
	function defensive(block = 0): GameState {
		let s = startFight("THE_GUARDIAN", 1n, DECK);
		s = endTurn(forceMove(s, 0, "THE_GUARDIAN_DEFENSIVE_MODE"));
		expect(powerAmount(monsterAt(s, 0), "SHARP_HIDE")).toBe(3);
		return withPlayer(s, { block, energy: 9 });
	}

	it("a multi-hit Attack costs 3 HP once, not once per hit", () => {
		const s = defensive();
		expect(s.currentHp - playCard(s, "TWIN_STRIKE").currentHp).toBe(3);
	});

	it("block stops it; Skills do not trigger it", () => {
		const s = defensive(5);
		const hit = playCard(s, "STRIKE_RED");
		expect(hit.currentHp).toBe(s.currentHp);
		expect(hit.combat?.player.block).toBe(2);
		expect(playCard(defensive(), "DEFEND_RED").currentHp).toBe(defensive().currentHp);
	});

	it("each Attack card triggers it", () => {
		let s = defensive();
		const hp = s.currentHp;
		s = playCard(s, "STRIKE_RED");
		s = playCard(s, "BASH");
		expect(hp - s.currentHp).toBe(6);
	});
});

describe("Red Slaver: Entangle once per combat", () => {
	it("over 25 turns on 10 seeds: never more than one Entangle; after it, no Stab ×3", () => {
		let used = 0;
		for (let seed = 1n; seed <= 10n; seed++) {
			let s = startFight("RED_SLAVER", seed, DECK);
			s = patchMonster(s, 0, { maxHp: 999, currentHp: 999 });
			for (let t = 0; t < 25; t++) s = endTurn(s);
			const m = monsterAt(s, 0);
			const moves = [...m.moveHistory, m.intent.moveId] as string[];
			const entangles = moves.filter((x) => x === "RED_SLAVER_ENTANGLE").length;
			expect(entangles).toBeLessThanOrEqual(1);
			used += entangles;
			const after = moves.slice(moves.indexOf("RED_SLAVER_ENTANGLE") + 1);
			if (entangles === 1) {
				const tripleStab = after.some(
					(x, i) => x === "RED_SLAVER_STAB" && after[i + 1] === x && after[i + 2] === x,
				);
				expect(tripleStab).toBe(false);
			}
		}
		expect(used).toBeGreaterThanOrEqual(8); // 25% a turn: almost every fight uses it once
	});
});
