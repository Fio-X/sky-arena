/**
 * Combat relics, part 2: card play, discard, shuffle, stance, orbs, healing,
 * deaths, victory. Helpers come from relicsCombat.ts.
 */
import { applyDamage, calculateNonAttackDamage } from "../combat/damage";
import { resolveMonsterDeath } from "../combat/death";
import { isDebuffApplication } from "../combat/powers";
import { registerPowerHooks } from "../core/hooks";
import { channelOrb, triggerOrbPassives } from "../core/orbSystem";
import type { ActorRef, GameState, OrbInstance, PowerInstance } from "../core/types";
import { random } from "../rng/stsRandom";
import { getCard } from "./loader";
import { addPlayerBlock, relicVal, setRelicCounter } from "./relicHelpers";
import { aliveMonsterRefs, gainEnergy, P, power, queue, relic } from "./relicsCombat";
import { hasRelic, relicCounter } from "./relicsCombatRules";

/** A random living enemy (MonsterGroup.getRandomMonster(null, true, cardRandomRng)). */
function randomEnemy(state: GameState): { target: ActorRef | null; state: GameState } {
	const alive = aliveMonsterRefs(state);
	if (alive.length === 0) return { target: null, state };
	const roll = random(state.rng.cardRandomRng, alive.length - 1);
	const s = { ...state, rng: { ...state.rng, cardRandomRng: roll.state } };
	return { target: alive[roll.value] ?? null, state: s };
}

// ═════════════════════════════════════════════════════════
// CARD PLAY
// ═════════════════════════════════════════════════════════

// Curses become playable (core/step.ts); playing one costs 1 HP and exhausts it.
relic("BLUE_CANDLE", {
	onUseCard: (ctx, card) =>
		getCard(card.id)?.type === "curse"
			? queue(ctx.state, [{ type: "loseHp", target: P, amount: relicVal("BLUE_CANDLE", 0, 1) }])
			: ctx.state,
});

// Statuses become playable and exhaust (core/step.ts); no hook of its own.
relic("MEDICAL_KIT", {});

// LoseDexterityPower: lose that much Dexterity at end of turn (Duality's temporary Dexterity).
registerPowerHooks("LOSE_DEXTERITY", (p: PowerInstance) => ({
	powerId: "LOSE_DEXTERITY",
	hooks: {
		atEndOfTurn: (ctx) => {
			if (ctx.owner.type !== "player") return ctx.state;
			const powers = ctx.combat.player.powers
				.map((pw) => (pw.id === "dexterity" ? { ...pw, amount: pw.amount - p.amount } : pw))
				.filter((pw) => pw.id !== "LOSE_DEXTERITY");
			return { ...ctx.state, combat: { ...ctx.combat, player: { ...ctx.combat.player, powers } } };
		},
	},
}));

relic("DUALITY", {
	onUseCard: (ctx, card) =>
		getCard(card.id)?.type === "attack"
			? queue(ctx.state, [power(P, "dexterity", 1), power(P, "LOSE_DEXTERITY", 1)])
			: ctx.state,
});

// Power played: a random card in hand that costs 1+ costs 0 this turn (cardRandomRng).
relic("MUMMIFIED_HAND", {
	onUseCard: (ctx, card) => {
		if (getCard(card.id)?.type !== "power") return ctx.state;
		const hand = ctx.combat.hand;
		const eligible = hand
			.map((c, i) => ({ c, i }))
			.filter(({ c }) => (getCard(c.id)?.cost ?? 0) > 0 && c.costForTurn > 0 && !c.freeToPlay);
		if (eligible.length === 0) return ctx.state;
		const roll = random(ctx.state.rng.cardRandomRng, eligible.length - 1);
		const pick = eligible[roll.value]?.i;
		return {
			...ctx.state,
			rng: { ...ctx.state.rng, cardRandomRng: roll.state },
			combat: {
				...ctx.combat,
				hand: hand.map((c, i) => (i === pick ? { ...c, costForTurn: 0 } : c)),
			},
		};
	},
});

// Counter bits: 1 Attack, 2 Skill, 4 Power played this turn; all three → remove debuffs.
const PELLET_BITS: Record<string, number> = { attack: 1, skill: 2, power: 4 };

function removePlayerDebuffs(state: GameState): GameState {
	const c = state.combat;
	if (!c) return state;
	const powers = c.player.powers.filter((p) => !isDebuffApplication(p.id, p.amount));
	return { ...state, combat: { ...c, player: { ...c.player, powers } } };
}

relic("ORANGE_PELLETS", {
	atBattleStart: (ctx) => setRelicCounter(ctx.state, "ORANGE_PELLETS", 0),
	atStartOfTurn: (ctx) => setRelicCounter(ctx.state, "ORANGE_PELLETS", 0),
	onUseCard: (ctx, card) => {
		const bit = PELLET_BITS[getCard(card.id)?.type ?? ""] ?? 0;
		const bits = relicCounter(ctx.state, "ORANGE_PELLETS") | bit;
		if (bits !== 7) return setRelicCounter(ctx.state, "ORANGE_PELLETS", bits);
		return removePlayerDebuffs(setRelicCounter(ctx.state, "ORANGE_PELLETS", 0));
	},
});

// Attacks that cost 0 deal 4 more. Damage actions carry no card, so the relic
// marks the attack being played (counter 1) from onUseCard to onAfterCardPlayed.
relic("WRIST_BLADE", {
	onUseCard: (ctx, card) => {
		const def = getCard(card.id);
		const zero =
			def?.type === "attack" && def.cost !== -1 && (card.freeToPlay || card.costForTurn === 0);
		return setRelicCounter(ctx.state, "WRIST_BLADE", zero ? 1 : 0);
	},
	onAfterCardPlayed: (ctx) => setRelicCounter(ctx.state, "WRIST_BLADE", 0),
	atDamageGive: (ctx, damage) =>
		relicCounter(ctx.state, "WRIST_BLADE") === 1 ? damage + 4 : damage,
});

// ═════════════════════════════════════════════════════════
// DISCARD
// ═════════════════════════════════════════════════════════

relic("HOVERING_KITE", {
	atBattleStart: (ctx) => setRelicCounter(ctx.state, "HOVERING_KITE", 0),
	atStartOfTurn: (ctx) => setRelicCounter(ctx.state, "HOVERING_KITE", 0),
	onManualDiscard: (ctx) => {
		if (relicCounter(ctx.state, "HOVERING_KITE") !== 0) return ctx.state;
		return gainEnergy(setRelicCounter(ctx.state, "HOVERING_KITE", 1), 1);
	},
});

// 3 THORNS damage to a random enemy, applied at once (the hook also fires outside a drain).
relic("TINGSHA", {
	onManualDiscard: (ctx) => {
		const pick = randomEnemy(ctx.state);
		if (pick.target?.type !== "monster") return pick.state;
		const dmg = calculateNonAttackDamage(pick.state, pick.target, relicVal("TINGSHA", 0, 3));
		const hit = applyDamage(dmg.state, pick.target, dmg.damage).state;
		const dead = !hit.combat?.monsters[pick.target.index]?.alive;
		return dead ? resolveMonsterDeath(hit, pick.target.index, []) : hit;
	},
});

// Relic Block is not modified by Dexterity / Frail (GainBlockAction with a flat amount).
relic("TOUGH_BANDAGES", {
	onManualDiscard: (ctx) => addPlayerBlock(ctx.state, relicVal("TOUGH_BANDAGES", 0, 3)),
});

// ═════════════════════════════════════════════════════════
// SHUFFLE / SCRY / STANCE
// ═════════════════════════════════════════════════════════

relic("THE_ABACUS", {
	onShuffle: (ctx) => addPlayerBlock(ctx.state, relicVal("THE_ABACUS", 0, 6)),
});

// Every 3 shuffles +2 energy; the count carries over between combats.
relic("SUNDIAL", {
	onShuffle: (ctx) => {
		const n = relicCounter(ctx.state, "SUNDIAL") + 1;
		if (n < 3) return setRelicCounter(ctx.state, "SUNDIAL", n);
		return gainEnergy(setRelicCounter(ctx.state, "SUNDIAL", 0), 2);
	},
});

relic("MELANGE", {
	onShuffle: (ctx) => queue(ctx.state, [{ type: "scry", count: relicVal("MELANGE", 0, 3) }]),
});

// Scry +2 is in ScryAction (relicsCombatRules.scryBonus).
relic("GOLDEN_EYE", {});

relic("VIOLET_LOTUS", {
	onChangeStance: (ctx, from) => (from === "calm" ? gainEnergy(ctx.state, 1) : ctx.state),
});

// ═════════════════════════════════════════════════════════
// ORBS
// ═════════════════════════════════════════════════════════

function withOrbs(state: GameState, orbs: OrbInstance[]): GameState {
	const c = state.combat;
	return c ? { ...state, combat: { ...c, player: { ...c.player, orbs } } } : state;
}

/** Gold-Plated Cables: the rightmost orb (index 0, evoked next) triggers its passive again. */
function cablesExtraPassive(state: GameState): GameState {
	const orbs = state.combat?.player.orbs ?? [];
	const first = orbs[0];
	if (!first || first.type === "empty" || !hasRelic(state, "GOLD_PLATED_CABLES")) return state;
	const after = triggerOrbPassives(withOrbs(state, [first]), []).state;
	const updated = after.combat?.player.orbs[0] ?? first;
	return withOrbs(after, [updated, ...orbs.slice(1)]);
}

// Assumption: the engine has no hook after the end-of-turn orb passives, so the
// extra trigger runs just before them (atEndOfTurn) instead of just after.
relic("GOLD_PLATED_CABLES", { atEndOfTurn: (ctx) => cablesExtraPassive(ctx.state) });

// Lost HP during the previous turn (counter 1) → ImpulseAction at turn start:
// every orb's passive, plus the Cables extra.
relic("EMOTION_CHIP", {
	atBattleStart: (ctx) => setRelicCounter(ctx.state, "EMOTION_CHIP", 0),
	wasHPLost: (ctx, amount) =>
		amount > 0 ? setRelicCounter(ctx.state, "EMOTION_CHIP", 1) : ctx.state,
	onLoseHp: (ctx, amount) =>
		amount > 0 ? setRelicCounter(ctx.state, "EMOTION_CHIP", 1) : ctx.state,
	atStartOfTurn: (ctx) => {
		if (relicCounter(ctx.state, "EMOTION_CHIP") !== 1) return ctx.state;
		const s = setRelicCounter(ctx.state, "EMOTION_CHIP", 0);
		return cablesExtraPassive(triggerOrbPassives(s, []).state);
	},
	onVictory: (ctx) => setRelicCounter(ctx.state, "EMOTION_CHIP", 0),
});

// Frozen Core replaces Cracked Core on pickup (run level). End of turn with an empty slot: Frost.
relic("FROZEN_CORE", {
	atEndOfTurn: (ctx) => {
		const p = ctx.combat.player;
		const filled = p.orbs.filter((o) => o.type !== "empty").length;
		return filled < p.orbSlots ? channelOrb(ctx.state, "frost", []).state : ctx.state;
	},
});

// Block per card in hand when the turn ended (counted before the discard by core/turn.ts).
relic("CLOAK_CLASP", {
	atEndOfTurn: (ctx) => {
		const n = relicCounter(ctx.state, "CLOAK_CLASP");
		const s = setRelicCounter(ctx.state, "CLOAK_CLASP", 0);
		return n > 0 ? addPlayerBlock(s, n * relicVal("CLOAK_CLASP", 0, 1)) : s;
	},
});

// ═════════════════════════════════════════════════════════
// HEAL / DEATH / VICTORY
// ═════════════════════════════════════════════════════════

// In combat only (onHeal is folded in combat): MathUtils.round(heal * 1.5).
relic("MAGIC_FLOWER", { onHeal: (_ctx, amount) => Math.floor(amount * 1.5 + 0.5) });

relic("MARK_OF_THE_BLOOM", { onHeal: () => 0 });

relic("FACE_OF_CLERIC", {
	onVictory: (ctx) =>
		ctx.state.currentHp > 0
			? { ...ctx.state, maxHp: ctx.state.maxHp + 1, currentHp: ctx.state.currentHp + 1 }
			: ctx.state,
});

// A dying enemy's Poison moves to a random living enemy (ApplyPowerToRandomEnemyAction).
relic("THE_SPECIMEN", {
	onMonsterDeath: (ctx, index) => {
		const poison = ctx.combat.monsters[index]?.powers.find((p) => p.id === "POISON");
		if (!poison || poison.amount <= 0) return ctx.state;
		const pick = randomEnemy(ctx.state);
		return pick.target
			? queue(pick.state, [power(pick.target, "POISON", poison.amount)])
			: ctx.state;
	},
});
