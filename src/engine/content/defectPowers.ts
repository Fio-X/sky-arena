import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import { channelOrb } from "../core/orbSystem";
import type { CardInstance, GameState, PowerId, PowerInstance } from "../core/types";
import { random } from "../rng/stsRandom";
import { getAllCardsByColorAndType } from "./cardUtils";
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

function removePowerFromPlayer(state: GameState, powerId: string): GameState {
	if (!state.combat) return state;
	const powers = state.combat.player.powers.filter((p) => p.id !== powerId);
	return {
		...state,
		combat: {
			...state.combat,
			player: { ...state.combat.player, powers },
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

// ── BIAS (Biased Cognition) ─────────────────────────────
// At start of turn, lose 1 Focus.

registerPowerHooks(
	"BIAS",
	(_p: PowerInstance): HookSource => ({
		powerId: "BIAS",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player") return ctx.state;
				return modifyPower(ctx.state, "FOCUS", -1);
			},
		},
	}),
);

// ── BUFFER ──────────────────────────────────────────────
// Prevent next N times you lose HP. Intercept via atDamageReceive fold.

registerPowerHooks(
	"BUFFER",
	(p: PowerInstance): HookSource => ({
		powerId: "BUFFER",
		hooks: {
			atDamageReceive: (ctx, damage, _card) => {
				if (ctx.owner.type !== "player" || damage <= 0) return damage;
				const newAmount = p.amount - 1;
				let s = ctx.state;
				if (newAmount <= 0) {
					s = removePowerFromPlayer(s, "BUFFER");
				} else {
					s = modifyPower(s, "BUFFER", -1);
				}
				return { value: 0, state: s };
			},
		},
	}),
);

// ── CREATIVE_AI ─────────────────────────────────────────
// At start of turn, add a random Power card to hand.

registerPowerHooks(
	"CREATIVE_AI",
	(_p: PowerInstance): HookSource => ({
		powerId: "CREATIVE_AI",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				if (ctx.combat.hand.length >= 10) return ctx.state;
				const powerCards = getAllCardsByColorAndType("blue", "power");
				if (powerCards.length === 0) return ctx.state;
				const r = random(ctx.state.rng.cardRandomRng, powerCards.length - 1);
				const chosen = powerCards[r.value];
				if (!chosen) return { ...ctx.state, rng: { ...ctx.state.rng, cardRandomRng: r.state } };
				const uid = nextUid(ctx.state);
				const card = makeCardInstance(chosen.id as string, false, uid);
				return {
					...ctx.state,
					rng: { ...ctx.state.rng, cardRandomRng: r.state },
					combat: {
						...ctx.combat,
						hand: [...ctx.combat.hand, card],
					},
				};
			},
		},
	}),
);

// ── ECHO_FORM ───────────────────────────────────────────
// First card played each turn is played twice.
// Tracking: uses ECHO_FORM_READY counter reset at turn start.
// The actual replay is handled in step.ts (replayIfEchoForm).

registerPowerHooks(
	"ECHO_FORM",
	(p: PowerInstance): HookSource => ({
		powerId: "ECHO_FORM",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player") return ctx.state;
				// Reset ready counter to the number of echo forms
				return modifyEchoReady(ctx.state, p.amount);
			},
		},
	}),
);

function modifyEchoReady(state: GameState, amount: number): GameState {
	if (!state.combat) return state;
	const powers = state.combat.player.powers;
	const existing = powers.find((p) => p.id === "ECHO_FORM_READY");
	let newPowers: PowerInstance[];
	if (existing) {
		newPowers = powers.map((p) => (p.id === "ECHO_FORM_READY" ? { ...p, amount } : p));
	} else {
		newPowers = [...powers, { id: "ECHO_FORM_READY" as PowerId, amount, justApplied: false }];
	}
	return {
		...state,
		combat: {
			...state.combat,
			player: { ...state.combat.player, powers: newPowers },
		},
	};
}

// ── ELECTRO (Electrodynamics) ───────────────────────────
// Lightning hits ALL enemies. Stored as a flag power; orbSystem checks for it.

registerPowerHooks(
	"ELECTRO",
	(_p: PowerInstance): HookSource => ({
		powerId: "ELECTRO",
		hooks: {},
	}),
);

// ── HEATSINK (Heatsinks) ────────────────────────────────
// When a Power card is played, draw 1 card.

registerPowerHooks(
	"HEATSINK",
	(p: PowerInstance): HookSource => ({
		powerId: "HEATSINK",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const def = getCard(card.id);
				if (def?.type !== "power") return ctx.state;
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

// ── HELLO_WORLD ─────────────────────────────────────────
// At start of turn, add a random Common card to hand.

registerPowerHooks(
	"HELLO_WORLD",
	(_p: PowerInstance): HookSource => ({
		powerId: "HELLO_WORLD",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				if (ctx.combat.hand.length >= 10) return ctx.state;
				const commons = getAllCardsByColorAndType("blue", "attack")
					.concat(getAllCardsByColorAndType("blue", "skill"))
					.filter((c) => c.rarity === "common");
				if (commons.length === 0) return ctx.state;
				const r = random(ctx.state.rng.cardRandomRng, commons.length - 1);
				const chosen = commons[r.value];
				if (!chosen) return { ...ctx.state, rng: { ...ctx.state.rng, cardRandomRng: r.state } };
				const uid = nextUid(ctx.state);
				const card = makeCardInstance(chosen.id as string, false, uid);
				return {
					...ctx.state,
					rng: { ...ctx.state.rng, cardRandomRng: r.state },
					combat: {
						...ctx.combat,
						hand: [...ctx.combat.hand, card],
					},
				};
			},
		},
	}),
);

// ── LOCK_ON ─────────────────────────────────────────────
// +50% damage from orbs. Already handled in orbSystem via hasLockOn.
// Register as a placeholder so the power is recognized.

registerPowerHooks(
	"LOCK_ON",
	(_p: PowerInstance): HookSource => ({
		powerId: "LOCK_ON",
		hooks: {},
	}),
);

// ── LOOP ────────────────────────────────────────────────
// At start of turn, trigger next orb passive 1(2) times.

registerPowerHooks(
	"LOOP",
	(p: PowerInstance): HookSource => ({
		powerId: "LOOP",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const orbs = ctx.combat.player.orbs;
				if (orbs.length === 0) return ctx.state;
				// triggerOrbPassives handles all orbs; Loop triggers the FIRST orb extra times
				// We import and call triggerOrbPassives for just the first orb
				const first = orbs[0];
				if (!first || first.type === "empty") return ctx.state;
				let s = ctx.state;
				// Manually trigger first orb's passive p.amount times
				for (let t = 0; t < p.amount; t++) {
					const result = triggerSingleOrbPassive(s, first);
					s = result.state;
				}
				return s;
			},
		},
	}),
);

function triggerSingleOrbPassive(
	state: GameState,
	orb: import("../core/types").OrbInstance,
): { state: GameState } {
	// Inline single orb passive trigger (simplified from orbSystem)
	const c = state.combat;
	if (!c) return { state };
	const focus = c.player.powers.find((p) => p.id === "FOCUS")?.amount ?? 0;
	let s = state;

	switch (orb.type) {
		case "lightning": {
			const baseDmg = Math.max(0, orb.passive + focus);
			const alive = c.monsters.filter((m) => m.alive);
			if (alive.length === 0) break;
			const r = random(s.rng.miscRng, alive.length - 1);
			const picked = alive[r.value];
			if (!picked) {
				s = { ...s, rng: { ...s.rng, miscRng: r.state } };
				break;
			}
			const c2 = s.combat;
			if (!c2) break;
			const m = c2.monsters[picked.index];
			if (!m?.alive) {
				s = { ...s, rng: { ...s.rng, miscRng: r.state } };
				break;
			}
			const dmg = Math.max(0, baseDmg - m.block);
			const newBlock = Math.max(0, m.block - baseDmg);
			const newHp = Math.max(0, m.currentHp - dmg);
			const monsters = [...c2.monsters];
			monsters[picked.index] = { ...m, currentHp: newHp, block: newBlock, alive: newHp > 0 };
			s = { ...s, rng: { ...s.rng, miscRng: r.state }, combat: { ...c2, monsters } };
			break;
		}
		case "frost": {
			const blockAmt = Math.max(0, orb.passive + focus);
			s = {
				...s,
				combat: {
					...c,
					player: { ...c.player, block: c.player.block + blockAmt },
				},
			};
			break;
		}
		case "dark": {
			// Dark passive accumulates damage on the orb — but we can't modify the
			// orb array from here without knowing its index. Loop on Dark is unusual.
			// Skip for now — the orb passives are triggered by orbSystem's normal flow.
			break;
		}
		case "plasma": {
			s = { ...s, combat: { ...c, energy: c.energy + 1 } };
			break;
		}
	}
	return { state: s };
}

// ── MACHINE_LEARNING ────────────────────────────────────
// Draw 1 additional card per turn.

registerPowerHooks(
	"MACHINE_LEARNING",
	(p: PowerInstance): HookSource => ({
		powerId: "MACHINE_LEARNING",
		hooks: {
			modifyDrawPerTurn: (_ctx, draw) => draw + p.amount,
		},
	}),
);

// ── SELF_REPAIR ─────────────────────────────────────────
// At end of combat, heal 7(10) HP. Handled via onVictory hook.

registerPowerHooks(
	"SELF_REPAIR",
	(p: PowerInstance): HookSource => ({
		powerId: "SELF_REPAIR",
		hooks: {
			onVictory: (ctx) => {
				if (ctx.owner.type !== "player") return ctx.state;
				const heal = p.amount;
				const newHp = Math.min(ctx.state.maxHp, ctx.state.currentHp + heal);
				return { ...ctx.state, currentHp: newHp };
			},
		},
	}),
);

// ── STATIC_DISCHARGE ────────────────────────────────────
// When you take unblocked attack damage, channel 1(2) Lightning.

registerPowerHooks(
	"STATIC_DISCHARGE",
	(p: PowerInstance): HookSource => ({
		powerId: "STATIC_DISCHARGE",
		hooks: {
			onAttacked: (ctx, damage) => {
				if (ctx.owner.type !== "player" || damage <= 0) return ctx.state;
				let s = ctx.state;
				const events: import("../core/types").GameEvent[] = [];
				for (let i = 0; i < p.amount; i++) {
					const result = channelOrb(s, "lightning", events);
					s = result.state;
				}
				return s;
			},
		},
	}),
);

// ── STORM ───────────────────────────────────────────────
// When you play a Power card, channel 1 Lightning.

registerPowerHooks(
	"STORM",
	(_p: PowerInstance): HookSource => ({
		powerId: "STORM",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const def = getCard(card.id);
				if (def?.type !== "power") return ctx.state;
				const events: import("../core/types").GameEvent[] = [];
				const result = channelOrb(ctx.state, "lightning", events);
				return result.state;
			},
		},
	}),
);

// ── AMPLIFY ─────────────────────────────────────────────
// This turn, next N Power cards played twice.
// The actual replay is handled in step.ts (replayIfAmplify).

registerPowerHooks(
	"AMPLIFY",
	(_p: PowerInstance): HookSource => ({
		powerId: "AMPLIFY",
		hooks: {},
	}),
);

// ── REBOUND ─────────────────────────────────────────────
// After playing a card, put it on top of draw pile instead of discard.

registerPowerHooks(
	"REBOUND",
	(_p: PowerInstance): HookSource => ({
		powerId: "REBOUND",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				// Move card from discard to top of draw pile (the card was already
				// discarded by exhaustOrDiscard in step.ts, so we move it back)
				const disc = ctx.combat.discardPile;
				const idx = disc.findIndex((c) => c.uniqueId === card.uniqueId);
				if (idx < 0) return ctx.state;
				const moved = disc[idx];
				if (!moved) return ctx.state;
				const discardPile = disc.filter((_, i) => i !== idx);
				const drawPile = [...ctx.combat.drawPile, moved];
				let s: GameState = {
					...ctx.state,
					combat: { ...ctx.combat, discardPile, drawPile },
				};
				// Rebound is single-use: remove after triggering
				s = removePowerFromPlayer(s, "REBOUND");
				return s;
			},
		},
	}),
);

// ── FOCUS ───────────────────────────────────────────────
// Focus modifies orb passive/evoke values. The orbSystem reads the FOCUS
// power amount directly. Register as placeholder.

registerPowerHooks(
	"FOCUS",
	(_p: PowerInstance): HookSource => ({
		powerId: "FOCUS",
		hooks: {},
	}),
);
