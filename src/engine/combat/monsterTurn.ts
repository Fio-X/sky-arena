import type { MonsterMoveDef, MonsterMoveEffect } from "../content/loader";
import { getMonster } from "../content/loader";
import { getMonsterAi } from "../content/monsterAi";
import { canonicalPowerId } from "../core/hooks";
import type {
	Action,
	ActorRef,
	CardId,
	GameState,
	MonsterId,
	MonsterIntent,
	MonsterMoveId,
	MonsterState,
	RngState,
} from "../core/types";
import { random } from "../rng/stsRandom";
import {
	allyRefs,
	findMoveEffect,
	getMoveDamage,
	getMoveHandler,
	getMoveHits,
	type MoveCtx,
} from "./moveEffects";

const SPLIT_MAP: Record<string, Array<{ spawnId: string; count: number }>> = {
	ACID_SLIME_L: [{ spawnId: "ACID_SLIME_M", count: 2 }],
	SPIKE_SLIME_L: [{ spawnId: "SPIKE_SLIME_M", count: 2 }],
	SLIME_BOSS: [
		{ spawnId: "ACID_SLIME_L", count: 1 },
		{ spawnId: "SPIKE_SLIME_L", count: 1 },
	],
};

export function rollMonsterMove(
	state: GameState,
	monsterIndex: number,
): { moveId: MonsterMoveId; state: GameState } {
	const combat = state.combat;
	if (!combat) return { moveId: "" as MonsterMoveId, state };

	const monster = combat.monsters[monsterIndex];
	if (!monster || !(monster.alive || monster.halfDead))
		return { moveId: "" as MonsterMoveId, state };

	const aiFn = getMonsterAi(monster.id);
	if (!aiFn) return { moveId: "" as MonsterMoveId, state };

	const result = aiFn({ state, monsterIndex, aiRng: state.rng.aiRng });
	let monsters = combat.monsters;
	if (result.miscInfo !== undefined) {
		monsters = [...combat.monsters];
		monsters[monsterIndex] = { ...monster, miscInfo: result.miscInfo };
	}
	const newState: GameState = {
		...state,
		combat: { ...combat, monsters },
		rng: { ...state.rng, aiRng: result.aiRng },
	};
	return { moveId: result.moveId, state: newState };
}

export function resolveMonsterMove(
	monster: MonsterState,
	moveId: MonsterMoveId,
	ascension: number,
	playerHp = 0,
	state?: GameState,
): Action[] {
	const def = getMonster(monster.id);
	if (!def) return [];

	const moveDef = def.moves[moveId as string];
	if (!moveDef) return [];

	const resolved = applyAscension(moveDef, ascension);
	let actions: Action[] = [];
	const self = { type: "monster" as const, index: monster.index };
	const player = { type: "player" as const };
	const ctx: MoveCtx | null = state ? { state, monster, moveId, self } : null;

	const baseDamage = resolveDamage(resolved, monster, moveId, playerHp, ascension);
	if (baseDamage != null) {
		const hits = resolveHits(resolved, monster, moveId, ascension);
		actions.push({ type: "damage", source: self, target: player, baseDamage, hits });
	}

	if (resolved.block != null) {
		const blockAmount = typeof resolved.block === "number" ? resolved.block : resolved.block[0];
		actions.push({ type: "block", source: self, amount: blockAmount });
	}

	if (resolved.effects) {
		actions = resolveEffects(resolved.effects, actions, self, player, ctx);
	}

	const intentStr = (resolved.intent ?? "").toUpperCase();
	if (intentStr === "ESCAPE") {
		actions.push({ type: "escape", monsterIndex: monster.index });
	}

	const splitSpawns = SPLIT_MAP[monster.id];
	if (splitSpawns && String(moveId).includes("SPLIT")) {
		for (const spawn of splitSpawns) {
			actions.push({
				type: "split",
				sourceIndex: monster.index,
				spawnId: spawn.spawnId as MonsterId,
				count: spawn.count,
				hp: monster.currentHp,
			});
		}
	}

	const moveHandler = ctx ? getMoveHandler(moveId as string) : undefined;
	return moveHandler && ctx ? moveHandler(ctx, actions) : actions;
}

/**
 * Registered hits (registerMoveHits) win; else data. Data with hits = null and a
 * damage value means "hits stored in miscInfo" (Book of Stabbing).
 */
function resolveHits(
	move: MonsterMoveDef,
	monster: MonsterState,
	moveId: MonsterMoveId,
	ascension: number,
): number {
	const fn = getMoveHits(moveId as string);
	if (fn) return fn(monster, ascension);
	if (typeof move.hits === "number") return move.hits;
	return move.damage != null ? Math.max(1, monster.miscInfo) : 1;
}

function resolveEffects(
	effects: MonsterMoveEffect[],
	initial: Action[],
	self: ActorRef,
	player: ActorRef,
	ctx: MoveCtx | null,
): Action[] {
	let actions = initial;
	for (const effect of effects) {
		if (!effect.power) continue;
		const handler = ctx ? findMoveEffect(effect.power) : undefined;
		if (handler && ctx) {
			actions = handler(ctx, effect, actions);
		} else if (effect.amount != null) {
			actions.push(
				...dataEffectActions(effect.power, effect.amount, effect.target, self, player, ctx),
			);
		}
	}
	return actions;
}

/** Effects expressible from data alone: CARD:X, STEAL_GOLD, BLOCK and plain powers. */
function dataEffectActions(
	power: string,
	amount: number,
	targetKind: string | undefined,
	self: ActorRef,
	player: ActorRef,
	ctx: MoveCtx | null,
): Action[] {
	if (power.startsWith("CARD:")) {
		const cardId = power.slice(5) as CardId;
		return Array.from(
			{ length: amount },
			(): Action => ({
				type: "addCardToDiscardPile",
				cardId,
				upgraded: false,
			}),
		);
	}
	if (power === "STEAL_GOLD") return [{ type: "loseGold", amount }];

	const targets: ActorRef[] =
		targetKind === "player" ? [player] : targetKind === "allies" && ctx ? allyRefs(ctx) : [self];
	return targets.map(
		(target): Action =>
			power === "BLOCK"
				? { type: "block", source: target, amount } // block credits its source: the ally
				: { type: "applyPower", source: self, target, powerId: canonicalPowerId(power), amount },
	);
}

function resolveDamage(
	resolved: MonsterMoveDef,
	monster: MonsterState,
	moveId: MonsterMoveId,
	playerHp: number,
	ascension: number,
): number | null {
	const fn = getMoveDamage(moveId as string);
	if (fn) return fn(monster, ascension);
	if (resolved.damage != null) {
		if (Array.isArray(resolved.damage)) {
			// Range damage (e.g. Louse BITE [5,7]): use pre-rolled miscInfo
			return monster.miscInfo;
		}
		return resolved.damage;
	}
	// Null damage with hits > 0 → special calculation (e.g. Hexaghost DIVIDER)
	if (
		typeof resolved.hits === "number" &&
		resolved.hits > 0 &&
		String(moveId).includes("DIVIDER")
	) {
		return Math.floor(playerHp / 12) + 1;
	}
	return null;
}

function applyAscension(move: MonsterMoveDef, ascension: number): MonsterMoveDef {
	if (!move.asc) return move;

	let resolved = { ...move };
	const thresholds = Object.keys(move.asc)
		.map(Number)
		.sort((a, b) => a - b);

	for (const threshold of thresholds) {
		if (ascension >= threshold) {
			const override = move.asc[String(threshold)];
			if (override) {
				resolved = { ...resolved, ...override };
			}
		}
	}
	return resolved;
}

export function rollMonsterMiscInfo(
	monsterId: string,
	ascension: number,
	rng: RngState,
): { miscInfo: number; rng: RngState } {
	const def = getMonster(monsterId);
	if (!def) return { miscInfo: 0, rng };

	for (const moveDef of Object.values(def.moves)) {
		const resolved = applyAscension(moveDef as MonsterMoveDef, ascension);
		if (Array.isArray(resolved.damage)) {
			const [min, max] = resolved.damage;
			const roll = random(rng, max - min);
			return { miscInfo: min + roll.value, rng: roll.state };
		}
	}
	return { miscInfo: 0, rng };
}

export function buildIntent(
	monster: MonsterState,
	moveId: MonsterMoveId,
	ascension: number,
	playerHp: number,
): MonsterIntent {
	const def = getMonster(monster.id);
	const moveDef = def?.moves[moveId as string];
	if (!moveDef) {
		return { moveId, baseDamage: null, hits: 1, isAttack: false, isDebuff: false, isBuff: false };
	}

	const resolved = applyAscension(moveDef, ascension);
	const hits = resolveHits(resolved, monster, moveId, ascension);
	const intent = (resolved.intent ?? "").toUpperCase();
	const baseDamage = resolveDamage(resolved, monster, moveId, playerHp, ascension);

	return {
		moveId,
		baseDamage,
		hits,
		isAttack: intent.includes("ATTACK"),
		isDebuff: intent.includes("DEBUFF"),
		isBuff: intent.includes("BUFF"),
	};
}
