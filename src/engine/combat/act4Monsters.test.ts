/**
 * Act 4 through the real step() loop: Spire Shield + Spire Spear (Surrounded,
 * Back Attack, turning around, the 3-turn cycles) and the Corrupt Heart
 * (Debilitate, Beat of Death, Invincible, the BUFF ladder).
 */
import { beforeAll, describe, expect, it } from "vitest";
import potionsJson from "../../../data-reference/potions.json";
import { loadPotions } from "../content/loader";
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
import { canUsePotion } from "../core/potion";
import { step } from "../core/step";
import type { GameState, MonsterMoveId, PotionId, PowerId } from "../core/types";

beforeAll(() => {
	loadAllData();
	loadPotions(potionsJson as never);
});

const SHIELD = 0;
const SPEAR = 1;
const HEART = 0;

const strikes = (n: number) => Array.from({ length: n }, (_, i) => card("STRIKE_RED", i + 1));
const mixed = () => [
	...strikes(5),
	...Array.from({ length: 5 }, (_, i) => card("DEFEND_RED", i + 6)),
];

function tank(s: GameState, hp = 1_000_000): GameState {
	return { ...s, currentHp: hp, maxHp: hp };
}

const energy = (s: GameState, n = 99): GameState =>
	s.combat ? { ...s, combat: { ...s.combat, energy: n } } : s;

const backAttackers = (s: GameState) =>
	(s.combat?.monsters ?? [])
		.filter((m) => powerAmount(m, "BACK_ATTACK") !== undefined)
		.map((m) => m.index);

const playerPower = (s: GameState, id: string) =>
	powerAmount(s.combat?.player ?? { powers: [] }, id);

function countAll(s: GameState, id: string): number {
	const c = s.combat;
	if (!c) return 0;
	return [...c.hand, ...c.drawPile, ...c.discardPile].filter((x) => x.id === id).length;
}

/** HP the player loses over one end of turn. */
function hpLostOver(s: GameState): { lost: number; after: GameState } {
	const after = endTurn(s);
	return { lost: s.currentHp - after.currentHp, after };
}

function addMonsterPower(s: GameState, i: number, id: string, amount: number): GameState {
	return patchMonster(s, i, {
		powers: [...monsterAt(s, i).powers, { id: id as PowerId, amount, justApplied: false }],
	});
}

function runHistory(
	encounter: string,
	seed: bigint,
	turns: number,
	index: number,
): MonsterMoveId[] {
	let s = tank(startFight(encounter, seed, strikes(10)), 1e12);
	for (let t = 0; t < turns; t++) s = endTurn(s);
	return [...monsterAt(s, index).moveHistory];
}

// ── Spire Shield & Spire Spear ──────────────────────────────

describe("Shield and Spear: setup", () => {
	it("layout, HP, Artifact; the player is Surrounded and the Shield (left) attacks from behind", () => {
		const s = startFight("SHIELD_AND_SPEAR");
		expect(monsterAt(s, SHIELD).id).toBe("SPIRE_SHIELD");
		expect(monsterAt(s, SPEAR).id).toBe("SPIRE_SPEAR");
		expect(monsterAt(s, SHIELD).maxHp).toBe(110);
		expect(monsterAt(s, SPEAR).maxHp).toBe(160);
		expect(playerPower(s, "SURROUNDED")).toBe(1);
		expect(backAttackers(s)).toEqual([SHIELD]);
		for (const i of [SHIELD, SPEAR]) {
			expect(powerAmount(monsterAt(s, i), "SURROUNDED")).toBeUndefined();
			expect(powerAmount(monsterAt(s, i), "ARTIFACT")).toBe(1);
		}
		expect(monsterAt(s, SPEAR).intent.moveId).toBe("SPIRE_SPEAR_BURN_STRIKE");
		expect(["SPIRE_SHIELD_FORTIFY", "SPIRE_SHIELD_BASH"]).toContain(
			monsterAt(s, SHIELD).intent.moveId,
		);
	});

	it("ascension: HP 125/180 (A8), Artifact 2 (A18)", () => {
		const a8 = startFight("SHIELD_AND_SPEAR", 1n, undefined, 8);
		expect(monsterAt(a8, SHIELD).maxHp).toBe(125);
		expect(monsterAt(a8, SPEAR).maxHp).toBe(180);
		expect(powerAmount(monsterAt(a8, SHIELD), "ARTIFACT")).toBe(1);
		const a18 = startFight("SHIELD_AND_SPEAR", 1n, undefined, 18);
		for (const i of [SHIELD, SPEAR]) expect(powerAmount(monsterAt(a18, i), "ARTIFACT")).toBe(2);
	});
});

describe("Shield and Spear: Back Attack and turning around", () => {
	function quiet(s: GameState, attacker: number, move: string): GameState {
		const other = attacker === SHIELD ? SPEAR : SHIELD;
		const idle = other === SHIELD ? "SPIRE_SHIELD_FORTIFY" : "SPIRE_SPEAR_PIERCER";
		return forceMove(forceMove(s, attacker, move), other, idle);
	}

	it("the monster behind deals x1.5; the one in front deals normal damage", () => {
		const s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		expect(hpLostOver(quiet(s, SHIELD, "SPIRE_SHIELD_BASH")).lost).toBe(18); // 12 x 1.5
		expect(hpLostOver(quiet(s, SPEAR, "SPIRE_SPEAR_BURN_STRIKE")).lost).toBe(10); // 5 x 2
	});

	it("targeting the monster behind with a card turns the player: Back Attack moves", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		s = playCard(s, "STRIKE_RED", SHIELD);
		expect(backAttackers(s)).toEqual([SPEAR]);
		expect(hpLostOver(quiet(s, SHIELD, "SPIRE_SHIELD_BASH")).lost).toBe(12);
		expect(hpLostOver(quiet(s, SPEAR, "SPIRE_SPEAR_BURN_STRIKE")).lost).toBe(14); // floor(7.5) x 2
		s = playCard(s, "STRIKE_RED", SPEAR);
		expect(backAttackers(s)).toEqual([SHIELD]);
	});

	it("targeting the monster in front, or an untargeted card, does not turn the player", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, mixed()));
		s = playCard(s, "STRIKE_RED", SPEAR);
		s = playCard(s, "DEFEND_RED");
		expect(backAttackers(s)).toEqual([SHIELD]);
	});

	it("a targeted potion turns the player too", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		s = { ...s, potions: ["FIRE_POTION" as PotionId, null, null] };
		s = step(s, { type: "usePotion", index: 0, targetIndex: SHIELD }).state;
		expect(s.potions[0]).toBeNull();
		expect(backAttackers(s)).toEqual([SPEAR]);
	});

	it("when one dies: Surrounded and Back Attack are removed; Smoke Bomb becomes usable", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		expect(canUsePotion(s, "SMOKE_BOMB" as PotionId)).toBe(false);
		s = patchMonster(s, SPEAR, { currentHp: 3 });
		s = playCard(s, "STRIKE_RED", SPEAR);
		expect(monsterAt(s, SPEAR).alive).toBe(false);
		expect(playerPower(s, "SURROUNDED")).toBeUndefined();
		expect(backAttackers(s)).toEqual([]);
		expect(canUsePotion(s, "SMOKE_BOMB" as PotionId)).toBe(true);
		s = forceMove(s, SHIELD, "SPIRE_SHIELD_BASH");
		expect(hpLostOver(s).lost).toBe(12);
	});
});

describe("Spire Shield moves", () => {
	it("BASH: -1 Strength without orbs; a Defect loses Focus or Strength (one aiRng coin)", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		s = forceMove(forceMove(s, SHIELD, "SPIRE_SHIELD_BASH"), SPEAR, "SPIRE_SPEAR_PIERCER");
		const iron = endTurn(s);
		expect(playerPower(iron, "STRENGTH")).toBe(-1);
		const defect = endTurn({ ...s, character: "DEFECT" });
		const lost = [playerPower(defect, "FOCUS"), playerPower(defect, "STRENGTH")];
		expect(lost.filter((x) => x === -1)).toHaveLength(1);
		expect(defect.rng.aiRng.counter).toBe(iron.rng.aiRng.counter + 1);
	});

	it("FORTIFY: Shield and Spear each gain 30 Block", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		s = forceMove(forceMove(s, SHIELD, "SPIRE_SHIELD_FORTIFY"), SPEAR, "SPIRE_SPEAR_PIERCER");
		s = endTurn(s);
		expect(monsterAt(s, SHIELD).block).toBe(30);
		expect(monsterAt(s, SPEAR).block).toBe(30);
	});

	it("SMASH: block = the damage dealt (Back Attack included); A18: flat 99", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		s = forceMove(forceMove(s, SHIELD, "SPIRE_SHIELD_SMASH"), SPEAR, "SPIRE_SPEAR_PIERCER");
		const behind = hpLostOver(s);
		expect(behind.lost).toBe(51); // 34 x 1.5
		expect(monsterAt(behind.after, SHIELD).block).toBe(51);
		const faced = hpLostOver(playCard(s, "STRIKE_RED", SHIELD));
		expect(faced.lost).toBe(34);
		expect(monsterAt(faced.after, SHIELD).block).toBe(34);

		let a18 = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10), 18));
		a18 = forceMove(forceMove(a18, SHIELD, "SPIRE_SHIELD_SMASH"), SPEAR, "SPIRE_SPEAR_PIERCER");
		const r = hpLostOver(a18);
		expect(r.lost).toBe(57); // 38 x 1.5
		expect(monsterAt(r.after, SHIELD).block).toBe(99);
	});

	it("cycle: SMASH on turns 3, 6, 9; BASH and FORTIFY once each in between", () => {
		const firsts = new Set<string>();
		for (let seed = 1n; seed <= 12n; seed++) {
			const h = runHistory("SHIELD_AND_SPEAR", seed, 9, SHIELD);
			for (const t of [2, 5, 8]) expect(h[t]).toBe("SPIRE_SHIELD_SMASH");
			for (const t of [0, 3, 6]) {
				expect([h[t], h[t + 1]].sort()).toEqual(["SPIRE_SHIELD_BASH", "SPIRE_SHIELD_FORTIFY"]);
				firsts.add(h[t] as string);
			}
		}
		expect(firsts.size).toBe(2);
	});
});

describe("Spire Spear moves", () => {
	it("BURN_STRIKE: 2 Burns into the discard pile; A18: on top of the draw pile", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		s = forceMove(s, SHIELD, "SPIRE_SHIELD_FORTIFY");
		s = endTurn(s);
		expect(s.combat?.discardPile.filter((c) => c.id === "BURN")).toHaveLength(2);

		let a18 = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10), 18));
		a18 = forceMove(a18, SHIELD, "SPIRE_SHIELD_FORTIFY");
		a18 = endTurn(a18);
		// Drawn straight away at the start of the next turn.
		expect(a18.combat?.hand.filter((c) => c.id === "BURN")).toHaveLength(2);
		expect(a18.combat?.discardPile.filter((c) => c.id === "BURN")).toHaveLength(0);
	});

	it("PIERCER: Shield and Spear each gain 2 Strength", () => {
		let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10)));
		s = forceMove(forceMove(s, SHIELD, "SPIRE_SHIELD_FORTIFY"), SPEAR, "SPIRE_SPEAR_PIERCER");
		s = endTurn(s);
		expect(powerAmount(monsterAt(s, SHIELD), "STRENGTH")).toBe(2);
		expect(powerAmount(monsterAt(s, SPEAR), "STRENGTH")).toBe(2);
	});

	it("SKEWER: 10 x 3 (A3: x 4)", () => {
		const skewer = (asc: number) => {
			let s = tank(startFight("SHIELD_AND_SPEAR", 1n, strikes(10), asc));
			s = forceMove(forceMove(s, SHIELD, "SPIRE_SHIELD_FORTIFY"), SPEAR, "SPIRE_SPEAR_SKEWER");
			return hpLostOver(s).lost;
		};
		expect(skewer(0)).toBe(30);
		expect(skewer(3)).toBe(40);
	});

	it("cycle: BURN_STRIKE first, SKEWER on turns 2, 5, 8; BURN_STRIKE and PIERCER once each in between", () => {
		const firsts = new Set<string>();
		for (let seed = 1n; seed <= 12n; seed++) {
			const h = runHistory("SHIELD_AND_SPEAR", seed, 8, SPEAR);
			expect(h[0]).toBe("SPIRE_SPEAR_BURN_STRIKE");
			for (const t of [1, 4, 7]) expect(h[t]).toBe("SPIRE_SPEAR_SKEWER");
			for (const t of [2, 5]) {
				expect([h[t], h[t + 1]].sort()).toEqual(["SPIRE_SPEAR_BURN_STRIKE", "SPIRE_SPEAR_PIERCER"]);
				firsts.add(h[t] as string);
			}
		}
		expect(firsts.size).toBe(2);
	});
});

// ── Corrupt Heart ───────────────────────────────────────────

describe("Corrupt Heart", () => {
	it("prebattle: 750 HP, Beat of Death 1, Invincible 300; A9 800 HP; A19 2 / 200", () => {
		const s = startFight("CORRUPT_HEART");
		const h = monsterAt(s, HEART);
		expect(h.maxHp).toBe(750);
		expect(powerAmount(h, "BEAT_OF_DEATH")).toBe(1);
		expect(powerAmount(h, "INVINCIBLE")).toBe(300);
		expect(h.intent.moveId).toBe("CORRUPT_HEART_DEBILITATE");
		expect(monsterAt(startFight("CORRUPT_HEART", 1n, undefined, 9), HEART).maxHp).toBe(800);
		const a19 = monsterAt(startFight("CORRUPT_HEART", 1n, undefined, 19), HEART);
		expect(powerAmount(a19, "BEAT_OF_DEATH")).toBe(2);
		expect(powerAmount(a19, "INVINCIBLE")).toBe(200);
	});

	it("DEBILITATE: Vulnerable/Weak/Frail 2 and one each of Dazed, Slimed, Wound, Burn, Void", () => {
		const s = endTurn(tank(startFight("CORRUPT_HEART", 1n, strikes(10))));
		for (const id of ["VULNERABLE", "WEAK", "FRAIL"]) expect(playerPower(s, id)).toBe(2);
		for (const id of ["DAZED", "SLIMED", "WOUND", "BURN", "VOID"]) expect(countAll(s, id)).toBe(1);
	});

	it("Beat of Death: every card played deals X damage to the player (blockable)", () => {
		let s = energy(tank(startFight("CORRUPT_HEART", 1n, mixed())));
		const hp = s.currentHp;
		s = playCard(s, "STRIKE_RED", HEART);
		expect(hp - s.currentHp).toBe(1);
		s = playCard(s, "DEFEND_RED");
		expect(s.combat?.player.block).toBe(4);
		expect(hp - s.currentHp).toBe(1);

		let a19 = energy(tank(startFight("CORRUPT_HEART", 1n, strikes(10), 19)));
		a19 = playCard(a19, "STRIKE_RED", HEART);
		expect(1_000_000 - a19.currentHp).toBe(2);
	});

	it("Invincible: HP loss per turn is capped (after block) and refills at the Heart's turn", () => {
		let s = energy(tank(startFight("CORRUPT_HEART", 1n, strikes(10))));
		s = patchMonster(s, HEART, {
			block: 5,
			powers: monsterAt(s, HEART).powers.map((p) =>
				p.id.toUpperCase() === "INVINCIBLE" ? { ...p, amount: 4 } : p,
			),
		});
		const hp0 = monsterAt(s, HEART).currentHp;
		s = playCard(s, "STRIKE_RED", HEART); // 5 blocked, 1 HP
		expect(hp0 - monsterAt(s, HEART).currentHp).toBe(1);
		expect(powerAmount(monsterAt(s, HEART), "INVINCIBLE")).toBe(3);
		s = playCard(s, "STRIKE_RED", HEART); // 6 → capped at 3
		expect(hp0 - monsterAt(s, HEART).currentHp).toBe(4);
		s = playCard(s, "STRIKE_RED", HEART); // cap spent
		expect(hp0 - monsterAt(s, HEART).currentHp).toBe(4);
		expect(powerAmount(monsterAt(s, HEART), "INVINCIBLE")).toBe(0);
		s = endTurn(s);
		expect(powerAmount(monsterAt(s, HEART), "INVINCIBLE")).toBe(300);
	});

	it("Invincible caps a full turn of attacks at 300", () => {
		let s = energy(tank(startFight("CORRUPT_HEART", 1n, strikes(10))));
		s = {
			...s,
			combat: s.combat && {
				...s.combat,
				player: {
					...s.combat.player,
					powers: [{ id: "strength" as PowerId, amount: 200, justApplied: false }],
				},
			},
		};
		s = playCard(s, "STRIKE_RED", HEART);
		s = playCard(s, "STRIKE_RED", HEART);
		expect(monsterAt(s, HEART).currentHp).toBe(750 - 300);
	});

	it("attacks: Blood Shots 2 x 12 (A4: x 15), Echo 40 (A4: 45)", () => {
		const hit = (move: string, asc: number) =>
			hpLostOver(forceMove(tank(startFight("CORRUPT_HEART", 1n, strikes(10), asc)), HEART, move))
				.lost;
		expect(hit("CORRUPT_HEART_BLOOD_SHOTS", 0)).toBe(24);
		expect(hit("CORRUPT_HEART_BLOOD_SHOTS", 4)).toBe(30);
		expect(hit("CORRUPT_HEART_ECHO", 0)).toBe(40);
		expect(hit("CORRUPT_HEART_ECHO", 4)).toBe(45);
	});

	it("BUFF clears negative Strength before adding 2", () => {
		let s = tank(startFight("CORRUPT_HEART", 1n, strikes(10)));
		s = addMonsterPower(s, HEART, "strength", -5);
		s = endTurn(forceMove(s, HEART, "CORRUPT_HEART_BUFF"));
		expect(powerAmount(monsterAt(s, HEART), "STRENGTH")).toBe(2);
		expect(powerAmount(monsterAt(s, HEART), "ARTIFACT")).toBe(2);
	});

	it("Painful Stabs (3rd BUFF): each unblocked Blood Shots hit adds a Wound", () => {
		let s = tank(startFight("CORRUPT_HEART", 1n, strikes(10)));
		const buff = "CORRUPT_HEART_BUFF" as MonsterMoveId;
		s = patchMonster(s, HEART, { moveHistory: [buff, buff] });
		s = endTurn(forceMove(s, HEART, "CORRUPT_HEART_BUFF"));
		expect(powerAmount(monsterAt(s, HEART), "PAINFUL_STABS")).toBe(1);
		s = endTurn(forceMove(s, HEART, "CORRUPT_HEART_BLOOD_SHOTS"));
		expect(countAll(s, "WOUND")).toBe(12);
	});

	it("cycle: DEBILITATE, attack pairs, BUFF every 3rd turn from turn 4 with the escalating buffs", () => {
		const firsts = new Set<string>();
		const attacks = ["CORRUPT_HEART_BLOOD_SHOTS", "CORRUPT_HEART_ECHO"];
		for (let seed = 1n; seed <= 8n; seed++) {
			let s = tank(startFight("CORRUPT_HEART", seed, strikes(10)), 1e12);
			const str: number[] = [];
			for (let t = 1; t <= 19; t++) {
				s = endTurn(s);
				if (t % 3 === 1 && t > 1) str.push(powerAmount(monsterAt(s, HEART), "STRENGTH") ?? 0);
			}
			const h = monsterAt(s, HEART).moveHistory;
			expect(h[0]).toBe("CORRUPT_HEART_DEBILITATE");
			for (let t = 3; t < 19; t += 3) expect(h[t]).toBe("CORRUPT_HEART_BUFF");
			for (let t = 1; t < 19; t += 3) {
				expect([h[t], h[t + 1]].sort()).toEqual(attacks);
				firsts.add(h[t] as string);
			}
			// Turns 4, 7, 10, 13, 16, 19: +2 each, plus +10 (4th) and +50 (5th, 6th).
			expect(str).toEqual([2, 4, 6, 18, 70, 122]);
			const heart = monsterAt(s, HEART);
			expect(powerAmount(heart, "BEAT_OF_DEATH")).toBe(2);
			expect(powerAmount(heart, "PAINFUL_STABS")).toBe(1);
			expect(powerAmount(heart, "ARTIFACT")).toBe(2);
		}
		expect(firsts.size).toBe(2);
	});
});
