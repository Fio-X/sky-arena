import { beforeEach, describe, expect, it } from "vitest";
import {
	card,
	loadAllData,
	monsterAt,
	playCard,
	powerAmount,
	startFight,
} from "./fightTestHelpers";

beforeEach(() => loadAllData());

const deck = () => [
	{ ...card("RAGE", 1), costForTurn: 0 },
	...[2, 3, 4, 5, 6].map((uid) => card("STRIKE_RED", uid)),
];

describe("card play hooks", () => {
	// onUseCard used to be declared but never dispatched, so Rage did nothing.
	it("Rage: attacks played afterwards give block (onUseCard)", () => {
		let s = startFight("JAW_WORM", 1n, deck());
		s = playCard(s, "RAGE");
		expect(s.combat?.player.block).toBe(0);
		s = playCard(s, "STRIKE_RED", 0);
		expect(s.combat?.player.block).toBe(3);
		s = playCard(s, "STRIKE_RED", 0);
		expect(s.combat?.player.block).toBe(6);
	});

	// onAttack used to be declared but never dispatched, so Envenom did nothing.
	it("Envenom: unblocked attack damage applies Poison (onAttack)", () => {
		let s = startFight("JAW_WORM", 1n, deck());
		const c = s.combat;
		if (!c) throw new Error("no combat");
		const envenom = { id: "ENVENOM" as never, amount: 1, justApplied: false };
		s = { ...s, combat: { ...c, player: { ...c.player, powers: [envenom] } } };
		s = playCard(s, "STRIKE_RED", 0);
		expect(powerAmount(monsterAt(s, 0), "POISON")).toBe(1);
	});
});
