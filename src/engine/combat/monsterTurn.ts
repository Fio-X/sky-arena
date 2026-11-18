import type { MonsterMoveDef, MonsterMoveEffect } from "../content/loader";
import { getMonster } from "../content/loader";
import { getMonsterAi } from "../content/monsterAi";
import type {
	Action,
	ActorRef,
	CardId,
	GameState,
	MonsterId,
	MonsterIntent,
	MonsterMoveId,
	MonsterState,
	PowerId,
	RngState,
} from "../core/types";
import { random } from "../rng/stsRandom";

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
	if (!monster?.alive) return { moveId: "" as MonsterMoveId, state };

	const aiFn = getMonsterAi(monster.id);
	if (!aiFn) return { moveId: "" as MonsterMoveId, state };

	const result = aiFn({ state, monsterIndex, aiRng: state.rng.aiRng });
	const newState: GameState = {
		...state,
		rng: { ...state.rng, aiRng: result.aiRng },
	};
	return { moveId: result.moveId, state: newState };
}

export function resolveMonsterMove(
	monster: MonsterState,
	moveId: MonsterMoveId,
	ascension: number,
	playerHp = 0,
): Action[] {
	const def = getMonster(monster.id);
	if (!def) return [];

	const moveDef = def.moves[moveId as string];
	if (!moveDef) return [];

	const resolved = applyAscension(moveDef, ascension);
	const actions: Action[] = [];
	const self = { type: "monster" as const, index: monster.index };
	const player = { type: "player" as const };

	const baseDamage = resolveDamage(resolved, monster, moveId, playerHp);
	if (baseDamage != null) {
		const hits = typeof resolved.hits === "number" ? resolved.hits : 1;
		actions.push({ type: "damage", source: self, target: player, baseDamage, hits });
	}

	if (resolved.block != null) {
		const blockAmount = typeof resolved.block === "number" ? resolved.block : resolved.block[0];
		actions.push({ type: "block", source: self, amount: blockAmount });
	}

	if (resolved.effects) {
		resolveEffects(resolved.effects, actions, self, player);
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
			});
		}
	}

	return actions;
}

function resolveEffects(
	effects: MonsterMoveEffect[],
	actions: Action[],
	self: ActorRef,
	player: ActorRef,
): void {
	for (const effect of effects) {
		if (!effect.power || effect.amount == null) continue;
		const power = effect.power;

		if (power.startsWith("CARD:")) {
			const cardId = power.slice(5) as CardId;
			for (let i = 0; i < effect.amount; i++) {
				actions.push({ type: "addCardToDiscardPile", cardId, upgraded: false });
			}
			continue;
		}

		if (power === "STEAL_GOLD") {
			actions.push({ type: "loseGold", amount: effect.amount });
			continue;
		}

		if (power === "BLOCK" && effect.target === "allies") {
			actions.push({ type: "block", source: self, amount: effect.amount });
			continue;
		}

		const target = effect.target === "player" ? player : self;
		actions.push({
			type: "applyPower",
			source: self,
			target,
			powerId: power.toLowerCase() as PowerId,
			amount: effect.amount,
		});
	}
}

function resolveDamage(
	resolved: MonsterMoveDef,
	monster: MonsterState,
	moveId: MonsterMoveId,
	playerHp: number,
): number | null {
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

	let resolved = moveDef;
	if (moveDef.asc) {
		for (const [t, override] of Object.entries(moveDef.asc)) {
			if (ascension >= Number(t) && override) {
				resolved = { ...resolved, ...override };
			}
		}
	}

	const hits = typeof resolved.hits === "number" ? resolved.hits : 1;
	const intent = (resolved.intent ?? "").toUpperCase();

	let baseDamage: number | null = null;
	if (resolved.damage != null) {
		baseDamage = Array.isArray(resolved.damage) ? monster.miscInfo : resolved.damage;
	} else if (hits > 0 && String(moveId).includes("DIVIDER")) {
		baseDamage = Math.floor(playerHp / 12) + 1;
	}

	return {
		moveId,
		baseDamage,
		hits,
		isAttack: intent.includes("ATTACK"),
		isDebuff: intent.includes("DEBUFF"),
		isBuff: intent.includes("BUFF"),
	};
}
