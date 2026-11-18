import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type { ActorRef, CardInstance, GameState, PowerId, PowerInstance } from "../core/types";
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

function removePower(state: GameState, actor: ActorRef, powerId: string): GameState {
	if (!state.combat) return state;
	if (actor.type === "player") {
		const powers = state.combat.player.powers.filter((p) => p.id !== powerId);
		return { ...state, combat: { ...state.combat, player: { ...state.combat.player, powers } } };
	}
	return state;
}

function addPlayerBlock(state: GameState, amount: number): GameState {
	if (!state.combat) return state;
	const p = state.combat.player;
	return { ...state, combat: { ...state.combat, player: { ...p, block: p.block + amount } } };
}

// ── Metallicize ──────────────────────────────────────────
// At end of turn, gain X Block.

registerPowerHooks(
	"metallicize",
	(p: PowerInstance): HookSource => ({
		powerId: "metallicize",
		hooks: {
			atEndOfTurn: (ctx) => addPlayerBlock(ctx.state, p.amount),
		},
	}),
);

// ── Demon Form ───────────────────────────────────────────
// At start of turn, gain X Strength.

registerPowerHooks(
	"demonForm",
	(p: PowerInstance): HookSource => ({
		powerId: "demonForm",
		hooks: {
			atStartOfTurn: (ctx) => modifyPower(ctx.state, ctx.owner, "strength", p.amount),
		},
	}),
);

// ── Lose Strength ────────────────────────────────────────
// At end of turn, lose X Strength. Used by FLEX.

registerPowerHooks(
	"loseStrength",
	(p: PowerInstance): HookSource => ({
		powerId: "loseStrength",
		hooks: {
			atEndOfTurn: (ctx) => {
				let s = modifyPower(ctx.state, ctx.owner, "strength", -p.amount);
				s = removePower(s, ctx.owner, "loseStrength");
				return s;
			},
		},
	}),
);

// ── Flame Barrier ────────────────────────────────────────
// When attacked, deal X damage back to attacker. Lasts 1 turn.

registerPowerHooks(
	"flameBarrier",
	(p: PowerInstance): HookSource => ({
		powerId: "flameBarrier",
		hooks: {
			onAttacked: (ctx, damage, source) => {
				if (damage <= 0) return ctx.state;
				if (source.type !== "monster") return ctx.state;
				if (!ctx.state.combat) return ctx.state;
				const monsters = [...ctx.state.combat.monsters];
				const m = monsters[source.index];
				if (!m || !m.alive) return ctx.state;
				const newHp = Math.max(0, m.currentHp - p.amount);
				monsters[source.index] = { ...m, currentHp: newHp, alive: newHp > 0 };
				return { ...ctx.state, combat: { ...ctx.state.combat, monsters } };
			},
			atEndOfTurn: (ctx) => removePower(ctx.state, ctx.owner, "flameBarrier"),
		},
	}),
);

// ── Thorns ───────────────────────────────────────────────
// When attacked, deal X damage back to attacker.

registerPowerHooks(
	"thorns",
	(p: PowerInstance): HookSource => ({
		powerId: "thorns",
		hooks: {
			onAttacked: (ctx, damage, source) => {
				if (damage <= 0) return ctx.state;
				if (source.type !== "monster") return ctx.state;
				if (!ctx.state.combat) return ctx.state;
				const monsters = [...ctx.state.combat.monsters];
				const m = monsters[source.index];
				if (!m || !m.alive) return ctx.state;
				const newHp = Math.max(0, m.currentHp - p.amount);
				monsters[source.index] = { ...m, currentHp: newHp, alive: newHp > 0 };
				return { ...ctx.state, combat: { ...ctx.state.combat, monsters } };
			},
		},
	}),
);

// ── Barricade ────────────────────────────────────────────
// Block is not removed at the start of your turn.

registerPowerHooks(
	"barricade",
	(_p: PowerInstance): HookSource => ({
		powerId: "barricade",
		hooks: {
			modifyBlockRetention: (_ctx, _retained) => 999,
		},
	}),
);

// ── Rage ─────────────────────────────────────────────────
// When you play an Attack, gain X Block.

function isAttack(card: CardInstance): boolean {
	const def = getCard(card.id);
	return def?.type === "attack";
}

registerPowerHooks(
	"rage",
	(p: PowerInstance): HookSource => ({
		powerId: "rage",
		hooks: {
			onUseCard: (ctx, card) => {
				if (!isAttack(card)) return ctx.state;
				return addPlayerBlock(ctx.state, p.amount);
			},
		},
	}),
);

// ── Combust ──────────────────────────────────────────────
// At end of turn, lose 1 HP and deal X damage to ALL enemies.

registerPowerHooks(
	"combust",
	(p: PowerInstance): HookSource => ({
		powerId: "combust",
		hooks: {
			atEndOfTurn: (ctx) => {
				const s = { ...ctx.state, currentHp: Math.max(0, ctx.state.currentHp - 1) };
				if (!s.combat) return s;
				const monsters = s.combat.monsters.map((m) => {
					if (!m.alive) return m;
					const newHp = Math.max(0, m.currentHp - p.amount);
					return { ...m, currentHp: newHp, alive: newHp > 0 };
				});
				return { ...s, combat: { ...s.combat, monsters } };
			},
		},
	}),
);

// ── Dark Embrace ─────────────────────────────────────────
// Whenever a card is exhausted, draw 1 card.

registerPowerHooks(
	"darkEmbrace",
	(p: PowerInstance): HookSource => ({
		powerId: "darkEmbrace",
		hooks: {
			onExhaust: (ctx) => {
				if (!ctx.state.combat) return ctx.state;
				const drawPile = ctx.state.combat.drawPile;
				if (drawPile.length === 0) return ctx.state;
				const drawn = drawPile.slice(-p.amount);
				const hand = [...ctx.state.combat.hand, ...drawn];
				return {
					...ctx.state,
					combat: { ...ctx.state.combat, hand, drawPile: drawPile.slice(0, -p.amount) },
				};
			},
		},
	}),
);

// ── Feel No Pain ─────────────────────────────────────────
// Whenever a card is exhausted, gain X Block.

registerPowerHooks(
	"feelNoPain",
	(p: PowerInstance): HookSource => ({
		powerId: "feelNoPain",
		hooks: {
			onExhaust: (ctx) => addPlayerBlock(ctx.state, p.amount),
		},
	}),
);

// ── Evolve ───────────────────────────────────────────────
// Whenever you draw a Status or Curse, draw X card(s).

registerPowerHooks(
	"evolve",
	(p: PowerInstance): HookSource => ({
		powerId: "evolve",
		hooks: {
			onDraw: (ctx, card) => {
				const def = getCard(card.id);
				if (def?.type !== "status" && def?.type !== "curse") return ctx.state;
				if (!ctx.state.combat) return ctx.state;
				const drawPile = ctx.state.combat.drawPile;
				const count = Math.min(p.amount, drawPile.length);
				if (count === 0) return ctx.state;
				const drawn = drawPile.slice(-count);
				const hand = [...ctx.state.combat.hand, ...drawn];
				return {
					...ctx.state,
					combat: { ...ctx.state.combat, hand, drawPile: drawPile.slice(0, -count) },
				};
			},
		},
	}),
);

// ── Fire Breathing ───────────────────────────────────────
// Whenever you draw a Status or Curse, deal X damage to ALL enemies.

registerPowerHooks(
	"fireBreathing",
	(p: PowerInstance): HookSource => ({
		powerId: "fireBreathing",
		hooks: {
			onDraw: (ctx, card) => {
				const def = getCard(card.id);
				if (def?.type !== "status" && def?.type !== "curse") return ctx.state;
				if (!ctx.state.combat) return ctx.state;
				const monsters = ctx.state.combat.monsters.map((m) => {
					if (!m.alive) return m;
					const newHp = Math.max(0, m.currentHp - p.amount);
					return { ...m, currentHp: newHp, alive: newHp > 0 };
				});
				return { ...ctx.state, combat: { ...ctx.state.combat, monsters } };
			},
		},
	}),
);

// ── Juggernaut ───────────────────────────────────────────
// Whenever you gain Block, deal X damage to a random enemy.

registerPowerHooks(
	"juggernaut",
	(p: PowerInstance): HookSource => ({
		powerId: "juggernaut",
		hooks: {
			onGainedBlock: (ctx) => {
				if (!ctx.state.combat) return ctx.state;
				const alive = ctx.state.combat.monsters.filter((m) => m.alive);
				if (alive.length === 0) return ctx.state;
				const first = alive[0];
				if (!first) return ctx.state;
				const targetIdx = first.index;
				const monsters = ctx.state.combat.monsters.map((m) => {
					if (m.index !== targetIdx) return m;
					const newHp = Math.max(0, m.currentHp - p.amount);
					return { ...m, currentHp: newHp, alive: newHp > 0 };
				});
				return { ...ctx.state, combat: { ...ctx.state.combat, monsters } };
			},
		},
	}),
);

// ── Rupture ──────────────────────────────────────────────
// When you lose HP from a card, gain X Strength.

registerPowerHooks(
	"rupture",
	(p: PowerInstance): HookSource => ({
		powerId: "rupture",
		hooks: {
			onLoseHp: (ctx) => modifyPower(ctx.state, ctx.owner, "strength", p.amount),
		},
	}),
);

// ── Inflame (Relic-like, permanent +str, no hook needed) ──
// Inflame just applies strength directly via applyPower action, no hook needed.

// ── Spot Weakness ────────────────────────────────────────
// Spot Weakness applies strength directly, not a power hook.
