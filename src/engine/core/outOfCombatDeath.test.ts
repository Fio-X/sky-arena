/**
 * Death and healing outside combat, through real event / rest / act commands:
 * at 0 HP Fairy in a Bottle and Lizard Tail still save the player, otherwise
 * the run ends; Mark of the Bloom stops every heal (and both saves).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { base, loadRunData, run } from "../content/relicsRunTestHelpers";
import { startNextAct } from "./act";
import type { GameState, PotionId } from "./types";

beforeAll(loadRunData);

const goop = (s: GameState): GameState =>
	run(
		{ ...s, phase: { type: "event", eventId: "WORLD_OF_GOOP" } },
		{
			type: "chooseEventOption",
			index: 0, // Gather Gold: +75 gold, lose 11 HP
		},
	);

const withHp = (relics: string[], hp: number): GameState => ({
	...base(["event"], relics),
	currentHp: hp,
});

describe("0 HP from an event", () => {
	it("no save: the run ends", () => {
		const s = goop(withHp([], 5));
		expect(s.currentHp).toBe(0);
		expect(s.phase).toEqual({ type: "gameOver", victory: false });
	});

	it("Lizard Tail: back to 50% of max HP, used up, the event goes on", () => {
		const s = goop(withHp(["LIZARD_TAIL"], 5));
		expect(s.currentHp).toBe(40);
		expect(s.phase.type).toBe("map");
		expect(s.gold).toBe(175);
		const again = goop({ ...s, currentHp: 5 });
		expect(again.phase).toEqual({ type: "gameOver", victory: false });
	});

	it("Fairy in a Bottle: 30% of max HP, the potion is gone, checked before Lizard Tail", () => {
		const s = goop({
			...withHp(["LIZARD_TAIL"], 5),
			potions: ["FAIRY_POTION" as PotionId, null, null],
		});
		expect(s.currentHp).toBe(24);
		expect(s.potions).toEqual([null, null, null]);
		expect(s.relics.find((r) => r.id === "LIZARD_TAIL")?.counter).not.toBe(-2);
	});

	it("Mark of the Bloom: neither saves", () => {
		const s = goop({
			...withHp(["LIZARD_TAIL", "MARK_OF_THE_BLOOM"], 5),
			potions: ["FAIRY_POTION" as PotionId, null, null],
		});
		expect(s.phase).toEqual({ type: "gameOver", victory: false });
	});

	it("other event helpers too: The Nest (Act 2) and the Designer's Punch (Act 3)", () => {
		const nest = run(
			{ ...withHp(["LIZARD_TAIL"], 6), phase: { type: "event", eventId: "THE_NEST" } },
			{ type: "chooseEventOption", index: 1 },
		);
		expect(nest.currentHp).toBe(40);
		expect(nest.deck.some((c) => c.id === "RITUAL_DAGGER")).toBe(true);

		const designer: GameState = {
			...withHp([], 3),
			phase: {
				type: "event",
				eventId: "DESIGNER_IN_SPIRE",
				screen: 1,
				data: { upgradeOne: 0, removes: 0 },
			},
		};
		const punched = run(designer, { type: "chooseEventOption", index: 3 });
		expect(punched.phase).toEqual({ type: "gameOver", victory: false });
	});
});

describe("Mark of the Bloom outside combat", () => {
	it("resting heals nothing", () => {
		const plain = run({ ...base(["rest"]), phase: { type: "rest" } }, { type: "rest" });
		expect(plain.currentHp).toBe(74);
		const bloom = run(
			{ ...base(["rest"], ["MARK_OF_THE_BLOOM"]), phase: { type: "rest" } },
			{ type: "rest" },
		);
		expect(bloom.currentHp).toBe(50);
		expect(bloom.phase.type).toBe("map");
	});

	it("the heal between acts is skipped", () => {
		expect(startNextAct(base()).currentHp).toBe(80);
		expect(startNextAct(base([], ["MARK_OF_THE_BLOOM"])).currentHp).toBe(50);
	});
});
