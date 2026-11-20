/**
 * Act 4 powers: Surrounded (player) + Back Attack (Spire Shield / Spire Spear),
 * Beat of Death and Invincible (Corrupt Heart). Painful Stabs is in act2Powers.ts.
 * Specs: data-reference/monsters-act34.json, data-reference/powers.json.
 */
import { canonicalPowerId, type HookSource, registerPowerHooks } from "../core/hooks";
import type { ActorRef, GameState, MonsterState, PowerInstance } from "../core/types";
import { run } from "./relicsCombat";

const isPower = (p: PowerInstance, id: string) => p.id.toUpperCase() === id;
const has = (powers: readonly PowerInstance[], id: string) => powers.some((p) => isPower(p, id));

function mapMonsters(state: GameState, fn: (m: MonsterState) => MonsterState): GameState {
	const c = state.combat;
	return c ? { ...state, combat: { ...c, monsters: c.monsters.map(fn) } } : state;
}

function withoutPower(m: MonsterState, id: string): MonsterState {
	return has(m.powers, id) ? { ...m, powers: m.powers.filter((p) => !isPower(p, id)) } : m;
}

function withPower(m: MonsterState, id: string): MonsterState {
	if (has(m.powers, id)) return m;
	const power: PowerInstance = { id: canonicalPowerId(id), amount: 1, justApplied: false };
	return { ...m, powers: [...m.powers, power] };
}

// ── Surrounded / Back Attack ────────────────────────────────
// The player stands between Spire Shield (slot 0, left) and Spire Spear
// (slot 1, right). The monster behind the player has BACK_ATTACK: its attacks
// deal x1.5. Targeting the monster behind with a card or potion turns the
// player around, so the Back Attack moves to the other side.

export const BACK_ATTACK = "BACK_ATTACK";
export const SURROUNDED = "SURROUNDED";

/** Turn to face `faced`: it loses Back Attack, every other living monster gains it. */
export function faceMonster(state: GameState, faced: number): GameState {
	return mapMonsters(state, (m) => {
		if (m.index === faced) return withoutPower(m, BACK_ATTACK);
		return m.alive ? withPower(m, BACK_ATTACK) : m;
	});
}

registerPowerHooks(
	SURROUNDED,
	(): HookSource => ({
		powerId: SURROUNDED,
		hooks: {
			onTargetMonster: (ctx, index) => {
				const target = ctx.combat.monsters[index];
				if (ctx.owner.type !== "player" || !target || !has(target.powers, BACK_ATTACK)) {
					return ctx.state;
				}
				return faceMonster(ctx.state, index);
			},
			// SpireShield/SpireSpear.die(): the survivor no longer flanks the player.
			onMonsterDeath: (ctx) => {
				if (ctx.owner.type !== "player") return ctx.state;
				const c = ctx.combat;
				const player = {
					...c.player,
					powers: c.player.powers.filter((p) => !isPower(p, SURROUNDED)),
				};
				const s = { ...ctx.state, combat: { ...c, player } };
				return mapMonsters(s, (m) => withoutPower(m, BACK_ATTACK));
			},
		},
	}),
);

// x1.5 after the attacker's Strength/Weak, before the player's Vulnerable
// (notes.surrounded). Monster attacks always target the player.
registerPowerHooks(
	BACK_ATTACK,
	(): HookSource => ({
		powerId: BACK_ATTACK,
		hooks: {
			atDamageFinalGive: (ctx, damage) =>
				ctx.owner.type === "monster" && has(ctx.combat.player.powers, SURROUNDED)
					? damage * 1.5
					: damage,
		},
	}),
);

// ── Beat of Death (Corrupt Heart) ───────────────────────────
// After every card the player plays: X THORNS damage to the player (blockable,
// no Strength/Weak/Vulnerable). The queue is empty at onAfterCardPlayed, so the
// hit runs right away.

registerPowerHooks(
	"BEAT_OF_DEATH",
	(p: PowerInstance): HookSource => ({
		powerId: "BEAT_OF_DEATH",
		hooks: {
			onAfterCardPlayed: (ctx) => {
				if (ctx.owner.type !== "monster" || p.amount <= 0) return ctx.state;
				const owner: ActorRef = ctx.owner;
				return run(ctx.state, [
					{
						type: "damage",
						source: owner,
						target: { type: "player" },
						baseDamage: p.amount,
						hits: 1,
						nonAttack: true,
					},
				]);
			},
		},
	}),
);

// ── Invincible (Corrupt Heart) ──────────────────────────────
// amount = HP the Heart can still lose this turn. Every HP loss through
// applyDamage is capped by it and spends it; it refills to 300 (A19: 200) at
// the start of the Heart's turn (applyPreTurnLogic, after the player's turn:
// the engine's end-of-turn step, before the monsters act).

export function invincibleCap(ascension: number): number {
	return ascension >= 19 ? 200 : 300;
}

function setOwnAmount(state: GameState, owner: ActorRef, id: string, amount: number): GameState {
	if (owner.type !== "monster") return state;
	return mapMonsters(state, (m) =>
		m.index === owner.index
			? { ...m, powers: m.powers.map((x) => (isPower(x, id) ? { ...x, amount } : x)) }
			: m,
	);
}

registerPowerHooks(
	"INVINCIBLE",
	(p: PowerInstance): HookSource => ({
		powerId: "INVINCIBLE",
		hooks: {
			onAttackedToChangeDamage: (ctx, hpLoss) => {
				const value = Math.min(hpLoss, Math.max(0, p.amount));
				return {
					value,
					state: setOwnAmount(ctx.state, ctx.owner, "INVINCIBLE", p.amount - value),
				};
			},
			atEndOfTurn: (ctx) =>
				setOwnAmount(ctx.state, ctx.owner, "INVINCIBLE", invincibleCap(ctx.state.ascension)),
		},
	}),
);
