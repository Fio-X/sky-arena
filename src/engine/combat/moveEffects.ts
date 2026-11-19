/**
 * Registry for monster move effects that the data-driven resolver cannot express
 * (summons, heals, card theft, debuff removal, ally targeting quirks).
 *
 * Two keys:
 * - effect name (e.g. "SUMMON_GREMLINS", "HEAL"): shared across monsters
 * - move id (e.g. "BRONZE_ORB_SUPPORT_BEAM"): per-move quirks, applied last
 *
 * Handlers receive the actions built so far and return the new list, so they can
 * append, drop or rewrite (e.g. damage → vampireDamage). The actions still go
 * through the normal action queue.
 */
import type { MonsterMoveEffect } from "../content/loader";
import type { Action, ActorRef, GameState, MonsterMoveId, MonsterState } from "../core/types";

export interface MoveCtx {
	readonly state: GameState;
	readonly monster: MonsterState;
	readonly moveId: MonsterMoveId;
	readonly self: ActorRef;
}

export type MoveEffectHandler = (
	ctx: MoveCtx,
	effect: MonsterMoveEffect,
	actions: readonly Action[],
) => Action[];

export type MoveHandler = (ctx: MoveCtx, actions: readonly Action[]) => Action[];

const effectRegistry = new Map<string, MoveEffectHandler>();
const moveRegistry = new Map<string, MoveHandler>();

export function registerMoveEffect(effectName: string, handler: MoveEffectHandler): void {
	effectRegistry.set(effectName, handler);
}

export function registerMoveHandler(moveId: string, handler: MoveHandler): void {
	moveRegistry.set(moveId, handler);
}

export function getMoveEffect(effectName: string): MoveEffectHandler | undefined {
	return effectRegistry.get(effectName);
}

export function getMoveHandler(moveId: string): MoveHandler | undefined {
	return moveRegistry.get(moveId);
}

function hasPower(m: MonsterState, id: string): boolean {
	return m.powers.some((p) => p.id.toUpperCase() === id);
}

/**
 * "allies" in monster data: other living monsters. A minion's allies are its
 * leader(s) only (Bronze Orb SUPPORT_BEAM shields the Automaton, not the other orb).
 */
export function allyRefs(ctx: MoveCtx): ActorRef[] {
	const monsters = ctx.state.combat?.monsters ?? [];
	const isMinion = hasPower(ctx.monster, "MINION");
	return monsters
		.filter((m) => m.alive && m.index !== ctx.monster.index)
		.filter((m) => !isMinion || hasPower(m, "MINION_LEADER"))
		.map((m) => ({ type: "monster" as const, index: m.index }));
}
