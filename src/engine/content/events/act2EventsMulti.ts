/** Act 2 events with several screens or a fight: Colosseum, Cursed Tome, Masked Bandits, The Library. */
import { type EncounterSlot, registerEncounterLayout } from "../../combat/encounters";
import { startEventCombat } from "../../core/eventCombat";
import { eventScreen, registerEvent } from "../../core/eventRegistry";
import { hasRelic, obtainRelic } from "../../core/obtain";
import { executePlayerHeal } from "../../core/playerActions";
import type { CardId, GameState, RelicId, RngState } from "../../core/types";
import { random } from "../../rng/stsRandom";
import { getCardsByColor } from "../loader";
import {
	a15,
	eventDamage,
	leave,
	loseGold,
	relicOrCirclet,
	roundPct,
	screenOf,
} from "./act2EventUtils";

// ── The Colosseum ───────────────────────────────────────
// Screen 0: the forced fight (Blue + Red Slaver, no rewards) → screen 1:
// Cowardice (leave) or Victory (Taskmaster + Gremlin Nob, elite, big rewards).

registerEncounterLayout("COLOSSEUM_EVENT_SLAVERS", [
	"BLUE_SLAVER",
	"RED_SLAVER",
] as EncounterSlot[]);
registerEncounterLayout("COLOSSEUM_EVENT_NOBS", ["TASKMASTER", "GREMLIN_NOB"] as EncounterSlot[]);

registerEvent("COLOSSEUM", {
	options: (s) =>
		screenOf(s) === 0
			? [{ label: "[Fight]", zh: "[战斗]" }]
			: [
					{ label: "[Cowardice] Escape.", zh: "[懦弱] 逃跑。" },
					{
						label:
							"[Victory] A much stronger fight. Rewards: a Rare and an Uncommon Relic, 100 Gold.",
						zh: "[胜利] 更强大的战斗。奖励：一件稀有遗物、一件罕见遗物、100金币。",
					},
				],
	choose: (s, i, events) => {
		if (screenOf(s) === 0) {
			const next = { type: "event", eventId: "COLOSSEUM", screen: 1 } as const;
			return startEventCombat(s, "COLOSSEUM_EVENT_SLAVERS", { none: true, next }, events);
		}
		if (i === 0) return leave(s);
		const rewards = {
			gold: 100,
			relics: ["rare", "uncommon"] as const,
			cardReward: true,
			potion: true,
			elite: true,
		};
		return startEventCombat(s, "COLOSSEUM_EVENT_NOBS", rewards, events);
	},
});

// ── Cursed Tome ─────────────────────────────────────────
// 0 Read/Leave → 1..3 pages (lose 1, 2, 3 HP) → 4 Take the book (10, A15 15 HP) / Stop (3 HP).

const LAST_PAGE = 4;
const tomeTakeDamage = (s: GameState) => (a15(s) ? 15 : 10);
const BOOKS = ["NECRONOMICON", "ENCHIRIDION", "NILRYS_CODEX"];

/** randomBook: an unowned book (miscRng), Circlet when all three are owned. */
function obtainRandomBook(s: GameState): GameState {
	const books = BOOKS.filter((b) => !hasRelic(s, b));
	const pool = books.length > 0 ? books : ["CIRCLET"];
	const roll = random(s.rng.miscRng, pool.length - 1);
	const book = pool[roll.value] as RelicId;
	return obtainRelic({ ...s, rng: { ...s.rng, miscRng: roll.state } }, book);
}

function tomeOptions(s: GameState) {
	const screen = screenOf(s);
	if (screen === 0) {
		return [
			{ label: "[Read]", zh: "[阅读]" },
			{ label: "[Leave]", zh: "[离开]" },
		];
	}
	if (screen < LAST_PAGE) {
		return [{ label: `[Continue] Lose ${screen} HP.`, zh: `[继续] 失去${screen}点生命。` }];
	}
	return [
		{
			label: `[Take] Obtain the Book. Lose ${tomeTakeDamage(s)} HP.`,
			zh: `[拿走] 获得这本书。失去${tomeTakeDamage(s)}点生命。`,
		},
		{ label: "[Stop] Lose 3 HP.", zh: "[停止] 失去3点生命。" },
	];
}

registerEvent("CURSED_TOME", {
	options: tomeOptions,
	choose: (s, i, events) => {
		const screen = screenOf(s);
		if (screen === 0) return i === 0 ? eventScreen(s, 1) : leave(s);
		if (screen < LAST_PAGE) return eventScreen(eventDamage(s, screen, events), screen + 1);
		if (i === 1) return leave(eventDamage(s, 3, events));
		const hurt = eventDamage(s, tomeTakeDamage(s), events);
		return hurt.phase.type === "gameOver" ? hurt : obtainRandomBook(leave(hurt));
	},
});

// ── Masked Bandits ──────────────────────────────────────
// Pay all gold, or fight Pointy + Romeo + Bear for 25-35 gold (miscRng, rolled
// before the fight), a card reward and the Red Mask. The engine's event-fight
// rewards have no fixed relic, so the mask is handed over on screen 1 after
// the reward screen.

registerEvent("MASKED_BANDITS", {
	options: (s) => {
		if (screenOf(s) === 0) {
			return [
				{ label: "[Pay] Lose all of your Gold.", zh: "[付钱] 失去你所有的金币。" },
				{ label: "[Fight!]", zh: "[战斗！]" },
			];
		}
		return hasRelic(s, "RED_MASK")
			? [{ label: "[Take] Obtain Circlet.", zh: "[拿走] 获得环。" }]
			: [{ label: "[Take] Obtain the Red Mask.", zh: "[拿走] 获得红面具。" }];
	},
	choose: (s, i, events) => {
		if (screenOf(s) === 1) return relicOrCirclet(leave(s), "RED_MASK");
		if (i === 0) return leave(loseGold(s, s.gold, events));
		const roll = random(s.rng.miscRng, 10);
		const gold = 25 + roll.value;
		const next = { type: "event", eventId: "MASKED_BANDITS", screen: 1 } as const;
		return startEventCombat(
			{ ...s, rng: { ...s.rng, miscRng: roll.state } },
			"MASKED_BANDITS_EVENT",
			{ gold, cardReward: true, potion: true, next },
			events,
		);
	},
});

// ── The Library ─────────────────────────────────────────

const LIBRARY_CARDS = 20;
const libraryHeal = (s: GameState) => roundPct(s.maxHp, a15(s) ? 0.2 : 0.33);
const CHARACTER_COLOR = {
	IRONCLAD: "red",
	SILENT: "green",
	DEFECT: "blue",
	WATCHER: "purple",
} as const;

/** AbstractDungeon.getCard(rollRarity()): rarity roll then a class card of it, both cardRng. */
function rollClassCard(s: GameState, rng: RngState): { id: CardId | null; rng: RngState } {
	const roll = random(rng, 99);
	const rarity = roll.value < 3 ? "rare" : roll.value < 40 ? "uncommon" : "common";
	const pool = getCardsByColor(CHARACTER_COLOR[s.character] ?? "red").filter(
		(c) => c.rarity === rarity && !c.unobtainable && c.pool !== "none",
	);
	if (pool.length === 0) return { id: null, rng: roll.state };
	const pick = random(roll.state, pool.length - 1);
	return { id: pool[pick.value]?.id ?? null, rng: pick.state };
}

/**
 * 20 distinct class cards; a duplicate is re-rolled (rarity and card). The
 * original adds each with addToBottom (index 0), so they show in reverse order.
 */
function libraryCards(s: GameState): { cards: CardId[]; rng: RngState } {
	let rng = s.rng.cardRng;
	const cards: CardId[] = [];
	for (let tries = 0; cards.length < LIBRARY_CARDS && tries < 1000; tries++) {
		const r = rollClassCard(s, rng);
		rng = r.rng;
		if (r.id && !cards.includes(r.id)) cards.unshift(r.id);
	}
	return { cards, rng };
}

registerEvent("THE_LIBRARY", {
	options: (s) => [
		{
			label: "[Read] Choose 1 of 20 cards to add to your deck.",
			zh: "[阅读] 从20张牌中选择1张加入牌组。",
		},
		{
			label: `[Sleep] Heal ${libraryHeal(s)} HP.`,
			zh: `[睡觉] 回复${libraryHeal(s)}点生命。`,
		},
	],
	choose: (s, i, events) => {
		if (i === 1) return leave(executePlayerHeal(s, libraryHeal(s), events).state);
		const { cards, rng } = libraryCards(s);
		return {
			...s,
			rng: { ...s.rng, cardRng: rng },
			phase: {
				type: "reward",
				cardRewards: cards,
				potionReward: null,
				gold: 0,
				next: { type: "map" },
			},
		};
	},
});
