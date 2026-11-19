/**
 * Combat relics, part 1: start of combat, start of turn, energy.
 * Part 2 (card play, discard, shuffle, orbs, heal) is relicsCombat2.ts;
 * rules the original hardcodes in engine code are in relicsCombatRules.ts.
 *
 * Turn 1: the engine fires only atBattleStart at combat start (after the first
 * draw), while the original also runs the start-of-turn relics on turn 1. The
 * per-turn relics here therefore run from both atBattleStart and
 * atStartOfTurn (see everyTurn).
 */
import { drainActions } from "../core/actionExecutor";
import { addToBot } from "../core/actionQueue";
import { getCurrentRoomType } from "../core/bossReward";
import type { HookCtx, HookTable } from "../core/hooks";
import { registerRelicHooks } from "../core/hooks";
import { addOrbSlots } from "../core/orbSystem";
import type { Action, ActorRef, CardId, CardInstance, GameState, PowerId } from "../core/types";
import { random } from "../rng/stsRandom";
import { getAllCards, getCard } from "./loader";
import { relicVal, setRelicCounter } from "./relicHelpers";
import { relicCounter, USED_UP } from "./relicsCombatRules";

// ── Shared helpers (also used by relicsCombat2.ts) ───────

export const P: ActorRef = { type: "player" };
export const MAX_ORB_SLOTS = 10;

export function relic(id: string, hooks: Partial<HookTable>): void {
	registerRelicHooks(id, () => ({ relicId: id, hooks }));
}

export function power(target: ActorRef, id: string, amount: number): Action {
	return { type: "applyPower", source: P, target, powerId: id as PowerId, amount };
}

/** Queue actions without running them (hooks that fire inside an action drain). */
export function queue(state: GameState, actions: readonly Action[]): GameState {
	let s = state;
	for (const a of actions) if (s.combat) s = { ...s, combat: addToBot(s.combat, a) };
	return s;
}

/** Queue and run now: only for hooks that fire with an empty queue (battle / turn start). */
export function run(state: GameState, actions: readonly Action[]): GameState {
	return drainActions(queue(state, actions), []).state;
}

export function aliveMonsterRefs(state: GameState): ActorRef[] {
	return (state.combat?.monsters ?? [])
		.filter((m) => m.alive)
		.map((m) => ({ type: "monster", index: m.index }));
}

export function gainEnergy(state: GameState, amount: number): GameState {
	const c = state.combat;
	return c ? { ...state, combat: { ...c, energy: c.energy + amount } } : state;
}

export function nextUid(state: GameState): number {
	const c = state.combat;
	let uid = 1;
	const piles = c ? [c.hand, c.drawPile, c.discardPile, c.exhaustPile] : [];
	for (const card of [...state.deck, ...piles.flat()]) uid = Math.max(uid, card.uniqueId + 1);
	return uid;
}

/** The original's start-of-turn relics also fire on turn 1 (see file header). */
function everyTurn(fn: (ctx: HookCtx) => GameState): Partial<HookTable> {
	return { atBattleStart: fn, atStartOfTurn: fn };
}

function isEliteOrBoss(state: GameState): boolean {
	const room = getCurrentRoomType(state);
	return room === "elite" || room === "boss";
}

/** energyMaster +1 for this combat (Runic Dome, Slaver's Collar). */
function plusMaxEnergy(state: GameState): GameState {
	const c = state.combat;
	if (!c) return state;
	return { ...state, combat: { ...c, maxEnergy: c.maxEnergy + 1, energy: c.energy + 1 } };
}

function orbSlotsUpTo(state: GameState, count: number): GameState {
	const slots = state.combat?.player.orbSlots ?? MAX_ORB_SLOTS;
	return addOrbSlots(state, Math.max(0, Math.min(count, MAX_ORB_SLOTS - slots)));
}

const CLASS_COLOR: Record<string, string> = {
	IRONCLAD: "red",
	SILENT: "green",
	DEFECT: "blue",
	WATCHER: "purple",
};

// ═════════════════════════════════════════════════════════
// START OF COMBAT
// ═════════════════════════════════════════════════════════

relic("BAG_OF_PREPARATION", {
	atBattleStart: (ctx) =>
		run(ctx.state, [{ type: "drawCards", count: relicVal("BAG_OF_PREPARATION", 0, 2) }]),
});

relic("BLOOD_VIAL", {
	atBattleStart: (ctx) =>
		run(ctx.state, [{ type: "heal", target: P, amount: relicVal("BLOOD_VIAL", 0, 2) }]),
});

relic("CLOCKWORK_SOUVENIR", { atBattleStart: (ctx) => run(ctx.state, [power(P, "ARTIFACT", 1)]) });

relic("DATA_DISK", {
	atBattleStart: (ctx) => run(ctx.state, [power(P, "FOCUS", relicVal("DATA_DISK", 0, 1))]),
});

relic("GREMLIN_VISAGE", { atBattleStart: (ctx) => run(ctx.state, [power(P, "weak", 1)]) });

relic("MUTAGENIC_STRENGTH", {
	atBattleStart: (ctx) => run(ctx.state, [power(P, "strength", 3), power(P, "loseStrength", 3)]),
});

relic("SLING_OF_COURAGE", {
	atBattleStart: (ctx) =>
		getCurrentRoomType(ctx.state) === "elite"
			? run(ctx.state, [power(P, "strength", relicVal("SLING_OF_COURAGE", 0, 2))])
			: ctx.state,
});

relic("RED_MASK", {
	atBattleStart: (ctx) =>
		run(
			ctx.state,
			aliveMonsterRefs(ctx.state).map((m) => power(m, "weak", relicVal("RED_MASK", 0, 1))),
		),
});

relic("TWISTED_FUNNEL", {
	atBattleStart: (ctx) =>
		run(
			ctx.state,
			aliveMonsterRefs(ctx.state).map((m) => power(m, "POISON", 4)),
		),
});

const addToHand = (id: string, n: number): Action[] =>
	Array.from({ length: n }, () => ({
		type: "addCardToHand" as const,
		cardId: id as CardId,
		upgraded: false,
	}));

// Holy Water replaces Pure Water on pickup (run level); here only its combat effect.
relic("HOLY_WATER", { atBattleStart: (ctx) => run(ctx.state, addToHand("MIRACLE", 3)) });

relic("NINJA_SCROLL", {
	atBattleStart: (ctx) => run(ctx.state, addToHand("SHIV", relicVal("NINJA_SCROLL", 0, 3))),
});

relic("NUCLEAR_BATTERY", {
	atBattleStart: (ctx) => run(ctx.state, [{ type: "channelOrb", orbType: "plasma" }]),
});

relic("SYMBIOTIC_VIRUS", {
	atBattleStart: (ctx) => run(ctx.state, [{ type: "channelOrb", orbType: "dark" }]),
});

relic("TEARDROP_LOCKET", {
	atBattleStart: (ctx) => run(ctx.state, [{ type: "changeStance", stance: "calm" }]),
});

relic("RUNIC_CAPACITOR", { atBattleStart: (ctx) => orbSlotsUpTo(ctx.state, 3) });

relic("PANTOGRAPH", {
	atBattleStart: (ctx) =>
		getCurrentRoomType(ctx.state) === "boss"
			? run(ctx.state, [{ type: "heal", target: P, amount: relicVal("PANTOGRAPH", 0, 25) }])
			: ctx.state,
});

// Elite enemies: current HP to 75% of max if above it (max HP unchanged).
relic("PRESERVED_INSECT", {
	atBattleStart: (ctx) => {
		const c = ctx.combat;
		if (getCurrentRoomType(ctx.state) !== "elite") return ctx.state;
		const keep = 1 - relicVal("PRESERVED_INSECT", 0, 25) / 100;
		const monsters = c.monsters.map((m) => {
			const cap = Math.floor(m.maxHp * keep);
			return m.alive && m.currentHp > cap ? { ...m, currentHp: cap } : m;
		});
		return { ...ctx.state, combat: { ...c, monsters } };
	},
});

// Counter = combats left (3 on pickup); used up → -2.
relic("NEOWS_LAMENT", {
	onEquip: (ctx) => setRelicCounter(ctx.state, "NEOWS_LAMENT", 3),
	atBattleStart: (ctx) => {
		const left = relicCounter(ctx.state, "NEOWS_LAMENT");
		if (left <= 0) return ctx.state;
		const s = setRelicCounter(ctx.state, "NEOWS_LAMENT", left === 1 ? USED_UP : left - 1);
		const monsters = ctx.combat.monsters.map((m) => (m.alive ? { ...m, currentHp: 1 } : m));
		return { ...s, combat: { ...ctx.combat, monsters } };
	},
});

relic("RUNIC_DOME", { atBattleStart: (ctx) => plusMaxEnergy(ctx.state) });

relic("SLAVERS_COLLAR", {
	atBattleStart: (ctx) => (isEliteOrBoss(ctx.state) ? plusMaxEnergy(ctx.state) : ctx.state),
});

// returnTrulyRandomCardInCombat(POWER): class Power card (cardRandomRng), costs 0 this turn.
relic("ENCHIRIDION", {
	atBattleStart: (ctx) => {
		const color = CLASS_COLOR[ctx.state.character] ?? "red";
		const pool = getAllCards().filter(
			(c) =>
				c.color === color &&
				c.type === "power" &&
				["common", "uncommon", "rare"].includes(c.rarity) &&
				!c.unobtainable,
		);
		if (pool.length === 0 || ctx.combat.hand.length >= 10) return ctx.state;
		const roll = random(ctx.state.rng.cardRandomRng, pool.length - 1);
		const def = pool[roll.value];
		if (!def) return ctx.state;
		const card: CardInstance = {
			id: def.id as CardId,
			uniqueId: nextUid(ctx.state),
			upgraded: false,
			costOverride: null,
			costForTurn: def.cost === -1 ? -1 : 0,
			freeToPlay: false,
			misc: 0,
		};
		return {
			...ctx.state,
			rng: { ...ctx.state.rng, cardRandomRng: roll.state },
			combat: { ...ctx.combat, hand: [...ctx.combat.hand, card] },
		};
	},
});

// Gambling Chip: discard any number, draw that many (cardSelect task "gamble").
relic("GAMBLING_CHIP", {
	atBattleStart: (ctx) => {
		if (ctx.state.phase.type !== "combat" || ctx.combat.hand.length === 0) return ctx.state;
		return { ...ctx.state, phase: { type: "cardSelect", task: "gamble" } };
	},
});

/** Assumption: colorless cards tagged HEALING in the original (excluded in combat). */
const HEALING_COLORLESS = new Set(["BANDAGE_UP", "HAND_OF_GREED"]);

// Toolbox (ChooseOneColorless): 3 distinct random colorless cards, chosen one into hand.
relic("TOOLBOX", {
	atBattleStart: (ctx) => {
		if (ctx.state.phase.type !== "combat") return ctx.state;
		const pool = getAllCards().filter(
			(c) =>
				c.color === "colorless" &&
				(c.rarity === "uncommon" || c.rarity === "rare") &&
				!HEALING_COLORLESS.has(c.id),
		);
		if (pool.length < 3) return ctx.state;
		let rng = ctx.state.rng.cardRandomRng;
		const ids: string[] = [];
		while (ids.length < 3) {
			const roll = random(rng, pool.length - 1);
			rng = roll.state;
			const id = pool[roll.value]?.id;
			if (id && !ids.includes(id)) ids.push(id);
		}
		const options: CardInstance[] = ids.map((id, i) => ({
			id: id as CardId,
			uniqueId: -1 - i,
			upgraded: false,
			costOverride: null,
			costForTurn: getCard(id)?.cost ?? 0,
			freeToPlay: false,
			misc: 0,
		}));
		return {
			...ctx.state,
			rng: { ...ctx.state.rng, cardRandomRng: rng },
			phase: { type: "cardSelect", task: "discovery", options },
		};
	},
});

// ═════════════════════════════════════════════════════════
// START OF TURN
// ═════════════════════════════════════════════════════════

relic(
	"BRIMSTONE",
	everyTurn((ctx) =>
		run(ctx.state, [
			power(P, "strength", 2),
			...aliveMonsterRefs(ctx.state).map((m) => power(m, "strength", relicVal("BRIMSTONE", 1, 1))),
		]),
	),
);

relic(
	"DAMARU",
	everyTurn((ctx) => run(ctx.state, [power(P, "MANTRA", relicVal("DAMARU", 0, 1))])),
);

// Every 2 turns +1 orb slot; the count carries over between combats.
relic(
	"INSERTER",
	everyTurn((ctx) => {
		const n = relicCounter(ctx.state, "INSERTER") + 1;
		if (n < 2) return setRelicCounter(ctx.state, "INSERTER", n);
		return orbSlotsUpTo(setRelicCounter(ctx.state, "INSERTER", 0), 1);
	}),
);

// UpgradeRandomCardAction: an upgradable non-Status card in hand, upgraded for the combat.
// Assumption: one shuffleRng roll stands in for CardGroup.shuffle() (java.util.Random seeded
// from shuffleRng in the original).
function upgradeRandomInHand(state: GameState): GameState {
	const c = state.combat;
	if (!c) return state;
	const options = c.hand
		.map((card, i) => ({ card, i, def: getCard(card.id) }))
		.filter((x) => !x.card.upgraded && x.def && x.def.type !== "status" && x.def.type !== "curse");
	if (options.length === 0) return state;
	const roll = random(state.rng.shuffleRng, options.length - 1);
	const pick = options[roll.value];
	if (!pick?.def) return state;
	const upCost = pick.def.upgrade.cost;
	const costForTurn =
		upCost != null && pick.card.costForTurn === pick.def.cost ? upCost : pick.card.costForTurn;
	const hand = c.hand.map((card, i) =>
		i === pick.i ? { ...card, upgraded: true, costForTurn } : card,
	);
	return {
		...state,
		rng: { ...state.rng, shuffleRng: roll.state },
		combat: { ...c, hand },
	};
}

relic("WARPED_TONGS", {
	atBattleStart: (ctx) => upgradeRandomInHand(ctx.state),
	atStartOfTurnPostDraw: (ctx) => upgradeRandomInHand(ctx.state),
});

// Ring of the Serpent replaces Ring of the Snake on pickup (run level): +1 draw every turn.
relic("RING_OF_THE_SERPENT", { modifyDrawPerTurn: (_ctx, draw) => draw + 1 });

// Counter 1 = the first 2+-cost Attack this turn is still to be replayed (core/replay.ts).
// The Necronomicurse on pickup is run level.
relic(
	"NECRONOMICON",
	everyTurn((ctx) => setRelicCounter(ctx.state, "NECRONOMICON", 1)),
);
