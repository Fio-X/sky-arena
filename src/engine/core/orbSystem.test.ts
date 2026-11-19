import { describe, expect, test } from "vitest";
import {
	addOrbSlots,
	channelOrb,
	evokeOrb,
	removeAllOrbs,
	removeOrbSlot,
	triggerOrbPassives,
} from "./orbSystem";
import { makeCombat, makeState } from "./testHelpers";
import type { GameEvent, OrbInstance, OrbType, PowerId } from "./types";

function orbCombat(orbs: OrbInstance[] = [], orbSlots = 3) {
	return makeCombat({
		player: { block: 0, powers: [], stance: "neutral" as const, orbs, orbSlots },
	});
}

function orb(type: OrbType): OrbInstance {
	const defaults: Record<OrbType, OrbInstance> = {
		lightning: { type: "lightning", passive: 3, evoke: 8 },
		frost: { type: "frost", passive: 2, evoke: 5 },
		dark: { type: "dark", passive: 6, evoke: 0 },
		plasma: { type: "plasma", passive: 1, evoke: 2 },
		empty: { type: "empty", passive: 0, evoke: 0 },
	};
	return defaults[type];
}

describe("channelOrb", () => {
	test("adds orb to empty slots", () => {
		const state = makeState(orbCombat([], 3));
		const events: GameEvent[] = [];
		const result = channelOrb(state, "lightning", events);
		const orbs = result.state.combat!.player.orbs;
		expect(orbs).toHaveLength(1);
		expect(orbs[0]!.type).toBe("lightning");
		expect(events.some((e) => e.type === "orbChanneled")).toBe(true);
	});

	test("evokes leftmost orb when slots full", () => {
		const state = makeState(orbCombat([orb("frost"), orb("frost"), orb("lightning")], 3));
		const events: GameEvent[] = [];
		const result = channelOrb(state, "dark", events);
		const orbs = result.state.combat!.player.orbs;
		expect(orbs).toHaveLength(3);
		expect(orbs[0]!.type).toBe("frost");
		expect(orbs[2]!.type).toBe("dark");
		expect(events.some((e) => e.type === "orbEvoked" && e.orbType === "frost")).toBe(true);
	});
});

describe("evokeOrb", () => {
	test("lightning evoke deals damage to a monster", () => {
		const state = makeState(orbCombat([orb("lightning")]));
		const events: GameEvent[] = [];
		const result = evokeOrb(state, 1, events);
		expect(result.state.combat!.player.orbs).toHaveLength(0);
		const monster = result.state.combat!.monsters[0]!;
		expect(monster.currentHp).toBeLessThan(44);
	});

	test("frost evoke gives block to player", () => {
		const state = makeState(orbCombat([orb("frost")]));
		const events: GameEvent[] = [];
		const result = evokeOrb(state, 1, events);
		expect(result.state.combat!.player.block).toBeGreaterThan(0);
	});

	test("plasma evoke gives 2 energy", () => {
		const state = makeState(orbCombat([orb("plasma")]));
		const events: GameEvent[] = [];
		const result = evokeOrb(state, 1, events);
		expect(result.state.combat!.energy).toBe(5);
	});

	test("evoke multiple times", () => {
		const state = makeState(orbCombat([orb("plasma"), orb("plasma")]));
		const events: GameEvent[] = [];
		const result = evokeOrb(state, 2, events);
		expect(result.state.combat!.player.orbs).toHaveLength(0);
		expect(result.state.combat!.energy).toBe(7);
	});
});

describe("triggerOrbPassives", () => {
	test("lightning passive deals damage", () => {
		const state = makeState(orbCombat([orb("lightning")]));
		const events: GameEvent[] = [];
		const result = triggerOrbPassives(state, events);
		const monster = result.state.combat!.monsters[0]!;
		expect(monster.currentHp).toBeLessThan(44);
	});

	test("frost passive gives block", () => {
		const state = makeState(orbCombat([orb("frost")]));
		const events: GameEvent[] = [];
		const result = triggerOrbPassives(state, events);
		expect(result.state.combat!.player.block).toBe(2);
	});

	test("dark passive accumulates damage", () => {
		const state = makeState(orbCombat([orb("dark")]));
		const events: GameEvent[] = [];
		const result = triggerOrbPassives(state, events);
		const darkOrb = result.state.combat!.player.orbs[0]!;
		expect(darkOrb.passive).toBe(12);
	});

	test("plasma passive gives 1 energy", () => {
		const state = makeState(orbCombat([orb("plasma")]));
		const events: GameEvent[] = [];
		const result = triggerOrbPassives(state, events);
		expect(result.state.combat!.energy).toBe(4);
	});

	test("focus increases passive values", () => {
		const combat = orbCombat([orb("frost")]);
		const withFocus = {
			...combat,
			player: {
				...combat.player,
				powers: [{ id: "FOCUS" as PowerId, amount: 3, justApplied: false }],
			},
		};
		const state = makeState(withFocus);
		const events: GameEvent[] = [];
		const result = triggerOrbPassives(state, events);
		expect(result.state.combat!.player.block).toBe(5);
	});
});

describe("orb slot management", () => {
	test("addOrbSlots increases capacity", () => {
		const state = makeState(orbCombat([], 3));
		const result = addOrbSlots(state, 2);
		expect(result.combat!.player.orbSlots).toBe(5);
	});

	test("removeOrbSlot decreases capacity and evicts excess", () => {
		const state = makeState(orbCombat([orb("lightning"), orb("frost"), orb("dark")], 3));
		const result = removeOrbSlot(state);
		expect(result.combat!.player.orbSlots).toBe(2);
		expect(result.combat!.player.orbs).toHaveLength(2);
	});

	test("removeAllOrbs clears orbs and returns them", () => {
		const state = makeState(orbCombat([orb("lightning"), orb("frost")]));
		const result = removeAllOrbs(state);
		expect(result.state.combat!.player.orbs).toHaveLength(0);
		expect(result.orbs).toHaveLength(2);
	});
});
