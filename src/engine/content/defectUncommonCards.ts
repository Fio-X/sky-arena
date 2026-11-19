import { addOrbSlots, removeOrbSlot } from "../core/orbSystem";
import type { CardInstance, GameState, OrbType } from "../core/types";
import { random } from "../rng/stsRandom";
import { registerCardEffect } from "./cardEffects";
import { type Action, M, P, vals } from "./cardUtils";
import { getAllCards, getCard } from "./loader";

// ── Uncommon attacks ────────────────────────────────────

// Bullseye: Deal 8(11) damage. Apply 2(3) Lock-On. Cost 1.
registerCardEffect("BULLSEYE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "applyPower", source: P, target: M(t), powerId: "LOCK_ON" as never, amount: v.magic },
	];
});

// Blizzard: Deal 2(3) × frostChanneled damage to ALL enemies. Cost 1.
// Frost channeled count tracked via invisible FROST_CHANNELED power on player.
registerCardEffect("BLIZZARD", (s, card, _t) => {
	const v = vals(card);
	const frostCount =
		s.combat?.player.powers.find((p) => p.id === ("FROST_CHANNELED" as never))?.amount ?? 0;
	const totalDamage = v.magic * frostCount;
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: totalDamage, hits: 1 });
		}
	}
	return actions;
});

// Doom and Gloom: Deal 10(14) damage to ALL enemies. Channel 1 Dark. Cost 2.
registerCardEffect("DOOM_AND_GLOOM", (s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let i = 0; i < (s.combat?.monsters.length ?? 0); i++) {
		if (s.combat?.monsters[i]?.alive) {
			actions.push({ type: "damage", source: P, target: M(i), baseDamage: v.damage, hits: 1 });
		}
	}
	actions.push({ type: "channelOrb", orbType: "dark" });
	return actions;
});

// FTL: Deal 5(6) damage. If less than 3(4) cards played this turn, draw 1. Cost 0.
// Note: cardsPlayedThisTurn is already incremented before the effect runs (includes FTL itself).
registerCardEffect("FTL", (s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	const played = s.combat?.cardsPlayedThisTurn ?? 0;
	if (played <= v.magic) {
		actions.push({ type: "drawCards", count: 1 });
	}
	return actions;
});

// Melter: Remove all Block from enemy. Deal 10(14) damage. Cost 1.
registerCardEffect("MELTER", (_s, card, t) => {
	const v = vals(card);
	const actions: Action[] = [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const monster = st.combat.monsters[t];
				if (!monster?.alive) return st;
				const monsters = [...st.combat.monsters];
				monsters[t] = { ...monster, block: 0 };
				return { ...st, combat: { ...st.combat, monsters } };
			},
		},
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
	];
	return actions;
});

// Rip and Tear: Deal 7(9) damage to random enemy twice. Cost 1.
registerCardEffect("RIP_AND_TEAR", (_s, card, _t) => {
	const v = vals(card);
	const actions: Action[] = [];
	for (let hit = 0; hit < 2; hit++) {
		actions.push({
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const alive = st.combat.monsters.map((m, i) => ({ m, i })).filter((x) => x.m.alive);
				if (alive.length === 0) return st;
				const r = random(st.rng.miscRng, alive.length - 1);
				const picked = alive[r.value];
				if (!picked) return st;
				// Store target for the following damage action
				return {
					...st,
					rng: { ...st.rng, miscRng: r.state },
					combat: {
						...st.combat,
						actionQueue: [
							{ type: "damage", source: P, target: M(picked.i), baseDamage: v.damage, hits: 1 },
							...st.combat.actionQueue,
						],
					},
				};
			},
		});
	}
	return actions;
});

// Scrape: Deal 7(10) damage. Draw 4(5). Discard drawn cards that don't cost 0. Cost 1.
// Helper: draw N cards, then discard any drawn card whose cost is not 0.
function scrapeDrawAndDiscard(st: GameState, drawCount: number): GameState {
	if (!st.combat) return st;
	const handBefore = st.combat.hand.length;
	let combat = st.combat;
	const drawn: CardInstance[] = [];
	for (let i = 0; i < drawCount; i++) {
		if (combat.hand.length >= 10) break;
		if (combat.drawPile.length === 0) break;
		const top = combat.drawPile[combat.drawPile.length - 1];
		if (!top) break;
		drawn.push(top);
		combat = {
			...combat,
			drawPile: combat.drawPile.slice(0, -1),
			hand: [...combat.hand, top],
		};
	}
	const toDiscard: CardInstance[] = [];
	const newHand: CardInstance[] = [];
	for (let i = 0; i < combat.hand.length; i++) {
		const c = combat.hand[i];
		if (!c) continue;
		const wasDrawn = i >= handBefore && drawn.some((d) => d.uniqueId === c.uniqueId);
		if (wasDrawn) {
			const def = getCard(c.id);
			const cost = c.costOverride ?? def?.cost ?? 1;
			if (cost !== 0) {
				toDiscard.push(c);
				continue;
			}
		}
		newHand.push(c);
	}
	return {
		...st,
		combat: {
			...combat,
			hand: newHand,
			discardPile: [...combat.discardPile, ...toDiscard],
			cardsDiscardedThisTurn: combat.cardsDiscardedThisTurn + toDiscard.length,
		},
	};
}

registerCardEffect("SCRAPE", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{ type: "custom", execute: (st: GameState) => scrapeDrawAndDiscard(st, v.magic) },
	];
});

// Sunder: Deal 24(32) damage. If kills enemy, gain 3 energy. Cost 3.
registerCardEffect("SUNDER", (_s, card, t) => {
	const v = vals(card);
	return [
		{ type: "damage", source: P, target: M(t), baseDamage: v.damage, hits: 1 },
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const monster = st.combat.monsters[t];
				if (monster && !monster.alive) {
					return { ...st, combat: { ...st.combat, energy: st.combat.energy + 3 } };
				}
				return st;
			},
		},
	];
});

// ── Uncommon skills ─────────────────────────────────────

// Aggregate: Gain 1 energy per 4(3) cards in draw pile. Cost 1.
registerCardEffect("AGGREGATE", (s, card, _t) => {
	const v = vals(card);
	const drawCount = s.combat?.drawPile.length ?? 0;
	const energyGain = Math.floor(drawCount / v.magic);
	return [{ type: "gainEnergy", amount: energyGain }];
});

// Auto-Shields: If no block, gain 11(15) Block. Cost 1.
registerCardEffect("AUTO_SHIELDS", (s, card, _t) => {
	const v = vals(card);
	if ((s.combat?.player.block ?? 0) > 0) return [];
	return [{ type: "block", source: P, amount: v.block }];
});

// Boot Sequence: Innate. Gain 10(13) Block. Exhaust. Cost 0.
// Innate + Exhaust handled by flags.
registerCardEffect("BOOT_SEQUENCE", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// Chaos: Channel 1(2) random orbs. Cost 1.
registerCardEffect("CHAOS", (_s, card, _t) => {
	const v = vals(card);
	const orbTypes: OrbType[] = ["lightning", "frost", "dark", "plasma"];
	const actions: Action[] = [];
	for (let i = 0; i < v.magic; i++) {
		actions.push({
			type: "custom",
			execute: (st: GameState): GameState => {
				const r = random(st.rng.miscRng, orbTypes.length - 1);
				const picked = orbTypes[r.value] ?? "lightning";
				return {
					...st,
					rng: { ...st.rng, miscRng: r.state },
					combat: st.combat
						? {
								...st.combat,
								actionQueue: [{ type: "channelOrb", orbType: picked }, ...st.combat.actionQueue],
							}
						: st.combat,
				};
			},
		});
	}
	return actions;
});

// Chill: Channel 1 Frost per enemy. Exhaust. (Upgraded: Innate.) Cost 0.
registerCardEffect("CHILL", (s, _card, _t) => {
	const actions: Action[] = [];
	const enemies = s.combat?.monsters.filter((m) => m.alive).length ?? 0;
	for (let i = 0; i < enemies; i++) {
		actions.push({ type: "channelOrb", orbType: "frost" });
	}
	return actions;
});

// Consume: Gain 2(3) Focus. Lose 1 orb slot. Cost 2.
registerCardEffect("CONSUME", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "FOCUS" as never, amount: v.magic },
		{
			type: "custom",
			execute: (st: GameState): GameState => removeOrbSlot(st),
		},
	];
});

// Darkness: Channel 1 Dark. Upgraded: trigger passive of all Dark orbs. Cost 1.
registerCardEffect("DARKNESS", (_s, card, _t) => {
	const actions: Action[] = [{ type: "channelOrb", orbType: "dark" }];
	if (card.upgraded) {
		actions.push({
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				// Trigger passive of all Dark orbs (increase their stored damage)
				const focus = st.combat.player.powers.find((p) => p.id === ("FOCUS" as never))?.amount ?? 0;
				const newOrbs = st.combat.player.orbs.map((orb) => {
					if (orb.type === "dark") {
						const gain = Math.max(0, orb.passive + focus);
						return { ...orb, passive: (orb.passive || orb.evoke) + gain };
					}
					return orb;
				});
				return {
					...st,
					combat: { ...st.combat, player: { ...st.combat.player, orbs: newOrbs } },
				};
			},
		});
	}
	return actions;
});

// Double Energy: Double energy. Exhaust. Cost 1(0).
registerCardEffect("DOUBLE_ENERGY", (s, _card, _t) => {
	const energy = s.combat?.energy ?? 0;
	return [{ type: "gainEnergy", amount: energy }];
});

// Equilibrium: Gain 13(16) Block. Retain hand this turn. Cost 2.
registerCardEffect("EQUILIBRIUM", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "applyPower", source: P, target: P, powerId: "EQUILIBRIUM" as never, amount: 1 },
	];
});

// Force Field: Costs 1 less per power played this combat. Gain 12(16) Block. Cost 4.
// Cost reduction handled via modifyCardCost hook with POWERS_PLAYED_COMBAT counter.
registerCardEffect("FORCE_FIELD", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "block", source: P, amount: v.block }];
});

// Fusion: Channel 1 Plasma. Cost 2(1).
registerCardEffect("FUSION", (_s, _card, _t) => {
	return [{ type: "channelOrb", orbType: "plasma" }];
});

// Genetic Algorithm: Gain 1 Block. Permanently increase block by 2(3). Exhaust. Cost 1.
// Uses card.misc to store accumulated block.
registerCardEffect("GENETIC_ALGORITHM", (_s, card, _t) => {
	const v = vals(card);
	const accumulatedBlock = 1 + (card.misc ?? 0);
	return [
		{ type: "block", source: P, amount: accumulatedBlock },
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				// Find this card in all piles and deck and permanently increase misc
				const upgrade = (c: CardInstance) =>
					c.uniqueId === card.uniqueId ? { ...c, misc: (c.misc ?? 0) + v.magic } : c;
				return {
					...st,
					deck: st.deck.map(upgrade),
					combat: st.combat
						? {
								...st.combat,
								hand: st.combat.hand.map(upgrade),
								drawPile: st.combat.drawPile.map(upgrade),
								discardPile: st.combat.discardPile.map(upgrade),
								exhaustPile: st.combat.exhaustPile.map(upgrade),
							}
						: st.combat,
				};
			},
		},
	];
});

// Glacier: Gain 7(10) Block. Channel 2 Frost. Cost 2.
registerCardEffect("GLACIER", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "block", source: P, amount: v.block },
		{ type: "channelOrb", orbType: "frost" },
		{ type: "channelOrb", orbType: "frost" },
	];
});

// Overclock: Draw 2(3) cards. Add a Burn to discard. Cost 0.
registerCardEffect("OVERCLOCK", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "drawCards", count: v.magic },
		{ type: "addCardToDiscardPile", cardId: "BURN" as never, upgraded: false },
	];
});

// Recycle: Exhaust a card. Gain energy = its cost. Cost 1(0).
// CardSelect task "recycle" already exists in types and cardSelect handler.
registerCardEffect("RECYCLE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState) => ({
				...st,
				phase: { type: "cardSelect" as const, task: "recycle" as const },
			}),
		},
	];
});

// Reinforced Body: X cost. Gain 7(9) Block X times. Cost X.
registerCardEffect("REINFORCED_BODY", (s, card, _t) => {
	const v = vals(card);
	const energy = s.combat?.energy ?? 0;
	const actions: Action[] = [];
	for (let i = 0; i < energy; i++) {
		actions.push({ type: "block", source: P, amount: v.block });
	}
	actions.push({ type: "loseEnergy", amount: energy });
	return actions;
});

// Reprogram: Lose 1(2) Focus. Gain 1(2) Strength. Gain 1(2) Dexterity. Cost 1.
registerCardEffect("REPROGRAM", (_s, card, _t) => {
	const v = vals(card);
	return [
		{ type: "applyPower", source: P, target: P, powerId: "FOCUS" as never, amount: -v.magic },
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "strength" as never,
			amount: v.magic,
		},
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "dexterity" as never,
			amount: v.magic,
		},
	];
});

// Skim: Draw 3(4) cards. Cost 1.
registerCardEffect("SKIM", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "drawCards", count: v.magic }];
});

// Tempest: X cost. Channel X(X+1) Lightning. Exhaust. Cost X.
registerCardEffect("TEMPEST", (s, card, _t) => {
	const energy = s.combat?.energy ?? 0;
	const count = card.upgraded ? energy + 1 : energy;
	const actions: Action[] = [];
	for (let i = 0; i < count; i++) {
		actions.push({ type: "channelOrb", orbType: "lightning" });
	}
	actions.push({ type: "loseEnergy", amount: energy });
	return actions;
});

// White Noise: Add random Power card to hand, it costs 0 this turn. Exhaust. Cost 1(0).
registerCardEffect("WHITE_NOISE", (_s, _card, _t) => {
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => {
				if (!st.combat) return st;
				const powers = getAllCards().filter(
					(c) => c.type === "power" && c.pool === "class" && !c.unobtainable,
				);
				if (powers.length === 0) return st;
				const r = random(st.rng.cardRng, powers.length - 1);
				const chosen = powers[r.value];
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
					upgraded: false,
					uniqueId: uid,
					costOverride: 0,
					freeToPlay: false,
					costForTurn: 0,
					misc: 0,
				};
				const hand = st.combat.hand.length < 10 ? [...st.combat.hand, newCard] : st.combat.hand;
				return { ...st, rng: { ...st.rng, cardRng: r.state }, combat: { ...st.combat, hand } };
			},
		},
	];
});

// ── Uncommon powers ─────────────────────────────────────
// For powers, just apply the power. Hooks registered separately in defectPowers.ts.

// Capacitor: Gain 2(3) orb slots. Cost 1.
registerCardEffect("CAPACITOR", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "custom",
			execute: (st: GameState): GameState => addOrbSlots(st, v.magic),
		},
	];
});

// Defragment: Gain 1(2) Focus. Cost 1.
registerCardEffect("DEFRAGMENT", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "applyPower", source: P, target: P, powerId: "FOCUS" as never, amount: v.magic }];
});

// Heatsinks: When you play a Power card, draw 1(2). Cost 1.
registerCardEffect("HEATSINKS", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "HEATSINKS" as never,
			amount: v.magic,
		},
	];
});

// Hello World: At start of turn, add random Common to hand. Cost 1.
registerCardEffect("HELLO_WORLD", (_s, _card, _t) => {
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "HELLO_WORLD" as never,
			amount: 1,
		},
	];
});

// Loop: At start of turn, trigger next orb passive 1(2) times. Cost 1.
registerCardEffect("LOOP", (_s, card, _t) => {
	const v = vals(card);
	return [{ type: "applyPower", source: P, target: P, powerId: "LOOP" as never, amount: v.magic }];
});

// Self Repair: At end of combat, heal 7(10) HP. Cost 1.
registerCardEffect("SELF_REPAIR", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "SELF_REPAIR" as never,
			amount: v.magic,
		},
	];
});

// Static Discharge: When hit by unblocked attack, channel 1(2) Lightning. Cost 1.
registerCardEffect("STATIC_DISCHARGE", (_s, card, _t) => {
	const v = vals(card);
	return [
		{
			type: "applyPower",
			source: P,
			target: P,
			powerId: "STATIC_DISCHARGE" as never,
			amount: v.magic,
		},
	];
});

// Storm: When you play a Power card, channel 1 Lightning. Cost 1.
registerCardEffect("STORM", (_s, _card, _t) => {
	return [{ type: "applyPower", source: P, target: P, powerId: "STORM" as never, amount: 1 }];
});
