/**
 * Act 1 event pool and the shrines (Exordium events, shrine pool). Choices
 * and numbers follow the original event classes; result screens that only
 * show text and a [Leave] button go straight to the map.
 */
import { eventScreen, leaveEvent, registerEvent } from "../../core/eventRegistry";
import { obtainRelic } from "../../core/obtain";
import { gainGold } from "../../core/playerActions";
import type { CardInstance, GameState, RelicId } from "../../core/types";
import { random } from "../../rng/stsRandom";
import { getCard } from "../loader";
import { upgradeRandomCards } from "../relicsRun2";
import {
	a15,
	canPick,
	curse,
	dataOf,
	gainMaxHpEvent,
	heal,
	LEAVE,
	loseGold,
	loseHp,
	loseMaxHp,
	obtainScreenlessRelic,
	pctOfMax,
	pickCard,
	roundPctOfMax,
	screenOf,
	toMap,
} from "./act1EventUtils";
import "./act1EventFights";
import "./act1Shrines";
import "./act1MatchAndKeep";

// ── Big Fish ─────────────────────────────────────────────

registerEvent("BIG_FISH", {
	options: (s) => [
		{
			label: `[Banana] Heal ${Math.trunc(s.maxHp / 3)} HP.`,
			zh: `[香蕉] 回复 ${Math.trunc(s.maxHp / 3)} 点生命。`,
		},
		{ label: "[Donut] Max HP +5.", zh: "[甜甜圈] 最大生命 +5。" },
		{
			label: "[Box] Receive a Relic. Become Cursed - Regret.",
			zh: "[盒子] 获得一件遗物。被诅咒——悔恨。",
		},
	],
	choose: (s, i, events) => {
		const done = toMap(s);
		if (i === 0) return heal(done, Math.trunc(s.maxHp / 3), events);
		if (i === 1) return gainMaxHpEvent(done, 5, events);
		return obtainScreenlessRelic(curse(done, "REGRET"));
	},
});

// ── The Cleric ───────────────────────────────────────────

const CLERIC_HEAL_COST = 35;
const clericPurifyCost = (s: GameState) => (a15(s) ? 75 : 50);

registerEvent("THE_CLERIC", {
	options: (s) => {
		const amt = pctOfMax(s, 0.25);
		const cost = clericPurifyCost(s);
		return [
			{
				label: `[Heal] ${CLERIC_HEAL_COST} Gold: Heal ${amt} HP.`,
				zh: `[治疗] ${CLERIC_HEAL_COST} 金币：回复 ${amt} 点生命。`,
				disabled: s.gold < CLERIC_HEAL_COST,
			},
			{
				label: `[Purify] ${cost} Gold: Remove a card from your deck.`,
				zh: `[净化] ${cost} 金币：从牌组中移除一张牌。`,
				disabled: s.gold < cost,
			},
			LEAVE,
		];
	},
	choose: (s, i, events) => {
		if (i === 0) {
			return heal(toMap(loseGold(s, CLERIC_HEAL_COST, events)), pctOfMax(s, 0.25), events);
		}
		if (i === 1) return pickCard(loseGold(s, clericPurifyCost(s), events), "remove");
		return leaveEvent(s);
	},
});

// ── Golden Idol ──────────────────────────────────────────

const idolDamage = (s: GameState) => pctOfMax(s, a15(s) ? 0.35 : 0.25);
const idolMaxHpLoss = (s: GameState) => Math.max(1, pctOfMax(s, a15(s) ? 0.1 : 0.08));

registerEvent("GOLDEN_IDOL", {
	options: (s) => {
		if (screenOf(s) === 0) {
			return [{ label: "[Take] Obtain Golden Idol.", zh: "[拿走] 获得金色神像。" }, LEAVE];
		}
		return [
			{ label: "[Outrun] Become Cursed - Injury.", zh: "[逃跑] 被诅咒——受伤。" },
			{
				label: `[Smash] Take ${idolDamage(s)} damage.`,
				zh: `[硬闯] 受到 ${idolDamage(s)} 点伤害。`,
			},
			{
				label: `[Hide] Lose ${idolMaxHpLoss(s)} Max HP.`,
				zh: `[躲藏] 失去 ${idolMaxHpLoss(s)} 点最大生命。`,
			},
		];
	},
	choose: (s, i, events) => {
		if (screenOf(s) === 0) {
			if (i === 1) return leaveEvent(s);
			return obtainRelic(eventScreen(s, 1), "GOLDEN_IDOL" as RelicId);
		}
		if (i === 0) return curse(toMap(s), "INJURY");
		if (i === 1) return loseHp(toMap(s), idolDamage(s), events);
		return loseMaxHp(toMap(s), idolMaxHpLoss(s));
	},
});

// ── Wing Statue (Golden Wing) ────────────────────────────

/** canAttack: a deck attack with base damage 10 or more. */
function hasBigAttack(s: GameState): boolean {
	return s.deck.some((c: CardInstance) => {
		const def = getCard(c.id);
		if (def?.type !== "attack") return false;
		const dmg = c.upgraded ? (def.upgrade.damage ?? def.values.damage) : def.values.damage;
		return (dmg ?? 0) >= 10;
	});
}

registerEvent("WING_STATUE", {
	options: (s) => [
		{
			label: "[Pray] Remove a card from your deck. Lose 7 HP.",
			zh: "[祈祷] 从牌组中移除一张牌。失去 7 点生命。",
		},
		hasBigAttack(s)
			? { label: "[Destroy] Gain 50-80 Gold.", zh: "[摧毁] 获得 50-80 金币。" }
			: {
					label: "[Locked] Requires a card that deals 10 or more damage.",
					zh: "[锁定] 需要一张造成 10 点或以上伤害的牌。",
					disabled: true,
				},
		LEAVE,
	],
	choose: (s, i, events) => {
		if (i === 0) {
			const hurt = loseHp(s, 7, events);
			return hurt.phase.type === "gameOver" ? hurt : pickCard(hurt, "remove");
		}
		if (i === 1) {
			const r = random(s.rng.miscRng, 30);
			return gainGold(toMap({ ...s, rng: { ...s.rng, miscRng: r.state } }), 50 + r.value, events);
		}
		return leaveEvent(s);
	},
});

// ── World of Goop (Goop Puddle) ──────────────────────────

/** Rolled when the event is created (peeked for the label, committed on any choice). */
function goopLoss(s: GameState): { amount: number; state: GameState } {
	const r = a15(s) ? random(s.rng.miscRng, 40) : random(s.rng.miscRng, 30);
	const roll = (a15(s) ? 35 : 20) + r.value;
	return { amount: Math.min(roll, s.gold), state: { ...s, rng: { ...s.rng, miscRng: r.state } } };
}

registerEvent("WORLD_OF_GOOP", {
	options: (s) => {
		const loss = goopLoss(s).amount;
		return [
			{
				label: "[Gather Gold] Gain 75 Gold. Lose 11 HP.",
				zh: "[收集金币] 获得 75 金币。失去 11 点生命。",
			},
			{ label: `[Leave It] Lose ${loss} Gold.`, zh: `[放弃] 失去 ${loss} 金币。` },
		];
	},
	choose: (s, i, events) => {
		const roll = goopLoss(s);
		const done = toMap(roll.state);
		if (i === 1) return loseGold(done, roll.amount, events);
		const hurt = loseHp(done, 11, events);
		return hurt.phase.type === "gameOver" ? hurt : gainGold(hurt, 75, events);
	},
});

// ── The Ssssserpent (Liars Game) ─────────────────────────

const serpentGold = (s: GameState) => (a15(s) ? 150 : 175);

registerEvent("THE_SSSSSERPENT", {
	options: (s) => {
		const gold = serpentGold(s);
		if (screenOf(s) === 1) {
			return [{ label: `[Continue] Receive ${gold} Gold.`, zh: `[继续] 获得 ${gold} 金币。` }];
		}
		return [
			{
				label: `[Agree] Receive ${gold} Gold. Become Cursed - Doubt.`,
				zh: `[同意] 获得 ${gold} 金币。被诅咒——疑虑。`,
			},
			{ label: "[Disagree] Leave.", zh: "[不同意] 离开。" },
		];
	},
	choose: (s, i, events) => {
		if (screenOf(s) === 1) return gainGold(toMap(s), serpentGold(s), events);
		if (i === 0) return curse(eventScreen(s, 1), "DOUBT");
		return leaveEvent(s);
	},
});

// ── Living Wall ──────────────────────────────────────────

registerEvent("LIVING_WALL", {
	options: (s) => [
		{ label: "[Forget] Remove a card from your deck.", zh: "[遗忘] 从牌组中移除一张牌。" },
		{ label: "[Change] Transform a card in your deck.", zh: "[改变] 变化牌组中的一张牌。" },
		canPick(s, "upgrade")
			? { label: "[Grow] Upgrade a card in your deck.", zh: "[成长] 升级牌组中的一张牌。" }
			: {
					label: "[Locked] Requires an upgradable card.",
					zh: "[锁定] 需要一张可升级的牌。",
					disabled: true,
				},
	],
	choose: (s, i) => pickCard(s, i === 0 ? "remove" : i === 1 ? "transform" : "upgrade"),
});

// ── Scrap Ooze ───────────────────────────────────────────

/** dmg starts at 3 (A15: 5) and the relic chance at 25%; each miss adds 1 and 10%. */
function oozeState(s: GameState): { dmg: number; chance: number } {
	const d = dataOf(s);
	return { dmg: d.dmg ?? (a15(s) ? 5 : 3), chance: d.chance ?? 25 };
}

registerEvent("SCRAP_OOZE", {
	options: (s) => {
		const { dmg, chance } = oozeState(s);
		return [
			{
				label: `[Reach Inside] Lose ${dmg} HP. ${chance}% chance to find a Relic.`,
				zh: `[伸手进去] 失去 ${dmg} 点生命。${chance}% 几率找到遗物。`,
			},
			LEAVE,
		];
	},
	choose: (s, i, events) => {
		if (i === 1) return leaveEvent(s);
		const { dmg, chance } = oozeState(s);
		const hurt = loseHp(s, dmg, events);
		if (hurt.phase.type === "gameOver") return hurt;
		const r = random(hurt.rng.miscRng, 99);
		const rolled: GameState = { ...hurt, rng: { ...hurt.rng, miscRng: r.state } };
		if (r.value >= 99 - chance) return obtainScreenlessRelic(toMap(rolled));
		return eventScreen(rolled, 0, { dmg: dmg + 1, chance: chance + 10 });
	},
});

// ── Shining Light ────────────────────────────────────────

const lightDamage = (s: GameState) => roundPctOfMax(s, a15(s) ? 0.3 : 0.2);

registerEvent("SHINING_LIGHT", {
	options: (s) => [
		canPick(s, "upgrade")
			? {
					label: `[Enter] Upgrade 2 random cards. Take ${lightDamage(s)} damage.`,
					zh: `[进入] 随机升级 2 张牌。受到 ${lightDamage(s)} 点伤害。`,
				}
			: {
					label: "[Locked] Requires upgradable cards.",
					zh: "[锁定] 需要可升级的牌。",
					disabled: true,
				},
		LEAVE,
	],
	choose: (s, i, events) => {
		if (i === 1) return leaveEvent(s);
		const hurt = loseHp(toMap(s), lightDamage(s), events);
		return hurt.phase.type === "gameOver" ? hurt : upgradeRandomCards(hurt, 2, null);
	},
});
