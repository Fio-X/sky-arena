import { getCardsByColor } from "../content/loader";
import type { CardId, GameState, RngState } from "../core/types";
import { random } from "../rng/stsRandom";

const RARITY_WEIGHTS = {
	common: 0.6,
	uncommon: 0.37,
	rare: 0.03,
};

export function generateCardReward(
	state: GameState,
	count = 3,
): { cards: CardId[]; rng: RngState } {
	const colorMap = { IRONCLAD: "red", SILENT: "green", DEFECT: "blue", WATCHER: "purple" } as const;
	const color = colorMap[state.character] ?? ("red" as const);

	const commons = getCardsByColor(color).filter(
		(c) => c.rarity === "common" && !c.unobtainable && c.pool !== "none",
	);
	const uncommons = getCardsByColor(color).filter(
		(c) => c.rarity === "uncommon" && !c.unobtainable && c.pool !== "none",
	);
	const rares = getCardsByColor(color).filter(
		(c) => c.rarity === "rare" && !c.unobtainable && c.pool !== "none",
	);

	let rng = state.rng.cardRng;
	const chosen: CardId[] = [];

	for (let i = 0; i < count; i++) {
		const rarity = rollRarity(rng);
		rng = rarity.rng;

		const pool =
			rarity.value === "rare" ? rares : rarity.value === "uncommon" ? uncommons : commons;
		const card = pickFromPool(
			pool.map((c) => c.id),
			chosen,
			rng,
		);
		rng = card.rng;
		chosen.push(card.value);
	}

	return { cards: chosen, rng };
}

function rollRarity(rng: RngState): { value: "common" | "uncommon" | "rare"; rng: RngState } {
	const result = random(rng, 99);
	const roll = result.value;
	const threshold = RARITY_WEIGHTS.rare * 100;
	const uncommonThreshold = threshold + RARITY_WEIGHTS.uncommon * 100;

	if (roll < threshold) return { value: "rare", rng: result.state };
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
