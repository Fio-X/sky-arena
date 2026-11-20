import { getAllCards, getCardsByColor } from "../content/loader";
import { hasRelic } from "../core/obtain";
import type { CardId, GameState, RngState } from "../core/types";
import { random, randomBooleanWithChance } from "../rng/stsRandom";

const RARITY_WEIGHTS = {
	common: 0.6,
	uncommon: 0.37,
	rare: 0.03,
};

/** numCards (3) after relic changeNumberOfCardsInReward: Question Card +1, Busted Crown −2. */
export function cardRewardCount(state: GameState): number {
	let n = 3;
	if (hasRelic(state, "QUESTION_CARD")) n += 1;
	if (hasRelic(state, "BUSTED_CROWN")) n -= 2;
	return Math.max(0, n);
}

type Rarity = "common" | "uncommon" | "rare";

/** Card pool for one rarity: own color, or every color + colorless with Prismatic Shard. */
function rewardPool(state: GameState, rarity: Rarity): CardId[] {
	const colorMap = { IRONCLAD: "red", SILENT: "green", DEFECT: "blue", WATCHER: "purple" } as const;
	const color = colorMap[state.character] ?? ("red" as const);
	// Prismatic Shard: CardLibrary.getAnyColorCard(rarity) — any color, no curses/statuses.
	const source = hasRelic(state, "PRISMATIC_SHARD")
		? getAllCards().filter((c) => c.type !== "curse" && c.type !== "status")
		: getCardsByColor(color);
	return source
		.filter((c) => c.rarity === rarity && !c.unobtainable && c.pool !== "none")
		.map((c) => c.id);
}

/**
 * cardUpgradedChance per dungeon: Exordium 0, The City 25% (A12: 12.5%),
 * The Beyond / The Ending 50% (A12: 25%).
 */
export function cardUpgradedChance(state: GameState): number {
	if (state.act <= 1) return 0;
	const base = state.act === 2 ? 0.25 : 0.5;
	return state.ascension >= 12 ? base / 2 : base;
}

export function generateCardReward(
	state: GameState,
	count = cardRewardCount(state),
): { cards: CardId[]; upgraded: boolean[]; rng: RngState } {
	// N'loth's Gift: changeRareCardRewardChance → rare chance ×3.
	const rareRate = RARITY_WEIGHTS.rare * 100 * (hasRelic(state, "NLOTHS_GIFT") ? 3 : 1);

	let rng = state.rng.cardRng;
	const chosen: CardId[] = [];
	const rarities: Rarity[] = [];

	for (let i = 0; i < count; i++) {
		const rarity = rollRarity(rng, rareRate);
		rng = rarity.rng;

		const card = pickFromPool(rewardPool(state, rarity.value), chosen, rng);
		rng = card.rng;
		chosen.push(card.value);
		rarities.push(rarity.value);
	}

	// getRewardCards: every non-rare card rolls cardRng.randomBoolean(chance), even at 0%.
	const chance = cardUpgradedChance(state);
	const upgraded = rarities.map((r) => {
		if (r === "rare") return false;
		const roll = randomBooleanWithChance(rng, chance);
		rng = roll.state;
		return roll.value;
	});

	return { cards: chosen, upgraded, rng };
}

function rollRarity(rng: RngState, rareRate: number): { value: Rarity; rng: RngState } {
	const result = random(rng, 99);
	const roll = result.value;
	const uncommonThreshold = rareRate + RARITY_WEIGHTS.uncommon * 100;

	if (roll < rareRate) return { value: "rare", rng: result.state };
	if (roll < uncommonThreshold) return { value: "uncommon", rng: result.state };
	return { value: "common", rng: result.state };
}

function pickFromPool(
	pool: CardId[],
	exclude: CardId[],
	rng: RngState,
): { value: CardId; rng: RngState } {
	const available = pool.filter((id) => !exclude.includes(id));
	const usePool = available.length > 0 ? available : pool;
	const result = random(rng, usePool.length - 1);
	return { value: usePool[result.value] as CardId, rng: result.state };
}
