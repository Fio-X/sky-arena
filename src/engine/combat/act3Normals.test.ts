/**
 * Act 3 normal monsters through the real step() loop: Darkling (Life Link),
 * Orb Walker, the Shapes (Spiker, Repulsor, Exploder), Transient, The Maw,
 * Spire Growth and Writhing Mass. Specs: data-reference/monsters-act34.json.
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
import type { CardInstance, GameState, MonsterState, RelicId } from "../core/types";

beforeEach(() => loadAllData());

const strikes = (n = 10) => Array.from({ length: n }, (_, i) => card("STRIKE_RED", i + 1));
const defends = (n = 10) => Array.from({ length: n }, (_, i) => card("DEFEND_RED", i + 1));

function withPlayerPower(s: GameState, id: string, amount: number): GameState {
	const c = s.combat;
	if (!c) return s;
	const powers = [...c.player.powers, { id: id as never, amount, justApplied: false }];
	return { ...s, combat: { ...c, player: { ...c.player, powers } } };
}

function withRelic(s: GameState, id: string, counter = -1): GameState {
	return { ...s, relics: [...s.relics, { id: id as RelicId, counter }] };
}

const intentOf = (s: GameState, i: number) => monsterAt(s, i).intent.moveId as string;
const inCombat = (s: GameState) => s.phase.type === "combat";

/** First seed whose `enc` layout has `id`; returns the fight and that slot. */
function findShape(enc: string, id: string, deck?: CardInstance[], asc = 0): [GameState, number] {
	for (let seed = 1n; seed < 200n; seed++) {
		const s = startFight(enc, seed, deck, asc);
		const i = s.combat?.monsters.findIndex((m) => m.id === id) ?? -1;
		if (i >= 0) return [s, i];
	}
	throw new Error(`${enc} never has ${id}`);
}

/** Force every other shape into a harmless move for the coming monster turn. */
function quietOthers(s: GameState, keep: number): GameState {
	let st = s;
	for (const m of st.combat?.monsters ?? []) {
		if (m.index === keep || !m.alive) continue;
		if (m.id === "SPIKER") st = forceMove(st, m.index, "SPIKER_SPIKE");
		if (m.id === "REPULSOR") st = forceMove(st, m.index, "REPULSOR_REPULSE");
		if (m.id === "EXPLODER") st = forceMove(st, m.index, "EXPLODER_SLAM");
	}
	return st;
}

// ── Darkling ────────────────────────────────────────────────

describe("Darkling", () => {
	it("Nip damage is rolled per Darkling at construction (7-11; asc2: 9-13 +2)", () => {
		for (let seed = 1n; seed <= 20n; seed++) {
			for (const m of startFight("THREE_DARKLINGS", seed).combat?.monsters ?? []) {
				expect(m.miscInfo).toBeGreaterThanOrEqual(7);
				expect(m.miscInfo).toBeLessThanOrEqual(11);
				expect(powerAmount(m, "LIFE_LINK")).toBe(1);
			}
			const s2 = startFight("THREE_DARKLINGS", seed, undefined, 2);
			for (const m of s2.combat?.monsters ?? []) {
				expect(m.miscInfo).toBeGreaterThanOrEqual(9);
				expect(m.miscInfo).toBeLessThanOrEqual(13);
				const nip = forceMove(s2, m.index, "DARKLING_NIP");
				expect(monsterAt(nip, m.index).intent.baseDamage).toBe(m.miscInfo + 2);
			}
		}
	});

	it("Nip hits for the rolled damage; Harden gives 12 block (+2 Strength at asc17)", () => {
		let s = startFight("THREE_DARKLINGS", 3n, defends(), 17);
		s = forceMove(s, 0, "DARKLING_NIP");
		s = forceMove(s, 1, "DARKLING_HARDEN");
		s = forceMove(s, 2, "DARKLING_HARDEN");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(monsterAt(s, 0).miscInfo + 2);
		expect(monsterAt(s, 1).block).toBe(12);
		expect(powerAmount(monsterAt(s, 1), "STRENGTH")).toBe(2);
	});

	it("dies into halfDead while others live: REGROW, then REINCARNATE at half HP", () => {
		let s = startFight("THREE_DARKLINGS", 5n, strikes());
		s = patchMonster(s, 0, { currentHp: 1 });
		s = playCard(s, "STRIKE_RED", 0);
		let d = monsterAt(s, 0);
		expect(d.halfDead).toBe(true);
		expect(d.alive).toBe(false);
		expect(d.powers).toEqual([]);
		expect(d.intent.moveId).toBe("DARKLING_REGROW");
		expect(inCombat(s)).toBe(true);

		s = endTurn(s); // REGROW does nothing, AI → REINCARNATE (halfDead)
		d = monsterAt(s, 0);
		expect(d.halfDead).toBe(true);
		expect(d.intent.moveId).toBe("DARKLING_REINCARNATE");

		s = endTurn(s); // revives
		d = monsterAt(s, 0);
		expect(d.alive).toBe(true);
		expect(d.halfDead).toBe(false);
		expect(d.currentHp).toBe(Math.floor(d.maxHp / 2));
		expect(powerAmount(d, "LIFE_LINK")).toBe(1);
		expect(d.moveHistory.slice(-2)).toEqual(["DARKLING_REGROW", "DARKLING_REINCARNATE"]);
		expect(["DARKLING_NIP", "DARKLING_HARDEN", "DARKLING_CHOMP"]).toContain(d.intent.moveId);
	});

	it("revives with +1 Strength when the player has Philosopher's Stone", () => {
		let s = withRelic(startFight("THREE_DARKLINGS", 5n, strikes()), "PHILOSOPHERS_STONE");
		s = patchMonster(s, 0, { currentHp: 1 });
		s = endTurn(endTurn(playCard(s, "STRIKE_RED", 0)));
		expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(1);
	});

	it("killing the last living Darkling wins even while others are regrowing", () => {
		let s = startFight("THREE_DARKLINGS", 5n, strikes());
		for (const i of [1, 2]) {
			s = patchMonster(s, i, { alive: false, halfDead: true, currentHp: 0, powers: [] });
		}
		s = patchMonster(s, 0, { currentHp: 1 });
		s = playCard(s, "STRIKE_RED", 0);
		expect(s.combat?.monsters.every((m) => !m.alive && !m.halfDead)).toBe(true);
		expect(s.phase.type).toBe("reward");
	});

	it("the middle Darkling never Chomps; Chomp hits twice for the others", () => {
		let s = startFight("THREE_DARKLINGS", 9n, defends());
		s = forceMove(s, 0, "DARKLING_CHOMP");
		s = forceMove(s, 1, "DARKLING_HARDEN");
		s = forceMove(s, 2, "DARKLING_HARDEN");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(16);
		for (let t = 0; t < 30 && inCombat(s); t++) {
			expect(intentOf(s, 1)).not.toBe("DARKLING_CHOMP");
			s = endTurn(s);
		}
	});
});

// ── Orb Walker ──────────────────────────────────────────────

describe("Orb Walker", () => {
	it("gains 3 Strength every round (asc17: 5); Claw hits harder each turn", () => {
		let s = forceMove(startFight("ORB_WALKER", 1n, defends()), 0, "ORB_WALKER_CLAW");
		let hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(15);
		expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(3);
		s = forceMove(s, 0, "ORB_WALKER_CLAW");
		hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(18);
		const a17 = endTurn(startFight("ORB_WALKER", 1n, defends(), 17));
		expect(powerAmount(monsterAt(a17, 0), "STRENGTH")).toBe(5);
	});

	it("Laser deals 10 and adds a Burn to the draw pile and one to the discard pile", () => {
		let s = forceMove(startFight("ORB_WALKER", 1n, defends()), 0, "ORB_WALKER_LASER");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(10);
		const c = s.combat;
		const burns = [...(c?.drawPile ?? []), ...(c?.hand ?? []), ...(c?.discardPile ?? [])].filter(
			(x) => x.id === "BURN",
		);
		expect(burns.length).toBe(2);
	});
});

// ── Shapes ──────────────────────────────────────────────────

describe("Spiker", () => {
	it("Thorns (3) hits the player when struck; block absorbs it", () => {
		let [s, i] = findShape("THREE_SHAPES", "SPIKER", [...strikes(5), ...defends(5)]);
		expect(powerAmount(monsterAt(s, i), "THORNS")).toBe(3);
		const hp = s.currentHp;
		s = playCard(s, "STRIKE_RED", i);
		expect(hp - s.currentHp).toBe(3);
		s = playCard(s, "DEFEND_RED");
		s = playCard(s, "STRIKE_RED", i);
		expect(hp - s.currentHp).toBe(3);
		expect(s.combat?.player.block).toBe(2);
	});

	it("Thorns scales with ascension (asc2: 4, asc17: 7)", () => {
		expect(
			powerAmount(monsterAt(...findShape("THREE_SHAPES", "SPIKER", undefined, 2)), "THORNS"),
		).toBe(4);
		expect(
			powerAmount(monsterAt(...findShape("THREE_SHAPES", "SPIKER", undefined, 17)), "THORNS"),
		).toBe(7);
	});

	it("Spike adds 2 Thorns; after 6 Spikes it only Cuts", () => {
		let [s, i] = findShape("THREE_SHAPES", "SPIKER", defends());
		s = quietOthers(forceMove(s, i, "SPIKER_SPIKE"), i);
		s = endTurn(s);
		expect(powerAmount(monsterAt(s, i), "THORNS")).toBe(5);
		const six = Array(6).fill("SPIKER_SPIKE");
		s = patchMonster(s, i, { moveHistory: six });
		for (let t = 0; t < 5 && inCombat(s); t++) {
			s = quietOthers(forceMove(s, i, "SPIKER_CUT"), i);
			s = endTurn(s);
			expect(intentOf(s, i)).toBe("SPIKER_CUT");
		}
	});
});

describe("Repulsor", () => {
	it("Repulse shuffles 2 Dazed into the draw pile; Bash deals 11", () => {
		let [s, i] = findShape("THREE_SHAPES", "REPULSOR", defends(20));
		s = quietOthers(forceMove(s, i, "REPULSOR_REPULSE"), i);
		s = endTurn(s);
		const c = s.combat;
		const dazed = [...(c?.drawPile ?? []), ...(c?.hand ?? [])].filter((x) => x.id === "DAZED");
		const repulsors = c?.monsters.filter((m) => m.id === "REPULSOR").length ?? 0;
		expect(dazed.length).toBe(2 * repulsors); // quietOthers makes the other Repulsor Repulse too
		expect(c?.drawPile.filter((x) => x.id === "DAZED").length).toBeGreaterThan(0);
		s = quietOthers(forceMove(s, i, "REPULSOR_BASH"), i);
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(11);
	});
});

describe("Exploder", () => {
	it("Slam, Slam, then explodes for 30 non-attack damage and dies; Explosive counts 3-2-1", () => {
		let [s, i] = findShape("THREE_SHAPES", "EXPLODER", defends());
		expect(intentOf(s, i)).toBe("EXPLODER_SLAM");
		expect(powerAmount(monsterAt(s, i), "EXPLOSIVE")).toBe(3);
		const seen: string[] = [];
		const lost: number[] = [];
		const rolls: number[] = [];
		for (let t = 0; t < 3; t++) {
			seen.push(intentOf(s, i));
			s = quietOthers(s, i);
			const hp = s.currentHp;
			const rng = s.rng.aiRng.counter;
			s = endTurn(s);
			lost.push(hp - s.currentHp);
			rolls.push(s.rng.aiRng.counter - rng);
			if (t < 2) expect(powerAmount(monsterAt(s, i), "EXPLOSIVE")).toBe(2 - t);
		}
		expect(seen).toEqual(["EXPLODER_SLAM", "EXPLODER_SLAM", "EXPLODER_EXPLODE"]);
		expect(lost).toEqual([9, 9, 30]);
		expect(monsterAt(s, i).alive).toBe(false);
		// one aiRng.random(99) per monster per turn, also for the exploding turn (noOpRollMove)
		expect(rolls).toEqual([3, 3, 3]);
	});

	it("explosion ignores Strength and Vulnerable", () => {
		let [s, i] = findShape("THREE_SHAPES", "EXPLODER", defends());
		s = patchMonster(s, i, { moveHistory: ["EXPLODER_SLAM", "EXPLODER_SLAM"] as never });
		s = forceMove(quietOthers(s, i), i, "EXPLODER_EXPLODE");
		s = withPlayerPower(s, "vulnerable", 3);
		const m = monsterAt(s, i);
		s = patchMonster(s, i, {
			powers: [...m.powers, { id: "strength" as never, amount: 5, justApplied: false }],
		});
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(30);
	});
});

// ── Transient ───────────────────────────────────────────────

describe("Transient", () => {
	it("attacks for 30, 40, 50 ... and fades after its 5th attack (player wins)", () => {
		let s = startFight("TRANSIENT", 1n, defends());
		expect(monsterAt(s, 0).currentHp).toBe(999);
		const lost: number[] = [];
		const rolls: number[] = [];
		while (inCombat(s)) {
			expect(monsterAt(s, 0).intent.baseDamage).toBe(30 + 10 * lost.length);
			const hp = s.currentHp;
			const rng = s.rng.aiRng.counter;
			s = endTurn(s);
			lost.push(hp - s.currentHp);
			rolls.push(s.rng.aiRng.counter - rng);
		}
		expect(lost).toEqual([30, 40, 50, 60, 70]);
		expect(rolls).toEqual([1, 1, 1, 1, 1]); // the fading turn still burns its roll
		expect(s.phase.type).toBe("reward");
	});

	it("asc17: Fading 6, base 40", () => {
		let s = startFight("TRANSIENT", 1n, defends(), 17);
		expect(powerAmount(monsterAt(s, 0), "FADING")).toBe(6);
		let attacks = 0;
		while (inCombat(s) && attacks < 10) {
			expect(monsterAt(s, 0).intent.baseDamage).toBe(40 + 10 * attacks);
			s = endTurn(s);
			attacks++;
		}
		expect(attacks).toBe(6);
	});

	it("Shifting: HP lost becomes lost Strength + Shackled until the end of its turn", () => {
		let s = startFight("TRANSIENT", 1n, strikes());
		s = playCard(s, "STRIKE_RED", 0);
		const m = monsterAt(s, 0);
		expect(powerAmount(m, "STRENGTH")).toBe(-6);
		expect(powerAmount(m, "SHACKLED")).toBe(6);
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(24);
		expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBeUndefined();
		expect(powerAmount(monsterAt(s, 0), "SHACKLED")).toBeUndefined();
		expect(powerAmount(monsterAt(s, 0), "FADING")).toBe(4);
	});
});

// ── The Maw ─────────────────────────────────────────────────

describe("The Maw", () => {
	it("opens with Roar (Weak + Frail 3), 300 HP", () => {
		let s = startFight("MAW", 1n, defends());
		expect(monsterAt(s, 0).currentHp).toBe(300);
		expect(intentOf(s, 0)).toBe("THE_MAW_ROAR");
		s = endTurn(s);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "WEAK")).toBeGreaterThan(0);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "FRAIL")).toBeGreaterThan(0);
	});

	it("Nom hits ceil(turn/2) times and is always followed by Drool", () => {
		let s = startFight("MAW", 1n, defends());
		s = endTurn(s); // turn 1: Roar
		s = patchMonster(s, 0, {
			moveHistory: ["THE_MAW_ROAR", "THE_MAW_SLAM", "THE_MAW_DROOL", "THE_MAW_SLAM"] as never,
		});
		s = forceMove(s, 0, "THE_MAW_NOM"); // its 5th turn → 3 hits
		expect(monsterAt(s, 0).intent.hits).toBe(3);
		s = { ...s, combat: s.combat && { ...s.combat, player: { ...s.combat.player, powers: [] } } };
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(15);
		expect(intentOf(s, 0)).toBe("THE_MAW_DROOL");
		s = endTurn(s);
		expect(powerAmount(monsterAt(s, 0), "STRENGTH")).toBe(3);
	});
});

// ── Spire Growth ────────────────────────────────────────────

describe("Spire Growth", () => {
	it("Constrict: 10 damage at the end of each player turn; never re-applied", () => {
		let s = forceMove(startFight("SPIRE_GROWTH", 1n, defends()), 0, "SPIRE_GROWTH_CONSTRICT");
		s = endTurn(s);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "CONSTRICTED")).toBe(10);
		for (let t = 0; t < 8 && inCombat(s); t++) {
			expect(intentOf(s, 0)).not.toBe("SPIRE_GROWTH_CONSTRICT");
			s = forceMove(s, 0, "SPIRE_GROWTH_QUICK_TACKLE");
			const hp = s.currentHp;
			s = endTurn(s);
			expect(hp - s.currentHp).toBe(16 + 10); // Tackle + Constricted
		}
	});

	it("Constricted damage is blocked by block the player still has (Barricade)", () => {
		let s = forceMove(startFight("SPIRE_GROWTH", 1n, defends()), 0, "SPIRE_GROWTH_CONSTRICT");
		s = endTurn(s);
		s = withPlayerPower(s, "barricade", 1);
		s = forceMove(s, 0, "SPIRE_GROWTH_CONSTRICT"); // no damage from its move
		s = playCard(playCard(s, "DEFEND_RED"), "DEFEND_RED");
		const hp = s.currentHp;
		s = endTurn(s);
		expect(hp - s.currentHp).toBe(0);
		expect(s.combat?.player.block).toBe(0);
	});

	it("asc17: Constrict 12 whenever legal", () => {
		const s = startFight("SPIRE_GROWTH", 1n, defends(), 17);
		expect(intentOf(s, 0)).toBe("SPIRE_GROWTH_CONSTRICT");
		const after = endTurn(s);
		expect(powerAmount(after.combat?.player ?? { powers: [] }, "CONSTRICTED")).toBe(12);
	});
});

// ── Writhing Mass ───────────────────────────────────────────

describe("Writhing Mass", () => {
	it("first turn: Multi Strike, Flail or Wither only", () => {
		const firsts = new Set<string>();
		for (let seed = 1n; seed <= 30n; seed++)
			firsts.add(intentOf(startFight("WRITHING_MASS", seed), 0));
		expect([...firsts].sort()).toEqual([
			"WRITHING_MASS_FLAIL",
			"WRITHING_MASS_MULTI_STRIKE",
			"WRITHING_MASS_WITHER",
		]);
	});

	it("Reactive: each damaging hit re-rolls the intent (aiRng) to a different move", () => {
		for (let seed = 1n; seed <= 10n; seed++) {
			let s = startFight("WRITHING_MASS", seed, strikes());
			const before = intentOf(s, 0);
			const counter = s.rng.aiRng.counter;
			s = playCard(s, "STRIKE_RED", 0);
			expect(s.rng.aiRng.counter).toBeGreaterThan(counter);
			expect(intentOf(s, 0)).not.toBe(before);
			expect(getMonster("WRITHING_MASS")?.moves[intentOf(s, 0)]).toBeDefined();
		}
	});

	it("Malleable: +3 block then +4 on the next hit, resets to 3 after the round", () => {
		let s = startFight("WRITHING_MASS", 1n, strikes());
		s = playCard(s, "STRIKE_RED", 0);
		expect(monsterAt(s, 0).block).toBe(3);
		expect(powerAmount(monsterAt(s, 0), "MALLEABLE")).toBe(4);
		s = playCard(s, "STRIKE_RED", 0); // 6 - 3 block = 3 unblocked → +4
		expect(monsterAt(s, 0).block).toBe(4);
		s = endTurn(s);
		expect(powerAmount(monsterAt(s, 0), "MALLEABLE")).toBe(3);
	});

	it("Implant adds Parasite to the master deck, only once per combat", () => {
		let s = forceMove(startFight("WRITHING_MASS", 1n, defends()), 0, "WRITHING_MASS_IMPLANT");
		s = endTurn(s);
		expect(s.deck.filter((c) => c.id === "PARASITE").length).toBe(1);
		expect(monsterAt(s, 0).miscInfo).toBe(1);
		for (let t = 0; t < 20 && inCombat(s); t++) {
			expect(intentOf(s, 0)).not.toBe("WRITHING_MASS_IMPLANT");
			s = endTurn(s);
		}
	});

	it("Omamori absorbs the Parasite; Darkstone Periapt gives +6 max HP", () => {
		let s = withRelic(startFight("WRITHING_MASS", 1n, defends()), "OMAMORI", 2);
		s = endTurn(forceMove(s, 0, "WRITHING_MASS_IMPLANT"));
		expect(s.deck.some((c) => c.id === "PARASITE")).toBe(false);
		expect(s.relics.find((r) => r.id === "OMAMORI")?.counter).toBe(1);

		let d = withRelic(startFight("WRITHING_MASS", 1n, defends()), "DARKSTONE_PERIAPT");
		const max = d.maxHp;
		d = endTurn(forceMove(d, 0, "WRITHING_MASS_IMPLANT"));
		expect(d.maxHp).toBe(max + 6);
	});

	it("Flail attacks and gains 16 block; Wither applies Weak and Vulnerable", () => {
		let s = forceMove(startFight("WRITHING_MASS", 1n, defends()), 0, "WRITHING_MASS_FLAIL");
		s = endTurn(s);
		expect(monsterAt(s, 0).block).toBe(16);
		s = endTurn(forceMove(s, 0, "WRITHING_MASS_WITHER"));
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "WEAK")).toBeGreaterThan(0);
		expect(powerAmount(s.combat?.player ?? { powers: [] }, "VULNERABLE")).toBeGreaterThan(0);
	});
});

// ── 10-turn soak per encounter ──────────────────────────────

const runOf = (h: readonly string[], id: string, n: number) =>
	h.some((_, k) => k + n <= h.length && h.slice(k, k + n).every((x) => x === id));

/** History rules from each monster's ai.historyRules, on executed moves. */
function checkHistory(m: MonsterState): void {
	const h = m.moveHistory as string[];
	const tag = `${m.id}@${m.index}: ${h.join(",")}`;
	switch (m.id as string) {
		case "DARKLING": {
			const live = h.filter((x) => x !== "DARKLING_REGROW" && x !== "DARKLING_REINCARNATE");
			if (h[0]) expect(["DARKLING_HARDEN", "DARKLING_NIP"], tag).toContain(h[0]);
			expect(runOf(live, "DARKLING_CHOMP", 2), tag).toBe(false);
			expect(runOf(live, "DARKLING_HARDEN", 2), tag).toBe(false);
			expect(runOf(live, "DARKLING_NIP", 3), tag).toBe(false);
			if (m.index === 1) expect(h, tag).not.toContain("DARKLING_CHOMP");
			break;
		}
		case "ORB_WALKER":
			expect(runOf(h, "ORB_WALKER_CLAW", 3) || runOf(h, "ORB_WALKER_LASER", 3), tag).toBe(false);
			break;
		case "SPIKER": {
			const spikes = h.filter((x) => x === "SPIKER_SPIKE").length;
			expect(spikes, tag).toBeLessThanOrEqual(6);
			if (spikes < 6) expect(runOf(h, "SPIKER_CUT", 2), tag).toBe(false);
			break;
		}
		case "REPULSOR":
			expect(runOf(h, "REPULSOR_BASH", 2), tag).toBe(false);
			break;
		case "EXPLODER":
			expect(
				["EXPLODER_SLAM", "EXPLODER_SLAM", "EXPLODER_EXPLODE"].slice(0, h.length),
				tag,
			).toEqual(h);
			break;
		case "TRANSIENT":
			expect(
				h.every((x) => x === "TRANSIENT_ATTACK"),
				tag,
			).toBe(true);
			break;
		case "THE_MAW":
			if (h[0]) expect(h[0], tag).toBe("THE_MAW_ROAR");
			h.forEach((x, k) => {
				if (x === "THE_MAW_NOM" && k + 1 < h.length) expect(h[k + 1], tag).toBe("THE_MAW_DROOL");
			});
			expect(runOf(h, "THE_MAW_SLAM", 2), tag).toBe(false);
			break;
		case "SPIRE_GROWTH":
			expect(h.filter((x) => x === "SPIRE_GROWTH_CONSTRICT").length, tag).toBeLessThanOrEqual(1);
			expect(
				runOf(h, "SPIRE_GROWTH_QUICK_TACKLE", 3) || runOf(h, "SPIRE_GROWTH_SMASH", 3),
				tag,
			).toBe(false);
			break;
		case "WRITHING_MASS":
			// (first executed move may be a Reactive re-roll, so the first-turn rule is tested separately)
			expect(h.filter((x) => x === "WRITHING_MASS_IMPLANT").length, tag).toBeLessThanOrEqual(1);
			break;
	}
}

function checkIntents(s: GameState): void {
	for (const m of s.combat?.monsters ?? []) {
		if (!m.alive && !m.halfDead) continue;
		const id = m.intent.moveId as string;
		expect(getMonster(m.id)?.moves[id], `${m.id}@${m.index} intent ${id}`).toBeDefined();
	}
}

/** Up to 10 real turns, one Strike per turn (keeps Reactive / Shifting / Malleable / Thorns busy). */
function soak(enc: string, seed: bigint, asc: number): number {
	let s = startFight(enc, seed, [card("STRIKE_RED", 1), ...defends(9)], asc);
	let turns = 0;
	while (turns < 10 && inCombat(s)) {
		checkIntents(s);
		const target = s.combat?.monsters.find((m) => m.alive && m.currentHp > 6);
		if (target && s.combat?.hand.some((c) => c.id === "STRIKE_RED")) {
			s = playCard(s, "STRIKE_RED", target.index);
		}
		if (!inCombat(s)) break;
		s = endTurn(s);
		turns++;
		for (const m of s.combat?.monsters ?? []) checkHistory(m);
	}
	expect(s.currentHp).toBeGreaterThan(0);
	return turns;
}

describe("10-turn soak (real turn loop, 999 HP player)", () => {
	const encounters = [
		"THREE_DARKLINGS",
		"ORB_WALKER",
		"THREE_SHAPES",
		"FOUR_SHAPES",
		"SPHERE_AND_TWO_SHAPES",
		"TRANSIENT",
		"MAW",
		"SPIRE_GROWTH",
		"WRITHING_MASS",
	];
	for (const enc of encounters) {
		it(enc, () => {
			for (const asc of [0, 17]) {
				for (let seed = 1n; seed <= 6n; seed++) {
					// Transient fades after 5-6 turns; everything else lasts all 10
					expect(soak(enc, seed, asc)).toBe(enc === "TRANSIENT" ? (asc >= 17 ? 6 : 5) : 10);
				}
			}
		});
	}
});
