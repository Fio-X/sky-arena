/** "?" rooms, event pools, the handler registry, event fights and event deck picks. */
import { beforeAll, describe, expect, it } from "vitest";
import { base, enter, linearMap, loadRunData, run } from "../content/relicsRunTestHelpers";
import { startEventCombat } from "./eventCombat";
import { eventScreen, leaveEvent, registerEvent } from "./eventRegistry";
import { generateEvent, newEventPools, rollQuestionRoom } from "./eventRoom";
import { patchMonster, playCard } from "./fightTestHelpers";
import { obtainRelic } from "./obtain";
import type { GameState, RelicId } from "./types";

beforeAll(() => {
	loadRunData();
	// A two-screen test event: screen 0 → screen 1 (or a fight), screen 1 → remove a card.
	registerEvent("TEST_EVENT", {
		options: (s) => {
			const screen = s.phase.type === "event" ? (s.phase.screen ?? 0) : 0;
			if (screen === 0) {
				return [
					{ label: "Next" },
					{ label: "Too poor", disabled: s.gold < 1000 },
					{ label: "Fight" },
				];
			}
			return [{ label: "Remove a card" }, { label: "Leave" }];
		},
		choose: (s, i, events) => {
			const screen = s.phase.type === "event" ? (s.phase.screen ?? 0) : 0;
			if (screen === 0 && i === 0) return eventScreen(s, 1, { picked: 7 });
			if (screen === 0 && i === 2) {
				return startEventCombat(s, "CULTIST", { gold: 30, relics: ["rare"] }, events);
			}
			if (i === 0) {
				return {
					...s,
					phase: { type: "deckSelect", task: "remove", count: 1, next: { type: "map" } },
				};
			}
			return leaveEvent(s);
		},
	});
});

const inEvent = (s: GameState): GameState => ({
	...s,
	phase: { type: "event", eventId: "TEST_EVENT" },
});

describe('"?" room roll', () => {
	it("chances grow when missed and reset when hit", () => {
		let s: GameState = { ...base(), eventPools: newEventPools(1) };
		const seen = new Set<string>();
		for (let i = 0; i < 40; i++) {
			const before = s.eventPools?.chances.monster ?? 0;
			const r = rollQuestionRoom(s);
			s = r.state;
			seen.add(r.room);
			const after = s.eventPools?.chances.monster ?? 0;
			expect(after).toBeCloseTo(r.room === "monster" ? 0.1 : before + 0.1);
		}
		expect(seen.has("event")).toBe(true);
		expect(seen.has("monster")).toBe(true);
	});

	it("Juzu Bracelet turns a monster result into an event", () => {
		const sure = { ...newEventPools(1), chances: { monster: 1, shop: 0, treasure: 0 } };
		const plain = rollQuestionRoom({ ...base(), eventPools: sure });
		expect(plain.room).toBe("monster");
		const juzu = obtainRelic({ ...base(), eventPools: sure }, "JUZU_BRACELET" as RelicId);
		expect(rollQuestionRoom(juzu).room).toBe("event");
	});

	it("a monster result starts a normal fight", () => {
		const s = enter(
			{
				...base(["event"]),
				eventPools: { ...newEventPools(1), chances: { monster: 1, shop: 0, treasure: 0 } },
			},
			0,
		);
		expect(s.phase.type).toBe("combat");
	});
});

describe("event pools", () => {
	it("a picked event leaves the pool; spawn conditions are checked", () => {
		const pools = {
			...newEventPools(1),
			events: ["THE_CLERIC", "BIG_FISH"],
			shrines: [],
			oneTime: [],
		};
		const poor: GameState = { ...base(), gold: 0, eventPools: pools };
		const first = generateEvent(poor);
		expect(first.eventId).toBe("BIG_FISH"); // The Cleric needs 35 gold
		expect(first.state.eventPools?.events).toEqual(["THE_CLERIC"]);
	});

	it("one-time events are shared with shrines and last across acts", () => {
		const pools = { ...newEventPools(1), events: [], shrines: [], oneTime: ["LAB"] };
		const r = generateEvent({ ...base(), eventPools: pools });
		expect(r.eventId).toBe("LAB");
		expect(r.state.eventPools?.oneTime).toEqual([]);
		expect(newEventPools(2, r.state.eventPools).oneTime).toEqual([]);
		expect(newEventPools(2, r.state.eventPools).events).toContain("THE_LIBRARY");
	});
});

describe("handlers", () => {
	it("screens, data and disabled choices", () => {
		let s = inEvent({ ...base(), gold: 10 });
		s = run(s, { type: "chooseEventOption", index: 1 }); // disabled: nothing happens
		expect(s.phase).toEqual({ type: "event", eventId: "TEST_EVENT" });
		s = run(s, { type: "chooseEventOption", index: 0 });
		expect(s.phase).toMatchObject({ type: "event", screen: 1, data: { picked: 7 } });
		s = run(s, { type: "chooseEventOption", index: 0 });
		expect(s.phase).toMatchObject({ type: "deckSelect", task: "remove" });
		s = run(s, { type: "chooseDeckCards", indices: [0] });
		expect(s.deck).toHaveLength(9);
		expect(s.phase.type).toBe("map");
	});

	it("event fights pay the event's rewards", () => {
		let s = run(inEvent(base()), { type: "chooseEventOption", index: 2 });
		expect(s.phase.type).toBe("combat");
		const gold = s.gold;
		const relics = s.relics.length;
		s = playCard(patchMonster(s, 0, { currentHp: 1 }), "STRIKE_RED");
		expect(s.phase).toMatchObject({ type: "reward", gold: 30, cardRewards: [] });
		expect(s.gold).toBe(gold + 30);
		expect(s.relics).toHaveLength(relics + 1);
		expect(s.eventCombat).toBeUndefined();
	});

	it("an event fight with no rewards goes straight to its next phase", () => {
		const events: never[] = [];
		let s = startEventCombat(
			{ ...base(), map: linearMap(["event"]) },
			"CULTIST",
			{ none: true, next: { type: "event", eventId: "TEST_EVENT", screen: 1 } },
			events,
		);
		s = playCard(patchMonster(s, 0, { currentHp: 1 }), "STRIKE_RED");
		expect(s.phase).toEqual({ type: "event", eventId: "TEST_EVENT", screen: 1 });
		expect(s.combat).toBeNull();
	});
});

describe("event deck picks", () => {
	const pick = (task: "upgrade" | "transform" | "duplicate", indices: number[]) =>
		run(
			{
				...base(),
				phase: { type: "deckSelect", task, count: indices.length, next: { type: "map" } },
			},
			{ type: "chooseDeckCards", indices },
		);

	it("upgrade, transform, duplicate", () => {
		expect(pick("upgrade", [0]).deck[0]?.upgraded).toBe(true);
		const t = pick("transform", [0]);
		expect(t.deck).toHaveLength(10);
		expect(t.deck.filter((c) => c.id === "STRIKE_RED")).toHaveLength(4);
		expect(pick("duplicate", [9]).deck).toHaveLength(11);
	});
});
