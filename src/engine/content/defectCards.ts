import type { CardInstance, GameState, OrbType } from "../core/types";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";

// ── Helpers ─────────────────────────────────────────────

function uniqueOrbTypes(state: GameState): number {
	const orbs = state.combat?.player.orbs ?? [];
	const types = new Set(orbs.map((o) => o.type).filter((t) => t !== "empty"));
	return types.size;
}

function updateCardMiscEverywhere(state: GameState, cardId: string, delta: number): GameState {
	if (!state.combat) return state;
	const bump = (c: CardInstance): CardInstance =>
		c.id === cardId ? { ...c, misc: c.misc + delta } : c;
	return {
		...state,
		combat: {
			...state.combat,
			hand: state.combat.hand.map(bump),
			drawPile: state.combat.drawPile.map(bump),
			discardPile: state.combat.discardPile.map(bump),
		},
	};
}

function updateSelfMisc(state: GameState, uniqueId: number, delta: number): GameState {
	if (!state.combat) return state;
	const bump = (c: CardInstance): CardInstance =>
		c.uniqueId === uniqueId ? { ...c, misc: c.misc + delta } : c;
	return {
		...state,
		combat: {
			...state.combat,
			hand: state.combat.hand.map(bump),
			drawPile: state.combat.drawPile.map(bump),
			discardPile: state.combat.discardPile.map(bump),
		},
	};
}

// ── Basic cards ─────────────────────────────────────────

// Strike (Blue): Deal 6(9) damage.
registerCardEffect("STRIKE_BLUE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Defend (Blue): Gain 5(8) Block.
registerCardEffect("DEFEND_BLUE", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// Zap: Channel 1 Lightning. Cost 1(0).
registerCardEffect("ZAP", (_s, _card, _t) => {
	return [{ type: "channelOrb", orbType: "lightning" }];
});

// Dualcast: Evoke next Orb 2(3) times.
registerCardEffect("DUALCAST", (_s, card, _t) => {
	const times = card.upgraded ? 3 : 2;
	return [{ type: "evokeOrb", times }];
});

// ── Common attacks ──────────────────────────────────────

// Ball Lightning: Deal 7(10) damage. Channel 1 Lightning.
registerCardEffect("BALL_LIGHTNING", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "channelOrb", orbType: "lightning" as OrbType },
	];
});

// Barrage: Deal 4(6) damage for each Channeled Orb.
registerCardEffect("BARRAGE", (s, card, t) => {
	const v = vals(card);
	const orbCount = s.combat?.player.orbs.filter((o) => o.type !== "empty").length ?? 0;
	const actions: Action[] = [];
	for (let i = 0; i < orbCount; i++) {
		actions.push({
			type: "damage",
			source: P,
			target: M(t),
			baseDamage: v.damage,
			hits: 1,
		});
	}
	return actions;
});

// Beam Cell: Deal 3(4) damage. Apply 1(2) Vulnerable.
registerCardEffect("BEAM_CELL", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "vulnerable" as never,
			amount: v.magic,
		},
	];
});

// Claw: Deal 3(5)+misc damage. Increase ALL Claw damage by 2.
registerCardEffect("CLAW", (_s, card, t) => {
	const v = vals(card);
	const bonus = card.misc ?? 0;
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage + bonus, hits: 1 },
		{
			type: "custom",
			execute: (st: GameState) => updateCardMiscEverywhere(st, "CLAW", 2),
		},
	];
});

// Cold Snap: Deal 6(9) damage. Channel 1 Frost.
registerCardEffect("COLD_SNAP", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "channelOrb", orbType: "frost" as OrbType },
	];
});

// Compile Driver: Deal 7(10) damage. Draw 1 card per unique orb type.
registerCardEffect("COMPILE_DRIVER", (s, card, t) => {
	const v = vals(card);
	const count = uniqueOrbTypes(s);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	if (count > 0) {
		actions.push({ type: "drawCards", count });
	}
	return actions;
});

// Go for the Eyes: Deal 3(4) damage. If enemy intends to attack, apply 1(2) Weak.
registerCardEffect("GO_FOR_THE_EYES", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const monster = s.combat?.monsters[t];
	if (monster?.intent.isAttack) {
		actions.push({
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "weak" as never,
			amount: v.magic,
		});
	}
	return actions;
});

// Rebound: Deal 9(12) damage. Next card played goes on top of draw pile.
registerCardEffect("REBOUND", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "REBOUND" as never,
			amount: 1,
		},
	];
});

// Streamline: Deal 15(20) damage. Reduce this card's cost by 1.
registerCardEffect("STREAMLINE", (_s, card, t) => {
	const v = vals(card);
	const uid = card.uniqueId;
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "custom",
			execute: (st: GameState) => {
				if (!st.combat) return st;
				const reduceCost = (c: CardInstance): CardInstance => {
					if (c.uniqueId !== uid) return c;
					const current = c.costOverride ?? 2;
					return { ...c, costOverride: Math.max(0, current - 1) };
				};
				return {
					...st,
					combat: {
						...st.combat,
						hand: st.combat.hand.map(reduceCost),
						drawPile: st.combat.drawPile.map(reduceCost),
						discardPile: st.combat.discardPile.map(reduceCost),
					},
				};
			},
		},
	];
});

// Sweeping Beam: Deal 6(9) damage to ALL enemies. Draw 1 card.
registerCardEffect("SWEEPING_BEAM", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({
				type: "damage",
				source: P,
				target: M(i),
				baseDamage: v.damage,
				hits: 1,
			});
		}
	}
	actions.push({ type: "drawCards", count: 1 });
	return actions;
});

// ── Common skills ───────────────────────────────────────

// Charge Battery: Gain 7(10) Block. Next turn gain 1 energy.
registerCardEffect("CHARGE_BATTERY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "energized" as never,
			amount: 1,
		},
	];
});

// Coolheaded: Channel 1 Frost. Draw 1(2) cards.
registerCardEffect("COOLHEADED", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "channelOrb", orbType: "frost" as OrbType },
		{ type: "drawCards", count: v.magic },
	];
});

// Hologram: Gain 3(5) Block. Pick a card from discard pile into hand.
// Base exhausts, upgraded doesn't (handled by flags in data).
registerCardEffect("HOLOGRAM", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [{ type: "block", source: P, amount: v.block }];
	if ((s.combat?.discardPile.length ?? 0) > 0) {
		actions.push({
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "hologram" as const },
			}),
		});
	}
	return actions;
});

// Leap: Gain 9(12) Block.
registerCardEffect("LEAP", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// Recursion: Evoke next orb, then channel the same orb type back.
registerCardEffect("RECURSION", (s, _card, _t) => {
	const firstOrb = s.combat?.player.orbs[0];
	if (!firstOrb || firstOrb.type === "empty") {
		return [{ type: "evokeOrb", times: 1 }];
	}
	const orbType = firstOrb.type;
	return [
		{ type: "evokeOrb", times: 1 },
		{ type: "channelOrb", orbType },
	];
});

// Stack: Gain Block equal to cards in discard pile (+3 if upgraded).
registerCardEffect("STACK", (s, card, _t) => {
	const discardCount = s.combat?.discardPile.length ?? 0;
	const bonus = card.upgraded ? 3 : 0;
	const amount = discardCount + bonus;
	return amount > 0 ? [{ type: "block", source: P, amount }] : [];
});

// Steam Barrier: Gain 6(8)-misc Block. Decrease block by 1.
registerCardEffect("STEAM_BARRIER", (_s, card, _t) => {
	const v = vals(card);
	const reduction = card.misc ?? 0;
	const blockAmt = Math.max(0, v.block - reduction);
	const uid = card.uniqueId;
	const actions: Action[] = [];
	if (blockAmt > 0) {
		actions.push({ type: "block", source: P, amount: blockAmt });
	}
	actions.push({
		type: "custom",
		execute: (st: GameState) => updateSelfMisc(st, uid, 1),
	});
	return actions;
});

// Turbo: Gain 2(3) energy. Add a Void to discard pile.
registerCardEffect("TURBO", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "gainEnergy", amount: v.magic },
		{ type: "addCardToDiscardPile", cardId: "VOID" as never, upgraded: false },
	];
});
