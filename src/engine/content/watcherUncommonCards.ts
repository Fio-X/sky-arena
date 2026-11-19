import { applyDamage, calculateDamage } from "../combat/damage";
import type { CardInstance, GameState } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, getAllCardsByColorAndType, M, P, vals } from "./cardUtils";
import { getCard } from "./loader";

// ── Uncommon attacks ────────────────────────────────────

// Carve Reality: Deal 6(10) damage. Add a Smite to hand.
registerCardEffect("CARVE_REALITY", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "addCardToHand", cardId: "SMITE" as never, upgraded: card.upgraded },
	];
});

// Conclude: Deal 12(16) damage to ALL enemies. End your turn.
registerCardEffect("CONCLUDE", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	actions.push({
		type: "custom",
		execute: (st: GameState): GameState => {
			if (!st.combat) return st;
			return {
				...st,
				combat: {
					...st.combat,
					actionQueue: [...st.combat.actionQueue, { type: "endTurn" } as never],
				},
			};
		},
	});
	return actions;
});

// Fear No Evil: Deal 8(11) damage. If enemy intends to attack, enter Calm.
registerCardEffect("FEAR_NO_EVIL", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const monster = s.combat?.monsters[t];
	if (monster?.alive && monster.intent.isAttack) {
		actions.push({ type: "changeStance", stance: "calm" });
	}
	return actions;
});

// Reach Heaven: Deal 10(15) damage. Shuffle Through Violence into draw pile.
registerCardEffect("REACH_HEAVEN", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "addCardToDrawPile",
			cardId: "THROUGH_VIOLENCE" as never,
			upgraded: card.upgraded,
			toTop: false,
		},
	];
});

// Sands of Time: Deal 20(26) damage. selfRetain. When retained, reduce cost by 1.
registerCardEffect("SANDS_OF_TIME", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Signature Move: Deal 30(40) damage. Can only be played if only attacks in hand.
// (Playability check handled elsewhere; effect is just damage.)
registerCardEffect("SIGNATURE_MOVE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Talk to the Hand: Deal 5(7) damage. Apply 2(3) Block Return to target. Exhaust.
registerCardEffect("TALK_TO_THE_HAND", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "applyPower",
			source: P,
			target: M(t),
			powerId: "BLOCK_RETURN" as never,
			amount: v.magic,
		},
	];
});

// Tantrum: Deal 3 damage 3(4) times. Enter Wrath. Shuffle this into draw pile.
registerCardEffect("TANTRUM", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: v.hits },
		{ type: "changeStance", stance: "wrath" },
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				// Find this card in discard pile (it was just played) and move to draw pile
				const idx = st.combat.discardPile.findIndex((c) => c.uniqueId === card.uniqueId);
				if (idx === -1) return st;
				const theCard = st.combat.discardPile[idx]!;
				const newDiscard = st.combat.discardPile.filter((_, i) => i !== idx);
				const r = random(st.rng.cardRng, st.combat.drawPile.length);
				const newDraw = [...st.combat.drawPile];
				newDraw.splice(r.value, 0, theCard);
				return {
					...st,
					rng: { ...st.rng, cardRng: r.state },
					combat: { ...st.combat, discardPile: newDiscard, drawPile: newDraw },
				};
			},
		},
	];
	return actions;
});

// Wallop: Deal 9(12) damage. Gain block = unblocked damage dealt.
registerCardEffect("WALLOP", (_s, card, t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const { damage, state: s1 } = calculateDamage(st, P, M(t), v.damage, card);
				const { state: s2, hpLost } = applyDamage(s1, M(t), damage);
				if (hpLost <= 0) return s2;
				// Gain block equal to unblocked damage
				const player = s2.combat!.player;
				return {
					...s2,
					combat: { ...s2.combat!, player: { ...player, block: player.block + hpLost } },
				};
			},
		},
	];
});

// Weave: Deal 4(6) damage. (Auto-play from discard on Scry handled by hook.)
registerCardEffect("WEAVE", (_s, card, t) => {
	const v = vals(card);
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 }];
});

// Wheel Kick: Deal 15(20) damage. Draw 2 cards.
registerCardEffect("WHEEL_KICK", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "drawCards", count: v.magic },
	];
});

// Windmill Strike: Deal 7(10) damage. selfRetain. When retained, increase damage by 4(5).
// misc tracks accumulated bonus damage.
registerCardEffect("WINDMILL_STRIKE", (_s, card, t) => {
	const v = vals(card);
	const bonusDamage = card.misc ?? 0;
	return [{ type: "damage", source: P, target: M(t), baseDamage: v.damage + bonusDamage, hits: 1 }];
});

// ── Uncommon skills ─────────────────────────────────────

// Collect: X cost. Put a Miracle+ into hand at start of next X(X+1) turns. Exhaust.
registerCardEffect("COLLECT", (s, card, _t) => {
	const energy = s.combat?.energy ?? 0;
	const turns = card.upgraded ? energy + 1 : energy;
	return [
		{ type: "applyPower", source: P, target: P, powerId: "COLLECT" as never, amount: turns },
		{ type: "loseEnergy", amount: energy },
	];
});

// Deceive Reality: Gain 4(7) block. Add a Safety to hand.
registerCardEffect("DECEIVE_REALITY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "addCardToHand", cardId: "SAFETY" as never, upgraded: card.upgraded },
	];
});

// Empty Mind: Exit stance. Draw 2(3) cards.
registerCardEffect("EMPTY_MIND", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "changeStance", stance: "neutral" },
		{ type: "drawCards", count: v.magic },
	];
});

// Foreign Influence: Choose 1 of 3 random attack cards from other classes. Add to hand. Exhaust.
// Simplified: add a random non-purple attack card to hand.
registerCardEffect("FOREIGN_INFLUENCE", (_s, card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const attacks = getAllCardsByColorAndType("red", "attack")
					.concat(getAllCardsByColorAndType("green", "attack"))
					.concat(getAllCardsByColorAndType("blue", "attack"));
				if (attacks.length === 0) return st;
				const r = random(st.rng.cardRng, attacks.length - 1);
				const chosen = attacks[r.value];
				if (!chosen) return st;
				const allCards = [
					...st.combat.hand,
					...st.combat.drawPile,
					...st.combat.discardPile,
					...st.combat.exhaustPile,
				];
				const uid = allCards.reduce((max, c) => Math.max(max, c.uniqueId), 0) + 1;
				const newCard: CardInstance = {
					id: chosen.id as never,
					upgraded: card.upgraded,
					uniqueId: uid,
					costOverride: null,
					freeToPlay: false,
					costForTurn: chosen.cost ?? 0,
					misc: 0,
				};
				const hand = st.combat.hand.length < 10 ? [...st.combat.hand, newCard] : st.combat.hand;
				return { ...st, rng: { ...st.rng, cardRng: r.state }, combat: { ...st.combat, hand } };
			},
		},
	];
});

// Indignation: If in Wrath, apply 3(5) Vulnerable to ALL enemies. Otherwise, enter Wrath.
registerCardEffect("INDIGNATION", (s, card, _t) => {
	const v = vals(card);
	if (s.combat?.player.stance === "wrath") {
		const actions: Action[] = [];
		for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
			if (s.combat?.monsters[i]?.alive) {
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
	}
	return [{ type: "changeStance", stance: "wrath" }];
});

// Inner Peace: If in Calm, draw 3(4) cards. Otherwise, enter Calm.
registerCardEffect("INNER_PEACE", (s, card, _t) => {
	const v = vals(card);
	if (s.combat?.player.stance === "calm") {
		return [{ type: "drawCards", count: v.magic }];
	}
	return [{ type: "changeStance", stance: "calm" }];
});

// Meditate: Put 1(2) cards from discard into hand and Retain them. Enter Calm. End turn.
// Simplified: enter Calm, end turn. Full card-select handled via cardSelect task.
registerCardEffect("MEDITATE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				// Take up to v.magic cards from top of discard pile and add to hand with retain
				const count = Math.min(v.magic, st.combat.discardPile.length);
				if (count === 0) return st;
				const taken = st.combat.discardPile.slice(-count);
				const newDiscard = st.combat.discardPile.slice(0, -count);
				const retained = taken.map((c) => ({ ...c, freeToPlay: c.freeToPlay }));
				const hand = [...st.combat.hand, ...retained].slice(0, 10);
				return { ...st, combat: { ...st.combat, hand, discardPile: newDiscard } };
			},
		},
		{ type: "changeStance", stance: "calm" },
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				return {
					...st,
					combat: {
						...st.combat,
						actionQueue: [...st.combat.actionQueue, { type: "endTurn" } as never],
					},
				};
			},
		},
	];
});

// Perseverance: Gain 5(7) block. selfRetain. When retained, increase block by 2(3).
// misc tracks accumulated bonus block.
registerCardEffect("PERSEVERANCE", (_s, card, _t) => {
	const v = vals(card);
	const bonusBlock = card.misc ?? 0;
	return [{ type: "block", source: P, amount: v.block + bonusBlock }];
});

// Pray: Gain 3(4) Mantra. Shuffle 1 Insight into draw pile.
registerCardEffect("PRAY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "MANTRA" as never, amount: v.magic },
		{ type: "addCardToDrawPile", cardId: "INSIGHT" as never, upgraded: false, toTop: false },
	];
});

// Sanctity: Gain 6(9) block. If last card played was a Skill, draw 2 cards.
registerCardEffect("SANCTITY", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [{ type: "block", source: P, amount: v.block }];
	// Check if previous card was a skill by looking at discard pile top
	const discard = s.combat?.discardPile ?? [];
	if (discard.length > 0) {
		const lastPlayed = discard[discard.length - 1];
		if (lastPlayed) {
			const def = getCard(lastPlayed.id);
			if (def?.type === "skill") {
				actions.push({ type: "drawCards", count: v.magic });
			}
		}
	}
	return actions;
});

// Simmering Fury: At start of next turn, enter Wrath and draw 2(3) cards.
registerCardEffect("SIMMERING_FURY", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "SIMMERING_FURY" as never,
			amount: v.magic,
		},
	];
});

// Swivel: Gain 8(11) block. Next attack you play costs 0.
registerCardEffect("SWIVEL", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "applyPower", source: P, target: P, powerId: "SWIVEL" as never, amount: 1 },
	];
});

// Wave of the Hand: Gain block this turn → gain Mantra. Apply power with magic amount.
registerCardEffect("WAVE_OF_THE_HAND", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "WAVE_OF_THE_HAND" as never,
			amount: v.magic,
		},
	];
});

// Worship: Gain 5 Mantra. (Upgraded: selfRetain.)
registerCardEffect("WORSHIP", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "MANTRA" as never, amount: v.magic },
	];
});

// Wreath of Flame: Next attack deals +5(+8) damage.
registerCardEffect("WREATH_OF_FLAME", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "WREATH_OF_FLAME" as never,
			amount: v.magic,
		},
	];
});
