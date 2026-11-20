/** Small helpers shared by the Act 2 event handlers (act2Events.ts, act2EventsMulti.ts). */
import { leaveEvent } from "../../core/eventRegistry";
import { hasRelic, obtainRelic } from "../../core/obtain";
import type { CardInstance, GameEvent, GameState, RelicId } from "../../core/types";
import { getCard } from "../loader";
import { endRunIfDead } from "../relicsCombatRules";
import { rollRandomRelic } from "../relicsRun2";

export const screenOf = (s: GameState): number =>
	s.phase.type === "event" ? (s.phase.screen ?? 0) : 0;

export const a15 = (s: GameState): boolean => s.ascension >= 15;

/** Java `maxHealth * 0.3F`: an int times a float literal, in float precision. */
const floatMul = (n: number, pct: number): number => Math.fround(n * Math.fround(pct));
/** MathUtils.ceil(maxHealth * pct). */
export const ceilPct = (n: number, pct: number): number => Math.ceil(floatMul(n, pct));
/** MathUtils.round(maxHealth * pct). */
export const roundPct = (n: number, pct: number): number => Math.floor(floatMul(n, pct) + 0.5);

/** player.loseGold: no helper elsewhere (event.ts does the same). */
export function loseGold(s: GameState, amount: number, events: GameEvent[]): GameState {
	const lost = Math.min(amount, s.gold);
	if (lost <= 0) return s;
	events.push({ type: "goldChanged", delta: -lost });
	return { ...s, gold: s.gold - lost };
}

/**
 * AbstractPlayer.damage from an event (no owner, no block): Tungsten Rod takes
 * 1 off (onLoseHpLast); at 0 HP Fairy in a Bottle / Lizard Tail may save the
 * player, otherwise the run is over.
 */
export function eventDamage(s: GameState, amount: number, events: GameEvent[]): GameState {
	const reduced = amount > 0 && hasRelic(s, "TUNGSTEN_ROD") ? amount - 1 : amount;
	const lost = Math.max(0, Math.min(reduced, s.currentHp));
	if (lost > 0) events.push({ type: "hpLost", target: { type: "player" }, amount: lost });
	const after = { ...s, currentHp: s.currentHp - lost };
	return endRunIfDead(after, events);
}

/** Leave to the map, unless the event just killed the player. */
export function leave(s: GameState): GameState {
	return s.phase.type === "gameOver" ? s : leaveEvent(s);
}

/** AbstractCreature.decreaseMaxHealth. */
export function loseMaxHp(s: GameState, amount: number): GameState {
	const maxHp = Math.max(1, s.maxHp - amount);
	return { ...s, maxHp, currentHp: Math.min(s.currentHp, maxHp) };
}

/** returnRandomScreenlessRelic re-rolls these four; here they are left out of the roll. */
const SCREEN_RELICS = ["BOTTLED_FLAME", "BOTTLED_LIGHTNING", "BOTTLED_TORNADO", "WHETSTONE"];

/** returnRandomScreenlessRelic(returnRandomRelicTier()) + spawnRelicAndObtain (relicRng). */
export function obtainScreenlessRelic(s: GameState): GameState {
	const r = rollRandomRelic(s, SCREEN_RELICS);
	return r.id ? obtainRelic(r.state, r.id) : r.state;
}

/** A fixed event relic, or Circlet when it is already owned. */
export function relicOrCirclet(s: GameState, id: string): GameState {
	return obtainRelic(s, (hasRelic(s, id) ? "CIRCLET" : id) as RelicId);
}

/** AbstractCard.hasTag(STARTER_STRIKE / STARTER_DEFEND). */
export function hasTag(card: CardInstance, tag: "starter_strike" | "starter_defend"): boolean {
	return getCard(card.id)?.flags.includes(`tag:${tag}`) ?? false;
}
