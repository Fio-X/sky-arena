/**
 * Act 2 monster powers: Flight (Byrd), Malleable (Snake Plant), Painful Stabs
 * (Book of Stabbing), Minion Leader (Gremlin Leader / Collector / Automaton),
 * Stasis (Bronze Orb) and Hex (Chosen, on the player).
 */
import { buildIntent } from "../combat/monsterTurn";
import { addToBot } from "../core/actionQueue";
import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type {
	CardId,
	CardInstance,
	GameState,
	MonsterMoveId,
	MonsterState,
	PowerInstance,
} from "../core/types";
import { random } from "../rng/stsRandom";
import { getCard } from "./loader";

// ── helpers ─────────────────────────────────────────────────

function updateMonster(
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

function setAmount(m: MonsterState, id: string, amount: number): MonsterState {
	const powers =
		amount > 0
			? m.powers.map((p) => (p.id === id ? { ...p, amount } : p))
			: m.powers.filter((p) => p.id !== id);
	return { ...m, powers };
}

/** Replace the monster's current intent (Byrd grounded, Parasite stunned). */
export function setMonsterMove(state: GameState, index: number, moveId: string): GameState {
	return updateMonster(state, index, (m) => ({
		...m,
		intent: buildIntent(m, moveId as MonsterMoveId, state.ascension, state.currentHp),
	}));
}

function nextUid(state: GameState): number {
	const c = state.combat;
	let uid = 1;
	for (const card of [...(c?.hand ?? []), ...(c?.drawPile ?? []), ...(c?.discardPile ?? [])]) {
		if (card.uniqueId >= uid) uid = card.uniqueId + 1;
	}
	for (const card of c?.exhaustPile ?? []) if (card.uniqueId >= uid) uid = card.uniqueId + 1;
	return uid;
}

function makeCard(id: string, uid: number): CardInstance {
	return {
		id: id as CardId,
		uniqueId: uid,
		upgraded: false,
		costOverride: null,
		costForTurn: getCard(id)?.cost ?? 0,
		freeToPlay: false,
		misc: 0,
	};
}

// ── Flight (Byrd) ───────────────────────────────────────────
// Attack damage x0.5; each damaging hit -1; at 0 the Byrd is grounded (STUNNED).
// Resets to 3 (A17: 4) at the start of each round if not fully removed.

registerPowerHooks(
	"FLIGHT",
	(p: PowerInstance): HookSource => ({
		powerId: "FLIGHT",
		hooks: {
			atDamageFinalReceive: (ctx, damage) => (ctx.owner.type === "monster" ? damage * 0.5 : damage),
			onAttacked: (ctx, damage) => {
				if (ctx.owner.type !== "monster" || damage <= 0) return ctx.state;
				const index = ctx.owner.index;
				const s = updateMonster(ctx.state, index, (m) => setAmount(m, "FLIGHT", p.amount - 1));
				return p.amount - 1 > 0 ? s : setMonsterMove(s, index, "BYRD_STUNNED");
			},
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				const base = ctx.state.ascension >= 17 ? 4 : 3;
				return updateMonster(ctx.state, ctx.owner.index, (m) => setAmount(m, "FLIGHT", base));
			},
		},
	}),
);

// ── Malleable (Snake Plant) ─────────────────────────────────
// On unblocked attack damage: gain X block, X += 1. Resets to 3 after the round.

registerPowerHooks(
	"MALLEABLE",
	(p: PowerInstance): HookSource => ({
		powerId: "MALLEABLE",
		hooks: {
			onAttacked: (ctx, damage) => {
				if (ctx.owner.type !== "monster" || damage <= 0) return ctx.state;
				return updateMonster(ctx.state, ctx.owner.index, (m) =>
					m.alive ? { ...setAmount(m, "MALLEABLE", p.amount + 1), block: m.block + p.amount } : m,
				);
			},
			atEndOfRound: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				return updateMonster(ctx.state, ctx.owner.index, (m) => setAmount(m, "MALLEABLE", 3));
			},
		},
	}),
);

// ── Painful Stabs (Book of Stabbing) ────────────────────────
// Each hit of its attacks that deals unblocked damage adds X Wounds to discard.

registerPowerHooks(
	"PAINFUL_STABS",
	(p: PowerInstance): HookSource => ({
		powerId: "PAINFUL_STABS",
		hooks: {
			onAttack: (ctx, damage, target) => {
				if (ctx.owner.type !== "monster" || target.type !== "player" || damage <= 0) {
					return ctx.state;
				}
				let combat = ctx.combat;
				for (let i = 0; i < p.amount; i++) {
					combat = addToBot(combat, {
						type: "addCardToDiscardPile",
						cardId: "WOUND" as CardId,
						upgraded: false,
					});
				}
				return { ...ctx.state, combat };
			},
		},
	}),
);

// ── Minion Leader ───────────────────────────────────────────
// When the leader dies, every living MINION abandons combat.

registerPowerHooks(
	"MINION_LEADER",
	(): HookSource => ({
		powerId: "MINION_LEADER",
		hooks: {
			onMonsterDeath: (ctx) => {
				let combat = ctx.combat;
				for (const m of combat.monsters) {
					if (!m.alive || !m.powers.some((pw) => pw.id.toUpperCase() === "MINION")) continue;
					combat = addToBot(combat, { type: "escape", monsterIndex: m.index });
				}
				return { ...ctx.state, combat };
			},
		},
	}),
);

// ── Stasis (Bronze Orb) ─────────────────────────────────────
// On death, the stolen card goes back to the hand (discard pile if the hand is full).

registerPowerHooks(
	"STASIS",
	(): HookSource => ({
		powerId: "STASIS",
		hooks: {
			onMonsterDeath: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				const index = ctx.owner.index;
				const held = ctx.combat.monsters[index]?.heldCard;
				if (!held) return ctx.state;
				const s = updateMonster(ctx.state, index, (m) => ({ ...m, heldCard: undefined }));
				const c = s.combat;
				if (!c) return s;
				const toHand = c.hand.length < 10;
				return {
					...s,
					combat: {
						...c,
						hand: toHand ? [...c.hand, held] : c.hand,
						discardPile: toHand ? c.discardPile : [...c.discardPile, held],
					},
				};
			},
		},
	}),
);

// ── Hex (Chosen → player) ───────────────────────────────────
// Whenever the player plays a non-Attack, shuffle X Dazed into the draw pile
// (random positions, cardRandomRng). Fired after the card resolves: onUseCard
// is not dispatched by the engine yet.

registerPowerHooks(
	"HEX",
	(p: PowerInstance): HookSource => ({
		powerId: "HEX",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				if (ctx.owner.type !== "player" || getCard(card.id)?.type === "attack") return ctx.state;
				let s = ctx.state;
				for (let i = 0; i < p.amount; i++) {
					const c = s.combat;
					if (!c) return s;
					const roll = random(s.rng.cardRandomRng, c.drawPile.length);
					const drawPile = [...c.drawPile];
					drawPile.splice(roll.value, 0, makeCard("DAZED", nextUid(s)));
					s = { ...s, combat: { ...c, drawPile }, rng: { ...s.rng, cardRandomRng: roll.state } };
				}
				return s;
			},
		},
	}),
);
