/**
 * Relic rules the original game hardcodes in engine code rather than in a
 * relic callback (AbstractPlayer.damage, ApplyPowerAction, ScryAction,
 * UseCardAction, AbstractPotion.getPotency…). The engine calls these at the
 * matching point; the relic hooks themselves live in relicsCombat.ts.
 */
import { addToBot } from "../core/actionQueue";
import { executePlayerHeal } from "../core/playerActions";
import type { Action, ActorRef, CardInstance, GameEvent, GameState, PotionId } from "../core/types";
import { randomBoolean } from "../rng/stsRandom";
import { getCard } from "./loader";

const PLAYER = { type: "player" } as const;
/** Relic counter value for "used up" (original: counter -2 / usedUp()). */
export const USED_UP = -2;

function queue(s: GameState, a: Action): GameState {
	return s.combat ? { ...s, combat: addToBot(s.combat, a) } : s;
}

export function hasRelic(state: GameState, id: string): boolean {
	return state.relics.some((r) => r.id === id);
}

export function relicCounter(state: GameState, id: string): number {
	return state.relics.find((r) => r.id === id)?.counter ?? 0;
}

/**
 * AbstractPlayer.damage: at 0 HP, an unused Lizard Tail heals 50% of max HP
 * (at least 1) instead of dying. No-op while HP > 0. The heal goes through
 * onHeal (Magic Flower, Mark of the Bloom) as AbstractPlayer.heal does.
 */
export function preventPlayerDeath(state: GameState, events: GameEvent[]): GameState {
	if (state.currentHp > 0 || !state.combat) return state;
	// Mark of the Bloom: neither Fairy in a Bottle nor Lizard Tail can save you.
	if (hasRelic(state, "MARK_OF_THE_BLOOM")) return state;
	const fairy = state.potions.indexOf("FAIRY_POTION" as PotionId);
	if (fairy >= 0) return drinkFairyPotion(state, fairy, events);
	if (!hasRelic(state, "LIZARD_TAIL") || relicCounter(state, "LIZARD_TAIL") === USED_UP) {
		return state;
	}
	const used: GameState = {
		...state,
		currentHp: 0,
		relics: state.relics.map((r) => (r.id === "LIZARD_TAIL" ? { ...r, counter: USED_UP } : r)),
	};
	return executePlayerHeal(used, Math.max(1, Math.floor(state.maxHp / 2)), events).state;
}

/**
 * Fairy in a Bottle (checked before Lizard Tail): heal 30% of max HP (Sacred
 * Bark 60%, at least 1) and the potion is used up. Not a drink, so no onUsePotion.
 */
function drinkFairyPotion(state: GameState, slot: number, events: GameEvent[]): GameState {
	const percent = hasRelic(state, "SACRED_BARK") ? 0.6 : 0.3;
	const potions = state.potions.map((p, i) => (i === slot ? null : p));
	events.push({ type: "potionUsed", potionId: "FAIRY_POTION" as PotionId, slot });
	const used: GameState = { ...state, currentHp: 0, potions };
	return executePlayerHeal(used, Math.max(1, Math.floor(state.maxHp * percent)), events).state;
}

/**
 * ApplyPowerAction, player → another creature:
 * - Snecko Skull: Poison +1 (constructor adds to the amount).
 * - Champion Belt: Vulnerable also queues 1 Weak (before the Artifact check,
 *   so it triggers even when Artifact cancels the Vulnerable).
 */
export function applyPowerRelics(
	state: GameState,
	action: Extract<Action, { type: "applyPower" }>,
): { state: GameState; action: Extract<Action, { type: "applyPower" }> } {
	if (action.source.type !== "player" || action.target.type === "player") {
		return { state, action };
	}
	const id = action.powerId.toUpperCase();
	if (id === "POISON" && hasRelic(state, "SNECKO_SKULL")) {
		return { state, action: { ...action, amount: action.amount + 1 } };
	}
	if (id === "VULNERABLE" && hasRelic(state, "CHAMPION_BELT")) {
		const weak: Action = { ...action, powerId: "weak" as never, amount: 1 };
		return { state: queue(state, weak), action };
	}
	return { state, action };
}

export function targetBlock(s: GameState, target: ActorRef): number {
	return target.type === "monster" ? (s.combat?.monsters[target.index]?.block ?? 0) : 0;
}

/** Hand Drill (onBlockBroken): the player's hit took a monster's Block from >0 to 0. */
export function handDrill(
	state: GameState,
	action: Extract<Action, { type: "damage" }>,
	blockBefore: number,
): GameState {
	const target = action.target;
	if (action.source.type !== "player" || target.type !== "monster" || blockBefore <= 0) {
		return state;
	}
	if (!hasRelic(state, "HAND_DRILL")) return state;
	if ((state.combat?.monsters[target.index]?.block ?? 0) > 0) return state;
	return queue(state, {
		type: "applyPower",
		source: PLAYER,
		target,
		powerId: "vulnerable" as never,
		amount: 2,
	});
}

/** ScryAction constructor: Golden Eye scries 2 more. */
export function scryBonus(state: GameState): number {
	return hasRelic(state, "GOLDEN_EYE") ? 2 : 0;
}

/**
 * Chemical X: X-cost effects see 2 more energy. The extra is only visible to
 * the effect builder; the loseEnergy it emits floors at 0.
 */
export function withChemicalX(state: GameState, card: CardInstance): GameState {
	if (getCard(card.id)?.cost !== -1 || !state.combat || !hasRelic(state, "CHEMICAL_X")) {
		return state;
	}
	return { ...state, combat: { ...state.combat, energy: state.combat.energy + 2 } };
}

/** Sacred Bark: potion potency doubled (every numeric amount the potion produces). */
export function potionPotency(state: GameState, actions: Action[]): Action[] {
	if (!hasRelic(state, "SACRED_BARK")) return actions;
	return actions.map((a): Action => {
		switch (a.type) {
			case "damage":
				return { ...a, baseDamage: a.baseDamage * 2 };
			case "block":
			case "applyPower":
			case "heal":
			case "gainEnergy":
			case "gainMaxHp":
				return { ...a, amount: a.amount * 2 };
			case "drawCards":
				return { ...a, count: a.count * 2 };
			default:
				return a;
		}
	});
}

/**
 * Blue Candle (Curses) / Medical Kit (Statuses): unplayable cards become
 * playable. Such a play has no card effect and the card is exhausted.
 */
export function playableByRelic(state: GameState, card: CardInstance): boolean {
	const type = getCard(card.id)?.type;
	if (type === "curse") return hasRelic(state, "BLUE_CANDLE");
	if (type === "status") return hasRelic(state, "MEDICAL_KIT");
	return false;
}

/**
 * UseCardAction: a card about to be exhausted is discarded instead when
 * Strange Spoon wins cardRandomRng.randomBoolean() (Power cards excluded).
 */
export function strangeSpoon(
	state: GameState,
	card: CardInstance,
): { state: GameState; spoon: boolean } {
	if (!hasRelic(state, "STRANGE_SPOON") || getCard(card.id)?.type === "power") {
		return { state, spoon: false };
	}
	const roll = randomBoolean(state.rng.cardRandomRng);
	return {
		state: { ...state, rng: { ...state.rng, cardRandomRng: roll.state } },
		spoon: roll.value,
	};
}

/**
 * Cloak Clasp counts the hand when the turn ends, before the end-of-turn
 * discard; the engine discards before atEndOfTurn, so the count is recorded
 * here (stepEndTurn) and read by the relic's atEndOfTurn.
 */
export function recordEndTurnHand(state: GameState): GameState {
	if (!state.combat || !hasRelic(state, "CLOAK_CLASP")) return state;
	const size = state.combat.hand.length;
	return {
		...state,
		relics: state.relics.map((r) => (r.id === "CLOAK_CLASP" ? { ...r, counter: size } : r)),
	};
}
