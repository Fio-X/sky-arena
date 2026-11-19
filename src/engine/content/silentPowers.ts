import { resolveMonsterDeath } from "../combat/death";
import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type { ActorRef, CardInstance, GameState, PowerId, PowerInstance } from "../core/types";
import { getCard } from "./loader";

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

				const s = { ...ctx.state, combat: { ...ctx.state.combat!, monsters } };
				return alive ? s : resolveMonsterDeath(s, idx, []);
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

// ── Noxious Fumes ──────────────────────────────────────
// At start of turn, apply X Poison to ALL enemies.

registerPowerHooks(
	"NOXIOUS_FUMES",
	(p: PowerInstance): HookSource => ({
		powerId: "NOXIOUS_FUMES",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				let s = ctx.state;
				for (let i = 0; i < ctx.combat.monsters.length; i++) {
					const m = ctx.combat.monsters[i];
					if (m?.alive) {
						s = modifyPower(s, { type: "monster", index: i }, "POISON", p.amount);
					}
				}
				return s;
			},
		},
	}),
);

// ── Accuracy ───────────────────────────────────────────
// Shivs deal X more damage. Implemented via atDamageGive fold.

registerPowerHooks(
	"ACCURACY",
	(p: PowerInstance): HookSource => ({
		powerId: "ACCURACY",
		hooks: {
			atDamageGive: (_ctx, damage, card) => {
				if (card?.id === "SHIV") return damage + p.amount;
				return damage;
			},
		},
	}),
);

// ── Caltrops ───────────────────────────────────────────
// When attacked, deal X damage back to attacker.

registerPowerHooks(
	"CALTROPS",
	(p: PowerInstance): HookSource => ({
		powerId: "CALTROPS",
		hooks: {
			onAttacked: (ctx, _damage, source) => {
				if (ctx.owner.type !== "player" || source.type !== "monster") return ctx.state;
				if (!ctx.combat) return ctx.state;
				const idx = source.index;
				const monster = ctx.combat.monsters[idx];
				if (!monster?.alive) return ctx.state;
				const newHp = Math.max(0, monster.currentHp - p.amount);
				const monsters = [...ctx.combat.monsters];
				monsters[idx] = { ...monster, currentHp: newHp, alive: newHp > 0 };
				return { ...ctx.state, combat: { ...ctx.combat, monsters } };
			},
		},
	}),
);

// ── Infinite Blades ────────────────────────────────────
// At start of turn, add a Shiv to hand.

registerPowerHooks(
	"INFINITE_BLADES",
	(_p: PowerInstance): HookSource => ({
		powerId: "INFINITE_BLADES",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				if (ctx.combat.hand.length >= 10) return ctx.state;
				const allCards = [
					...ctx.combat.hand,
					...ctx.combat.drawPile,
					...ctx.combat.discardPile,
					...ctx.combat.exhaustPile,
				];
				const uid = allCards.reduce((max, c) => Math.max(max, c.uniqueId), 0) + 1;
				const shiv: CardInstance = {
					id: "SHIV" as never,
					upgraded: false,
					uniqueId: uid,
					costOverride: null,
					freeToPlay: false,
					costForTurn: 0,
					misc: 0,
				};
				return {
					...ctx.state,
					combat: { ...ctx.combat, hand: [...ctx.combat.hand, shiv] },
				};
			},
		},
	}),
);

// ── A Thousand Cuts ────────────────────────────────────
// When you play a card, deal X damage to ALL enemies.

registerPowerHooks(
	"A_THOUSAND_CUTS",
	(p: PowerInstance): HookSource => ({
		powerId: "A_THOUSAND_CUTS",
		hooks: {
			onAfterCardPlayed: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				let s = ctx.state;
				const monsters = [...ctx.combat.monsters];
				for (let i = 0; i < monsters.length; i++) {
					const m = monsters[i];
					if (m?.alive) {
						const newHp = Math.max(0, m.currentHp - p.amount);
						monsters[i] = { ...m, currentHp: newHp, alive: newHp > 0 };
					}
				}
				s = { ...s, combat: { ...ctx.combat, monsters } };
				return s;
			},
		},
	}),
);

// ── After Image ────────────────────────────────────────
// When you play a card, gain 1 Block.

registerPowerHooks(
	"AFTER_IMAGE",
	(p: PowerInstance): HookSource => ({
		powerId: "AFTER_IMAGE",
		hooks: {
			onAfterCardPlayed: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const player = ctx.combat.player;
				return {
					...ctx.state,
					combat: {
						...ctx.combat,
						player: { ...player, block: player.block + p.amount },
					},
				};
			},
		},
	}),
);

// ── Envenom ────────────────────────────────────────────
// When you deal unblocked attack damage, apply 1 Poison.

registerPowerHooks(
	"ENVENOM",
	(p: PowerInstance): HookSource => ({
		powerId: "ENVENOM",
		hooks: {
			onAttack: (ctx, damage, target) => {
				if (ctx.owner.type !== "player" || damage <= 0) return ctx.state;
				if (target.type !== "monster") return ctx.state;
				return modifyPower(ctx.state, target, "POISON", p.amount);
			},
		},
	}),
);

// ── Choke ──────────────────────────────────────────────
// Whenever the player plays a card, lose X HP (on the monster).

registerPowerHooks(
	"CHOKE",
	(p: PowerInstance): HookSource => ({
		powerId: "CHOKE",
		hooks: {
			onAfterCardPlayed: (ctx) => {
				if (ctx.owner.type !== "monster" || !ctx.combat) return ctx.state;
				const idx = ctx.owner.index;
				const monster = ctx.combat.monsters[idx];
				if (!monster?.alive) return ctx.state;
				const newHp = Math.max(0, monster.currentHp - p.amount);
				const monsters = [...ctx.combat.monsters];
				monsters[idx] = { ...monster, currentHp: newHp, alive: newHp > 0 };
				return { ...ctx.state, combat: { ...ctx.combat, monsters } };
			},
		},
	}),
);

// ── Corpse Explosion ───────────────────────────────────
// When this monster dies, deal its maxHp damage to all other enemies.

registerPowerHooks(
	"CORPSE_EXPLOSION",
	(_p: PowerInstance): HookSource => ({
		powerId: "CORPSE_EXPLOSION",
		hooks: {
			onMonsterDeath: (ctx, monsterIndex) => {
				if (!ctx.combat) return ctx.state;
				const dead = ctx.combat.monsters[monsterIndex];
				if (!dead) return ctx.state;
				const dmg = dead.maxHp;
				const monsters = [...ctx.combat.monsters];
				for (let i = 0; i < monsters.length; i++) {
					if (i === monsterIndex) continue;
					const m = monsters[i];
					if (m?.alive) {
						const newHp = Math.max(0, m.currentHp - dmg);
						monsters[i] = { ...m, currentHp: newHp, alive: newHp > 0 };
					}
				}
				return { ...ctx.state, combat: { ...ctx.combat, monsters } };
			},
		},
	}),
);

// ── Draw Card Next Turn ────────────────────────────────
// At start of turn, draw X extra cards. Used by Predator.

registerPowerHooks(
	"DRAW_CARD_NEXT_TURN",
	(p: PowerInstance): HookSource => ({
		powerId: "DRAW_CARD_NEXT_TURN",
		hooks: {
			modifyDrawPerTurn: (ctx, draw) => {
				if (ctx.owner.type !== "player") return draw;
				return {
					value: draw + p.amount,
					state: removePowerFromPlayer(ctx.state, "DRAW_CARD_NEXT_TURN"),
				};
			},
		},
	}),
);

// ── Blur ───────────────────────────────────────────────
// Block not removed at start of next turn.

registerPowerHooks(
	"BLUR",
	(p: PowerInstance): HookSource => ({
		powerId: "BLUR",
		hooks: {
			modifyBlockRetention: (ctx, retained) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return retained;
				const newAmount = p.amount - 1;
				let s = ctx.state;
				if (newAmount <= 0) {
					s = removePowerFromPlayer(s, "BLUR");
				} else {
					s = modifyPower(s, ctx.owner, "BLUR", -1);
				}
				return { value: ctx.combat.player.block, state: s };
			},
		},
	}),
);

// ── Wraith Form ────────────────────────────────────────
// Lose 1 Dexterity at end of each turn.

registerPowerHooks(
	"WRAITH_FORM",
	(_p: PowerInstance): HookSource => ({
		powerId: "WRAITH_FORM",
		hooks: {
			atEndOfTurn: (ctx) => {
				if (ctx.owner.type !== "player") return ctx.state;
				return modifyPower(ctx.state, ctx.owner, "dexterity", -1);
			},
		},
	}),
);

// ── Phantasmal Killer ──────────────────────────────────
// Next turn, attacks deal double damage.

registerPowerHooks(
	"PHANTASMAL_KILLER",
	(_p: PowerInstance): HookSource => ({
		powerId: "PHANTASMAL_KILLER",
		hooks: {
			atDamageGive: (ctx, damage, card) => {
				if (ctx.owner.type !== "player") return damage;
				const def = card ? getCard(card.id) : null;
				if (def?.type !== "attack") return damage;
				return { value: damage * 2, state: removePowerFromPlayer(ctx.state, "PHANTASMAL_KILLER") };
			},
		},
	}),
);

// ── Tools of the Trade ─────────────────────────────────
// At start of turn, draw 1 card, then discard 1 card.

registerPowerHooks(
	"TOOLS_OF_THE_TRADE",
	(_p: PowerInstance): HookSource => ({
		powerId: "TOOLS_OF_THE_TRADE",
		hooks: {
			atStartOfTurnPostDraw: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				// Draw 1 card
				const c = ctx.combat;
				if (c.drawPile.length === 0 || c.hand.length >= 10) return ctx.state;
				const card = c.drawPile[c.drawPile.length - 1];
				if (!card) return ctx.state;
				const drawPile = c.drawPile.slice(0, -1);
				const hand = [...c.hand, card];
				const newCombat = { ...c, hand, drawPile };
				// Prompt discard
				return {
					...ctx.state,
					combat: newCombat,
					phase: { type: "cardSelect" as const, task: "toolsOfTheTrade" as const },
				};
			},
		},
	}),
);

// ── Well-Laid Plans ────────────────────────────────────
// At end of turn, Retain up to X cards. Cards with Retain flag keep.

registerPowerHooks(
	"WELL_LAID_PLANS",
	(_p: PowerInstance): HookSource => ({
		powerId: "WELL_LAID_PLANS",
		hooks: {},
	}),
);

// ── Helpers ────────────────────────────────────────────

function removePowerFromPlayer(state: GameState, powerId: string): GameState {
	if (!state.combat) return state;
	const player = state.combat.player;
	const powers = removePowerFromList(player.powers, powerId);
	return { ...state, combat: { ...state.combat, player: { ...player, powers } } };
}
