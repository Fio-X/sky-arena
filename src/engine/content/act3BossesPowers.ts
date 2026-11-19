/**
 * Act 3 boss powers: Curiosity (Awakened One), Time Warp (Time Eater) and
 * Draw Reduction (Time Eater HEAD_SLAM, on the player).
 * Regenerate (Awakened One "REGEN") is already registered in monsterPowers.ts.
 */
import { applyPower } from "../combat/powers";
import type { HookSource } from "../core/hooks";
import { canonicalPowerId, registerPowerHooks } from "../core/hooks";
import type { ActorRef, GameState, PowerInstance } from "../core/types";
import { getCard } from "./loader";

function setOwnPowers(
	state: GameState,
	owner: ActorRef,
	fn: (powers: readonly PowerInstance[]) => PowerInstance[],
): GameState {
	const c = state.combat;
	if (!c) return state;
	if (owner.type === "player") {
		return { ...state, combat: { ...c, player: { ...c.player, powers: fn(c.player.powers) } } };
	}
	const m = c.monsters[owner.index];
	if (!m) return state;
	const monsters = [...c.monsters];
	monsters[owner.index] = { ...m, powers: fn(m.powers) };
	return { ...state, combat: { ...c, monsters } };
}

function gainStrength(state: GameState, owner: ActorRef, amount: number): GameState {
	return applyPower(state, owner, owner, canonicalPowerId("STRENGTH"), amount);
}

// ── Curiosity (Awakened One, phase 1) ───────────────────────
// Whenever the player plays a Power card, gains X Strength (X = 1, A19: 2).
// sts_lightspeed has this trigger commented out; the spec's conflict resolution
// follows the real game (wiki), so it is implemented here.

registerPowerHooks(
	"CURIOSITY",
	(p: PowerInstance): HookSource => ({
		powerId: "CURIOSITY",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				if (ctx.owner.type !== "monster" || getCard(card.id)?.type !== "power") return ctx.state;
				return gainStrength(ctx.state, ctx.owner, p.amount);
			},
		},
	}),
);

// ── Time Warp (Time Eater) ──────────────────────────────────
// Counts the player's cards. On the 12th: counter back to 0, the Time Eater
// gains 2 Strength and the player's turn ends right after that card.

export const TIME_WARP_LIMIT = 12;
const TIME_WARP_STRENGTH = 2;

registerPowerHooks(
	"TIME_WARP",
	(p: PowerInstance): HookSource => ({
		powerId: "TIME_WARP",
		hooks: {
			onAfterCardPlayed: (ctx) => {
				const owner = ctx.owner;
				if (owner.type !== "monster") return ctx.state;
				const next = p.amount + 1;
				const setCounter = (n: number) =>
					setOwnPowers(ctx.state, owner, (ps) =>
						ps.map((x) => (x.id === p.id ? { ...x, amount: n } : x)),
					);
				if (next < TIME_WARP_LIMIT) return setCounter(next);
				const s = gainStrength(setCounter(0), owner, TIME_WARP_STRENGTH);
				return s.combat ? { ...s, combat: { ...s.combat, endTurnRequested: true } } : s;
			},
		},
	}),
);

// ── Draw Reduction (player; Time Eater HEAD_SLAM) ───────────
// Draw X fewer cards at the start of the turn. Turn-based but not in the
// generic tick list: the round it is applied only clears justApplied (the
// original's justApplied for monster-sourced debuffs), then -1 per round.
// Net effect of Head Slam: the next turn draws one card less.

registerPowerHooks(
	"DRAW_REDUCTION",
	(p: PowerInstance): HookSource => ({
		powerId: "DRAW_REDUCTION",
		hooks: {
			modifyDrawPerTurn: (ctx, draw) => (ctx.owner.type === "player" ? draw - p.amount : draw),
			atEndOfRound: (ctx) =>
				setOwnPowers(ctx.state, ctx.owner, (ps) =>
					ps
						.map((x) => {
							if (x.id !== p.id) return x;
							return x.justApplied ? { ...x, justApplied: false } : { ...x, amount: x.amount - 1 };
						})
						.filter((x) => x.id !== p.id || x.amount > 0),
				),
		},
	}),
);
