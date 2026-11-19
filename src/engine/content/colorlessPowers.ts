import type { HookSource } from "../core/hooks";
import { registerPowerHooks } from "../core/hooks";
import type { CardInstance, GameState, PowerId, PowerInstance } from "../core/types";
import { random } from "../rng/stsRandom";
import { getAllCards, getCard } from "./loader";

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

// ══════════════════════════════════════════════════════════
// COLORLESS POWERS
// ══════════════════════════════════════════════════════════

// ── MAGNETISM ───────────────────────────────────────────
// At start of turn, add X random Colorless cards to hand.

registerPowerHooks(
	"MAGNETISM",
	(p: PowerInstance): HookSource => ({
		powerId: "MAGNETISM",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				const colorless = getAllCards().filter(
					(c) => c.color === "colorless" && !c.unobtainable && c.rarity !== "basic",
				);
				if (colorless.length === 0) return ctx.state;
				let rng = ctx.state.rng.cardRng;
				let hand = [...ctx.combat.hand];
				let uid = nextUid(ctx.state);
				for (let i = 0; i < p.amount; i++) {
					if (hand.length >= 10) break;
					const r = random(rng, colorless.length - 1);
					rng = r.state;
					const chosen = colorless[r.value];
					if (chosen) {
						hand = [...hand, makeCardInstance(chosen.id as string, false, uid++)];
					}
				}
				return {
					...ctx.state,
					rng: { ...ctx.state.rng, cardRng: rng },
					combat: { ...ctx.combat, hand },
				};
			},
		},
	}),
);

// ── MAYHEM ──────────────────────────────────────────────
// At start of turn, play top X cards of draw pile.
// Simplified: queue the top card as a card play action via custom.

registerPowerHooks(
	"MAYHEM",
	(p: PowerInstance): HookSource => ({
		powerId: "MAYHEM",
		hooks: {
			atStartOfTurn: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				let state = ctx.state;
				for (let i = 0; i < p.amount; i++) {
					const c = state.combat!;
					if (c.drawPile.length === 0) break;
					// Move top card from draw pile to hand and queue it for play
					const topCard = c.drawPile[c.drawPile.length - 1]!;
					const drawPile = c.drawPile.slice(0, -1);
					const hand = [...c.hand, topCard];
					state = {
						...state,
						combat: { ...c, drawPile, hand },
					};
				}
				return state;
			},
		},
	}),
);

// ── PANACHE ─────────────────────────────────────────────
// Every 5 cards played in a turn, deal X damage to ALL enemies.
// Uses a counter stored in power's misc via amount tracking.
// The power amount stores the damage value. We track the counter
// using the cardsPlayedThisTurn field on combat state (mod 5).

registerPowerHooks(
	"PANACHE",
	(p: PowerInstance): HookSource => ({
		powerId: "PANACHE",
		hooks: {
			onAfterCardPlayed: (ctx) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				// Check if cardsPlayedThisTurn is a multiple of 5
				if (ctx.combat.cardsPlayedThisTurn % 5 !== 0) return ctx.state;
				// Deal p.amount damage to all enemies
				const monsters = [...ctx.combat.monsters];
				for (let i = 0; i < monsters.length; i++) {
					const m = monsters[i];
					if (m?.alive) {
						const newHp = Math.max(0, m.currentHp - p.amount);
						monsters[i] = { ...m, currentHp: newHp, alive: newHp > 0 };
					}
				}
				return {
					...ctx.state,
					combat: { ...ctx.combat, monsters },
				};
			},
		},
	}),
);

// ── SADISTIC (Sadistic Nature) ──────────────────────────
// When applying a debuff, deal X damage to that enemy.
// Hooks into onApplyPower — we use the notification hook for damage.

registerPowerHooks(
	"SADISTIC",
	(p: PowerInstance): HookSource => ({
		powerId: "SADISTIC",
		hooks: {
			onAfterCardPlayed: (ctx, card) => {
				if (ctx.owner.type !== "player" || !ctx.combat) return ctx.state;
				// Check if the card applies debuffs by checking the card's effect type
				// This is a simplified approach: deal damage for each debuff keyword
				const def = card ? getCard(card.id) : null;
				if (!def) return ctx.state;
				// Count debuff applications from card text heuristic:
				// Look for weak, vulnerable, frail in the card's actions
				const text = def.text.toLowerCase();
				const debuffs = ["weak", "vulnerable", "frail", "poison", "strength down"];
				let debuffCount = 0;
				for (const d of debuffs) {
					if (text.includes(d)) debuffCount++;
				}
				if (debuffCount === 0) return ctx.state;
				// Deal damage to all alive enemies
				const monsters = [...ctx.combat.monsters];
				for (let i = 0; i < monsters.length; i++) {
					const m = monsters[i];
					if (m?.alive) {
						const newHp = Math.max(0, m.currentHp - p.amount * debuffCount);
						monsters[i] = { ...m, currentHp: newHp, alive: newHp > 0 };
					}
				}
				return {
					...ctx.state,
					combat: { ...ctx.combat, monsters },
				};
			},
		},
	}),
);

// ── THE_BOMB ────────────────────────────────────────────
// At end of 3 turns, deal X damage to ALL enemies.
// We track turns via the power amount: start at 3, decrement each turn.
// When it reaches 0, explode and remove.

registerPowerHooks(
	"THE_BOMB",
	(p: PowerInstance): HookSource => ({
		powerId: "THE_BOMB",
		hooks: {
			atEndOfTurn: (ctx, isPlayerTurn) => {
				if (ctx.owner.type !== "player" || !isPlayerTurn) return ctx.state;
				if (!ctx.combat) return ctx.state;
				// The bomb power stores damage in amount.
				// We use a separate counter approach: check combat.turn.
				// Since THE_BOMB is applied once and counts down 3 turns,
				// we decrement via a custom counter. Store turn count in amount field:
				// Actually, let's just track using justApplied for simplicity.
				// The power amount is the damage. We need a countdown.
				// Approach: use a companion power THE_BOMB_TIMER that counts down.
				// Simpler: on each end of turn, decrement a companion counter.
				// For now, the power amount holds damage (40 or 50).
				// We use a timer approach: check if 3 player turns have passed.

				// Find THE_BOMB_TIMER power for countdown
				const timer = ctx.combat.player.powers.find((pw) => pw.id === ("THE_BOMB_TIMER" as never));
				const remaining = timer ? timer.amount : 3;
				if (remaining <= 1) {
					// BOOM! Deal damage to all enemies
					const monsters = [...ctx.combat.monsters];
					for (let i = 0; i < monsters.length; i++) {
						const m = monsters[i];
						if (m?.alive) {
							const newHp = Math.max(0, m.currentHp - p.amount);
							monsters[i] = {
								...m,
								currentHp: newHp,
								alive: newHp > 0,
							};
						}
					}
					// Remove both powers
					let state: GameState = {
						...ctx.state,
						combat: { ...ctx.combat, monsters },
					};
					state = removePowerFromPlayer(state, "THE_BOMB");
					state = removePowerFromPlayer(state, "THE_BOMB_TIMER");
					return state;
				}
				// Decrement timer
				return modifyPower(ctx.state, "THE_BOMB_TIMER", timer ? -1 : 2);
			},
		},
	}),
);

// ── NO_BLOCK ────────────────────────────────────────────
// You cannot gain Block from cards. Duration-based (turns down each turn).

registerPowerHooks(
	"NO_BLOCK",
	(p: PowerInstance): HookSource => ({
		powerId: "NO_BLOCK",
		hooks: {
			modifyBlock: (_ctx, _block, _card) => {
				return 0;
			},
			atEndOfTurn: (ctx, isPlayerTurn) => {
				if (ctx.owner.type !== "player" || !isPlayerTurn) return ctx.state;
				if (!ctx.combat) return ctx.state;
				const newAmount = p.amount - 1;
				if (newAmount <= 0) {
					return removePowerFromPlayer(ctx.state, "NO_BLOCK");
				}
				return modifyPower(ctx.state, "NO_BLOCK", -1);
			},
		},
	}),
);
