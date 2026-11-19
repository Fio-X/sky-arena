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

/**
 * Damage or hit count the data cannot express (Darkling NIP rolls its damage,
 * Transient grows +10 per turn, Maw NOM hits ceil(turn/2) times). Used for both
 * the shown intent and the executed attack, so they always agree.
 */
export type MoveStatFn = (monster: MonsterState, ascension: number) => number;

const effectRegistry = new Map<string, MoveEffectHandler>();
const moveRegistry = new Map<string, MoveHandler>();
const damageRegistry = new Map<string, MoveStatFn>();
const hitsRegistry = new Map<string, MoveStatFn>();

export function registerMoveDamage(moveId: string, fn: MoveStatFn): void {
	damageRegistry.set(moveId, fn);
}

export function registerMoveHits(moveId: string, fn: MoveStatFn): void {
	hitsRegistry.set(moveId, fn);
}

export function getMoveDamage(moveId: string): MoveStatFn | undefined {
	return damageRegistry.get(moveId);
}

export function getMoveHits(moveId: string): MoveStatFn | undefined {
	return hitsRegistry.get(moveId);
}

export function registerMoveEffect(effectName: string, handler: MoveEffectHandler): void {
	effectRegistry.set(effectName, handler);
}

export function registerMoveHandler(moveId: string, handler: MoveHandler): void {
	moveRegistry.set(moveId, handler);
}

export function getMoveEffect(effectName: string): MoveEffectHandler | undefined {
	return effectRegistry.get(effectName);
}

/**
 * Effect word of a data string: the part before ":" or "(".
 * "AddCard:BURN:discard" → "AddCard", "Suicide(triggerRelics=true)" → "Suicide".
 */
export function effectKey(effectName: string): string {
	return effectName.split(/[:(]/, 1)[0] ?? effectName;
}

/** Exact name first (SUMMON_GREMLINS, "FOCUS(-1)|STRENGTH(-1)"), then its effect word. */
export function findMoveEffect(effectName: string): MoveEffectHandler | undefined {
	return effectRegistry.get(effectName) ?? effectRegistry.get(effectKey(effectName));
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
