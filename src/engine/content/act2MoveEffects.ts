/**
 * Act 2 move effects that monster data names but the generic resolver cannot run.
 * Slot rules follow the reference specs in data-reference/monsters-act2.json.
 */
import { allyRefs, type MoveCtx, registerMoveEffect } from "../combat/moveEffects";
import { canonicalPowerId } from "../core/hooks";
import type { Action, CardId, MonsterId } from "../core/types";

function isOpen(ctx: MoveCtx, slot: number): boolean {
	const m = ctx.state.combat?.monsters[slot];
	return !m?.alive;
}

function aliveCount(ctx: MoveCtx): number {
	return (ctx.state.combat?.monsters ?? []).filter((m) => m.alive).length;
}

function spawn(slot: number, monsterId: MonsterId | "RANDOM_GREMLIN", burnAiRoll = false): Action {
	return { type: "spawnMonster", monsterId, slot, minion: true, burnAiRoll };
}

// Gremlin Leader RALLY: up to 2 open slots, searching slot 1, slot 2, then slot 0.
registerMoveEffect("SUMMON_GREMLINS", (ctx, effect, actions) => {
	const count = effect.amount ?? 2;
	const slots = [1, 2, 0].filter((s) => isOpen(ctx, s)).slice(0, count);
	return [...actions, ...slots.map((s) => spawn(s, "RANDOM_GREMLIN"))];
});

// Collector SPAWN: 3 - monstersAlive heads; first = slot 1 if open else 0, second = 0.
registerMoveEffect("SUMMON_TORCH_HEADS", (ctx, _effect, actions) => {
	const count = Math.max(0, 3 - aliveCount(ctx));
	const slots = (isOpen(ctx, 1) ? [1, 0] : [0]).slice(0, count);
	return [...actions, ...slots.map((s) => spawn(s, "TORCH_HEAD" as MonsterId, true))];
});

// Bronze Automaton SPAWN_ORBS: orbs into slots 0 and 2.
registerMoveEffect("SUMMON_BRONZE_ORBS", (ctx, _effect, actions) => {
	const slots = [0, 2].filter((s) => isOpen(ctx, s));
	return [...actions, ...slots.map((s) => spawn(s, "BRONZE_ORB" as MonsterId))];
});

// Mystic HEAL: self and/or allies.
registerMoveEffect("HEAL", (ctx, effect, actions) => {
	const amount = effect.amount ?? 0;
	const targets = effect.target === "allies" ? allyRefs(ctx) : [ctx.self];
	return [...actions, ...targets.map((target): Action => ({ type: "heal", target, amount }))];
});

// Shelled Parasite SUCK: its attack heals by the unblocked damage dealt.
registerMoveEffect("HEAL_FOR_UNBLOCKED_DAMAGE", (_ctx, _effect, actions) =>
	actions.map(
		(a): Action =>
			a.type === "damage" && a.source.type === "monster"
				? { type: "vampireDamage", source: a.source, target: a.target, baseDamage: a.baseDamage }
				: a,
	),
);

// Bronze Orb STASIS.
registerMoveEffect("STASIS_STEAL_CARD", (ctx, _effect, actions) => [
	...actions,
	{ type: "stealCard", monsterIndex: ctx.monster.index },
]);

// The Champ ANGER.
registerMoveEffect("REMOVE_DEBUFFS", (ctx, _effect, actions) => [
	...actions,
	{ type: "removeDebuffs", target: ctx.self },
]);

// Taskmaster SCOURING_WHIP.
registerMoveEffect("ADD_WOUND_TO_DISCARD", (_ctx, effect, actions) => {
	const wounds = Array.from(
		{ length: effect.amount ?? 1 },
		(): Action => ({
			type: "addCardToDiscardPile",
			cardId: "WOUND" as CardId,
			upgraded: false,
		}),
	);
	return [...actions, ...wounds];
});

// Snecko GLARE: data has no amount for the non-stacking Confused.
registerMoveEffect("CONFUSED", (ctx, _effect, actions) => [
	...actions,
	{
		type: "applyPower",
		source: ctx.self,
		target: { type: "player" },
		powerId: canonicalPowerId("CONFUSED"),
		amount: 1,
	},
]);
