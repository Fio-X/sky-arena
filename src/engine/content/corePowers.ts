import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type { GameState, PowerInstance } from "../core/types";
import { random } from "../rng/stsRandom";
import { getCard } from "./loader";

registerPowerHooks(
	"strength",
	(p: PowerInstance): HookSource => ({
		powerId: "strength",
		hooks: {
			atDamageGive: (_ctx, damage, _card) => damage + p.amount,
		},
	}),
);

registerPowerHooks(
	"dexterity",
	(p: PowerInstance): HookSource => ({
		powerId: "dexterity",
		hooks: {
			modifyBlock: (_ctx, block, _card) => block + p.amount,
		},
	}),
);

registerPowerHooks(
	"vulnerable",
	(_p: PowerInstance): HookSource => ({
		powerId: "vulnerable",
		hooks: {
			atDamageFinalReceive: (_ctx, damage, _card) => Math.floor(damage * 1.5),
		},
	}),
);

registerPowerHooks(
	"weak",
	(_p: PowerInstance): HookSource => ({
		powerId: "weak",
		hooks: {
			atDamageGive: (_ctx, damage, _card) => Math.floor(damage * 0.75),
		},
	}),
);

registerPowerHooks(
	"frail",
	(_p: PowerInstance): HookSource => ({
		powerId: "frail",
		hooks: {
			modifyBlock: (_ctx, block, _card) => Math.floor(block * 0.75),
		},
	}),
);

registerPowerHooks(
	"loseStrength",
	(p: PowerInstance): HookSource => ({
		powerId: "loseStrength",
		hooks: {
			atEndOfTurn: (ctx) => {
				const powers = ctx.combat.player.powers
					.map((pw) => (pw.id === "strength" ? { ...pw, amount: pw.amount - p.amount } : pw))
					.filter((pw) => pw.id !== "loseStrength");
				return {
					...ctx.state,
					combat: { ...ctx.combat, player: { ...ctx.combat.player, powers } },
				};
			},
		},
	}),
);

// ── Ironclad powers ──────────────────────────────────────

registerPowerHooks(
	"metallicize",
	(p: PowerInstance): HookSource => ({
		powerId: "metallicize",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (!ctx.combat) return ctx.state;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...ctx.combat.player, block: ctx.combat.player.block + p.amount },
					},
				};
			},
		},
	}),
);

registerPowerHooks(
	"demonForm",
	(p: PowerInstance): HookSource => ({
		powerId: "demonForm",
		hooks: {
			atStartOfTurn: (ctx) => {
				const powers = ctx.combat.player.powers.map((pw) =>
					pw.id === "strength" ? { ...pw, amount: pw.amount + p.amount } : pw,
				);
				const hasStr = powers.some((pw) => pw.id === "strength");
				const finalPowers = hasStr
					? powers
					: [...powers, { id: "strength" as never, amount: p.amount, justApplied: true }];
				return {
					...ctx.state,
					combat: { ...ctx.combat, player: { ...ctx.combat.player, powers: finalPowers } },
				};
			},
		},
	}),
);

registerPowerHooks(
	"barricade",
	(_p: PowerInstance): HookSource => ({
		powerId: "barricade",
		hooks: {
			modifyBlockRetention: (_ctx, _retained) => 999,
		},
	}),
);

registerPowerHooks(
	"combust",
	(p: PowerInstance): HookSource => ({
		powerId: "combust",
		hooks: {
			atEndOfTurn: (ctx) => {
				const s = { ...ctx.state, currentHp: Math.max(0, ctx.state.currentHp - 1) };
				if (!s.combat) return s;
				const monsters = s.combat.monsters.map((m) =>
					m.alive ? { ...m, currentHp: Math.max(0, m.currentHp - p.amount) } : m,
				);
				return { ...s, combat: { ...s.combat, monsters } };
			},
		},
	}),
);

registerPowerHooks(
	"darkEmbrace",
	(_p: PowerInstance): HookSource => ({
		powerId: "darkEmbrace",
		hooks: {
			onExhaust: (ctx, _card) => {
				if (!ctx.combat) return ctx.state;
				return drawCards(ctx.state, 1);
			},
		},
	}),
);

registerPowerHooks(
	"evolve",
	(p: PowerInstance): HookSource => ({
		powerId: "evolve",
		hooks: {
			onDraw: (ctx, card) => {
				const def = getCard(card.id);
				if (def?.type === "status") {
					return drawCards(ctx.state, p.amount);
				}
				return ctx.state;
			},
		},
	}),
);

registerPowerHooks(
	"feelNoPain",
	(p: PowerInstance): HookSource => ({
		powerId: "feelNoPain",
		hooks: {
			onExhaust: (ctx, _card) => {
				if (!ctx.combat) return ctx.state;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...ctx.combat.player, block: ctx.combat.player.block + p.amount },
					},
				};
			},
		},
	}),
);

registerPowerHooks(
	"fireBreathing",
	(p: PowerInstance): HookSource => ({
		powerId: "fireBreathing",
		hooks: {
			onDraw: (ctx, card) => {
				const def = getCard(card.id);
				if (def?.type === "status" || def?.type === "curse") {
					if (!ctx.combat) return ctx.state;
					const monsters = ctx.combat.monsters.map((m) =>
						m.alive ? { ...m, currentHp: Math.max(0, m.currentHp - p.amount) } : m,
					);
					return { ...ctx.state, combat: { ...ctx.combat, monsters } };
				}
				return ctx.state;
			},
		},
	}),
);

registerPowerHooks(
	"rage",
	(p: PowerInstance): HookSource => ({
		powerId: "rage",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				const def = getCard(card.id);
				if (def?.type === "attack" && ctx.combat) {
					return {
						...ctx.state,
						combat: {
							...ctx.combat,
							player: { ...ctx.combat.player, block: ctx.combat.player.block + p.amount },
						},
					};
				}
				return ctx.state;
			},
			atEndOfTurn: (ctx) => {
				const powers = ctx.combat.player.powers.filter((pw) => pw.id !== "rage");
				return {
					...ctx.state,
					combat: { ...ctx.combat, player: { ...ctx.combat.player, powers } },
				};
			},
		},
	}),
);

registerPowerHooks(
	"flameBarrier",
	(p: PowerInstance): HookSource => ({
		powerId: "flameBarrier",
		hooks: {
			onAttacked: (ctx, _damage, source) => {
				if (source.type !== "monster" || !ctx.combat) return ctx.state;
				const monsters = [...ctx.combat.monsters];
				const m = monsters[source.index];
				if (m?.alive) {
					monsters[source.index] = { ...m, currentHp: Math.max(0, m.currentHp - p.amount) };
				}
				return { ...ctx.state, combat: { ...ctx.combat, monsters } };
			},
		},
	}),
);

registerPowerHooks(
	"berserk",
	(_p: PowerInstance): HookSource => ({
		powerId: "berserk",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (!ctx.combat) return ctx.state;
				return {
					...ctx.state,
					combat: { ...ctx.combat, energy: ctx.combat.energy + 1 },
				};
			},
		},
	}),
);

registerPowerHooks(
	"brutality",
	(_p: PowerInstance): HookSource => ({
		powerId: "brutality",
		hooks: {
			atStartOfTurn: (ctx) => {
				const s = { ...ctx.state, currentHp: Math.max(0, ctx.state.currentHp - 1) };
				return drawCards(s, 1);
			},
		},
	}),
);

registerPowerHooks(
	"juggernaut",
	(p: PowerInstance): HookSource => ({
		powerId: "juggernaut",
		hooks: {
			onGainedBlock: (ctx, _amount) => {
				if (!ctx.combat) return ctx.state;
				const alive = ctx.combat.monsters.filter((m) => m.alive);
				if (alive.length === 0) return ctx.state;
				const r = random(ctx.state.rng.cardRng, alive.length - 1);
				const target = alive[r.value];
				if (!target) return ctx.state;
				const monsters = [...ctx.combat.monsters];
				monsters[target.index] = {
					...target,
					currentHp: Math.max(0, target.currentHp - p.amount),
				};
				return {
					...ctx.state,
					rng: { ...ctx.state.rng, cardRng: r.state },
					combat: { ...ctx.combat, monsters },
				};
			},
		},
	}),
);

registerPowerHooks(
	"rupture",
	(p: PowerInstance): HookSource => ({
		powerId: "rupture",
		hooks: {
			wasHPLost: (ctx, _amount) => {
				if (!ctx.combat) return ctx.state;
				const powers = ctx.combat.player.powers.map((pw) =>
					pw.id === "strength" ? { ...pw, amount: pw.amount + p.amount } : pw,
				);
				const hasStr = powers.some((pw) => pw.id === "strength");
				const finalPowers = hasStr
					? powers
					: [...powers, { id: "strength" as never, amount: p.amount, justApplied: true }];
				return {
					...ctx.state,
					combat: { ...ctx.combat, player: { ...ctx.combat.player, powers: finalPowers } },
				};
			},
		},
	}),
);

registerPowerHooks(
	"corruption",
	(_p: PowerInstance): HookSource => ({
		powerId: "corruption",
		hooks: {
			modifyCardCost: (_ctx, cost, card) => {
				const def = getCard(card.id);
				return def?.type === "skill" ? 0 : cost;
			},
		},
	}),
);

registerPowerHooks(
	"doubleTap",
	(_p: PowerInstance): HookSource => ({
		powerId: "doubleTap",
		hooks: {
			atEndOfTurn: (ctx) => {
				const powers = ctx.combat.player.powers.filter((pw) => pw.id !== "doubleTap");
				return {
					...ctx.state,
					combat: { ...ctx.combat, player: { ...ctx.combat.player, powers } },
				};
			},
		},
	}),
);

// ── Intangible ──────────────────────────────────────────
// Reduce ALL damage taken to 1. turnBased, decrements each turn.

registerPowerHooks(
	"intangible",
	(_p: PowerInstance): HookSource => ({
		powerId: "intangible",
		hooks: {
			atDamageFinalReceive: (_ctx, damage, _card) => (damage > 0 ? 1 : 0),
		},
	}),
);

// ── Plated Armor ────────────────────────────────────────
// End of turn: gain X Block. When you take unblocked damage, lose 1 stack.

registerPowerHooks(
	"platedArmor",
	(p: PowerInstance): HookSource => ({
		powerId: "platedArmor",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (!ctx.combat) return ctx.state;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...ctx.combat.player, block: ctx.combat.player.block + p.amount },
					},
				};
			},
			wasHPLost: (ctx, amount) => {
				if (amount <= 0 || !ctx.combat) return ctx.state;
				const newAmount = p.amount - 1;
				const powers =
					newAmount > 0
						? ctx.combat.player.powers.map((pw) =>
								pw.id === "platedArmor" ? { ...pw, amount: newAmount } : pw,
							)
						: ctx.combat.player.powers.filter((pw) => pw.id !== "platedArmor");
				return {
					...ctx.state,
					combat: { ...ctx.combat, player: { ...ctx.combat.player, powers } },
				};
			},
		},
	}),
);

// ── Regen ───────────────────────────────────────────────
// End of turn: heal X HP. turnBased, decrements each turn.

registerPowerHooks(
	"regen",
	(p: PowerInstance): HookSource => ({
		powerId: "regen",
		hooks: {
			atEndOfTurn: (ctx) => {
				const healed = Math.min(p.amount, ctx.state.maxHp - ctx.state.currentHp);
				return { ...ctx.state, currentHp: ctx.state.currentHp + healed };
			},
		},
	}),
);

// ── Ritual (player) ─────────────────────────────────────
// End of round: gain X Strength. Skips first round (justApplied).

registerPowerHooks(
	"ritual",
	(p: PowerInstance): HookSource => ({
		powerId: "ritual",
		hooks: {
			atEndOfRound: (ctx) => {
				if (p.justApplied) {
					const powers = ctx.combat.player.powers.map((pw) =>
						pw.id === "ritual" ? { ...pw, justApplied: false } : pw,
					);
					return {
						...ctx.state,
						combat: { ...ctx.combat, player: { ...ctx.combat.player, powers } },
					};
				}
				const powers = ctx.combat.player.powers.map((pw) =>
					pw.id === "strength" ? { ...pw, amount: pw.amount + p.amount } : pw,
				);
				const hasStr = powers.some((pw) => pw.id === "strength");
				const finalPowers = hasStr
					? powers
					: [...powers, { id: "strength" as never, amount: p.amount, justApplied: true }];
				return {
					...ctx.state,
					combat: { ...ctx.combat, player: { ...ctx.combat.player, powers: finalPowers } },
				};
			},
		},
	}),
);

// ── Confused ────────────────────────────────────────────
// Whenever you draw a card, randomize its cost (0 to 3).

registerPowerHooks(
	"confused",
	(_p: PowerInstance): HookSource => ({
		powerId: "confused",
		hooks: {
			onDraw: (ctx, card) => {
				if (!ctx.combat) return ctx.state;
				const r = random(ctx.state.rng.cardRng, 3);
				const hand = ctx.combat.hand.map((c) =>
					c.uniqueId === card.uniqueId ? { ...c, costForTurn: r.value } : c,
				);
				return {
					...ctx.state,
					rng: { ...ctx.state.rng, cardRng: r.state },
					combat: { ...ctx.combat, hand },
				};
			},
		},
	}),
);

// ── Helper ───────────────────────────────────────────────

function drawCards(state: GameState, count: number): GameState {
	if (!state.combat) return state;
	let combat = state.combat;
	for (let i = 0; i < count; i++) {
		if (combat.hand.length >= 10) break;
		if (combat.drawPile.length === 0) break;
		const card = combat.drawPile[combat.drawPile.length - 1];
		if (!card) break;
		combat = {
			...combat,
			drawPile: combat.drawPile.slice(0, -1),
			hand: [...combat.hand, card],
		};
	}
	return { ...state, combat };
}
