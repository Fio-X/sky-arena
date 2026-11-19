import { beforeEach, describe, expect, it } from "vitest";
import {
	card,
	endTurn,
	forceMove,
	loadAllData,
	monsterAt,
	moveCard,
	patchMonster,
	playCard,
	powerAmount,
	startFight,
} from "../core/fightTestHelpers";
import type { GameState } from "../core/types";

beforeEach(() => loadAllData());

function withPlayerPower(s: GameState, id: string, amount: number): GameState {
	const c = s.combat;
	if (!c) return s;
	const powers = [...c.player.powers, { id: id as never, amount, justApplied: false }];
	return { ...s, combat: { ...c, player: { ...c.player, powers } } };
}

describe("prebattle data", () => {
	it("Spheric Guardian starts with 40 real block, Barricade and 3 Artifact", () => {
		const m = monsterAt(startFight("SPHERIC_GUARDIAN"), 0);
		expect(m.block).toBe(40);
		expect(powerAmount(m, "BARRICADE")).toBeDefined();
		expect(powerAmount(m, "ARTIFACT")).toBe(3);
		expect(powerAmount(m, "BLOCK")).toBeUndefined();
		expect(m.currentHp).toBe(20);
	});

	it("Spheric Guardian keeps its block across turns (Barricade)", () => {
		let s = forceMove(startFight("SPHERIC_GUARDIAN"), 0, "SPHERIC_GUARDIAN_SLAM");
		s = endTurn(s);
		expect(monsterAt(s, 0).block).toBe(40);
	});

	it("Shelled Parasite starts with 14 block and 14 Plated Armor", () => {
		const m = monsterAt(startFight("SHELL_PARASITE"), 0);
		expect(m.block).toBe(14);
		expect(powerAmount(m, "PLATED_ARMOR")).toBe(14);
	});

	it("Book of Stabbing has Painful Stabs; minion leaders get MINION_LEADER", () => {
		expect(powerAmount(monsterAt(startFight("BOOK_OF_STABBING"), 0), "PAINFUL_STABS")).toBe(1);
		const gl = startFight("GREMLIN_LEADER", 3n);
		expect(powerAmount(monsterAt(gl, 3), "MINION_LEADER")).toBeDefined();
	});
});

describe("special moves", () => {
	it("Mystic HEAL heals itself and the Centurion", () => {
		let s = startFight("CENTURION_AND_HEALER");
		s = patchMonster(s, 0, { currentHp: monsterAt(s, 0).maxHp - 30 });
		s = patchMonster(s, 1, { currentHp: monsterAt(s, 1).maxHp - 30 });
		s = forceMove(s, 0, "CENTURION_SLASH");
		s = forceMove(s, 1, "MYSTIC_HEAL");
		s = endTurn(s);
		expect(monsterAt(s, 0).currentHp).toBe(monsterAt(s, 0).maxHp - 14);
		expect(monsterAt(s, 1).currentHp).toBe(monsterAt(s, 1).maxHp - 14);
	});

	it("Centurion DEFEND gives 15 block to the Mystic", () => {
		let s = startFight("CENTURION_AND_HEALER");
		s = forceMove(s, 0, "CENTURION_DEFEND");
		s = forceMove(s, 1, "MYSTIC_BUFF");
		s = endTurn(s);
		expect(monsterAt(s, 1).block).toBe(15);
		expect(monsterAt(s, 0).block).toBe(0);
	});

	it("Shelled Parasite SUCK heals by the unblocked damage dealt", () => {
		let s = startFight("SHELL_PARASITE");
		const hp = monsterAt(s, 0).maxHp - 20;
		s = patchMonster(s, 0, { currentHp: hp });
		s = forceMove(s, 0, "SHELLED_PARASITE_SUCK");
		const playerBefore = s.currentHp;
		s = endTurn(s);
		expect(playerBefore - s.currentHp).toBe(10);
		expect(monsterAt(s, 0).currentHp).toBe(hp + 10);
	});

	it("Shelled Parasite is stunned when Plated Armor is broken", () => {
		let s = startFight("SHELL_PARASITE");
		s = patchMonster(s, 0, {
			block: 0,
			powers: [{ id: "PLATED_ARMOR" as never, amount: 1, justApplied: false }],
		});
		s = playCard(s, "STRIKE_RED", 0);
		expect(powerAmount(monsterAt(s, 0), "PLATED_ARMOR")).toBeUndefined();
		expect(monsterAt(s, 0).intent.moveId).toBe("SHELLED_PARASITE_STUNNED");
	});

	it("Taskmaster adds a Wound to the discard pile", () => {
		let s = forceMove(startFight("SLAVERS"), 1, "TASKMASTER_SCOURING_WHIP");
		s = endTurn(s);
		expect(s.combat?.discardPile.some((c) => c.id === "WOUND")).toBe(true);
	});

	it("Snecko GLARE confuses the player", () => {
		let s = forceMove(startFight("SNECKO"), 0, "SNECKO_PERPLEXING_GLARE");
		s = endTurn(s);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "CONFUSED")).toBeDefined();
	});

	it("Champ ANGER removes debuffs, happens once, and enters phase 2", () => {
		let s = startFight("CHAMP");
		const champ = monsterAt(s, 0);
		s = patchMonster(s, 0, {
			currentHp: Math.floor(champ.maxHp / 2) - 1,
			powers: [{ id: "weak" as never, amount: 2, justApplied: false }],
		});
		s = forceMove(s, 0, "THE_CHAMP_GLOAT");
		s = endTurn(s); // GLOAT executes; next roll sees <50% HP → ANGER
		expect(monsterAt(s, 0).intent.moveId).toBe("THE_CHAMP_ANGER");
		s = endTurn(s);
		const m = monsterAt(s, 0);
		expect(powerAmount(m, "WEAK")).toBeUndefined();
		expect(m.intent.moveId).not.toBe("THE_CHAMP_ANGER");
		for (let i = 0; i < 6; i++) {
			s = endTurn(s);
			expect(monsterAt(s, 0).intent.moveId).not.toBe("THE_CHAMP_ANGER");
		}
	});

	it("Champ uses DEFENSIVE_STANCE at most twice", () => {
		let s = startFight("CHAMP", 11n);
		let stances = 0;
		for (let i = 0; i < 20 && s.phase.type === "combat"; i++) {
			if (monsterAt(s, 0).intent.moveId === "THE_CHAMP_DEFENSIVE_STANCE") stances++;
			s = endTurn(s);
		}
		expect(stances).toBeLessThanOrEqual(2);
	});

	it("Book of Stabbing multi-stab hits grow and each hit adds a Wound", () => {
		let s = startFight("BOOK_OF_STABBING");
		s = forceMove(s, 0, "BOOK_OF_STABBING_SINGLE_STAB");
		s = endTurn(s); // single stab → +1 wound
		const hits: number[] = [];
		for (let i = 0; i < 12 && s.phase.type === "combat"; i++) {
			const intent = monsterAt(s, 0).intent;
			if (intent.moveId === "BOOK_OF_STABBING_MULTI_STAB") hits.push(intent.hits);
			s = endTurn(s);
		}
		expect(hits.length).toBeGreaterThan(1);
		expect(hits[0]).toBeGreaterThanOrEqual(2);
		for (let i = 1; i < hits.length; i++) {
			expect(hits[i]).toBeGreaterThan(hits[i - 1] ?? 0);
		}
		const c = s.combat;
		const wounds = [...(c?.hand ?? []), ...(c?.discardPile ?? []), ...(c?.drawPile ?? [])].filter(
			(c) => c.id === "WOUND",
		);
		expect(wounds.length).toBeGreaterThanOrEqual(1 + (hits[0] ?? 0));
	});
});

describe("monster powers", () => {
	it("Byrd Flight halves attack damage and grounds the Byrd at 0", () => {
		let s = startFight("THREE_BYRDS");
		const hp = monsterAt(s, 0).currentHp;
		s = playCard(s, "STRIKE_RED", 0);
		expect(monsterAt(s, 0).currentHp).toBe(hp - 3);
		expect(powerAmount(monsterAt(s, 0), "FLIGHT")).toBe(2);
		s = playCard(s, "STRIKE_RED", 0);
		s = playCard(s, "STRIKE_RED", 0);
		expect(powerAmount(monsterAt(s, 0), "FLIGHT")).toBeUndefined();
		expect(monsterAt(s, 0).intent.moveId).toBe("BYRD_STUNNED");
	});

	it("Snake Plant Malleable: block per hit, growing by 1", () => {
		let s = startFight("SNAKE_PLANT");
		s = playCard(s, "STRIKE_RED", 0);
		expect(monsterAt(s, 0).block).toBe(3);
		expect(powerAmount(monsterAt(s, 0), "MALLEABLE")).toBe(4);
	});

	it("Chosen HEX: playing a non-attack shuffles a Dazed into the draw pile", () => {
		let s = startFight("CHOSEN");
		s = withPlayerPower(s, "HEX", 1);
		const before = s.combat?.drawPile.filter((c) => c.id === "DAZED").length ?? 0;
		s = playCard(s, "DEFEND_RED");
		expect(s.combat?.drawPile.filter((c) => c.id === "DAZED").length).toBe(before + 1);
	});

	it("Bronze Orb STASIS steals the rarest draw-pile card and returns it on death", () => {
		const deck = [
			...[...Array(5).keys()].map((i) => card("STRIKE_RED", i + 1)),
			...[...Array(5).keys()].map((i) => card("DEFEND_RED", i + 6)),
			card("DEMON_FORM", 50),
			card("POMMEL_STRIKE", 51),
		];
		let s = endTurn(startFight("AUTOMATON", 5n, deck));
		const where = (st: GameState) =>
			(["hand", "drawPile", "discardPile"] as const).filter((p) =>
				st.combat?.[p].some((c) => c.uniqueId === 50),
			);
		s = moveCard(s, 50, "drawPile");
		s = forceMove(s, 0, "BRONZE_ORB_STASIS");
		s = forceMove(s, 2, "BRONZE_ORB_BEAM");
		s = forceMove(s, 1, "BRONZE_AUTOMATON_BOOST");
		s = endTurn(s);
		expect(where(s)).toEqual([]);
		expect(monsterAt(s, 0).heldCard?.uniqueId).toBe(50);
		expect(powerAmount(monsterAt(s, 0), "STASIS")).toBeDefined();

		s = patchMonster(s, 0, { currentHp: 1, block: 0 });
		s = playCard(s, "STRIKE_RED", 0);
		expect(monsterAt(s, 0).alive).toBe(false);
		expect(s.combat?.hand.some((c) => c.uniqueId === 50)).toBe(true);
	});
});

describe("Act 1 split (shared spawn path)", () => {
	// Split children used to start with an empty intent, skip a turn and record "" in history.
	it("slimes split from Acid Slime (L) get a real first move and act next turn", () => {
		let s = forceMove(startFight("LARGE_SLIME"), 0, "ACID_SLIME_L_SPLIT");
		s = endTurn(s);
		const children = (s.combat?.monsters ?? []).filter((m) => m.alive);
		expect(children.map((m) => m.id)).toEqual(["ACID_SLIME_M", "ACID_SLIME_M"]);
		for (const m of children) {
			expect(m.intent.moveId).toMatch(/^ACID_SLIME_M_/);
			expect(m.moveHistory).toEqual([]);
		}
		s = endTurn(s);
		for (const m of (s.combat?.monsters ?? []).filter((x) => x.alive)) {
			expect(m.moveHistory.length).toBe(1);
			expect(m.moveHistory[0]).toMatch(/^ACID_SLIME_M_/);
		}
	});
});
