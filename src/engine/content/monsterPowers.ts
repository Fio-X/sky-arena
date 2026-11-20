import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type { ActorRef, GameState, PowerId, PowerInstance } from "../core/types";
import { setMonsterMove } from "./act2Powers";
import { getCard } from "./loader";

// ── helpers ──────────────────────────────────────────────

function modifyPower(state: GameState, actor: ActorRef, powerId: string, delta: number): GameState {
	if (!state.combat) return state;
	if (actor.type === "player") {
		const powers = addToPowerList(state.combat.player.powers, powerId, delta);
		return { ...state, combat: { ...state.combat, player: { ...state.combat.player, powers } } };
	}
	const monsters = [...state.combat.monsters];
	const m = monsters[actor.index];
	if (!m) return state;
	monsters[actor.index] = { ...m, powers: addToPowerList(m.powers, powerId, delta) };
	return { ...state, combat: { ...state.combat, monsters } };
}

function addToPowerList(
	powers: readonly PowerInstance[],
	id: string,
	delta: number,
): PowerInstance[] {
	const existing = powers.find((p) => p.id === id);
	if (existing) {
		return powers.map((p) => (p.id === id ? { ...p, amount: p.amount + delta } : p));
	}
	return [...powers, { id: id as PowerId, amount: delta, justApplied: false }];
}

function removePowerFromList(powers: readonly PowerInstance[], id: string): PowerInstance[] {
	return powers.filter((p) => p.id !== id);
}

function setPowerField(
	state: GameState,
	actor: ActorRef,
	powerId: string,
	update: (p: PowerInstance) => PowerInstance,
): GameState {
	if (!state.combat) return state;
	if (actor.type === "player") {
		const powers = state.combat.player.powers.map((p) => (p.id === powerId ? update(p) : p));
		return { ...state, combat: { ...state.combat, player: { ...state.combat.player, powers } } };
	}
	const monsters = [...state.combat.monsters];
	const m = monsters[actor.index];
	if (!m) return state;
	monsters[actor.index] = { ...m, powers: m.powers.map((p) => (p.id === powerId ? update(p) : p)) };
	return { ...state, combat: { ...state.combat, monsters } };
}

function setMonsterPowers(state: GameState, index: number, powers: PowerInstance[]): GameState {
	if (!state.combat) return state;
	const monsters = [...state.combat.monsters];
	const m = monsters[index];
	if (!m) return state;
	monsters[index] = { ...m, powers };
	return { ...state, combat: { ...state.combat, monsters } };
}

function addMonsterBlock(state: GameState, index: number, amount: number): GameState {
	if (!state.combat) return state;
	const monsters = [...state.combat.monsters];
	const m = monsters[index];
	if (!m) return state;
	monsters[index] = { ...m, block: m.block + amount };
	return { ...state, combat: { ...state.combat, monsters } };
}

// ── Ritual (Cultist) ─────────────────────────────────────
// End of round: gain X Strength. Skip first round (justApplied).

registerPowerHooks(
	"RITUAL",
	(p: PowerInstance): HookSource => ({
		powerId: "RITUAL",
		hooks: {
			atEndOfRound: (ctx) => {
				if (p.justApplied) {
					return setPowerField(ctx.state, ctx.owner, "RITUAL", (pw) => ({
						...pw,
						justApplied: false,
					}));
				}
				return modifyPower(ctx.state, ctx.owner, "strength", p.amount);
			},
		},
	}),
);

// ── Curl Up (Louse) ──────────────────────────────────────
// First unblocked hit: gain X Block, then remove self.

registerPowerHooks(
	"CURL_UP",
	(p: PowerInstance): HookSource => ({
		powerId: "CURL_UP",
		hooks: {
			onAttacked: (ctx, damage, _source) => {
				if (damage <= 0) return ctx.state;
				if (ctx.owner.type !== "monster") return ctx.state;
				const idx = ctx.owner.index;
				let s = addMonsterBlock(ctx.state, idx, p.amount);
				const monster = s.combat?.monsters[idx];
				if (monster) {
					s = setMonsterPowers(s, idx, removePowerFromList(monster.powers, "CURL_UP"));
				}
				return s;
			},
		},
	}),
);

// ── Angry (Mad Gremlin) ─────────────────────────────────
// When hit by an attack: gain X Strength.

registerPowerHooks(
	"ANGRY",
	(p: PowerInstance): HookSource => ({
		powerId: "ANGRY",
		hooks: {
			onAttacked: (ctx, damage, _source) => {
				if (damage <= 0) return ctx.state;
				return modifyPower(ctx.state, ctx.owner, "strength", p.amount);
			},
		},
	}),
);

// ── Enrage (Gremlin Nob) ────────────────────────────────
// When player plays a Skill: gain X Strength.

registerPowerHooks(
	"ENRAGE",
	(p: PowerInstance): HookSource => ({
		powerId: "ENRAGE",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				const def = getCard(card.id);
				if (def?.type !== "skill") return ctx.state;
				return modifyPower(ctx.state, ctx.owner, "strength", p.amount);
			},
		},
	}),
);

// ── Entangled (Red Slaver → player) ─────────────────────
// Prevent playing Attack cards.

registerPowerHooks(
	"ENTANGLED",
	(_p: PowerInstance): HookSource => ({
		powerId: "ENTANGLED",
		hooks: {
			canPlayCard: (_ctx, card) => {
				const def = getCard(card.id);
				return def?.type !== "attack";
			},
		},
	}),
);

// ── Metallicize (Lagavulin) ─────────────────────────────
// End of turn: gain X Block (not through calculateBlock).

registerPowerHooks(
	"METALLICIZE",
	(p: PowerInstance): HookSource => ({
		powerId: "METALLICIZE",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				return addMonsterBlock(ctx.state, ctx.owner.index, p.amount);
			},
		},
	}),
);

// ── Asleep (Lagavulin) ──────────────────────────────────
// Marker power read by the Lagavulin AI. Waking (Lagavulin.changeState "OPEN")
// removes it and reduces Metallicize by 8. Two ways to wake:
// - any HP loss while asleep (Lagavulin.damage): the queued SLEEP still runs
//   (the original shows it as a 1-turn Stun), then ATTACK;
// - naturally after its third SLEEP (idleCount >= 3); done at the end of that
//   round, before Metallicize next triggers.

const LAGAVULIN_SLEEP = "LAGAVULIN_SLEEP";

function wakeLagavulin(state: GameState, idx: number): GameState {
	const monster = state.combat?.monsters[idx];
	if (!monster) return state;
	const powers = removePowerFromList(monster.powers, "ASLEEP")
		.map((p) => (p.id.toUpperCase() === "METALLICIZE" ? { ...p, amount: p.amount - 8 } : p))
		.filter((p) => p.id.toUpperCase() !== "METALLICIZE" || p.amount > 0);
	return setMonsterPowers(state, idx, powers);
}

registerPowerHooks(
	"ASLEEP",
	(_p: PowerInstance): HookSource => ({
		powerId: "ASLEEP",
		hooks: {
			wasHPLost: (ctx, amount) => {
				if (amount <= 0 || ctx.owner.type !== "monster") return ctx.state;
				return wakeLagavulin(ctx.state, ctx.owner.index);
			},
			atEndOfRound: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				const monster = ctx.state.combat?.monsters[ctx.owner.index];
				const sleeps = monster?.moveHistory.filter((m) => m === LAGAVULIN_SLEEP).length ?? 0;
				return sleeps >= 3 ? wakeLagavulin(ctx.state, ctx.owner.index) : ctx.state;
			},
		},
	}),
);

// ── Artifact (Sentry) ───────────────────────────────────
// Handled directly in combat/powers.ts applyPower() — consumes a stack
// before the debuff is applied. No hook needed here.

// ── Sharp Hide (The Guardian) ───────────────────────────
// When hit: deal X damage to attacker.

registerPowerHooks(
	"SHARP_HIDE",
	(p: PowerInstance): HookSource => ({
		powerId: "SHARP_HIDE",
		hooks: {
			onAttacked: (ctx, damage, source) => {
				if (damage <= 0) return ctx.state;
				if (source.type !== "player") return ctx.state;
				const newHp = Math.max(0, ctx.state.currentHp - p.amount);
				return { ...ctx.state, currentHp: newHp };
			},
		},
	}),
);

// ── Mode Shift (The Guardian) ───────────────────────────
// Track cumulative damage. When threshold reached, switch mode.
// Uses p.amount as remaining threshold. When 0, removes self and switches.

registerPowerHooks(
	"MODE_SHIFT",
	(p: PowerInstance): HookSource => ({
		powerId: "MODE_SHIFT",
		hooks: {
			wasHPLost: (ctx, amount) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				const remaining = p.amount - amount;
				const idx = ctx.owner.index;
				if (remaining > 0) {
					return setPowerField(ctx.state, ctx.owner, "MODE_SHIFT", (pw) => ({
						...pw,
						amount: remaining,
					}));
				}
				const monster = ctx.state.combat?.monsters[idx];
				if (!monster) return ctx.state;
				let s = setMonsterPowers(ctx.state, idx, removePowerFromList(monster.powers, "MODE_SHIFT"));
				// changeState("Defensive Mode"): gain 20 block and the current intent is
				// replaced with DEFENSIVE_MODE at once. TWIN_SLAM restores Mode Shift (bossAi.ts).
				s = addMonsterBlock(s, idx, 20);
				return setMonsterMove(s, idx, "THE_GUARDIAN_DEFENSIVE_MODE");
			},
		},
	}),
);

// ── Spore Cloud (Fungi Beast) ───────────────────────────
// On death: apply X Vulnerable to player.

registerPowerHooks(
	"SPORE_CLOUD",
	(p: PowerInstance): HookSource => ({
		powerId: "SPORE_CLOUD",
		hooks: {
			onMonsterDeath: ({ state }) => {
				return modifyPower(state, { type: "player" }, "vulnerable", p.amount);
			},
		},
	}),
);

// ── Thorns (monster) ────────────────────────────────────
// When hit: deal X damage back to attacker.

registerPowerHooks(
	"THORNS",
	(p: PowerInstance): HookSource => ({
		powerId: "THORNS",
		hooks: {
			onAttacked: (ctx, damage, source) => {
				if (damage <= 0) return ctx.state;
				if (source.type !== "player") return ctx.state;
				const newHp = Math.max(0, ctx.state.currentHp - p.amount);
				return { ...ctx.state, currentHp: newHp };
			},
		},
	}),
);

// ── Intangible (monster) ────────────────────────────────
// Reduce ALL damage taken to 1. turnBased.

registerPowerHooks(
	"INTANGIBLE",
	(_p: PowerInstance): HookSource => ({
		powerId: "INTANGIBLE",
		hooks: {
			atDamageFinalReceive: (_ctx, damage, _card) => (damage > 0 ? 1 : 0),
		},
	}),
);

// ── Plated Armor (monster) ──────────────────────────────
// End of turn: gain X Block. Unblocked damage reduces by 1.

registerPowerHooks(
	"PLATED_ARMOR",
	(p: PowerInstance): HookSource => ({
		powerId: "PLATED_ARMOR",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				return addMonsterBlock(ctx.state, ctx.owner.index, p.amount);
			},
			wasHPLost: (ctx, amount) => {
				if (amount <= 0 || ctx.owner.type !== "monster") return ctx.state;
				const idx = ctx.owner.index;
				const monster = ctx.state.combat?.monsters[idx];
				if (!monster) return ctx.state;
				const newAmount = p.amount - 1;
				const powers =
					newAmount > 0
						? monster.powers.map((pw) =>
								pw.id === "PLATED_ARMOR" ? { ...pw, amount: newAmount } : pw,
							)
						: removePowerFromList(monster.powers, "PLATED_ARMOR");
				const s = setMonsterPowers(ctx.state, idx, powers);
				// Shelled Parasite loses its next turn when its Plated Armor breaks.
				return newAmount <= 0 && monster.id === "SHELLED_PARASITE"
					? setMonsterMove(s, idx, "SHELLED_PARASITE_STUNNED")
					: s;
			},
		},
	}),
);

// ── Regenerate (monster) ────────────────────────────────
// End of turn: heal X HP. Does not decrement.

registerPowerHooks(
	"REGENERATE",
	(p: PowerInstance): HookSource => ({
		powerId: "REGENERATE",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				const idx = ctx.owner.index;
				const monster = ctx.state.combat?.monsters[idx];
				if (!monster || !monster.alive) return ctx.state;
				const healed = Math.min(p.amount, monster.maxHp - monster.currentHp);
				if (healed <= 0) return ctx.state;
				const monsters = [...ctx.state.combat!.monsters];
				monsters[idx] = { ...monster, currentHp: monster.currentHp + healed };
				return { ...ctx.state, combat: { ...ctx.state.combat!, monsters } };
			},
		},
	}),
);
