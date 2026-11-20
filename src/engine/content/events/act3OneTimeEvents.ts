/**
 * One-time events (part 1): Ominous Forge, Bonfire Spirits, Designer In-Spire,
 * Duplicator, Face Trader, The Divine Fountain, Knowing Skull.
 */
import { eventScreen } from "../../core/eventRegistry";
import { hasRelic, obtainCard, obtainRelic } from "../../core/obtain";
import { gainGold } from "../../core/playerActions";
import { obtainPotion, uniformRandomPotion } from "../../core/potion";
import type { CardId, CardInstance, GameEvent, GameState, RelicId } from "../../core/types";
import { randomBoolean } from "../../rng/stsRandom";
import { getAllCards, getCard } from "../loader";
import {
	deckSelectPhase,
	eligibleIndices,
	purgeableIndices,
	registerDeckSelectEffect,
	upgradeDeckCard,
} from "../relicsRun2";
import {
	type Choice,
	canUpgrade,
	dataOf,
	defineEvent,
	type Effect,
	go,
	heal,
	loseGold,
	loseHp,
	removeCardByUid,
	screenOf,
	shuffleWith,
	toMap,
} from "./act3EventKit";

const MAP = { type: "map" } as const;
const leave: Choice = { label: "[Leave]", zh: "[离开]" };

// ── Ominous Forge (Accursed Blacksmith) ──────────────────

defineEvent("OMINOUS_FORGE", (s) => [
	eligibleIndices(s, "upgrade").length > 0
		? {
				label: "[Forge] Upgrade a card.",
				zh: "[锻造] 升级一张牌。",
				run: (st) => deckSelectPhase(st, "upgrade", 1, MAP),
			}
		: {
				label: "[Locked] Requires: Upgradable card.",
				zh: "[锁定] 需要：可升级的牌。",
				disabled: true,
			},
	{
		label: "[Rummage] Obtain Warped Tongs. Become Cursed - Pain.",
		zh: "[翻找] 获得扭曲钳。被诅咒——疼痛。",
		run: (st) => obtainRelic(toMap(obtainCard(st, "PAIN" as CardId)), "WARPED_TONGS" as RelicId),
	},
	leave,
]);

// ── Bonfire Spirits (Bonfire Elementals) ─────────────────

/** setReward by the offered card's rarity. */
function bonfireOffering(state: GameState, cards: readonly CardInstance[]): GameState {
	const card = cards[0];
	if (!card) return state;
	const s = removeCardByUid(state, card.uniqueId);
	const def = getCard(card.id);
	const rarity = def?.type === "curse" ? "curse" : def?.rarity;
	switch (rarity) {
		case "curse":
			return obtainRelic(s, (hasRelic(s, "SPIRIT_POOP") ? "CIRCLET" : "SPIRIT_POOP") as RelicId);
		case "common":
		case "special":
			return heal(s, 5, []);
		case "uncommon":
			return heal(s, s.maxHp, []);
		case "rare": {
			// increaseMaxHp(10) heals the 10 as well; both heals are stopped by Mark of the Bloom.
			const raised = { ...s, maxHp: s.maxHp + 10 };
			return heal(raised, raised.maxHp, []);
		}
		default:
			return s;
	}
}

registerDeckSelectEffect("bonfire", bonfireOffering);

defineEvent("BONFIRE_SPIRITS", (s) => {
	if (screenOf(s) === 0) {
		return [{ label: "[Approach]", zh: "[靠近]", run: (st) => eventScreen(st, 1) }];
	}
	return [
		{
			label: "[Offer] Offer a card to the spirits.",
			zh: "[献祭] 将一张牌献给火灵。",
			run: (st) => deckSelectPhase(st, "bonfire", 1, MAP),
		},
	];
});

// ── Designer In-Spire ────────────────────────────────────

/** Collections.shuffle(upgradable, new Random(miscRng.randomLong())), upgrade the first `n`. */
function upgradeRandom(s: GameState, n: number): GameState {
	const upgradable = s.deck.filter(canUpgrade);
	if (upgradable.length === 0) return s;
	const sh = shuffleWith(s, "miscRng", upgradable);
	return sh.items.slice(0, n).reduce((st, c) => upgradeDeckCard(st, c.uniqueId), sh.state);
}

/** Full Service: remove the chosen card, then upgrade a random card. */
registerDeckSelectEffect("removeAndUpgrade", (s, cards) =>
	upgradeRandom(
		cards.reduce((st, c) => removeCardByUid(st, c.uniqueId), s),
		1,
	),
);

function designerCosts(s: GameState) {
	return s.ascension >= 15
		? { adjust: 50, clean: 75, full: 110, punch: 5 }
		: { adjust: 40, clean: 60, full: 90, punch: 3 };
}

const locked = (cost: number): Choice => ({
	label: `[Locked] Requires: ${cost} Gold.`,
	zh: `[锁定] 需要：${cost} 金币。`,
	disabled: true,
});

function designerAdjust(s: GameState, cost: number, upgradeOne: boolean): Choice {
	if (s.gold < cost) return locked(cost);
	const none = eligibleIndices(s, "upgrade").length === 0;
	if (upgradeOne) {
		return {
			label: `[Adjustments] Lose ${cost} Gold. Upgrade a card.`,
			zh: `[调整] 失去 ${cost} 金币。升级一张牌。`,
			disabled: none,
			run: (st, ev) => deckSelectPhase(loseGold(st, cost, ev), "upgrade", 1, MAP),
		};
	}
	return {
		label: `[Adjustments] Lose ${cost} Gold. Upgrade 2 random cards.`,
		zh: `[调整] 失去 ${cost} 金币。随机升级 2 张牌。`,
		disabled: none,
		run: (st, ev) => toMap(upgradeRandom(loseGold(st, cost, ev), 2)),
	};
}

function designerCleanUp(s: GameState, cost: number, removes: boolean): Choice {
	if (s.gold < cost) return locked(cost);
	const purgeable = purgeableIndices(s).length;
	if (removes) {
		return {
			label: `[Clean Up] Lose ${cost} Gold. Remove a card.`,
			zh: `[清理] 失去 ${cost} 金币。移除一张牌。`,
			disabled: purgeable === 0,
			run: (st, ev) => deckSelectPhase(loseGold(st, cost, ev), "remove", 1, MAP),
		};
	}
	return {
		label: `[Clean Up] Lose ${cost} Gold. Transform 2 cards.`,
		zh: `[清理] 失去 ${cost} 金币。变化 2 张牌。`,
		disabled: purgeable < 2,
		run: (st, ev) => deckSelectPhase(loseGold(st, cost, ev), "transform", 2, MAP),
	};
}

defineEvent("DESIGNER_IN_SPIRE", (s) => {
	if (screenOf(s) === 0) {
		return [
			{
				label: "[Continue]",
				zh: "[继续]",
				run: (st) => {
					// Constructor: adjustmentUpgradesOne, cleanUpRemovesCards (miscRng.randomBoolean).
					const up = randomBoolean(st.rng.miscRng);
					const rm = randomBoolean(up.state);
					const r = { ...st, rng: { ...st.rng, miscRng: rm.state } };
					return eventScreen(r, 1, { upgradeOne: up.value ? 1 : 0, removes: rm.value ? 1 : 0 });
				},
			},
		];
	}
	const d = dataOf(s);
	const cost = designerCosts(s);
	return [
		designerAdjust(s, cost.adjust, d.upgradeOne === 1),
		designerCleanUp(s, cost.clean, d.removes === 1),
		s.gold < cost.full
			? locked(cost.full)
			: {
					label: `[Full Service] Lose ${cost.full} Gold. Remove a card, then upgrade a random card.`,
					zh: `[全套服务] 失去 ${cost.full} 金币。移除一张牌，然后随机升级一张牌。`,
					disabled: purgeableIndices(s).length === 0,
					run: (st, ev) => deckSelectPhase(loseGold(st, cost.full, ev), "removeAndUpgrade", 1, MAP),
				},
		{
			label: `[Punch] Lose ${cost.punch} HP.`,
			zh: `[揍他] 失去 ${cost.punch} 点生命。`,
			run: (st, ev) => toMap(loseHp(st, cost.punch, ev)),
		},
	];
});

// ── Duplicator ───────────────────────────────────────────

defineEvent("DUPLICATOR", () => [
	{
		label: "[Pray] Duplicate a card in your deck.",
		zh: "[祈祷] 复制牌组中的一张牌。",
		run: (st) => deckSelectPhase(st, "duplicate", 1, MAP),
	},
	leave,
]);

// ── Face Trader ──────────────────────────────────────────

const FACES = [
	"CULTIST_HEADPIECE",
	"FACE_OF_CLERIC",
	"GREMLIN_VISAGE",
	"NLOTHS_HUNGRY_FACE",
	"SSSERPENT_HEAD",
];

/** getRandomFace: un-owned faces (Circlet if none), shuffled with miscRng, first taken. */
function tradeFace(s: GameState): GameState {
	const faces = FACES.filter((id) => !hasRelic(s, id));
	const sh = shuffleWith(s, "miscRng", faces.length > 0 ? faces : ["CIRCLET"]);
	return obtainRelic(toMap(sh.state), (sh.items[0] ?? "CIRCLET") as RelicId);
}

defineEvent("FACE_TRADER", (s) => {
	if (screenOf(s) === 0) {
		return [{ label: "[Continue]", zh: "[继续]", run: (st) => eventScreen(st, 1) }];
	}
	const damage = Math.max(1, Math.floor(s.maxHp / 10));
	const gold = s.ascension >= 15 ? 50 : 75;
	return [
		{
			label: `[Touch] Lose ${damage} HP. Gain ${gold} Gold.`,
			zh: `[触摸] 失去 ${damage} 点生命。获得 ${gold} 金币。`,
			run: (st, ev) => toMap(gainGold(loseHp(st, damage, ev), gold, ev)),
		},
		{ label: "[Trade] Obtain a random face.", zh: "[交易] 获得一张随机面孔。", run: tradeFace },
		leave,
	];
});

// ── The Divine Fountain (Fountain of Cleansing) ──────────

defineEvent("THE_DIVINE_FOUNTAIN", () => [
	{
		label: "[Drink] Remove all Curses from your deck.",
		zh: "[饮用] 从牌组中移除所有诅咒。",
		run: (st) => {
			const removable = new Set(
				purgeableIndices(st).filter((i) => getCard(st.deck[i]?.id ?? "")?.type === "curse"),
			);
			return toMap({ ...st, deck: st.deck.filter((_, i) => !removable.has(i)) });
		},
	},
	leave,
]);

// ── Knowing Skull ────────────────────────────────────────

/** Every price starts at 6 HP (sts_lightspeed) and rises by 1 each time that option is bought. */
const SKULL_BASE = 6;

/** returnColorlessCard(UNCOMMON): colorless pool shuffled with shuffleRng, first uncommon. */
function skullCard(s: GameState): GameState {
	const pool = getAllCards().filter((c) => c.pool === "colorless" && !c.unobtainable);
	const sh = shuffleWith(s, "shuffleRng", pool);
	const card = sh.items.find((c) => c.rarity === "uncommon");
	return card ? obtainCard(sh.state, card.id) : sh.state;
}

function skullPotion(s: GameState, events: GameEvent[]): GameState {
	const p = uniformRandomPotion(s.rng.potionRng, s.character);
	const r = { ...s, rng: { ...s.rng, potionRng: p.rng } };
	return p.potion ? obtainPotion(r, p.potion, events) : r;
}

function skullBuy(key: "gold" | "card" | "potion", count: number, buy: Effect): Effect {
	return (s, events) => {
		const paid = loseHp(s, SKULL_BASE + count, events);
		const r = buy(paid, events);
		if (r.currentHp <= 0) return go(r, MAP);
		return eventScreen(r, 1, { [key]: count + 1 });
	};
}

defineEvent("KNOWING_SKULL", (s) => {
	if (screenOf(s) === 0) {
		return [{ label: "[Continue]", zh: "[继续]", run: (st) => eventScreen(st, 1) }];
	}
	const d = dataOf(s);
	const gold = d.gold ?? 0;
	const card = d.card ?? 0;
	const potion = d.potion ?? 0;
	return [
		{
			label: `[Riches?] Gain 90 Gold. Lose ${SKULL_BASE + gold} HP.`,
			zh: `[财富？] 获得 90 金币。失去 ${SKULL_BASE + gold} 点生命。`,
			run: skullBuy("gold", gold, (st, ev) => gainGold(st, 90, ev)),
		},
		{
			label: `[Success?] Obtain a colorless card. Lose ${SKULL_BASE + card} HP.`,
			zh: `[成功？] 获得一张无色牌。失去 ${SKULL_BASE + card} 点生命。`,
			run: skullBuy("card", card, skullCard),
		},
		{
			label: `[A Pick Me Up?] Obtain a potion. Lose ${SKULL_BASE + potion} HP.`,
			zh: `[提提神？] 获得一瓶药水。失去 ${SKULL_BASE + potion} 点生命。`,
			run: skullBuy("potion", potion, skullPotion),
		},
		{
			label: `[How do I leave?] Lose ${SKULL_BASE} HP.`,
			zh: `[我该怎么离开？] 失去 ${SKULL_BASE} 点生命。`,
			run: (st, ev) => toMap(loseHp(st, SKULL_BASE, ev)),
		},
	];
});
