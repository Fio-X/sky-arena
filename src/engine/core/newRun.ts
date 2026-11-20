/**
 * A new run: starter deck and relic, base stats, and the run-start ascension
 * rules — A6 start at 90% HP, A10 Ascender's Bane, A11 one potion slot fewer,
 * A14 lower max HP (Ironclad −5, others −4). A1's extra elites live in the map.
 */
import { generateEncounterLists } from "../combat/encounters";
import { generateMap } from "../map/generate";
import { createAllStreams } from "../rng/stsRandom";
import type { CardId, GameState, RelicId } from "./types";

function makeCard(id: string, uid: number, cost = 1): GameState["deck"][0] {
	return {
		id: id as CardId,
		uniqueId: uid,
		upgraded: false,
		costOverride: null,
		costForTurn: cost,
		freeToPlay: false,
		misc: 0,
	};
}

export function makeStarterDeck(character: GameState["character"]): GameState["deck"] {
	let uid = 1;
	if (character === "SILENT") {
		const cards: GameState["deck"] = [];
		for (let i = 0; i < 5; i++) cards.push(makeCard("STRIKE_GREEN", uid++));
		for (let i = 0; i < 5; i++) cards.push(makeCard("DEFEND_GREEN", uid++));
		cards.push(makeCard("SURVIVOR", uid++));
		cards.push(makeCard("NEUTRALIZE", uid++, 0));
		return cards;
	}
	if (character === "DEFECT") {
		const cards: GameState["deck"] = [];
		for (let i = 0; i < 4; i++) cards.push(makeCard("STRIKE_BLUE", uid++));
		for (let i = 0; i < 4; i++) cards.push(makeCard("DEFEND_BLUE", uid++));
		cards.push(makeCard("ZAP", uid++));
		cards.push(makeCard("DUALCAST", uid++));
		return cards;
	}
	if (character === "WATCHER") {
		const cards: GameState["deck"] = [];
		for (let i = 0; i < 4; i++) cards.push(makeCard("STRIKE_PURPLE", uid++));
		for (let i = 0; i < 4; i++) cards.push(makeCard("DEFEND_PURPLE", uid++));
		cards.push(makeCard("ERUPTION", uid++, 2));
		cards.push(makeCard("VIGILANCE", uid++, 2));
		return cards;
	}
	const cards: GameState["deck"] = [];
	for (let i = 0; i < 5; i++) cards.push(makeCard("STRIKE_RED", uid++));
	for (let i = 0; i < 4; i++) cards.push(makeCard("DEFEND_RED", uid++));
	cards.push(makeCard("BASH", uid++, 2));
	return cards;
}

export function getStartingStats(character: GameState["character"]) {
	if (character === "SILENT") return { maxHp: 70, relic: "RING_OF_THE_SNAKE" as RelicId };
	if (character === "DEFECT") return { maxHp: 75, relic: "CRACKED_CORE" as RelicId };
	if (character === "WATCHER") return { maxHp: 72, relic: "PURE_WATER" as RelicId };
	return { maxHp: 80, relic: "BURNING_BLOOD" as RelicId };
}

export function createRun(
	seed: bigint,
	character: GameState["character"],
	ascension = 0,
): GameState {
	const rng = createAllStreams(seed);
	const encResult = generateEncounterLists(rng.monsterRng);
	const stats = getStartingStats(character);
	const maxHp = stats.maxHp - (ascension >= 14 ? (character === "IRONCLAD" ? 5 : 4) : 0);
	const currentHp = ascension >= 6 ? Math.round(maxHp * 0.9) : maxHp;
	const deck = makeStarterDeck(character);
	if (ascension >= 10) deck.push(makeCard("ASCENDERS_BANE", deck.length + 1, -2));
	const potionSlots = ascension >= 11 ? 2 : 3;

	return {
		seed,
		character,
		ascension,
		act: 1,
		floor: 0,
		gold: 99,
		maxHp,
		currentHp,
		potionSlots,
		potions: Array.from({ length: potionSlots }, () => null),
		deck,
		relics: [{ id: stats.relic, counter: 0 }],
		map: generateMap(seed, 1, ascension),
		combat: null,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: encResult.lists,
		rng: { ...rng, monsterRng: encResult.rng },
		phase: { type: "neow" },
	};
}
