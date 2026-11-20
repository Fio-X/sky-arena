/**
 * Match and Keep (GremlinMatchGame): 12 face-down cards, 6 pairs; 5 attempts
 * of flipping two cards. A matched pair puts one copy of that card in the deck.
 *
 * Event data: c0..c5 = the six cards (index into getAllCards()), p0..p11 = the
 * pair at each board slot, m = matched-slot bitmask, f = first flipped slot
 * (-1 none), a = attempts left, r1/r2/hit = the last two flips.
 */
import type { EventChoice } from "../../core/eventRegistry";
import { eventScreen, registerEvent } from "../../core/eventRegistry";
import { obtainCard } from "../../core/obtain";
import type { CardId, GameState, RngState } from "../../core/types";
import { random, stsShuffle } from "../../rng/stsRandom";
import { getAllCards, getCard } from "../loader";
import { a15, dataOf, screenOf, toMap } from "./act1EventUtils";

const ID = "MATCH_AND_KEEP";
const BOARD = 12;
const ATTEMPTS = 5;
const COLOR = { IRONCLAD: "red", SILENT: "green", DEFECT: "blue", WATCHER: "purple" } as const;
const START = { IRONCLAD: "BASH", SILENT: "NEUTRALIZE", DEFECT: "ZAP", WATCHER: "ERUPTION" };

type Roll = { id: CardId | null; rng: RngState };

function pick(pool: readonly CardId[], rng: RngState): Roll {
	if (pool.length === 0) return { id: null, rng };
	const r = random(rng, pool.length - 1);
	return { id: pool[r.value] ?? null, rng: r.state };
}

const classPool = (s: GameState, rarity: string): CardId[] =>
	getAllCards()
		.filter(
			(c) =>
				c.color === COLOR[s.character] &&
				c.rarity === rarity &&
				!c.unobtainable &&
				c.pool !== "none",
		)
		.map((c) => c.id);

const colorlessUncommon = (): CardId[] =>
	getAllCards()
		.filter((c) => c.color === "colorless" && c.rarity === "uncommon" && !c.unobtainable)
		.map((c) => c.id);

const cursePool = (): CardId[] =>
	getAllCards()
		.filter((c) => c.type === "curse" && c.rarity === "curse" && !c.unobtainable)
		.map((c) => c.id);

/**
 * initializeCards: rare, uncommon, common (getCard, cardRng), an uncommon
 * colorless card (shuffleRng; A15: a second random curse), a random curse
 * (cardRng) and the character's event starter card.
 */
function rollCards(s: GameState): { cards: CardId[]; state: GameState } {
	let cardRng = s.rng.cardRng;
	let shuffleRng = s.rng.shuffleRng;
	const cards: CardId[] = [];
	const fromCardRng = (pool: CardId[]) => {
		const r = pick(pool, cardRng);
		cardRng = r.rng;
		if (r.id) cards.push(r.id);
	};
	fromCardRng(classPool(s, "rare"));
	fromCardRng(classPool(s, "uncommon"));
	fromCardRng(classPool(s, "common"));
	if (a15(s)) fromCardRng(cursePool());
	else {
		const r = pick(colorlessUncommon(), shuffleRng);
		shuffleRng = r.rng;
		if (r.id) cards.push(r.id);
	}
	fromCardRng(cursePool());
	cards.push(START[s.character] as CardId);
	return { cards, state: { ...s, rng: { ...s.rng, cardRng, shuffleRng } } };
}

/** Deal the board: the 12 cards java-shuffled with miscRng (here stsShuffle). */
function setup(s: GameState): GameState {
	const rolled = rollCards(s);
	const pairs = rolled.cards.map((_, i) => i);
	const board = stsShuffle([...pairs, ...pairs], rolled.state.rng.miscRng);
	const all = getAllCards().map((c) => c.id as string);
	const data: Record<string, number> = { m: 0, f: -1, a: ATTEMPTS };
	rolled.cards.forEach((id, i) => {
		data[`c${i}`] = all.indexOf(id);
	});
	board.result.forEach((pair, slot) => {
		data[`p${slot}`] = pair;
	});
	const s2 = { ...rolled.state, rng: { ...rolled.state.rng, miscRng: board.rng } };
	return eventScreen(s2, 1, data);
}

function cardAt(s: GameState, slot: number): CardId {
	const d = dataOf(s);
	const index = d[`c${d[`p${slot}`] ?? 0}`] ?? 0;
	return (getAllCards()[index]?.id ?? "STRIKE_RED") as CardId;
}

const nameAt = (s: GameState, slot: number) => {
	const id = cardAt(s, slot);
	return getCard(id)?.name ?? id;
};

const isMatched = (s: GameState, slot: number) => ((dataOf(s).m ?? 0) & (1 << slot)) !== 0;

function boardOptions(s: GameState): EventChoice[] {
	const first = dataOf(s).f ?? -1;
	return Array.from({ length: BOARD }, (_, slot) => {
		const n = slot + 1;
		if (isMatched(s, slot)) {
			const name = nameAt(s, slot);
			return { label: `${n}. ${name} (kept)`, zh: `${n}. ${name}（已配对）`, disabled: true };
		}
		if (slot === first) {
			const name = nameAt(s, slot);
			return { label: `${n}. ${name}`, zh: `${n}. ${name}`, disabled: true };
		}
		return { label: `${n}. [Flip]`, zh: `${n}. [翻开]` };
	});
}

function resultOption(s: GameState): EventChoice {
	const d = dataOf(s);
	const left = d.a ?? 0;
	const a = nameAt(s, d.r1 ?? 0);
	const b = nameAt(s, d.r2 ?? 0);
	const more = left > 0 ? `${left} attempts left.` : "No attempts left.";
	const moreZh = left > 0 ? `还剩 ${left} 次。` : "没有次数了。";
	if (d.hit) {
		return {
			label: `Match: ${a} obtained. ${more} [Continue]`,
			zh: `配对成功：获得 ${a}。${moreZh}[继续]`,
		};
	}
	return {
		label: `${a} / ${b}: no match. ${more} [Continue]`,
		zh: `${a} / ${b}：未配对。${moreZh}[继续]`,
	};
}

function flip(s: GameState, slot: number): GameState {
	const d = dataOf(s);
	const first = d.f ?? -1;
	if (first < 0) return eventScreen(s, 1, { f: slot });
	const hit = d[`p${first}`] === d[`p${slot}`];
	const next = eventScreen(s, 2, {
		f: -1,
		a: (d.a ?? ATTEMPTS) - 1,
		r1: first,
		r2: slot,
		hit: hit ? 1 : 0,
		m: hit ? (d.m ?? 0) | (1 << first) | (1 << slot) : (d.m ?? 0),
	});
	return hit ? obtainCard(next, cardAt(s, slot)) : next;
}

registerEvent(ID, {
	options: (s) => {
		const screen = screenOf(s);
		if (screen === 0) {
			return [{ label: "[Play] Match the cards.", zh: "[开始] 翻牌配对。" }];
		}
		if (screen === 2) return [resultOption(s)];
		return boardOptions(s);
	},
	choose: (s, i) => {
		const screen = screenOf(s);
		if (screen === 0) return setup(s);
		if (screen === 2) return (dataOf(s).a ?? 0) > 0 ? eventScreen(s, 1) : toMap(s);
		return flip(s, i);
	},
});
