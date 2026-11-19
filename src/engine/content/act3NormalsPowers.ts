/**
 * Act 3 normal-monster powers: Strength Up (Orb Walker), Explosive (Exploder),
 * Fading / Shifting / Shackled (Transient), Constricted (Spire Growth, on the
 * player), Life Link (Darkling) and Reactive (Writhing Mass).
 *
 * Monster "end of its turn" effects use atEndOfRound: in this engine a
 * monster's atEndOfTurn fires BEFORE the monsters act (see silentPowers POISON),
 * while atEndOfRound fires after every monster has acted — the original
 * MonsterGroup.applyEndOfTurnPowers timing.
 */
import { applyDamage, calculateNonAttackDamage } from "../combat/damage";
import { buildIntent } from "../combat/monsterTurn";
import { addToBot } from "../core/actionQueue";
import type { HookSource } from "../core/hooks";
import { fireHook, registerPowerHooks } from "../core/hooks";
import type { ActorRef, GameState, MonsterState, PowerId, PowerInstance } from "../core/types";
import { getMonsterAi } from "./monsterAi";

// ── helpers ─────────────────────────────────────────────────

export function updateMonster(
	state: GameState,
	index: number,
	fn: (m: MonsterState) => MonsterState,
): GameState {
	const c = state.combat;
	const m = c?.monsters[index];
	if (!c || !m) return state;
	const monsters = [...c.monsters];
	monsters[index] = fn(m);
	return { ...state, combat: { ...c, monsters } };
}

export function powerOf(m: { powers: readonly PowerInstance[] }, id: string): number {
	return m.powers.find((p) => p.id === id)?.amount ?? 0;
}

/** Add `delta` to a power (created if missing, removed when it reaches 0). */
export function addPower(m: MonsterState, id: string, delta: number): MonsterState {
	const existing = m.powers.find((p) => p.id === id);
	const amount = (existing?.amount ?? 0) + delta;
	if (existing) {
		const powers =
			amount === 0
				? m.powers.filter((p) => p.id !== id)
				: m.powers.map((p) => (p.id === id ? { ...p, amount } : p));
		return { ...m, powers };
	}
	if (amount === 0) return m;
	return { ...m, powers: [...m.powers, { id: id as PowerId, amount, justApplied: false }] };
}

function onLivingMonster(
	ctx: { state: GameState; owner: ActorRef },
	fn: (m: MonsterState) => MonsterState,
): GameState {
	if (ctx.owner.type !== "monster") return ctx.state;
	return updateMonster(ctx.state, ctx.owner.index, (m) => (m.alive ? fn(m) : m));
}

// ── Strength Up (Orb Walker) ────────────────────────────────
// GenericStrengthUpPower.atEndOfRound: gain X Strength every round (from round 1).

registerPowerHooks(
	"GENERIC_STRENGTH_UP",
	(p: PowerInstance): HookSource => ({
		powerId: "GENERIC_STRENGTH_UP",
		hooks: {
			atEndOfRound: (ctx) => onLivingMonster(ctx, (m) => addPower(m, "strength", p.amount)),
		},
	}),
);

// ── Explosive (Exploder) ────────────────────────────────────
// Countdown display only: the explosion itself is the EXPLODER_EXPLODE move,
// which the AI picks on the 3rd turn (spec: "the in-game EXPLOSIVE power is just
// the 3-turn countdown display"). 3 → 2 → 1, explodes on the turn it shows 1.

registerPowerHooks(
	"EXPLOSIVE",
	(p: PowerInstance): HookSource => ({
		powerId: "EXPLOSIVE",
		hooks: {
			atEndOfRound: (ctx) =>
				p.amount > 1 ? onLivingMonster(ctx, (m) => addPower(m, "EXPLOSIVE", -1)) : ctx.state,
		},
	}),
);

// ── Fading (Transient) ──────────────────────────────────────
// No hooks: TRANSIENT_ATTACK's move handler reads and decrements it (spec:
// "if FADING == 1 at execution time -> Suicide ... then decrement FADING").
// Registered so the data name maps to this uppercase id.

registerPowerHooks("FADING", (): HookSource => ({ powerId: "FADING", hooks: {} }));

// ── Shifting / Shackled (Transient) ─────────────────────────
// Shifting: on HP loss, lose that much Strength and gain that much Shackled.
// Shackled: at the end of the monster's turn, regain X Strength and go away.

registerPowerHooks(
	"SHIFTING",
	(): HookSource => ({
		powerId: "SHIFTING",
		hooks: {
			wasHPLost: (ctx, amount) =>
				amount > 0
					? onLivingMonster(ctx, (m) =>
							addPower(addPower(m, "strength", -amount), "SHACKLED", amount),
						)
					: ctx.state,
		},
	}),
);

registerPowerHooks(
	"SHACKLED",
	(p: PowerInstance): HookSource => ({
		powerId: "SHACKLED",
		hooks: {
			atEndOfRound: (ctx) =>
				onLivingMonster(ctx, (m) =>
					addPower(addPower(m, "strength", p.amount), "SHACKLED", -p.amount),
				),
		},
	}),
);

// ── Constricted (player, from Spire Growth) ─────────────────
// ConstrictedPower.atEndOfTurn: DamageInfo(source, X, THORNS) on the owner —
// block and Intangible apply, Strength/Weak/Vulnerable do not. Permanent.

registerPowerHooks(
	"CONSTRICTED",
	(p: PowerInstance): HookSource => ({
		powerId: "CONSTRICTED",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (ctx.owner.type !== "player") return ctx.state;
				const calc = calculateNonAttackDamage(ctx.state, ctx.owner, p.amount);
				const applied = applyDamage(calc.state, ctx.owner, calc.damage);
				return applied.hpLost > 0
					? fireHook(applied.state, ctx.owner, "wasHPLost", applied.hpLost)
					: applied.state;
			},
		},
	}),
);

// ── Life Link (Darkling) ────────────────────────────────────
// Regrow/revive is the DARKLING death interceptor + REGROW/REINCARNATE moves
// (act3Normals.ts). This hook covers the other half of Monster::die: when a
// Darkling really dies (no other monster alive), monstersAlive hits 0 and the
// player wins even while other Darklings are regrowing, so their halfDead
// state is cleared here.

registerPowerHooks(
	"LIFE_LINK",
	(): HookSource => ({
		powerId: "LIFE_LINK",
		hooks: {
			onMonsterDeath: (ctx) => {
				const c = ctx.state.combat;
				if (!c) return ctx.state;
				const monsters = c.monsters.map((m) =>
					m.halfDead ? { ...m, halfDead: false, alive: false, currentHp: 0 } : m,
				);
				return { ...ctx.state, combat: { ...c, monsters } };
			},
		},
	}),
);

// ── Reactive (Writhing Mass) ────────────────────────────────
// ReactivePower.onAttacked: non-lethal attack damage > 0 → addToBot(RollMoveAction).
// The reroll runs the monster's AI with its current intent as lastMove (the
// original's setMove pushes intents into moveHistory), so it cannot repeat it.

/** RollMoveAction for a living monster: one AI call, the result becomes its intent. */
export function rerollIntent(state: GameState, index: number): GameState {
	const c = state.combat;
	const m = c?.monsters[index];
	const ai = m ? getMonsterAi(m.id) : undefined;
	if (!c || !m?.alive || !ai) return state;
	const withIntent: MonsterState = { ...m, moveHistory: [...m.moveHistory, m.intent.moveId] };
	const probe = updateMonster(state, index, () => withIntent);
	const result = ai({ state: probe, monsterIndex: index, aiRng: state.rng.aiRng });
	const next: MonsterState = { ...m, miscInfo: result.miscInfo ?? m.miscInfo };
	return {
		...updateMonster(state, index, () => ({
			...next,
			intent: buildIntent(next, result.moveId, state.ascension, state.currentHp),
		})),
		rng: { ...state.rng, aiRng: result.aiRng },
	};
}

registerPowerHooks(
	"REACTIVE",
	(): HookSource => ({
		powerId: "REACTIVE",
		hooks: {
			onAttacked: (ctx, damage) => {
				if (ctx.owner.type !== "monster" || damage <= 0) return ctx.state;
				const index = ctx.owner.index;
				if (!ctx.combat.monsters[index]?.alive) return ctx.state;
				return {
					...ctx.state,
					combat: addToBot(ctx.combat, {
						type: "custom",
						execute: (s) => rerollIntent(s, index),
					}),
				};
			},
		},
	}),
);
