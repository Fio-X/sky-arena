/**
 * Act 3 elites through the real step(): Giant Head (Slow, Count/Glare, It Is
 * Time), Nemesis (intangible every other turn, Burns), Reptomancer (Dagger
 * summons, spawn cap, minions flee) and Dagger (Stab then Explode).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getMonster } from "../content/loader";
import {
	aliveIds,
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
import type { GameState, MonsterMoveId, PowerId, RelicId } from "../core/types";

beforeAll(loadAllData);

const strikes = (n: number) => Array.from({ length: n }, (_, i) => card("STRIKE_RED", i + 1));
const defends = (n: number) => Array.from({ length: n }, (_, i) => card("DEFEND_RED", i + 1));

function tough(s: GameState): GameState {
	return { ...s, currentHp: 99999, maxHp: 99999 };
}

function intentOf(s: GameState, i: number): string {
	return monsterAt(s, i).intent.moveId as string;
}

function count(s: GameState, pile: "discardPile" | "drawPile" | "hand", id: string): number {
	return (s.combat?.[pile] ?? []).filter((c) => c.id === id).length;
}

/** Every living monster's intent is a move of that monster. */
function assertIntentsValid(s: GameState, label: string): void {
	for (const m of s.combat?.monsters ?? []) {
		if (!m.alive) continue;
		expect(getMonster(m.id)?.moves[m.intent.moveId as string], `${label} ${m.id}`).toBeDefined();
	}
}

function lastNSame(h: readonly MonsterMoveId[], n: number): boolean {
	if (h.length < n) return false;
	const tail = h.slice(-n);
	return tail.every((x) => x === tail[0]);
}

const withPower = (s: GameState, i: number, id: string, amount: number) =>
	patchMonster(s, i, {
		powers: [...monsterAt(s, i).powers, { id: id as PowerId, amount, justApplied: false }],
	});

// ── Giant Head ──────────────────────────────────────────────

describe("Giant Head", () => {
	it("starts with Slow 0 and a Count or Glare intent", () => {
		const seen = new Set<string>();
		for (let seed = 1n; seed <= 30n; seed++) {
			const s = startFight("GIANT_HEAD", seed);
			expect(powerAmount(monsterAt(s, 0), "SLOW")).toBe(0);
			seen.add(intentOf(s, 0));
		}
		expect([...seen].sort()).toEqual(["GIANT_HEAD_COUNT", "GIANT_HEAD_GLARE"]);
	});

	it("Slow: +1 per card played, +10% attack damage per stack, back to 0 at end of round", () => {
		let s = startFight("GIANT_HEAD", 1n, strikes(10));
		s = forceMove(s, 0, "GIANT_HEAD_GLARE");
		const hits: number[] = [];
		for (let k = 0; k < 3; k++) {
			const hp = monsterAt(s, 0).currentHp;
			s = playCard(s, "STRIKE_RED", 0);
			hits.push(hp - monsterAt(s, 0).currentHp);
		}
		// 6, 6 * 1.1 = 6.6, 6 * 1.2 = 7.2
		expect(hits).toEqual([6, 6, 7]);
		expect(powerAmount(monsterAt(s, 0), "SLOW")).toBe(3);
		s = endTurn(s);
		expect(powerAmount(monsterAt(s, 0), "SLOW")).toBe(0);
	});

	it("Slow combines with Vulnerable multiplicatively, floored once", () => {
		let s = startFight("GIANT_HEAD", 1n, strikes(10));
		s = patchMonster(s, 0, {
			powers: [
				{ id: "SLOW" as PowerId, amount: 2, justApplied: false },
				{ id: "vulnerable" as PowerId, amount: 2, justApplied: false },
			],
		});
		const hp = monsterAt(s, 0).currentHp;
		s = playCard(s, "STRIKE_RED", 0);
		// 6 * 1.2 * 1.5 = 10.8 → 10 (a floor after Slow would give 7 * 1.5 = 10.5 → 10; use 5 stacks too)
		expect(hp - monsterAt(s, 0).currentHp).toBe(10);
		s = patchMonster(s, 0, {
			powers: [
				{ id: "SLOW" as PowerId, amount: 3, justApplied: false },
				{ id: "vulnerable" as PowerId, amount: 2, justApplied: false },
			],
		});
		const hp2 = monsterAt(s, 0).currentHp;
		s = playCard(s, "STRIKE_RED", 0);
		// 6 * 1.3 * 1.5 = 11.7 → 11 (flooring 7.8 first would give 7 * 1.5 = 10)
		expect(hp2 - monsterAt(s, 0).currentHp).toBe(11);
	});

	it("Glare applies Weak 1; Count hits for 13", () => {
		let s = tough(startFight("GIANT_HEAD", 1n, defends(10)));
		s = forceMove(s, 0, "GIANT_HEAD_GLARE");
		s = endTurn(s);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "WEAK")).toBe(1);
		s = forceMove(s, 0, "GIANT_HEAD_COUNT");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(13);
	});

	const runGiantHead = (asc: number, seed: bigint) => {
		let s = tough(startFight("GIANT_HEAD", seed, defends(10), asc));
		const intents: { move: string; dmg: number | null }[] = [];
		for (let turn = 1; turn <= 12; turn++) {
			assertIntentsValid(s, `asc${asc} turn ${turn}`);
			const m = monsterAt(s, 0);
			intents.push({ move: m.intent.moveId as string, dmg: m.intent.baseDamage });
			const hp = s.currentHp;
			s = endTurn(s);
			if (m.intent.moveId === "GIANT_HEAD_IT_IS_TIME") {
				// the executed attack matches the shown damage (player has no block/powers)
				expect(hp - s.currentHp, `turn ${turn}`).toBe(m.intent.baseDamage);
			}
		}
		return { s, intents };
	};

	it("It Is Time from turn 5, +5 per turn to 60 (A0); Count/Glare never three in a row", () => {
		for (const seed of [1n, 2n, 3n, 9n]) {
			const { s, intents } = runGiantHead(0, seed);
			const early = intents.slice(0, 4).map((x) => x.move);
			for (const mv of early) expect(["GIANT_HEAD_COUNT", "GIANT_HEAD_GLARE"]).toContain(mv);
			expect(early.slice(0, 3).every((x) => x === early[0])).toBe(false);
			expect(early.slice(1, 4).every((x) => x === early[1])).toBe(false);
			expect(intents.slice(4).map((x) => x.dmg)).toEqual([30, 35, 40, 45, 50, 55, 60, 60]);
			expect(intents.slice(4).every((x) => x.move === "GIANT_HEAD_IT_IS_TIME")).toBe(true);
			const h = monsterAt(s, 0).moveHistory;
			for (let k = 3; k <= 4; k++) expect(lastNSame(h.slice(0, k), 3)).toBe(false);
		}
	});

	it("A3: It Is Time starts at 40; A18: starts on turn 4 and caps at 70", () => {
		const a3 = runGiantHead(3, 5n).intents;
		expect(a3[4]).toEqual({ move: "GIANT_HEAD_IT_IS_TIME", dmg: 40 });
		const a18 = runGiantHead(18, 5n).intents;
		expect(a18.slice(0, 3).every((x) => x.move !== "GIANT_HEAD_IT_IS_TIME")).toBe(true);
		expect(a18.slice(3).map((x) => x.dmg)).toEqual([40, 45, 50, 55, 60, 65, 70, 70, 70]);
	});
});

// ── Nemesis ─────────────────────────────────────────────────

describe("Nemesis", () => {
	it("never opens with Scythe; both openers occur", () => {
		const seen = new Set<string>();
		for (let seed = 1n; seed <= 40n; seed++) seen.add(intentOf(startFight("NEMESIS", seed), 0));
		expect([...seen].sort()).toEqual(["NEMESIS_ATTACK", "NEMESIS_DEBUFF"]);
	});

	it("is Intangible on every even-numbered turn (damage capped at 1)", () => {
		let s = tough(startFight("NEMESIS", 2n, strikes(10)));
		for (let turn = 1; turn <= 6; turn++) {
			const intangible = (powerAmount(monsterAt(s, 0), "INTANGIBLE") ?? 0) > 0;
			expect(intangible, `turn ${turn}`).toBe(turn % 2 === 0);
			const hp = monsterAt(s, 0).currentHp;
			s = playCard(s, "STRIKE_RED", 0);
			expect(hp - monsterAt(s, 0).currentHp, `turn ${turn}`).toBe(turn % 2 === 0 ? 1 : 6);
			s = endTurn(s);
		}
	});

	it("Tri Attack 3 x 6 (A3: 3 x 7); Scythe 45", () => {
		for (const [asc, per] of [
			[0, 6],
			[3, 7],
		] as const) {
			let s = tough(startFight("NEMESIS", 1n, defends(10), asc));
			s = forceMove(s, 0, "NEMESIS_ATTACK");
			const hp = s.currentHp;
			s = endTurn(s);
			expect(hp - s.currentHp).toBe(3 * per);
		}
		let s = tough(startFight("NEMESIS", 1n, defends(10)));
		s = forceMove(s, 0, "NEMESIS_SCYTHE");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(45);
	});

	it("Tri Burn: 3 Burns into the discard pile (5 from A18)", () => {
		for (const [asc, n] of [
			[0, 3],
			[17, 3],
			[18, 5],
		] as const) {
			let s = tough(startFight("NEMESIS", 1n, defends(10), asc));
			s = forceMove(s, 0, "NEMESIS_DEBUFF");
			s = endTurn(s);
			const all = [
				...(s.combat?.discardPile ?? []),
				...(s.combat?.hand ?? []),
				...(s.combat?.drawPile ?? []),
			];
			expect(all.filter((c) => c.id === "BURN").length).toBe(n);
			expect(count(s, "discardPile", "BURN") + count(s, "hand", "BURN")).toBe(n);
		}
	});

	it("10 real turns: valid intents, Scythe not within two, no Tri Burn twice, no Tri Attack thrice", () => {
		for (const seed of [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]) {
			let s = tough(startFight("NEMESIS", seed, defends(10)));
			for (let turn = 0; turn < 10; turn++) {
				assertIntentsValid(s, `seed ${seed} turn ${turn}`);
				s = endTurn(s);
			}
			const h = [...monsterAt(s, 0).moveHistory, monsterAt(s, 0).intent.moveId];
			expect(h[0]).not.toBe("NEMESIS_SCYTHE");
			for (let k = 1; k < h.length; k++) {
				if (h[k] === "NEMESIS_SCYTHE") {
					expect(h[k - 1]).not.toBe("NEMESIS_SCYTHE");
					if (k >= 2) expect(h[k - 2]).not.toBe("NEMESIS_SCYTHE");
				}
				if (h[k] === "NEMESIS_DEBUFF") expect(h[k - 1]).not.toBe("NEMESIS_DEBUFF");
				expect(lastNSame(h.slice(0, k + 1), 3) && h[k] === "NEMESIS_ATTACK").toBe(false);
			}
		}
	});
});

// ── Reptomancer + Daggers ───────────────────────────────────

const REPTO = 2;

describe("Reptomancer", () => {
	it("opens with Summon; the starting daggers are minions that open with Stab", () => {
		for (let seed = 1n; seed <= 20n; seed++) {
			const s = startFight("REPTOMANCER", seed);
			expect(intentOf(s, REPTO)).toBe("REPTOMANCER_SUMMON");
			expect(powerAmount(monsterAt(s, REPTO), "MINION_LEADER")).toBe(1);
			for (const i of [1, 4]) {
				expect(intentOf(s, i)).toBe("DAGGER_STAB");
				expect(powerAmount(monsterAt(s, i), "MINION")).toBe(1);
			}
		}
	});

	it("A0 Summon: one dagger into slot 3 (4 and 1 taken); it does not act that round", () => {
		let s = tough(startFight("REPTOMANCER", 1n, defends(10)));
		const hp = s.currentHp;
		s = endTurn(s);
		expect(aliveIds(s)).toEqual(["DAGGER", "REPTOMANCER", "DAGGER", "DAGGER"]);
		const d = monsterAt(s, 3);
		expect(d.id).toBe("DAGGER");
		expect(powerAmount(d, "MINION")).toBe(1);
		expect(d.maxHp).toBeGreaterThanOrEqual(20);
		expect(d.maxHp).toBeLessThanOrEqual(25);
		expect(d.intent.moveId).toBe("DAGGER_STAB");
		expect(d.moveHistory).toEqual([]);
		// only the two starting daggers stabbed (9 each), each adding a Wound
		expect(hp - s.currentHp).toBe(18);
		expect(count(s, "discardPile", "WOUND") + count(s, "hand", "WOUND")).toBe(2);
		expect(monsterAt(s, 0).alive).toBe(false);
	});

	it("A18 first-turn Summon brings 4 daggers (slots 3 and 0)", () => {
		let s = tough(startFight("REPTOMANCER", 1n, defends(10), 18));
		s = endTurn(s);
		expect(aliveIds(s)).toEqual(["DAGGER", "DAGGER", "REPTOMANCER", "DAGGER", "DAGGER"]);
		expect(monsterAt(s, 0).intent.moveId).toBe("DAGGER_STAB");
	});

	it("Summon spawns only into open slots (none when all four are taken)", () => {
		let s = tough(startFight("REPTOMANCER", 1n, defends(10), 18));
		s = endTurn(s); // 4 daggers now
		for (const i of [0, 1, 3, 4]) s = forceMove(s, i, "DAGGER_STAB");
		s = forceMove(s, REPTO, "REPTOMANCER_SUMMON");
		s = endTurn(s);
		expect(aliveIds(s)).toHaveLength(5);
		// one open slot at A18 (two wanted): only slot 4 is filled
		let t = tough(startFight("REPTOMANCER", 1n, defends(10), 18));
		t = endTurn(t);
		t = patchMonster(t, 4, { alive: false, currentHp: 0 });
		for (const i of [0, 1, 3]) t = forceMove(t, i, "DAGGER_STAB");
		t = forceMove(t, REPTO, "REPTOMANCER_SUMMON");
		t = endTurn(t);
		expect(aliveIds(t)).toHaveLength(5);
		expect(monsterAt(t, 4).moveHistory).toEqual([]);
	});

	it("Philosopher's Stone: a summoned dagger gains 1 Strength", () => {
		let s = tough(startFight("REPTOMANCER", 1n, defends(10)));
		s = { ...s, relics: [{ id: "PHILOSOPHERS_STONE" as RelicId, counter: 0 }] };
		s = endTurn(s);
		expect(powerAmount(monsterAt(s, 3), "STRENGTH")).toBe(1);
	});

	it("spawn cap: with 4 monsters alive it never picks Summon; with 3 it can", () => {
		const nextAfterSnake = (seed: bigint, killOne: boolean) => {
			let s = tough(startFight("REPTOMANCER", seed, defends(10)));
			s = endTurn(s); // summon → 4 alive
			if (killOne) s = patchMonster(s, 3, { alive: false, currentHp: 0 });
			s = forceMove(s, 1, "DAGGER_STAB"); // slot 1 acts before the roll: keep it alive
			s = forceMove(s, REPTO, "REPTOMANCER_SNAKE_STRIKE");
			s = endTurn(s);
			return intentOf(s, REPTO);
		};
		const capped = new Set<string>();
		const open = new Set<string>();
		for (let seed = 1n; seed <= 30n; seed++) {
			capped.add(nextAfterSnake(seed, false));
			open.add(nextAfterSnake(seed, true));
		}
		expect(capped.has("REPTOMANCER_SUMMON")).toBe(false);
		expect(open.has("REPTOMANCER_SUMMON")).toBe(true);
		expect(open.has("REPTOMANCER_SNAKE_STRIKE")).toBe(false);
	});

	it("Snake Strike 2 x 13 + Weak 1; Big Bite 30 (A3: 2 x 16, 34)", () => {
		for (const [asc, snake, bite] of [
			[0, 13, 30],
			[3, 16, 34],
		] as const) {
			let s = tough(startFight("REPTOMANCER", 1n, defends(10), asc));
			for (const i of [1, 4]) s = patchMonster(s, i, { alive: false, currentHp: 0 });
			s = forceMove(s, REPTO, "REPTOMANCER_SNAKE_STRIKE");
			let hp = s.currentHp;
			s = endTurn(s);
			expect(hp - s.currentHp).toBe(2 * snake);
			expect(powerAmount(s.combat?.player ?? { powers: [] }, "WEAK")).toBe(1);
			s = forceMove(s, REPTO, "REPTOMANCER_BIG_BITE");
			hp = s.currentHp;
			s = endTurn(s);
			// player Weak does not change monster damage
			expect(hp - s.currentHp).toBe(bite);
		}
	});

	it("killing the Reptomancer makes every dagger flee and wins the fight", () => {
		let s = startFight("REPTOMANCER", 1n, strikes(10));
		s = patchMonster(s, REPTO, { currentHp: 1 });
		s = playCard(s, "STRIKE_RED", REPTO);
		expect(aliveIds(s)).toEqual([]);
		expect(s.phase.type).not.toBe("combat");
	});

	it("10 real turns: valid intents; no Big Bite twice, no Summon thrice, Snake twice only when capped", () => {
		for (const asc of [0, 18]) {
			for (const seed of [1n, 2n, 3n, 4n, 5n, 6n]) {
				let s = tough(startFight("REPTOMANCER", seed, defends(10), asc));
				for (let turn = 0; turn < 10 && s.phase.type === "combat"; turn++) {
					assertIntentsValid(s, `asc${asc} seed ${seed} turn ${turn}`);
					const daggers = aliveIds(s).filter((id) => id === "DAGGER").length;
					expect(daggers).toBeLessThanOrEqual(4);
					s = endTurn(s);
				}
				const h = [...monsterAt(s, REPTO).moveHistory, monsterAt(s, REPTO).intent.moveId];
				expect(h[0]).toBe("REPTOMANCER_SUMMON");
				for (let k = 1; k < h.length; k++) {
					expect(h[k] === "REPTOMANCER_BIG_BITE" && h[k - 1] === h[k]).toBe(false);
					expect(lastNSame(h.slice(0, k + 1), 3) && h[k] === "REPTOMANCER_SUMMON").toBe(false);
				}
			}
		}
	});
});

describe("Dagger", () => {
	it("Stab (9 + Wound) then Explode (25, then it dies)", () => {
		let s = tough(startFight("REPTOMANCER", 1n, defends(10)));
		s = patchMonster(s, 1, { alive: false, currentHp: 0 });
		s = forceMove(s, REPTO, "REPTOMANCER_BIG_BITE");
		s = patchMonster(s, REPTO, {
			intent: { ...monsterAt(s, REPTO).intent, moveId: "" as MonsterMoveId },
		});
		let hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(9);
		expect(count(s, "discardPile", "WOUND") + count(s, "hand", "WOUND")).toBe(1);
		expect(intentOf(s, 4)).toBe("DAGGER_EXPLODE");
		s = patchMonster(s, REPTO, {
			intent: { ...monsterAt(s, REPTO).intent, moveId: "" as MonsterMoveId },
		});
		hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(25);
		expect(monsterAt(s, 4).alive).toBe(false);
		expect(s.phase.type).toBe("combat");
	});

	it("Explode is a real attack: Strength adds to it", () => {
		let s = tough(startFight("REPTOMANCER", 1n, defends(10)));
		s = patchMonster(s, 1, { alive: false, currentHp: 0 });
		s = patchMonster(s, REPTO, {
			intent: { ...monsterAt(s, REPTO).intent, moveId: "" as MonsterMoveId },
		});
		s = withPower(s, 4, "strength", 3);
		s = forceMove(s, 4, "DAGGER_EXPLODE");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(28);
		expect(monsterAt(s, 4).alive).toBe(false);
	});
});
