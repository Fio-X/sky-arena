/**
 * One-time events (part 2): Lab, N'loth, Note For Yourself, Secret Portal,
 * The Joust, We Meet Again!, The Woman in Blue.
 */
import { obtainRandomRelic } from "../../core/event";
import { eventScreen } from "../../core/eventRegistry";
import { hasRelic, obtainCard, obtainRelic } from "../../core/obtain";
import { gainGold } from "../../core/playerActions";
import type { CardId, GameEvent, GameState, RelicId } from "../../core/types";
import { random, randomBooleanWithChance } from "../../rng/stsRandom";
import { getCard, getPotion, getRelic } from "../loader";
import { deckSelectPhase, purgeableIndices, registerDeckSelectEffect } from "../relicsRun2";
import {
	type Choice,
	cardName,
	defineEvent,
	type Effect,
	loseGold,
	loseHp,
	loseRelic,
	potionRewards,
	removeCardByUid,
	screenOf,
	shuffleWith,
	toMap,
} from "./act3EventKit";

const MAP = { type: "map" } as const;
const leave: Choice = { label: "[Leave]", zh: "[离开]" };
const relicName = (id: string): string => getRelic(id)?.name ?? id;

// ── Lab ──────────────────────────────────────────────────

defineEvent("LAB", (s) => {
	const n = s.ascension >= 15 ? 2 : 3;
	return [
		{
			label: `[Search] Obtain ${n} random potions.`,
			zh: `[搜寻] 获得 ${n} 瓶随机药水。`,
			run: (st) => potionRewards(st, n),
		},
	];
});

// ── N'loth ───────────────────────────────────────────────

/** Constructor: the relics shuffled with miscRng; the first two are offered. */
function nlothOffers(s: GameState): { offers: string[]; state: GameState } {
	const sh = shuffleWith(
		s,
		"miscRng",
		s.relics.map((r) => r.id as string),
	);
	return { offers: sh.items.slice(0, 2), state: sh.state };
}

function nlothOffer(slot: number): Effect {
	return (s) => {
		const o = nlothOffers(s);
		const lost = o.offers[slot];
		if (!lost) return toMap(o.state);
		const r = toMap(loseRelic(o.state, lost));
		return obtainRelic(r, (hasRelic(r, "NLOTHS_GIFT") ? "CIRCLET" : "NLOTHS_GIFT") as RelicId);
	};
}

defineEvent("NLOTH", (s) => {
	const { offers } = nlothOffers(s);
	const choices: Choice[] = [0, 1].map((slot) => {
		const id = offers[slot];
		if (!id) return { label: `[Locked] Requires: ${slot + 2} relics.`, disabled: true };
		const name = relicName(id);
		return {
			label: `[Offer ${name}] Lose ${name}. Obtain N'loth's Gift.`,
			zh: `[献上 ${name}] 失去 ${name}。获得恩洛思的礼物。`,
			run: nlothOffer(slot),
		};
	});
	return [...choices, { ...leave, run: (st) => toMap(nlothOffers(st).state) }];
});

// ── Note For Yourself ────────────────────────────────────

/**
 * The note's card lives in the save profile across runs; the engine has no
 * profile, so the stored card is always the fresh-profile Iron Wave and the
 * card given back is only removed.
 */
const NOTE_CARD = "IRON_WAVE" as CardId;

registerDeckSelectEffect("noteForYourself", (s, cards) =>
	obtainCard(
		cards.reduce((st, c) => removeCardByUid(st, c.uniqueId), s),
		NOTE_CARD,
	),
);

defineEvent("NOTE_FOR_YOURSELF", (s) => {
	if (screenOf(s) === 0) {
		return [{ label: "[Continue]", zh: "[继续]", run: (st) => eventScreen(st, 1) }];
	}
	const name = cardName(NOTE_CARD);
	return [
		{
			label: `[Take and Give] Obtain ${name}, then leave a card for yourself.`,
			zh: `[一取一予] 获得 ${name}，然后留下一张牌给自己。`,
			run: (st) =>
				purgeableIndices(st).length > 0
					? deckSelectPhase(st, "noteForYourself", 1, MAP)
					: toMap(obtainCard(st, NOTE_CARD)),
		},
		{ label: "[Ignore]", zh: "[无视]" },
	];
});

// ── Secret Portal ────────────────────────────────────────

/** Stand on a node linked to the boss, so the next room is the act boss. */
function portalToBoss(s: GameState): GameState {
	const isBoss = (x: number, y: number) => s.map.nodes[y]?.[x]?.type === "boss";
	const before = s.map.nodes.flat().find((n) => n.edges.some((e) => isBoss(e.x, e.y)));
	if (!before) return toMap(s);
	return toMap({ ...s, map: { ...s.map, currentNode: { x: before.x, y: before.y } } });
}

defineEvent("SECRET_PORTAL", () => [
	{
		label: "[Enter the Portal] Travel to the Boss.",
		zh: "[进入传送门] 直接前往首领。",
		run: portalToBoss,
	},
	leave,
]);

// ── The Joust ────────────────────────────────────────────

/** Pay 50, then ownerWins = miscRng.randomBoolean(0.3). */
function joustBet(onOwner: boolean): Effect {
	return (s, events) => {
		const paid = loseGold(s, 50, events);
		const roll = randomBooleanWithChance(paid.rng.miscRng, 0.3);
		const r = { ...paid, rng: { ...paid.rng, miscRng: roll.state } };
		if (roll.value === onOwner) return toMap(gainGold(r, onOwner ? 250 : 100, events));
		return toMap(r);
	};
}

defineEvent("THE_JOUST", (s) => {
	if (screenOf(s) === 0) {
		return [{ label: "[Continue]", zh: "[继续]", run: (st) => eventScreen(st, 1) }];
	}
	return [
		{
			label: "[Murderer] Bet 50 Gold - 70%: Win 100 Gold.",
			zh: "[凶手] 下注 50 金币——70%：赢得 100 金币。",
			run: joustBet(false),
		},
		{
			label: "[Owner] Bet 50 Gold - 30%: Win 250 Gold.",
			zh: "[主人] 下注 50 金币——30%：赢得 250 金币。",
			run: joustBet(true),
		},
	];
});

// ── We Meet Again! ───────────────────────────────────────

interface Ranwid {
	readonly potionSlot: number;
	readonly cardUid: number;
	readonly gold: number;
	readonly state: GameState;
}

/** Constructor: potion (shuffle), non-basic non-curse card (shuffle), gold (miscRng.random(50, min(150, gold))). */
function ranwidOffers(s: GameState): Ranwid {
	let st = s;
	let potionSlot = -1;
	const filled = s.potions.flatMap((p, i) => (p ? [i] : []));
	if (filled.length > 0) {
		const sh = shuffleWith(st, "miscRng", filled);
		st = sh.state;
		potionSlot = sh.items[0] ?? -1;
	}
	let cardUid = -1;
	const cards = s.deck.filter((c) => {
		const def = getCard(c.id);
		return def?.rarity !== "basic" && def?.type !== "curse";
	});
	if (cards.length > 0) {
		const sh = shuffleWith(st, "miscRng", cards);
		st = sh.state;
		cardUid = sh.items[0]?.uniqueId ?? -1;
	}
	let gold = 0;
	if (s.gold >= 50) {
		const r = random(st.rng.miscRng, Math.min(150, s.gold) - 50);
		st = { ...st, rng: { ...st.rng, miscRng: r.state } };
		gold = 50 + r.value;
	}
	return { potionSlot, cardUid, gold, state: st };
}

/** Give something, then a screenless relic of a random tier (relicRng). */
function ranwidGive(give: (o: Ranwid, events: GameEvent[]) => GameState): Effect {
	return (s, events) => obtainRandomRelic(toMap(give(ranwidOffers(s), events)));
}

defineEvent("WE_MEET_AGAIN", (s) => {
	const o = ranwidOffers(s);
	const potion = s.potions[o.potionSlot];
	const card = s.deck.find((c) => c.uniqueId === o.cardUid);
	const potionLabel = potion ? (getPotion(potion)?.name ?? potion) : "";
	const giveCard = card ? cardName(card.id) : "";
	return [
		potion
			? {
					label: `[Give Potion] Lose ${potionLabel}. Obtain a Relic.`,
					zh: `[给出药水] 失去 ${potionLabel}。获得一件遗物。`,
					run: ranwidGive((r) => ({
						...r.state,
						potions: r.state.potions.map((p, i) => (i === r.potionSlot ? null : p)),
					})),
				}
			: { label: "[Locked] Requires: Potion.", zh: "[锁定] 需要：药水。", disabled: true },
		o.gold > 0
			? {
					label: `[Give ${o.gold} Gold] Obtain a Relic.`,
					zh: `[给出 ${o.gold} 金币] 获得一件遗物。`,
					run: ranwidGive((r, ev) => loseGold(r.state, r.gold, ev)),
				}
			: { label: "[Locked] Requires: 50 Gold.", zh: "[锁定] 需要：50 金币。", disabled: true },
		card
			? {
					label: `[Give Card] Lose ${giveCard}. Obtain a Relic.`,
					zh: `[给出卡牌] 失去 ${giveCard}。获得一件遗物。`,
					run: ranwidGive((r) => removeCardByUid(r.state, r.cardUid)),
				}
			: {
					label: "[Locked] Requires: Non-basic, non-curse card.",
					zh: "[锁定] 需要：非基础、非诅咒的牌。",
					disabled: true,
				},
		{ label: "[Attack]", zh: "[攻击]", run: (st) => toMap(ranwidOffers(st).state) },
	];
});

// ── The Woman in Blue ────────────────────────────────────

function buyPotions(n: number, cost: number): Choice {
	return {
		label: `[Buy ${n} Potion${n > 1 ? "s" : ""}] Lose ${cost} Gold.`,
		zh: `[购买 ${n} 瓶药水] 失去 ${cost} 金币。`,
		run: (st, ev) => potionRewards(loseGold(st, cost, ev), n),
	};
}

defineEvent("THE_WOMAN_IN_BLUE", (s) => {
	const buys = (
		[
			[1, 20],
			[2, 30],
			[3, 40],
		] as const
	).map(([n, cost]) => ({ ...buyPotions(n, cost), disabled: s.gold < cost }));
	if (s.ascension < 15) return [...buys, leave];
	const hp = Math.ceil(s.maxHp * 0.05);
	return [
		...buys,
		{
			label: `[Leave] Lose ${hp} HP.`,
			zh: `[离开] 失去 ${hp} 点生命。`,
			run: (st, ev) => toMap(loseHp(st, hp, ev)),
		},
	];
});
