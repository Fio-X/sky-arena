/**
 * Act 2 event pool (single-screen events). The multi-screen ones (Colosseum,
 * Cursed Tome, Masked Bandits, The Library) are in act2EventsMulti.ts.
 * Pure text screens of the original (result text + [Leave]) are skipped: the
 * choice applies and the event ends.
 */
import { type EventChoice, registerEvent } from "../../core/eventRegistry";
import { hasRelic, obtainCard } from "../../core/obtain";
import { gainGold } from "../../core/playerActions";
import type { CardId, GameEvent, GameState } from "../../core/types";
import { randomBoolean } from "../../rng/stsRandom";
import { deckSelectPhase, gainMaxHp, purgeableIndices, upgradeDeckCard } from "../relicsRun2";
import {
	a15,
	ceilPct,
	eventDamage,
	hasTag,
	leave,
	loseGold,
	loseMaxHp,
	obtainScreenlessRelic,
	relicOrCirclet,
	roundPct,
} from "./act2EventUtils";
import "./act2EventsMulti";

const MAP = { type: "map" } as const;
const LEAVE: EventChoice = { label: "[Leave]", zh: "[离开]" };

// ── Pleading Vagrant (Addict) ───────────────────────────

const VAGRANT_COST = 85;

registerEvent("PLEADING_VAGRANT", {
	options: (s) => [
		{
			label: `[Offer Gold] Give ${VAGRANT_COST} Gold. Obtain a random Relic.`,
			zh: `[给予金币] 失去${VAGRANT_COST}金币，获得一件随机遗物。`,
			disabled: s.gold < VAGRANT_COST,
		},
		{
			label: "[Rob] Obtain a random Relic. Become Cursed - Shame.",
			zh: "[抢劫] 获得一件随机遗物。被诅咒——耻辱。",
		},
		LEAVE,
	],
	choose: (s, i, events) => {
		if (i === 0) return obtainScreenlessRelic(leave(loseGold(s, VAGRANT_COST, events)));
		// The relic is obtained at once, the curse through a queued effect: relic first.
		if (i === 1) return obtainCard(obtainScreenlessRelic(leave(s)), "SHAME" as CardId);
		return leave(s);
	},
});

// ── Ancient Writing (Back to Basics) ────────────────────

/** Simplicity: every STARTER_STRIKE / STARTER_DEFEND card that can still upgrade. */
function upgradeStarters(s: GameState): GameState {
	const starters = s.deck.filter((c) => hasTag(c, "starter_strike") || hasTag(c, "starter_defend"));
	return starters.reduce((st, c) => upgradeDeckCard(st, c.uniqueId), s);
}

registerEvent("ANCIENT_WRITING", {
	options: () => [
		{ label: "[Elegance] Remove a card from your deck.", zh: "[优雅] 从你的牌组中移除一张牌。" },
		{ label: "[Simplicity] Upgrade all Strikes and Defends.", zh: "[简洁] 升级所有打击和防御。" },
	],
	choose: (s, i) => (i === 0 ? deckSelectPhase(s, "remove", 1, MAP) : leave(upgradeStarters(s))),
});

// ── Old Beggar (Beggar) ─────────────────────────────────

const BEGGAR_COST = 75;

registerEvent("OLD_BEGGAR", {
	options: (s) => [
		{
			label: `[Offer Gold] Lose ${BEGGAR_COST} Gold. Remove a card from your deck.`,
			zh: `[施舍金币] 失去${BEGGAR_COST}金币，从你的牌组中移除一张牌。`,
			disabled: s.gold < BEGGAR_COST,
		},
		LEAVE,
	],
	choose: (s, i, events) =>
		i === 0 ? deckSelectPhase(loseGold(s, BEGGAR_COST, events), "remove", 1, MAP) : leave(s),
});

// ── Augmenter (Drug Dealer) ─────────────────────────────

registerEvent("AUGMENTER", {
	options: (s) => [
		{ label: "[Test J.A.X.] Obtain J.A.X.", zh: "[测试 J.A.X.] 获得 J.A.X.。" },
		{
			label: "[Become Test Subject] Choose and Transform 2 cards in your deck.",
			zh: "[成为实验对象] 选择牌组中的2张牌进行变化。",
			disabled: purgeableIndices(s).length < 2,
		},
		{
			label: "[Ingest Mutagens] Obtain Mutagenic Strength.",
			zh: "[注射诱变剂] 获得诱变力量。",
		},
	],
	choose: (s, i) => {
		if (i === 0) return obtainCard(leave(s), "JAX" as CardId);
		if (i === 1) return deckSelectPhase(s, "transform", 2, MAP);
		return relicOrCirclet(leave(s), "MUTAGENIC_STRENGTH");
	},
});

// ── Forgotten Altar ─────────────────────────────────────

const altarHpLoss = (s: GameState) => roundPct(s.maxHp, a15(s) ? 0.35 : 0.25);

/** gainChalice: Bloody Idol takes the Golden Idol's place; Circlet if already owned. */
function offerIdol(s: GameState): GameState {
	if (hasRelic(s, "BLOODY_IDOL")) return relicOrCirclet(leave(s), "BLOODY_IDOL");
	const relics = s.relics.map((r) =>
		r.id === "GOLDEN_IDOL" ? { id: "BLOODY_IDOL" as typeof r.id, counter: 0 } : r,
	);
	return leave({ ...s, relics });
}

registerEvent("FORGOTTEN_ALTAR", {
	options: (s) => [
		{
			label: "[Offer: Golden Idol] Lose Golden Idol. Obtain Bloody Idol.",
			zh: "[献上：金色偶像] 失去金色偶像，获得血腥偶像。",
			disabled: !hasRelic(s, "GOLDEN_IDOL"),
		},
		{
			label: `[Sacrifice] Gain 5 Max HP. Lose ${altarHpLoss(s)} HP.`,
			zh: `[献祭] 获得5点最大生命值，失去${altarHpLoss(s)}点生命。`,
		},
		{ label: "[Desecrate] Become Cursed - Decay.", zh: "[亵渎] 被诅咒——衰退。" },
	],
	choose: (s, i, events) => {
		if (i === 0) return offerIdol(s);
		// The HP loss is fixed when the event opens (before the Max HP gain).
		if (i === 1) return leave(eventDamage(gainMaxHp(s, 5), altarHpLoss(s), events));
		return obtainCard(leave(s), "DECAY" as CardId);
	},
});

// ── Council of Ghosts ───────────────────────────────────

const ghostsLoss = (s: GameState) => Math.min(ceilPct(s.maxHp, 0.5), s.maxHp - 1);
const ghostsCount = (s: GameState) => (a15(s) ? 3 : 5);

registerEvent("GHOSTS", {
	options: (s) => [
		{
			label: `[Accept] Receive ${ghostsCount(s)} Apparitions. Lose ${ghostsLoss(s)} Max HP.`,
			zh: `[接受] 获得${ghostsCount(s)}张幻影。失去${ghostsLoss(s)}点最大生命值。`,
		},
		{ label: "[Refuse]", zh: "[拒绝]" },
	],
	choose: (s, i) => {
		if (i !== 0) return leave(s);
		let r = leave(loseMaxHp(s, ghostsLoss(s)));
		for (let n = 0; n < ghostsCount(s); n++) r = obtainCard(r, "APPARITION" as CardId);
		return r;
	},
});

// ── The Nest ────────────────────────────────────────────

const nestGold = (s: GameState) => (a15(s) ? 50 : 99);

registerEvent("THE_NEST", {
	options: (s) => [
		{
			label: `[Smash and Grab] Obtain ${nestGold(s)} Gold.`,
			zh: `[趁火打劫] 获得${nestGold(s)}金币。`,
		},
		{
			label: "[Stay in Line] Lose 6 HP. Obtain Ritual Dagger.",
			zh: "[继续排队] 失去6点生命。获得仪式匕首。",
		},
	],
	choose: (s, i, events) => {
		if (i === 0) return leave(gainGold(s, nestGold(s), events));
		const hurt = eventDamage(s, 6, events);
		if (hurt.phase.type === "gameOver") return hurt;
		return obtainCard(leave(hurt), "RITUAL_DAGGER" as CardId);
	},
});

// ── The Mausoleum ───────────────────────────────────────

registerEvent("THE_MAUSOLEUM", {
	options: (s) => [
		{
			label: `[Open Coffin] Obtain a Relic. ${a15(s) ? "" : "50%: "}Become Cursed - Writhe.`,
			zh: `[打开棺材] 获得一件遗物。${a15(s) ? "" : "50%："}被诅咒——挣扎。`,
		},
		LEAVE,
	],
	choose: (s, i) => {
		if (i !== 0) return leave(s);
		const coin = randomBoolean(s.rng.miscRng);
		const cursed = coin.value || a15(s);
		const r = obtainScreenlessRelic(leave({ ...s, rng: { ...s.rng, miscRng: coin.state } }));
		return cursed ? obtainCard(r, "WRITHE" as CardId) : r;
	},
});

// ── Vampires(?) ─────────────────────────────────────────

const vampiresLoss = (s: GameState) => Math.min(ceilPct(s.maxHp, 0.3), s.maxHp - 1);

/** replaceAttacks: every STARTER_STRIKE leaves the deck, then 5 Bites are obtained. */
function replaceAttacks(s: GameState): GameState {
	let r: GameState = { ...s, deck: s.deck.filter((c) => !hasTag(c, "starter_strike")) };
	for (let n = 0; n < 5; n++) r = obtainCard(r, "BITE" as CardId);
	return r;
}

type VampireChoice = "accept" | "vial" | "refuse";
/** The Blood Vial offer is only listed when the relic is owned (between Accept and Refuse). */
const vampireChoices = (s: GameState): VampireChoice[] =>
	hasRelic(s, "BLOOD_VIAL") ? ["accept", "vial", "refuse"] : ["accept", "refuse"];

const VAMPIRE_LABELS: Record<VampireChoice, (s: GameState) => EventChoice> = {
	accept: (s) => ({
		label: `[Accept] Lose ${vampiresLoss(s)} Max HP. Remove all Strikes. Receive 5 Bites.`,
		zh: `[接受] 失去${vampiresLoss(s)}点最大生命值。移除所有打击。获得5张噬咬。`,
	}),
	vial: () => ({
		label: "[Offer: Blood Vial] Remove all Strikes. Receive 5 Bites. Lose Blood Vial.",
		zh: "[献上：血瓶] 移除所有打击。获得5张噬咬。失去血瓶。",
	}),
	refuse: () => ({ label: "[Refuse]", zh: "[拒绝]" }),
};

function vampiresChoose(s: GameState, i: number, _events: GameEvent[]): GameState {
	const choice = vampireChoices(s)[i];
	if (choice === "accept") return replaceAttacks(leave(loseMaxHp(s, vampiresLoss(s))));
	if (choice === "vial") {
		return replaceAttacks(leave({ ...s, relics: s.relics.filter((r) => r.id !== "BLOOD_VIAL") }));
	}
	return leave(s);
}

registerEvent("VAMPIRES", {
	options: (s) => vampireChoices(s).map((c) => VAMPIRE_LABELS[c](s)),
	choose: vampiresChoose,
});
