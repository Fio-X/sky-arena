import { foldHook } from "../core/hooks";
import type { ActorRef, CardInstance, GameState } from "../core/types";

/**
 * Damage pipeline — 4 phases matching the original game.
 * Each phase is a fold hook: the value and state thread through all powers/relics.
 * Returns both the final damage number and the potentially-modified state
 * (fold hooks like Pen Nib can consume counters while modifying damage).
 */
export function calculateDamage(
	state: GameState,
	source: ActorRef,
	target: ActorRef,
	baseDamage: number,
	card: CardInstance | null,
): { damage: number; state: GameState } {
	let s = state;
	let damage = baseDamage;

	// Phase 1: attacker modifiers (additive — Strength, Vigor)
	({ value: damage, state: s } = foldHook(s, source, "atDamageGive", damage, card));

	// Phase 2: defender modifiers (additive — Plated Armor)
	({ value: damage, state: s } = foldHook(s, target, "atDamageReceive", damage, card));

	// Phase 3: attacker final modifiers (multiplicative — Vulnerable on target)
	({ value: damage, state: s } = foldHook(s, source, "atDamageFinalGive", damage, card));

	// Stance multiplier for player attacks (after hooks, before floor)
	if (source.type === "player" && s.combat) {
		const stance = s.combat.player.stance;
		if (stance === "wrath") damage *= 2;
		else if (stance === "divinity") damage *= 3;
	}

	// Phase 4: defender final modifiers (multiplicative — Intangible)
	({ value: damage, state: s } = foldHook(s, target, "atDamageFinalReceive", damage, card));

	// Wrath: player takes double damage
	if (target.type === "player" && s.combat?.player.stance === "wrath") {
		damage *= 2;
	}

	return { damage: Math.max(0, Math.floor(damage)), state: s };
}

/**
 * Calculate block gained, modified by hooks (Dexterity, Frail).
 */
export function calculateBlock(
	state: GameState,
	source: ActorRef,
	baseBlock: number,
	card: CardInstance | null,
): { block: number; state: GameState } {
	const { value, state: s } = foldHook(state, source, "modifyBlock", baseBlock, card);
	return { block: Math.max(0, Math.floor(value)), state: s };
}

/**
 * Apply damage to a target, accounting for block.
 * Returns the new state and actual HP lost.
 */
export function applyDamage(
	state: GameState,
	target: ActorRef,
	damage: number,
): { state: GameState; hpLost: number; blocked: number } {
	if (!state.combat) return { state, hpLost: 0, blocked: 0 };

	if (target.type === "player") {
		const player = state.combat.player;
		const blocked = Math.min(player.block, damage);
		let hpLost = damage - blocked;
		const newBlock = player.block - blocked;

		let powers = player.powers;
		if (hpLost > 0) {
			const buffer = powers.find((p) => p.id === "BUFFER");
			if (buffer && buffer.amount > 0) {
				hpLost = 0;
				powers =
					buffer.amount > 1
						? powers.map((p) => (p.id === "BUFFER" ? { ...p, amount: p.amount - 1 } : p))
						: powers.filter((p) => p.id !== "BUFFER");
			}
		}

		const newHp = Math.max(0, state.currentHp - hpLost);
		const newState: GameState = {
			...state,
			currentHp: newHp,
			combat: {
				...state.combat,
				player: { ...player, block: newBlock, powers },
			},
		};
		return { state: newState, hpLost, blocked };
	}

	// Monster target
	const monsters = [...state.combat.monsters];
	const monster = monsters[target.index];
	if (!monster?.alive) return { state, hpLost: 0, blocked: 0 };

	const blocked = Math.min(monster.block, damage);
	let hpLost = damage - blocked;

	let mPowers = monster.powers;
	if (hpLost > 0) {
		const buffer = mPowers.find((p) => p.id === "BUFFER");
		if (buffer && buffer.amount > 0) {
			hpLost = 0;
			mPowers =
				buffer.amount > 1
					? mPowers.map((p) => (p.id === "BUFFER" ? { ...p, amount: p.amount - 1 } : p))
					: mPowers.filter((p) => p.id !== "BUFFER");
		}
	}

	const newHp = Math.max(0, monster.currentHp - hpLost);
	const alive = newHp > 0;

	monsters[target.index] = {
		...monster,
		block: monster.block - blocked,
		currentHp: newHp,
		alive,
		powers: mPowers,
	};

	const newState: GameState = {
		...state,
		combat: { ...state.combat, monsters },
	};
	return { state: newState, hpLost, blocked };
}
