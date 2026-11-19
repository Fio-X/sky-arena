import type { CardInstance, GameState } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, getAllCardsByColorAndType, M, P, vals } from "./cardUtils";
import { getCard } from "./loader";

// ── Uncommon attacks ─────────────────────────────────────

registerCardEffect("CARNAGE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

registerCardEffect("DROPKICK", (s, card, t) => {
	const v = vals(card);
	const target = s.combat?.monsters[t];
	const isVulnerable = target?.powers.some((p) => p.id === ("vulnerable" as never));
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	if (isVulnerable) {
		actions.push({ type: "gainEnergy", amount: 1 });
		actions.push({ type: "drawCards", count: 1 });
	}
	return actions;
});

registerCardEffect("HEMOKINESIS", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "loseHp", target: P, amount: v.magic },
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
});

registerCardEffect("PUMMEL", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: v.hits }];
});

registerCardEffect("UPPERCUT", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "applyPower", source: P, target: M(t), powerId: "weak" as never, amount: v.magic },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "vulnerable" as never,
			amount: v.magic,
		},
	];
});

registerCardEffect("RAMPAGE", (_s, card, t) => {
	const v = vals(card);
	const bonusDamage = card.misc;
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage + bonusDamage, hits: 1 },
		{
			type: "custom",
			execute: (st) => {
				const updateCard = (c: CardInstance) =>
					c.uniqueId === card.uniqueId ? { ...c, misc: c.misc + v.magic } : c;
				if (!st.combat) return st;
				return {
					...st,
					combat: {
						...st.combat,
						drawPile: st.combat.drawPile.map(updateCard),
						discardPile: st.combat.discardPile.map(updateCard),
						exhaustPile: st.combat.exhaustPile.map(updateCard),
					},
				};
			},
		},
	];
});

registerCardEffect("BLOOD_FOR_BLOOD", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

registerCardEffect("SEVER_SOUL", (s, card, t) => {
	const v = vals(card);
	const hand = s.combat?.hand ?? [];
	const actions: Action[] = [];
	const toExhaust = hand
		.map((c, i) => ({ card: c, index: i }))
		.filter((e) => {
			const def = getCard(e.card.id);
			return def && def.type !== "attack";
		})
		.sort((a, b) => b.index - a.index);
	for (const e of toExhaust) {
		actions.push({ type: "exhaustCard", handIndex: e.index });
	}
	actions.push({ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 });
	return actions;
});

registerCardEffect("WHIRLWIND", (s, card, _t) => {
	const v = vals(card);
	const energy = s.combat?.energy ?? 0;
	const actions: Action[] = [];
	for (let e = 0; e < energy; e++) {
		for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
			if (s.combat?.monsters[i]?.alive) {
				actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
			}
		}
	}
	actions.push({ type: "loseEnergy", amount: energy });
	return actions;
});

// ── Uncommon skills ──────────────────────────────────────

registerCardEffect("BATTLE_TRANCE", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "drawCards", count: v.magic }];
});

registerCardEffect("BLOODLETTING", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "loseHp", target: P, amount: 3 },
		{ type: "gainEnergy", amount: v.magic },
	];
});

registerCardEffect("DISARM", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: M(t), powerId: "strength" as never, amount: -v.magic },
	];
});

registerCardEffect("ENTRENCH", (s, _card, _t) => {
	const block = s.combat?.player.block ?? 0;
	return [{ type: "block", source: P, amount: block }];
});

registerCardEffect("FLAME_BARRIER", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "applyPower", source: P, target: P, powerId: "flameBarrier" as never, amount: v.magic },
	];
});

registerCardEffect("INTIMIDATE", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "weak" as never,
				amount: v.magic,
			});
		}
	}
	return actions;
});

registerCardEffect("OFFERING", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "loseHp", target: P, amount: 6 },
		{ type: "gainEnergy", amount: 2 },
		{ type: "drawCards", count: v.magic },
	];
});

registerCardEffect("SEEING_RED", (_s, _card, _t) => {
	return [{ type: "gainEnergy", amount: 2 }];
});

registerCardEffect("SHOCKWAVE", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "weak" as never,
				amount: v.magic,
			});
			actions.push({
				type: "applyPower",
				source: P,
				target: M(i),
				powerId: "vulnerable" as never,
				amount: v.magic,
			});
		}
	}
	return actions;
});

registerCardEffect("SPOT_WEAKNESS", (s, card, t) => {
	const v = vals(card);
	const target = s.combat?.monsters[t];
	if (target?.intent.isAttack) {
		return [
			{ type: "applyPower", source: P, target: P, powerId: "strength" as never, amount: v.magic },
		];
	}
	return [];
});

registerCardEffect("BURNING_PACT", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: {
					type: "cardSelect" as const,
					task: "exhaust" as const,
					drawAfter: v.magic,
				},
			}),
		},
	];
});

registerCardEffect("GHOSTLY_ARMOR", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

registerCardEffect("POWER_THROUGH", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "addCardToHand", cardId: "WOUND" as never, upgraded: false },
		{ type: "addCardToHand", cardId: "WOUND" as never, upgraded: false },
		{ type: "block", source: P, amount: v.block },
	];
});

registerCardEffect("RAGE", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "applyPower", source: P, target: P, powerId: "rage" as never, amount: v.magic }];
});

registerCardEffect("SECOND_WIND", (s, card, _t) => {
	const v = vals(card);
	const hand = s.combat?.hand ?? [];
	const actions: Action[] = [];
	const toExhaust = hand
		.map((c, i) => ({ card: c, index: i }))
		.filter((e) => {
			const def = getCard(e.card.id);
			return def && def.type !== "attack";
		})
		.sort((a, b) => b.index - a.index);
	for (const e of toExhaust) {
		actions.push({ type: "exhaustCard", handIndex: e.index });
	}
	actions.push({ type: "block", source: P, amount: v.block * toExhaust.length });
	return actions;
});

registerCardEffect("SENTINEL", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

registerCardEffect("INFERNAL_BLADE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st) => {
				if (!st.combat) return st;
				const redAttacks = getAllCardsByColorAndType("red", "attack");
				if (redAttacks.length === 0) return st;
				const r = random(st.rng.cardRng, redAttacks.length - 1);
				const chosen = redAttacks[r.value];
				if (!chosen) return st;
				if (st.combat.hand.length >= 10) return { ...st, rng: { ...st.rng, cardRng: r.state } };
				const card: CardInstance = {
					id: chosen.id as CardInstance["id"],
					uniqueId: Date.now(),
					upgraded: false,
					costOverride: null,
					costForTurn: 0,
					freeToPlay: true,
					misc: 0,
				};
				return {
					...st,
					rng: { ...st.rng, cardRng: r.state },
					combat: {
						...st.combat,
						hand: [...st.combat.hand, card],
					},
				};
			},
		},
	];
});

// ── Uncommon powers ──────────────────────────────────────

registerCardEffect("INFLAME", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "strength" as never, amount: v.magic },
	];
});

registerCardEffect("COMBUST", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "combust" as never, amount: v.magic },
	];
});

registerCardEffect("DARK_EMBRACE", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "darkEmbrace" as never, amount: 1 }];
});

registerCardEffect("EVOLVE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "evolve" as never, amount: v.magic },
	];
});

registerCardEffect("FEEL_NO_PAIN", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "feelNoPain" as never, amount: v.magic },
	];
});

registerCardEffect("FIRE_BREATHING", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "fireBreathing" as never,
			amount: v.magic,
		},
	];
});

registerCardEffect("DUAL_WIELD", (s, _card, _t) => {
	// Original DualWieldAction: with no Attack or Power in hand nothing happens
	// (opening the choice would leave no valid pick and lock the game).
	const valid = (s.combat?.hand ?? []).some((c) => {
		const type = getCard(c.id)?.type;
		return type === "attack" || type === "power";
	});
	if (!valid) return [];
	return [
		{
			type: "custom",
			execute: (state: GameState) => ({
				...state,
				phase: { type: "cardSelect" as const, task: "dualWield" as const },
			}),
		},
	];
});

registerCardEffect("HAVOC", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (state: GameState) => {
				const c = state.combat;
				if (!c || c.drawPile.length === 0) return state;
				const topCard = c.drawPile[c.drawPile.length - 1];
				if (!topCard) return state;
				const newDraw = c.drawPile.slice(0, -1);
				const def = getCard(topCard.id);
				if (!def || def.cost === -2) {
					return {
						...state,
						combat: { ...c, drawPile: newDraw, exhaustPile: [...c.exhaustPile, topCard] },
					};
				}
				const freeCard = { ...topCard, freeToPlay: true };
				const hand = [...c.hand, freeCard];
				return { ...state, combat: { ...c, drawPile: newDraw, hand } };
			},
		},
	];
});

registerCardEffect("METALLICIZE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "metallicize" as never, amount: v.magic },
	];
});
