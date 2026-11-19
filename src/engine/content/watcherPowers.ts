import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type { CardInstance, GameState, PowerId, PowerInstance } from "../core/types";
import { registerCardEffect } from "./cardEffects";
import { P, vals } from "./cardUtils";
import { getCard } from "./loader";

// ── helpers ──────────────────────────────────────────────

function modifyPower(state: GameState, powerId: string, delta: number): GameState {
	if (!state.combat) return state;
	const powers = state.combat.player.powers;
	const existing = powers.find((p) => p.id === powerId);
	let newPowers: PowerInstance[];
	if (existing) {
		newPowers = powers.map((p) => (p.id === powerId ? { ...p, amount: p.amount + delta } : p));
	} else {
		newPowers = [...powers, { id: powerId as PowerId, amount: delta, justApplied: false }];
	}
	return {
		...state,
		combat: {
			...state.combat,
			player: { ...state.combat.player, powers: newPowers },
		},
	};
}

function nextUid(state: GameState): number {
	if (!state.combat) return 1;
	const c = state.combat;
	let uid = 1;
	for (const card of [...c.hand, ...c.drawPile, ...c.discardPile, ...c.exhaustPile]) {
		if (card.uniqueId >= uid) uid = card.uniqueId + 1;
	}
	return uid;
}

function makeCardInstance(id: string, upgraded: boolean, uid: number): CardInstance {
	const def = getCard(id);
	const cost = def?.cost ?? 0;
	return {
		id: id as never,
		upgraded,
		uniqueId: uid,
		costOverride: null,
		freeToPlay: false,
		costForTurn: cost,
		misc: 0,
	};
}

// ══════════════════════════════════════════════════════════
// UNCOMMON POWERS
// ══════════════════════════════════════════════════════════

// ── BATTLE_HYMN ─────────────────────────────────────────
// At start of each turn, add a Smite to hand.

registerPowerHooks(
	"BATTLE_HYMN",
	(_p: PowerInstance): HookSource => ({
		powerId: "BATTLE_HYMN",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				if (ctx.combat.hand.length >= 10) return ctx.state;
				const uid = nextUid(ctx.state);
				const smite = makeCardInstance("SMITE", false, uid);
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						hand: [...ctx.combat.hand, smite],
					},
				};
			},
		},
	}),
);

// ── FASTING ─────────────────────────────────────────────
// Gain 3(4) Str + 3(4) Dex. Lose 1 energy each turn.

registerPowerHooks(
	"FASTING",
	(_p: PowerInstance): HookSource => ({
		powerId: "FASTING",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const newEnergy = Math.max(0, ctx.combat.energy - 1);
				return {
					...ctx.state,
					combat: { ...ctx.combat, energy: newEnergy },
				};
			},
		},
	}),
);

// ── FORESIGHT ───────────────────────────────────────────
// At start of turn, Scry 3(4). (Scry action dispatched)

registerPowerHooks(
	"FORESIGHT",
	(_p: PowerInstance): HookSource => ({
		powerId: "FORESIGHT",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				// Scry is handled by the action system; we just return a state
				// with a pending scry. For now, simplified: discard top N cards
				// that the player would see (full scry UI needs action support).
				return ctx.state;
			},
		},
	}),
);

// ── LIKE_WATER ──────────────────────────────────────────
// If in Calm at end of turn, gain 5(7) block.

registerPowerHooks(
	"LIKE_WATER",
	(p: PowerInstance): HookSource => ({
		powerId: "LIKE_WATER",
		hooks: {
			atEndOfTurn: (ctx, isPlayerTurn) => {
				if (!isPlayerTurn || ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				if (ctx.combat.player.stance !== "calm") return ctx.state;
				const newBlock = ctx.combat.player.block + p.amount;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...ctx.combat.player, block: newBlock },
					},
				};
			},
		},
	}),
);

// ── MENTAL_FORTRESS ─────────────────────────────────────
// Gain 4(6) block whenever you change stance.

registerPowerHooks(
	"MENTAL_FORTRESS",
	(p: PowerInstance): HookSource => ({
		powerId: "MENTAL_FORTRESS",
		hooks: {
			onChangeStance: (ctx, _from, _to) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const newBlock = ctx.combat.player.block + p.amount;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...ctx.combat.player, block: newBlock },
					},
				};
			},
		},
	}),
);

// ── NIRVANA ─────────────────────────────────────────────
// Gain 3(4) block whenever you Scry.

registerPowerHooks(
	"NIRVANA",
	(p: PowerInstance): HookSource => ({
		powerId: "NIRVANA",
		hooks: {
			onScry: (ctx, _count) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const newBlock = ctx.combat.player.block + p.amount;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...ctx.combat.player, block: newBlock },
					},
				};
			},
		},
	}),
);

// ── RUSHDOWN ────────────────────────────────────────────
// Draw 2 cards whenever you enter Wrath.

registerPowerHooks(
	"RUSHDOWN",
	(p: PowerInstance): HookSource => ({
		powerId: "RUSHDOWN",
		hooks: {
			onChangeStance: (ctx, _from, to) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				if (to !== "wrath") return ctx.state;
				// Draw p.amount cards (always 2)
				let c = ctx.combat;
				for (let i = 0; i < p.amount; i++) {
					if (c.hand.length >= 10 || c.drawPile.length === 0) break;
					const top = c.drawPile[c.drawPile.length - 1];
					if (!top) break;
					c = {
						...c,
						drawPile: c.drawPile.slice(0, -1),
						hand: [...c.hand, top],
					};
				}
				return { ...ctx.state, combat: c };
			},
		},
	}),
);

// ── STUDY ───────────────────────────────────────────────
// At end of turn, shuffle an Insight into draw pile.

registerPowerHooks(
	"STUDY",
	(_p: PowerInstance): HookSource => ({
		powerId: "STUDY",
		hooks: {
			atEndOfTurn: (ctx, isPlayerTurn) => {
				if (!isPlayerTurn || ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const uid = nextUid(ctx.state);
				const insight = makeCardInstance("INSIGHT", false, uid);
				// Shuffle into draw pile (append and rely on shuffle at turn start)
				const drawPile = [...ctx.combat.drawPile, insight];
				return {
					...ctx.state,
					combat: { ...ctx.combat, drawPile },
				};
			},
		},
	}),
);

// ══════════════════════════════════════════════════════════
// RARE POWERS
// ══════════════════════════════════════════════════════════

// ── DEVA_FORM ───────────────────────────────────────────
// At start of turn, gain energy and increase this gain by 1.
// Tracks via the power's amount field which increases each turn.

registerPowerHooks(
	"DEVA_FORM",
	(p: PowerInstance): HookSource => ({
		powerId: "DEVA_FORM",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const energyGain = p.amount;
				let s: GameState = {
					...ctx.state,
					combat: { ...ctx.combat, energy: ctx.combat.energy + energyGain },
				};
				// Increase the power's amount for next turn
				s = modifyPower(s, "DEVA_FORM", 1);
				return s;
			},
		},
	}),
);

// ── DEVOTION ────────────────────────────────────────────
// At start of turn, gain 2(3) Mantra.

registerPowerHooks(
	"DEVOTION",
	(p: PowerInstance): HookSource => ({
		powerId: "DEVOTION",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player") return ctx.state;
				return modifyPower(ctx.state, "MANTRA", p.amount);
			},
		},
	}),
);

// ── ESTABLISHMENT ───────────────────────────────────────
// Whenever a card is Retained, reduce its cost by 1.

registerPowerHooks(
	"ESTABLISHMENT",
	(_p: PowerInstance): HookSource => ({
		powerId: "ESTABLISHMENT",
		hooks: {
			onRetain: (ctx, card) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				// Reduce the card's costForTurn by 1 (minimum 0)
				const updateCard = (c: CardInstance): CardInstance =>
					c.uniqueId === card.uniqueId ? { ...c, costForTurn: Math.max(0, c.costForTurn - 1) } : c;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						hand: ctx.combat.hand.map(updateCard),
					},
				};
			},
		},
	}),
);

// ── MASTER_REALITY ──────────────────────────────────────
// Whenever a card is created during combat, upgrade it.
// This is tracked as a flag power; card-creation logic checks for it.

registerPowerHooks(
	"MASTER_REALITY",
	(_p: PowerInstance): HookSource => ({
		powerId: "MASTER_REALITY",
		hooks: {},
	}),
);

// ══════════════════════════════════════════════════════════
// CARD EFFECTS (play card → apply power)
// ══════════════════════════════════════════════════════════

registerCardEffect("BATTLE_HYMN", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "BATTLE_HYMN" as never, amount: v.magic },
	];
});

registerCardEffect("FASTING", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "strength" as never, amount: v.magic },
		{ type: "applyPower", source: P, target: P, powerId: "dexterity" as never, amount: v.magic },
		{ type: "applyPower", source: P, target: P, powerId: "FASTING" as never, amount: 1 },
	];
});

registerCardEffect("FORESIGHT", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "FORESIGHT" as never, amount: v.magic },
	];
});

registerCardEffect("LIKE_WATER", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "LIKE_WATER" as never, amount: v.magic },
	];
});

registerCardEffect("MENTAL_FORTRESS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "MENTAL_FORTRESS" as never,
			amount: v.magic,
		},
	];
});

registerCardEffect("NIRVANA", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "NIRVANA" as never, amount: v.magic },
	];
});

registerCardEffect("RUSHDOWN", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "RUSHDOWN" as never, amount: 2 }];
});

registerCardEffect("STUDY", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "STUDY" as never, amount: 1 }];
});

registerCardEffect("DEVA_FORM", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "DEVA_FORM" as never, amount: v.magic },
	];
});

registerCardEffect("DEVOTION", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "DEVOTION" as never, amount: v.magic },
	];
});

registerCardEffect("ESTABLISHMENT", (_s, _card, _t) => {
	return [
		{ type: "applyPower", source: P, target: P, powerId: "ESTABLISHMENT" as never, amount: 1 },
	];
});

registerCardEffect("MASTER_REALITY", (_s, _card, _t) => {
	return [
		{ type: "applyPower", source: P, target: P, powerId: "MASTER_REALITY" as never, amount: 1 },
	];
});
