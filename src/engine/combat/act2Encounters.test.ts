import { beforeEach, describe, expect, it } from "vitest";
import { getMonster } from "../content/loader";
import {
	aliveIds,
	endTurn,
	forceMove,
	KNOWN_POWER_IDS,
	loadAllData,
	monsterAt,
	patchMonster,
	playCard,
	powerAmount,
	startFight,
} from "../core/fightTestHelpers";
import type { GameState } from "../core/types";
import { ACT_ENCOUNTER_POOLS, getEncounterMonsters } from "./encounters";

beforeEach(() => loadAllData());

const pool = ACT_ENCOUNTER_POOLS[2];
const ACT2_ENCOUNTERS = [
	...(pool?.weak.map((w) => w.id) ?? []),
	...(pool?.strong.map((w) => w.id) ?? []),
	...(pool?.elites ?? []),
	...(pool?.bosses ?? []),
	"MASKED_BANDITS_EVENT",
];

/** Every power id must be a real power (catches "summon_gremlins", "block", ...). */
function assertSane(s: GameState, label: string): void {
	const c = s.combat;
	if (!c) return;
	for (const p of c.player.powers) {
		expect(KNOWN_POWER_IDS.has(p.id.toUpperCase()), `${label} player power ${p.id}`).toBe(true);
	}
	for (const m of c.monsters) {
		if (!m.alive) continue;
		const def = getMonster(m.id);
		expect(def, `${label} monster def ${m.id}`).toBeDefined();
		expect(def?.moves[m.intent.moveId as string], `${label} ${m.id} intent`).toBeDefined();
		expect(m.currentHp).toBeLessThanOrEqual(m.maxHp);
		for (const p of m.powers) {
			expect(KNOWN_POWER_IDS.has(p.id.toUpperCase()), `${label} ${m.id} power ${p.id}`).toBe(true);
		}
	}
}

describe("Act 2 encounter pool", () => {
	it("has 5 weak, 8 strong, 3 elites, 3 bosses", () => {
		expect(pool?.weak.length).toBe(5);
		expect(pool?.strong.length).toBe(8);
		expect(pool?.elites.length).toBe(3);
		expect(pool?.bosses.length).toBe(3);
		const sum = (pool?.strong ?? []).reduce((a, w) => a + w.weight, 0);
		expect(sum).toBeCloseTo(1, 5);
	});

	it.each(ACT2_ENCOUNTERS)("%s: 8 rounds with no fake powers or unknown moves", (enc) => {
		for (const seed of [1n, 42n, 7n]) {
			let s = startFight(enc, seed);
			expect(aliveIds(s).length, `${enc} has monsters`).toBeGreaterThan(0);
			for (let turn = 0; turn < 8 && s.phase.type === "combat"; turn++) {
				assertSane(s, `${enc} seed=${seed} turn=${turn}`);
				s = endTurn(s);
			}
		}
	});
});

describe("Act 2 layouts and summons", () => {
	it("Gremlin Leader: slot 0 empty, two random gremlins, leader in slot 3", () => {
		const s = startFight("GREMLIN_LEADER", 3n);
		expect(s.combat?.monsters.length).toBe(4);
		expect(monsterAt(s, 0).alive).toBe(false);
		expect(monsterAt(s, 3).id).toBe("GREMLIN_LEADER");
		for (const i of [1, 2]) {
			expect(monsterAt(s, i).id).toMatch(/GREMLIN/);
			expect(powerAmount(monsterAt(s, i), "MINION")).toBeDefined();
		}
	});

	it("Gremlin Leader RALLY summons 2 gremlins that do not act that turn", () => {
		let s = startFight("GREMLIN_LEADER", 3n);
		s = patchMonster(s, 1, { alive: false, currentHp: 0 });
		s = patchMonster(s, 2, { alive: false, currentHp: 0 });
		s = forceMove(s, 3, "GREMLIN_LEADER_RALLY");
		s = endTurn(s);
		const summoned = [0, 1, 2].map((i) => monsterAt(s, i)).filter((m) => m.alive);
		expect(summoned.length).toBe(2);
		for (const m of summoned) {
			expect(powerAmount(m, "MINION")).toBeDefined();
			expect(m.moveHistory.length).toBe(0);
			expect(m.intent.moveId).not.toBe("");
		}
		expect(powerAmount(monsterAt(s, 3), "SUMMON_GREMLINS")).toBeUndefined();
	});

	it("Gremlin Leader ENCOURAGE: minions get STR + block, leader only STR", () => {
		let s = startFight("GREMLIN_LEADER", 3n);
		s = forceMove(s, 3, "GREMLIN_LEADER_ENCOURAGE");
		// Shield Gremlin's PROTECT could shield the leader; force block-free moves on minions.
		for (const i of [1, 2]) s = forceMove(s, i, blockFreeMove(monsterAt(s, i).id));
		s = endTurn(s);
		const leader = monsterAt(s, 3);
		expect(powerAmount(leader, "STRENGTH")).toBe(3);
		expect(leader.block).toBe(0);
		for (const i of [1, 2]) {
			const m = monsterAt(s, i);
			if (!m.alive) continue;
			expect(powerAmount(m, "STRENGTH")).toBeGreaterThanOrEqual(3);
			expect(m.block).toBeGreaterThanOrEqual(6);
		}
	});

	it("killing the Gremlin Leader makes the gremlins flee and ends combat", () => {
		let s = startFight("GREMLIN_LEADER", 3n);
		s = patchMonster(s, 3, { currentHp: 1, block: 0 });
		s = playCard(s, "STRIKE_RED", 3);
		expect(aliveIds(s)).toEqual([]);
		expect(s.phase.type).toBe("reward");
	});

	it("Collector: first turn spawns 2 Torch Heads in slots 0 and 1", () => {
		let s = startFight("COLLECTOR", 5n);
		expect(monsterAt(s, 2).id).toBe("THE_COLLECTOR");
		expect(monsterAt(s, 2).intent.moveId).toBe("THE_COLLECTOR_SPAWN");
		s = endTurn(s);
		for (const i of [0, 1]) {
			const m = monsterAt(s, i);
			expect(m.id).toBe("TORCH_HEAD");
			expect(m.alive).toBe(true);
			expect(m.powers.filter((pw) => pw.id.toUpperCase() === "MINION").length).toBe(1);
			expect(m.intent.moveId).toBe("TORCH_HEAD_TACKLE");
		}
	});

	it("Automaton: SPAWN_ORBS puts Bronze Orbs in slots 0 and 2", () => {
		let s = startFight("AUTOMATON", 5n);
		expect(monsterAt(s, 1).id).toBe("BRONZE_AUTOMATON");
		s = endTurn(s);
		for (const i of [0, 2]) {
			expect(monsterAt(s, i).id).toBe("BRONZE_ORB");
			expect(monsterAt(s, i).alive).toBe(true);
			expect(monsterAt(s, i).moveHistory.length).toBe(0);
		}
	});

	it("Bronze Orb SUPPORT_BEAM shields the Automaton, not the other orb", () => {
		let s = endTurn(startFight("AUTOMATON", 5n));
		s = forceMove(s, 0, "BRONZE_ORB_SUPPORT_BEAM");
		s = forceMove(s, 2, "BRONZE_ORB_BEAM");
		s = forceMove(s, 1, "BRONZE_AUTOMATON_FLAIL");
		s = endTurn(s);
		expect(monsterAt(s, 1).block).toBe(12);
		expect(monsterAt(s, 2).block).toBe(0);
	});

	it("Sentry and Sphere / Slavers / Two Thieves use the documented order", () => {
		expect(getEncounterMonsters("SENTRY_AND_SPHERE")).toEqual(["SENTRY", "SPHERIC_GUARDIAN"]);
		expect(getEncounterMonsters("SLAVERS")).toEqual(["BLUE_SLAVER", "TASKMASTER", "RED_SLAVER"]);
		expect(getEncounterMonsters("TWO_THIEVES")).toEqual(["LOOTER", "MUGGER"]);
	});
});

function blockFreeMove(id: string): string {
	const moves = Object.entries(getMonster(id)?.moves ?? {});
	const ok = moves.find(
		([, m]) => m.block == null && !(m.effects ?? []).some((e) => e.power === "BLOCK"),
	);
	return ok?.[0] ?? "";
}
