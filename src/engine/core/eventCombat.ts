/**
 * Event fights (Colosseum, Masked Bandits, Dead Adventurer, Mushrooms,
 * Mysterious Sphere, Mind Bloom…): the encounter starts from the event, and
 * its rewards come from the event instead of the room type.
 */
import { generateCardReward } from "../combat/cardReward";
import { getEncounterMonsters } from "../combat/encounters";
import { initCombat } from "../combat/init";
import { obtainRandomRelicOfTier } from "./event";
import { fireHook } from "./hooks";
import { obtainRelic } from "./obtain";
import { gainGold } from "./playerActions";
import { rollPotionReward } from "./potion";
import type { EventCombatRewards, GameEvent, GamePhase, GameState } from "./types";

export function startEventCombat(
	state: GameState,
	encounterId: string,
	rewards: EventCombatRewards,
	events: GameEvent[],
): GameState {
	const s = initCombat(
		{ ...state, eventCombat: rewards },
		getEncounterMonsters(encounterId),
		encounterId,
	);
	events.push({ type: "combatStarted" });
	return fireHook(s, { type: "player" }, "atBattleStart");
}

/** checkCombatEnd for an event fight: the event's rewards, then `next` (default map). */
export function eventCombatVictory(state: GameState, events: GameEvent[]): GameState {
	const rewards = state.eventCombat ?? {};
	const next: GamePhase = rewards.next ?? { type: "map" };
	let s: GameState = { ...state, eventCombat: undefined };
	if (rewards.none) return { ...s, combat: null, phase: next };

	if (rewards.gold) s = gainGold(s, rewards.gold, events);
	// Relics are taken directly (the engine has no claimable relic rewards yet).
	for (const tier of rewards.relics ?? []) {
		s = obtainRandomRelicOfTier({ ...s, phase: { type: "map" } }, tier);
	}
	for (const id of rewards.relicIds ?? []) s = obtainRelic({ ...s, phase: { type: "map" } }, id);
	let cards: GameState["deck"][number]["id"][] = [];
	let upgraded: boolean[] = [];
	if (rewards.cardReward) {
		const reward = generateCardReward(s);
		cards = reward.cards;
		upgraded = reward.upgraded;
		s = { ...s, rng: { ...s.rng, cardRng: reward.rng } };
		events.push({ type: "cardRewardOffered", cards });
	}
	let potion = null;
	if (rewards.potion) {
		const listed =
			(rewards.gold ? 1 : 0) + (rewards.relics?.length ?? 0) + (rewards.relicIds?.length ?? 0);
		const drop = rollPotionReward(s, listed);
		potion = drop.potion;
		s = drop.state;
	}
	return {
		...s,
		phase: {
			type: "reward",
			cardRewards: cards,
			cardRewardsUpgraded: upgraded,
			potionReward: potion,
			gold: rewards.gold ?? 0,
			next,
		},
	};
}
