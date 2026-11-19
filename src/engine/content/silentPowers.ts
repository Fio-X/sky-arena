import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type { ActorRef, GameState, PowerId, PowerInstance } from "../core/types";

// ── helpers ──────────────────────────────────────────────

function modifyPower(state: GameState, actor: ActorRef, powerId: string, delta: number): GameState {
	if (!state.combat) return state;
	if (actor.type === "player") {
		const powers = addToPowerList(state.combat.player.powers, powerId, delta);
		return {
			...state,
			combat: { ...state.combat, player: { ...state.combat.player, powers } },
		};
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

// ── Poison ──────────────────────────────────────────────
// At the start of the poisoned creature's turn, lose X HP (bypasses block),
// then reduce Poison by 1. Removes itself at 0.
//
// In StS, poison fires at the start of the monster's turn, before its action.
// In our engine, stepEndTurn fires atEndOfTurn for all actors (including
// monsters) BEFORE executeMonsterTurns. So for monsters, atEndOfTurn is
// effectively "start of their turn" — the right timing for poison.

registerPowerHooks(
	"POISON",
	(p: PowerInstance): HookSource => ({
		powerId: "POISON",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				const idx = ctx.owner.index;
				const monster = ctx.state.combat?.monsters[idx];
				if (!monster?.alive) return ctx.state;

				// Deal damage equal to poison amount (bypasses block)
				const newHp = Math.max(0, monster.currentHp - p.amount);
				const monsters = [...ctx.state.combat!.monsters];
				const alive = newHp > 0;
				monsters[idx] = { ...monster, currentHp: newHp, alive };

				// Reduce poison by 1, remove at 0
				const newAmount = p.amount - 1;
				const powers =
					newAmount > 0
						? monsters[idx]!.powers.map((pw) =>
								pw.id === "POISON" ? { ...pw, amount: newAmount } : pw,
							)
						: removePowerFromList(monsters[idx]!.powers, "POISON");
				monsters[idx] = { ...monsters[idx]!, powers };

				return { ...ctx.state, combat: { ...ctx.state.combat!, monsters } };
			},
		},
	}),
);

// ── Lose Strength (temporary, restores at end of round) ─
// Used by Piercing Wail. Applied to monsters alongside a negative
// strength modifier. Restores strength at end of round (atEndOfRound),
// which fires AFTER executeMonsterTurns — so the strength loss persists
// through the monster's attack, then reverts.

registerPowerHooks(
	"LOSE_STRENGTH",
	(p: PowerInstance): HookSource => ({
		powerId: "LOSE_STRENGTH",
		hooks: {
			atEndOfRound: (ctx) => {
				if (ctx.owner.type !== "monster") return ctx.state;
				let s = modifyPower(ctx.state, ctx.owner, "strength", p.amount);
				const idx = ctx.owner.index;
				const monster = s.combat?.monsters[idx];
				if (monster && s.combat) {
					const monsters = [...s.combat.monsters];
					monsters[idx] = {
						...monster,
						powers: removePowerFromList(monster.powers, "LOSE_STRENGTH"),
					};
					s = { ...s, combat: { ...s.combat, monsters } };
				}
				return s;
			},
		},
	}),
);

// ── Next Turn Block ─────────────────────────────────────
// At start of turn, gain X Block. Used by Dodge and Roll.

registerPowerHooks(
	"nextTurnBlock",
	(p: PowerInstance): HookSource => ({
		powerId: "nextTurnBlock",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const player = ctx.combat.player;
				const powers = removePowerFromList(player.powers, "nextTurnBlock");
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...player, block: player.block + p.amount, powers },
					},
				};
			},
		},
	}),
);

// ── Energized ───────────────────────────────────────────
// At start of turn, gain X Energy. Used by Outmaneuver and Flying Knee.

registerPowerHooks(
	"energized",
	(p: PowerInstance): HookSource => ({
		powerId: "energized",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const player = ctx.combat.player;
				const powers = removePowerFromList(player.powers, "energized");
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						energy: ctx.combat.energy + p.amount,
						player: { ...player, powers },
					},
				};
			},
		},
	}),
);
