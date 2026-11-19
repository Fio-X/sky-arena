import { foldHook } from "../core/hooks";
import type { ActorRef, CardInstance, GameState, PowerInstance } from "../core/types";

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
	const krane = source.type === "monster" ? PAPER_KRANE : null;
	({ value: damage, state: s } = foldSwapped(s, source, "atDamageGive", damage, card, krane));

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
	const mushroom = target.type === "player" ? ODD_MUSHROOM : null;
	({ value: damage, state: s } = foldSwapped(
		s,
		target,
		"atDamageFinalReceive",
		damage,
		card,
		mushroom,
	));

	// Wrath: player takes double damage
	if (target.type === "player" && s.combat?.player.stance === "wrath") {
		damage *= 2;
	}

	return { damage: Math.max(0, Math.floor(damage)), state: s };
}

/**
 * Relics that WeakPower / VulnerablePower check in the original: Paper Krane
 * (Weak on an enemy: x0.6 instead of x0.75) and Odd Mushroom (Vulnerable on
 * the player: x1.25 instead of x1.5). The fold runs without that power and the
 * relic's multiplier is applied after it; the power is then put back in place.
 */
interface PowerSwap {
	readonly powerId: string;
	readonly relicId: string;
	readonly mult: number;
}
const PAPER_KRANE: PowerSwap = { powerId: "weak", relicId: "PAPER_KRANE", mult: 0.6 };
const ODD_MUSHROOM: PowerSwap = { powerId: "vulnerable", relicId: "ODD_MUSHROOM", mult: 1.25 };

function foldSwapped(
	state: GameState,
	actor: ActorRef,
	hook: "atDamageGive" | "atDamageFinalReceive",
	damage: number,
	card: CardInstance | null,
	swap: PowerSwap | null,
): { value: number; state: GameState } {
	const powers = actorPowers(state, actor);
	const idx = swap ? powers.findIndex((p) => p.id === swap.powerId) : -1;
	const power = powers[idx];
	if (!swap || !power || !state.relics.some((r) => r.id === swap.relicId)) {
		return foldHook(state, actor, hook, damage, card);
	}
	const without = withActorPowers(
		state,
		actor,
		powers.filter((_, i) => i !== idx),
	);
	const r = foldHook(without, actor, hook, damage, card);
	const after = [...actorPowers(r.state, actor)];
	after.splice(idx, 0, power);
	return { value: Math.floor(r.value * swap.mult), state: withActorPowers(r.state, actor, after) };
}

function actorPowers(s: GameState, actor: ActorRef): readonly PowerInstance[] {
	if (actor.type === "player") return s.combat?.player.powers ?? [];
	return s.combat?.monsters[actor.index]?.powers ?? [];
}

function withActorPowers(s: GameState, actor: ActorRef, powers: PowerInstance[]): GameState {
	const c = s.combat;
	if (!c) return s;
	if (actor.type === "player") return { ...s, combat: { ...c, player: { ...c.player, powers } } };
	const monsters = [...c.monsters];
	const m = monsters[actor.index];
	if (!m) return s;
	monsters[actor.index] = { ...m, powers };
	return { ...s, combat: { ...c, monsters } };
}

/**
 * DamageType.THORNS damage (Exploder's explosion): the base amount, with only
 * Intangible applied (AbstractPlayer.damage caps at 1 before block).
 */
export function calculateNonAttackDamage(
	state: GameState,
	target: ActorRef,
	baseDamage: number,
): { damage: number; state: GameState } {
	const combat = state.combat;
	const powers =
		target.type === "player" ? combat?.player.powers : combat?.monsters[target.index]?.powers;
	const intangible = (powers ?? []).some(
		(p) => p.id.toUpperCase() === "INTANGIBLE" && p.amount > 0,
	);
	const damage = Math.max(0, baseDamage);
	return { damage: intangible && damage > 1 ? 1 : damage, state };
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
