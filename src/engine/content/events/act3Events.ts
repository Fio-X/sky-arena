/**
 * Act 3 event pool: Falling, Mind Bloom, The Moai Head, Mysterious Sphere,
 * Sensory Stone, Tomb of Lord Red Mask, Winding Halls. The one-time events of
 * this batch live in act3OneTimeEvents*.ts.
 */
import "./act3OneTimeEvents";
import "./act3OneTimeEvents2";
import { cardRewardCount } from "../../combat/cardReward";
import { startEventCombat } from "../../core/eventCombat";
import { eventScreen } from "../../core/eventRegistry";
import { hasRelic, obtainCard, obtainRelic } from "../../core/obtain";
import { gainGold } from "../../core/playerActions";
import type { CardId, GameState, RelicId } from "../../core/types";
import { random, randomBooleanWithChance } from "../../rng/stsRandom";
import { getAllCards, getCard } from "../loader";
import { upgradeDeckCard } from "../relicsRun2";
import {
	type Choice,
	canUpgrade,
	cardName,
	dataOf,
	defineEvent,
	type Effect,
	go,
	heal,
	loseGold,
	loseHp,
	loseMaxHp,
	loseRelic,
	removeCardByUid,
	rewardChain,
	roundF,
	screenOf,
	shuffleWith,
	toMap,
} from "./act3EventKit";

const continueTo = (screen: number): Choice => ({
	label: "[Continue]",
	zh: "[继续]",
	run: (s) => eventScreen(s, screen),
});

const leave: Choice = { label: "[Leave]", zh: "[离开]" };

// ── Falling ──────────────────────────────────────────────

/** setCards: one random card of each type (miscRng), attack, skill, power in that order. */
const FALLING_TYPES = [
	["attack", "attack"],
	["skill", "skill"],
	["power", "power"],
] as const;

function fallingPick(s: GameState): { state: GameState; data: Record<string, number> } {
	let rng = s.rng.miscRng;
	const data: Record<string, number> = {};
	for (const [type, key] of FALLING_TYPES) {
		const cards = s.deck.filter((c) => getCard(c.id)?.type === type);
		if (cards.length === 0) {
			data[key] = -1;
			continue;
		}
		const r = random(rng, cards.length - 1);
		rng = r.state;
		data[key] = cards[r.value]?.uniqueId ?? -1;
	}
	return { state: { ...s, rng: { ...s.rng, miscRng: rng } }, data };
}

function fallingChoice(
	s: GameState,
	uid: number,
	label: string,
	zh: string,
	typeName: string,
): Choice {
	const card = s.deck.find((c) => c.uniqueId === uid);
	if (!card) {
		return {
			label: `[Locked] Requires: ${typeName} card`,
			zh: `[锁定] 需要：${typeName}牌`,
			disabled: true,
		};
	}
	const name = cardName(card.id);
	return {
		label: `[${label}] Lose ${name}.`,
		zh: `[${zh}] 失去 ${name}。`,
		run: (st) => toMap(removeCardByUid(st, uid)),
	};
}

defineEvent("FALLING", (s) => {
	if (screenOf(s) === 0) {
		return [
			{
				label: "[Continue]",
				zh: "[继续]",
				run: (st) => {
					const p = fallingPick(st);
					return eventScreen(p.state, 1, p.data);
				},
			},
		];
	}
	const d = dataOf(s);
	const skill = d.skill ?? -1;
	const power = d.power ?? -1;
	const attack = d.attack ?? -1;
	if (skill < 0 && power < 0 && attack < 0) {
		return [{ label: "[Land on your head] Lose nothing.", zh: "[头先着地] 什么都不失去。" }];
	}
	return [
		fallingChoice(s, skill, "Land", "着陆", "Skill"),
		fallingChoice(s, power, "Channel", "引导", "Power"),
		fallingChoice(s, attack, "Strike", "打击", "Attack"),
	];
});

// ── Mind Bloom ───────────────────────────────────────────

const ACT1_BOSSES = ["THE_GUARDIAN", "HEXAGHOST", "SLIME_BOSS"];

function upgradeAll(s: GameState): GameState {
	return s.deck.filter(canUpgrade).reduce((st, c) => upgradeDeckCard(st, c.uniqueId), s);
}

function mindBloomThird(s: GameState): Choice {
	if (s.floor % 50 <= 40) {
		return {
			label: "[I am Rich] Gain 999 Gold. Become Cursed - 2 Normality.",
			zh: "[我很富有] 获得 999 金币。被诅咒——2 张平庸。",
			run: (st, ev) => {
				let r = gainGold(st, 999, ev);
				r = obtainCard(r, "NORMALITY" as CardId);
				return toMap(obtainCard(r, "NORMALITY" as CardId));
			},
		};
	}
	return {
		label: "[I am Healthy] Heal to full HP. Become Cursed - Doubt.",
		zh: "[我很健康] 回复全部生命。被诅咒——疑虑。",
		run: (st, ev) => toMap(obtainCard(heal(st, st.maxHp, ev), "DOUBT" as CardId)),
	};
}

defineEvent("MINDBLOOM", (s) => {
	if (screenOf(s) === 1) {
		const boss = ACT1_BOSSES[dataOf(s).boss ?? 0] ?? "THE_GUARDIAN";
		return [
			{
				label: "[Fight!]",
				zh: "[战斗！]",
				run: (st, ev) =>
					startEventCombat(
						st,
						boss,
						{
							gold: st.ascension >= 13 ? 25 : 50,
							relics: ["rare"],
							cardReward: true,
							potion: true,
							elite: true,
						},
						ev,
					),
			},
		];
	}
	return [
		{
			label: "[I am War] Fight a Boss from Act I. Obtain a Rare Relic.",
			zh: "[我即战争] 与第一幕的一名首领战斗。获得一件稀有遗物。",
			run: (st) => {
				const sh = shuffleWith(st, "miscRng", ACT1_BOSSES);
				return eventScreen(sh.state, 1, { boss: ACT1_BOSSES.indexOf(sh.items[0] ?? "") });
			},
		},
		{
			label: "[I am Awake] Upgrade all cards. Obtain Mark of the Bloom.",
			zh: "[我已觉醒] 升级所有牌。获得绽放印记（无法再回复生命）。",
			run: (st) =>
				obtainRelic({ ...upgradeAll(st), phase: { type: "map" } }, "MARK_OF_THE_BLOOM" as RelicId),
		},
		mindBloomThird(s),
	];
});

// ── The Moai Head ────────────────────────────────────────

defineEvent("THE_MOAI_HEAD", (s) => {
	const amount = roundF(s.maxHp * (s.ascension >= 15 ? 0.18 : 0.125));
	const idol = hasRelic(s, "GOLDEN_IDOL");
	return [
		{
			label: `[Jump Inside] Lose ${amount} Max HP. Heal to full HP.`,
			zh: `[跳进去] 失去 ${amount} 点最大生命。回复全部生命。`,
			run: (st, ev) => {
				const r = loseMaxHp(st, amount);
				return toMap(heal(r, r.maxHp, ev));
			},
		},
		idol
			? {
					label: "[Offer: Golden Idol] Gain 333 Gold. Lose Golden Idol.",
					zh: "[献上：金神像] 获得 333 金币。失去金神像。",
					run: (st, ev) => toMap(gainGold(loseRelic(st, "GOLDEN_IDOL"), 333, ev)),
				}
			: { label: "[Locked] Requires: Golden Idol.", zh: "[锁定] 需要：金神像。", disabled: true },
		leave,
	];
});

// ── Mysterious Sphere ────────────────────────────────────

defineEvent("MYSTERIOUS_SPHERE", (s) => {
	if (screenOf(s) === 1) {
		return [
			{
				label: "[Fight!]",
				zh: "[战斗！]",
				run: (st, ev) => {
					const g = random(st.rng.miscRng, 10);
					const r: GameState = { ...st, rng: { ...st.rng, miscRng: g.state } };
					const rewards = { gold: 45 + g.value, relics: ["rare" as const], cardReward: true };
					return startEventCombat(r, "MYSTERIOUS_SPHERE_EVENT", { ...rewards, potion: true }, ev);
				},
			},
		];
	}
	return [
		{
			label: "[Open Sphere] Fight! Reward: Rare Relic.",
			zh: "[打开球体] 战斗！奖励：稀有遗物。",
			run: (st) => eventScreen(st, 1),
		},
		leave,
	];
});

// ── Sensory Stone ────────────────────────────────────────

function colorlessPool(rarity: "uncommon" | "rare"): CardId[] {
	return getAllCards()
		.filter((c) => c.pool === "colorless" && c.rarity === rarity && !c.unobtainable)
		.map((c) => c.id);
}

/** getColorlessRewardCards: per card cardRng.randomBoolean(0.3) → rare, else uncommon; no duplicates. */
function colorlessReward(s: GameState): { cards: CardId[]; state: GameState } {
	let rng = s.rng.cardRng;
	const cards: CardId[] = [];
	for (let i = 0; i < cardRewardCount(s); i++) {
		const rare = randomBooleanWithChance(rng, 0.3);
		rng = rare.state;
		const pool = colorlessPool(rare.value ? "rare" : "uncommon");
		if (pool.length === 0) continue;
		let card: CardId | undefined;
		do {
			const r = random(rng, pool.length - 1);
			rng = r.state;
			card = pool[r.value];
		} while (card && cards.includes(card) && pool.some((id) => !cards.includes(id)));
		if (card) cards.push(card);
	}
	return { cards, state: { ...s, rng: { ...s.rng, cardRng: rng } } };
}

function recall(n: number, hpLoss: number): Effect {
	return (s, events) => {
		let st = hpLoss > 0 ? loseHp(s, hpLoss, events) : s;
		const items: { cards: CardId[] }[] = [];
		for (let i = 0; i < n; i++) {
			const r = colorlessReward(st);
			st = r.state;
			items.push({ cards: r.cards });
		}
		return rewardChain(st, items, { type: "map" });
	};
}

defineEvent("SENSORY_STONE", (s) => {
	if (screenOf(s) === 0) return [continueTo(1)];
	return [
		{
			label: "[Recall] Obtain 1 colorless card.",
			zh: "[回忆] 获得 1 张无色牌。",
			run: recall(1, 0),
		},
		{
			label: "[Recall] Obtain 2 colorless cards. Lose 5 HP.",
			zh: "[回忆] 获得 2 张无色牌。失去 5 点生命。",
			run: recall(2, 5),
		},
		{
			label: "[Recall] Obtain 3 colorless cards. Lose 10 HP.",
			zh: "[回忆] 获得 3 张无色牌。失去 10 点生命。",
			run: recall(3, 10),
		},
	];
});

// ── Tomb of Lord Red Mask ────────────────────────────────

defineEvent("TOMB_OF_LORD_RED_MASK", (s) => {
	if (hasRelic(s, "RED_MASK")) {
		return [
			{
				label: "[Don the Red Mask] Gain 222 Gold.",
				zh: "[戴上红面具] 获得 222 金币。",
				run: (st, ev) => toMap(gainGold(st, 222, ev)),
			},
			leave,
		];
	}
	return [
		{ label: "[Locked] Requires: Red Mask.", zh: "[锁定] 需要：红面具。", disabled: true },
		{
			label: `[Offer: ${s.gold} Gold] Obtain Red Mask.`,
			zh: `[献上：${s.gold} 金币] 获得红面具。`,
			run: (st, ev) =>
				obtainRelic(go(loseGold(st, st.gold, ev), { type: "map" }), "RED_MASK" as RelicId),
		},
		leave,
	];
});

// ── Winding Halls ────────────────────────────────────────

defineEvent("WINDING_HALLS", (s) => {
	if (screenOf(s) === 0) return [continueTo(1)];
	const a15 = s.ascension >= 15;
	const hpLoss = roundF(s.maxHp * (a15 ? 0.18 : 0.125));
	const healAmt = roundF(s.maxHp * (a15 ? 0.2 : 0.25));
	const maxHpLoss = roundF(s.maxHp * 0.05);
	return [
		{
			label: `[Embrace Madness] Receive 2 Madness. Lose ${hpLoss} HP.`,
			zh: `[拥抱疯狂] 获得 2 张疯狂。失去 ${hpLoss} 点生命。`,
			run: (st, ev) => {
				let r = loseHp(st, hpLoss, ev);
				r = obtainCard(r, "MADNESS" as CardId);
				return toMap(obtainCard(r, "MADNESS" as CardId));
			},
		},
		{
			label: `[Press On] Heal ${healAmt} HP. Become Cursed - Writhe.`,
			zh: `[继续前进] 回复 ${healAmt} 点生命。被诅咒——苦恼。`,
			run: (st, ev) => toMap(obtainCard(heal(st, healAmt, ev), "WRITHE" as CardId)),
		},
		{
			label: `[Retrace Your Steps] Lose ${maxHpLoss} Max HP.`,
			zh: `[原路返回] 失去 ${maxHpLoss} 点最大生命。`,
			run: (st) => toMap(loseMaxHp(st, maxHpLoss)),
		},
	];
});
