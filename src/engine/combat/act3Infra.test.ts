/**
 * Engine pieces Act 3 relies on, tested without the Act 3 AIs:
 * random shape slots, encounter setup, the AddCard/Suicide/NonAttackDamage
 * effect words, central death handling (halfDead) and early end of turn.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getMonster } from "../content/loader";
import { insertAtRandomSpot } from "../core/drawPile";
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
import { step } from "../core/step";
import type { GameState, MonsterMoveId } from "../core/types";
import { createAllStreams } from "../rng/stsRandom";
import { allMonstersGone, registerDeathInterceptor } from "./death";
import { ACT3_ENCOUNTER_POOL, getEncounterMonsters } from "./encounters";
import { resolveMonsterMove } from "./monsterTurn";

beforeAll(loadAllData);

const strikes = (n: number) => Array.from({ length: n }, (_, i) => card("STRIKE_RED", i + 1));
const SHAPES = new Set(["REPULSOR", "EXPLODER", "SPIKER"]);

describe("Act 3 encounter layouts", () => {
	const pool = ACT3_ENCOUNTER_POOL;
	const ids = [
		...pool.weak.map((e) => e.id),
		...pool.strong.map((e) => e.id),
		...pool.elites,
		...pool.bosses,
	];

	it("every Act 3 encounter has a layout whose monsters exist in the data", () => {
		for (const id of ids) {
			const slots = getEncounterMonsters(id);
			expect(slots.length, id).toBeGreaterThan(0);
			for (const slot of slots) {
				if (slot === "EMPTY" || slot === "SHAPE_POOL" || slot === "RANDOM_SHAPE") continue;
				expect(getMonster(slot), `${id}: ${slot}`).toBeDefined();
			}
		}
	});

	it("THREE_SHAPES / FOUR_SHAPES draw without replacement (at most 2 of a kind)", () => {
		for (let seed = 1n; seed <= 40n; seed++) {
			for (const [enc, n] of [
				["THREE_SHAPES", 3],
				["FOUR_SHAPES", 4],
			] as const) {
				const ms = startFight(enc, seed).combat?.monsters ?? [];
				expect(ms.length).toBe(n);
				const counts = new Map<string, number>();
				for (const m of ms) {
					expect(SHAPES.has(m.id), m.id).toBe(true);
					counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
				}
				expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
			}
		}
	});

	it("SPHERE_AND_TWO_SHAPES: two random shapes then the Spheric Guardian", () => {
		const ms = startFight("SPHERE_AND_TWO_SHAPES", 7n).combat?.monsters ?? [];
		expect(ms.map((m) => SHAPES.has(m.id))).toEqual([true, true, false]);
		expect(ms[2]?.id).toBe("SPHERIC_GUARDIAN");
	});

	it("REPTOMANCER: daggers in slots 1 and 4, empty slots 0 and 3", () => {
		const ms = startFight("REPTOMANCER").combat?.monsters ?? [];
		expect(ms.map((m) => (m.alive ? m.id : "-"))).toEqual([
			"-",
			"DAGGER",
			"REPTOMANCER",
			"-",
			"DAGGER",
		]);
		expect(powerAmount(monsterAt(startFight("REPTOMANCER"), 1), "MINION")).toBe(1);
	});

	it("JAW_WORM_HORDE: Strength and Block by ascension, no forced first Chomp", () => {
		const a0 = startFight("JAW_WORM_HORDE", 3n, strikes(5), 0);
		const a17 = startFight("JAW_WORM_HORDE", 3n, strikes(5), 17);
		for (let i = 0; i < 3; i++) {
			expect(powerAmount(monsterAt(a0, i), "STRENGTH")).toBe(3);
			expect(monsterAt(a0, i).block).toBe(5);
			expect(powerAmount(monsterAt(a17, i), "STRENGTH")).toBe(5);
			expect(monsterAt(a17, i).block).toBe(9);
		}
		// Over many seeds the first intent is not always Chomp (Act 1 rule skipped).
		const firsts = new Set<string>();
		for (let seed = 1n; seed <= 30n; seed++) {
			const s = startFight("JAW_WORM_HORDE", seed);
			for (let i = 0; i < 3; i++) firsts.add(monsterAt(s, i).intent.moveId as string);
		}
		expect(firsts.size).toBeGreaterThan(1);
	});
});

describe("Act 3 effect words", () => {
	it("Exploder EXPLODE: 30 non-attack damage (no Strength), then it dies", () => {
		let s = startFight("SPHERE_AND_TWO_SHAPES", 1n, strikes(10));
		for (let seed = 2n; !s.combat?.monsters.some((m) => m.id === "EXPLODER"); seed++) {
			s = startFight("SPHERE_AND_TWO_SHAPES", seed, strikes(10));
		}
		const i = (s.combat?.monsters ?? []).findIndex((m) => m.id === "EXPLODER");
		s = patchMonster(s, i, {
			powers: [{ id: "STRENGTH" as never, amount: 5, justApplied: false }],
		});
		for (let k = 0; k < 3; k++) {
			if (k !== i)
				s = patchMonster(s, k, {
					intent: { ...monsterAt(s, k).intent, moveId: "" as MonsterMoveId },
				});
		}
		s = forceMove(s, i, "EXPLODER_EXPLODE");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(30);
		expect(monsterAt(s, i).alive).toBe(false);
	});

	it("random-spot insert never puts the card on top", () => {
		let rng = createAllStreams(9n).cardRandomRng;
		const pile = strikes(5);
		for (let k = 0; k < 50; k++) {
			const r = insertAtRandomSpot(pile, card("BURN", 99), rng);
			rng = r.rng;
			expect(r.pile).toHaveLength(6);
			expect(r.pile.at(-1)?.id).toBe("STRIKE_RED");
		}
	});

	it("AddCard:BURN:drawShuffle → random spot; :discard → discard pile", () => {
		let s = startFight("ORB_WALKER", 5n, strikes(10));
		s = forceMove(s, 0, "ORB_WALKER_LASER");
		const topBefore = s.combat?.drawPile.at(-1)?.uniqueId;
		const resolved = resolveMonsterMove(
			monsterAt(s, 0),
			"ORB_WALKER_LASER" as MonsterMoveId,
			0,
			s.currentHp,
			s,
		);
		expect(resolved.filter((a) => a.type === "addCardToDiscardPile")).toHaveLength(1);
		const shuffled = resolved.filter((a) => a.type === "addCardToDrawPile");
		expect(shuffled).toHaveLength(1);
		expect(shuffled[0]).toMatchObject({ randomSpot: true, toTop: false });
		s = endTurn(s);
		const c = s.combat;
		const all = [...(c?.drawPile ?? []), ...(c?.hand ?? []), ...(c?.discardPile ?? [])];
		expect(all.filter((x) => x.id === "BURN").length).toBe(2);
		expect(topBefore).toBeDefined();
	});

	it("AddCard:PARASITE:masterDeck adds a permanent card", () => {
		let s = startFight("WRITHING_MASS", 1n, strikes(5));
		const before = s.deck.length;
		s = forceMove(s, 0, "WRITHING_MASS_IMPLANT");
		s = endTurn(s);
		expect(s.deck.length).toBe(before + 1);
		expect(s.deck.at(-1)?.id).toBe("PARASITE");
	});

	it("HealToHalfMaxHp + RemoveOwnDebuffs (Time Eater HASTE)", () => {
		let s = startFight("TIME_EATER", 1n, strikes(5));
		const max = monsterAt(s, 0).maxHp;
		s = patchMonster(s, 0, {
			currentHp: 100,
			powers: [...monsterAt(s, 0).powers, { id: "WEAK" as never, amount: 2, justApplied: false }],
		});
		s = forceMove(s, 0, "TIME_EATER_HASTE");
		s = endTurn(s);
		expect(monsterAt(s, 0).currentHp).toBe(Math.floor(max / 2));
		expect(powerAmount(monsterAt(s, 0), "WEAK")).toBeUndefined();
	});
});

describe("central death handling", () => {
	// Test-only interceptor: a Cultist "regrows" instead of dying while another monster lives.
	registerDeathInterceptor("CULTIST", (state, index) => {
		const c = state.combat;
		if (!c) return null;
		const others = c.monsters.filter((m, i) => i !== index && m.alive);
		if (others.length === 0) return null;
		const monsters = [...c.monsters];
		const m = monsters[index];
		if (!m) return null;
		monsters[index] = { ...m, halfDead: true, powers: [] };
		return { ...state, combat: { ...c, monsters } };
	});

	function threeCultists(): GameState {
		let s = startFight("THREE_CULTIST", 1n, strikes(10));
		for (let i = 0; i < 3; i++) s = patchMonster(s, i, { currentHp: 1, block: 0 });
		return s;
	}

	it("halfDead: untargetable, still takes turns, blocks victory", () => {
		let s = threeCultists();
		s = playCard(s, "STRIKE_RED", 0);
		const m0 = monsterAt(s, 0);
		expect(m0.halfDead).toBe(true);
		expect(m0.alive).toBe(false);
		expect(s.phase.type).toBe("combat");

		// Cannot be targeted again.
		const before = s;
		s = playCard(s, "STRIKE_RED", 0);
		expect(s.combat?.hand.length).toBe(before.combat?.hand.length);

		// It still acts: give it a move and end the turn.
		s = forceMove(s, 0, "CULTIST_DARK_STRIKE");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(s.currentHp).toBeLessThan(hp);
	});

	it("the fight ends when the last living monster dies normally", () => {
		let s = threeCultists();
		s = playCard(s, "STRIKE_RED", 0); // halfDead
		s = playCard(s, "STRIKE_RED", 1); // halfDead
		expect(allMonstersGone(s)).toBe(false);
		s = patchMonster(s, 0, { halfDead: false }); // interceptor's job in real content
		s = patchMonster(s, 1, { halfDead: false });
		s = playCard(s, "STRIKE_RED", 2); // dies (no other living monster)
		expect(s.phase.type).toBe("reward");
	});

	it("poison kills fire onMonsterDeath (Spore Cloud → player Vulnerable)", () => {
		let s = startFight("TWO_FUNGI_BEASTS", 1n, strikes(5));
		s = patchMonster(s, 0, {
			currentHp: 2,
			powers: [...monsterAt(s, 0).powers, { id: "POISON" as never, amount: 5, justApplied: false }],
		});
		s = endTurn(s);
		expect(monsterAt(s, 0).alive).toBe(false);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "VULNERABLE")).toBeGreaterThan(0);
	});
});

describe("early end of turn", () => {
	it("endTurnRequested set during a card play ends the player's turn", () => {
		let s = startFight("CULTIST", 1n, strikes(10));
		const c = s.combat;
		if (!c) throw new Error("no combat");
		s = { ...s, combat: { ...c, endTurnRequested: true } };
		const turn = s.combat?.turn;
		s = step(s, { type: "playCard", handIndex: 0, targetIndex: 0 }).state;
		expect(s.combat?.turn).toBe((turn ?? 0) + 1);
		expect(s.combat?.endTurnRequested).toBe(false);
	});
});
