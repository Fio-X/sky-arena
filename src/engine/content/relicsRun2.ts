/**
 * Run-level relic flow outside combat: helpers shared by the pickup effects in
 * relicsRun.ts and the entry points core/step.ts calls (treasure chest, rest
 * site options, deck selection, Singing Bowl, extra combat rewards).
 */
import { cardRewardCount, generateCardReward } from "../combat/cardReward";
import { afterRewardPhase, getCurrentRoomType } from "../core/bossReward";
import { obtainRandomRelic } from "../core/event";
import { hasKey, obtainKey } from "../core/keys";
import { hasRelic, obtainCard, obtainRelic } from "../core/obtain";
import type {
	CardId,
	CardInstance,
	DeckSelectTask,
	GameEvent,
	GamePhase,
	GameState,
	PotionId,
	RelicId,
	RestOption,
	RngState,
	StepResult,
} from "../core/types";
import { random, randomBooleanWithChance, stsShuffle } from "../rng/stsRandom";
import { getAllCards, getAllRelics, getCard } from "./loader";
import { relicVal, setRelicCounter } from "./relicHelpers";

// ── Small state helpers ─────────────────────────────────

/** AbstractCreature.increaseMaxHp(amount, true): raise max HP and heal the same amount. */
export function gainMaxHp(state: GameState, amount: number): GameState {
	return { ...state, maxHp: state.maxHp + amount, currentHp: state.currentHp + amount };
}

export function relicCounter(state: GameState, relicId: string): number {
	return state.relics.find((r) => r.id === relicId)?.counter ?? 0;
}

function canUpgrade(card: CardInstance): boolean {
	const type = getCard(card.id)?.type;
	return !card.upgraded && type !== undefined && type !== "curse";
}

/** Upgrade one master-deck card (by uniqueId); the cost follows the upgrade data. */
export function upgradeDeckCard(state: GameState, uid: number): GameState {
	const deck = state.deck.map((c) => {
		if (c.uniqueId !== uid || !canUpgrade(c)) return c;
		const cost = getCard(c.id)?.upgrade.cost;
		return { ...c, upgraded: true, costForTurn: cost ?? c.costForTurn };
	});
	return { ...state, deck };
}

/**
 * War Paint / Whetstone / Tiny House: shuffle the upgradable cards (of a type)
 * with miscRng and upgrade the first `count`. Original shuffles with
 * java.util.Random(miscRng.randomLong()); here stsShuffle on miscRng (assumption).
 */
export function upgradeRandomCards(
	state: GameState,
	count: number,
	type: "attack" | "skill" | null,
): GameState {
	const candidates = state.deck.filter(
		(c) => canUpgrade(c) && (type === null || getCard(c.id)?.type === type),
	);
	if (candidates.length === 0) return state;
	const shuffled = stsShuffle(candidates, state.rng.miscRng);
	let s: GameState = { ...state, rng: { ...state.rng, miscRng: shuffled.rng } };
	for (const c of shuffled.result.slice(0, count)) s = upgradeDeckCard(s, c.uniqueId);
	return s;
}

const UNPURGEABLE = new Set(["NECRONOMICURSE", "CURSE_OF_THE_BELL", "ASCENDERS_BANE"]);

/** CardGroup.getPurgeableCards: deck indices that may be removed or transformed. */
export function purgeableIndices(state: GameState): number[] {
	return state.deck.flatMap((c, i) => (UNPURGEABLE.has(c.id as string) ? [] : [i]));
}

const CHARACTER_COLOR = { IRONCLAD: "red", SILENT: "green", DEFECT: "blue", WATCHER: "purple" };

/** srcCommon + srcUncommon + srcRare card pools of the character. */
function classCardPool(state: GameState): CardId[] {
	const color = CHARACTER_COLOR[state.character] ?? "red";
	return getAllCards()
		.filter(
			(c) =>
				c.color === color && !c.unobtainable && ["common", "uncommon", "rare"].includes(c.rarity),
		)
		.map((c) => c.id);
}

/** CardLibrary.getCurse: random curse, excluding the special ones (rarity "special"). */
function cursePool(): CardId[] {
	return getAllCards()
		.filter((c) => c.type === "curse" && c.rarity === "curse" && !c.unobtainable)
		.map((c) => c.id);
}

function pick(pool: readonly CardId[], rng: RngState): { id: CardId | null; rng: RngState } {
	if (pool.length === 0) return { id: null, rng };
	const r = random(rng, pool.length - 1);
	return { id: pool[r.value] ?? null, rng: r.state };
}

/** Cursed Key: AbstractDungeon.returnRandomCurse (cardRng). */
export function obtainRandomCurse(state: GameState): GameState {
	const r = pick(cursePool(), state.rng.cardRng);
	const s = { ...state, rng: { ...state.rng, cardRng: r.rng } };
	return r.id ? obtainCard(s, r.id) : s;
}

/** Pandora's Box: AbstractDungeon.returnTrulyRandomCard (cardRandomRng). */
export function trulyRandomCard(state: GameState): { id: CardId | null; state: GameState } {
	const r = pick(classCardPool(state), state.rng.cardRandomRng);
	return { id: r.id, state: { ...state, rng: { ...state.rng, cardRandomRng: r.rng } } };
}

/** AbstractDungeon.transformCard(c, autoUpgrade, miscRng): same color group, never the same card. */
export function transformTarget(
	state: GameState,
	card: CardInstance,
): { id: CardId | null; state: GameState } {
	const def = getCard(card.id);
	let pool: CardId[];
	if (def?.type === "curse") pool = cursePool();
	else if (def?.color === "colorless") {
		pool = getAllCards()
			.filter(
				(c) =>
					c.color === "colorless" && !c.unobtainable && ["uncommon", "rare"].includes(c.rarity),
			)
			.map((c) => c.id);
	} else pool = classCardPool(state);
	const r = pick(
		pool.filter((id) => id !== card.id),
		state.rng.miscRng,
	);
	return { id: r.id, state: { ...state, rng: { ...state.rng, miscRng: r.rng } } };
}

// ── Relic picks ─────────────────────────────────────────

type Tier = "common" | "uncommon" | "rare";

/**
 * A random non-boss relic id, without obtaining it. With no tier: the same
 * 50/33/17 relicRng tier roll as event.ts obtainRandomRelic.
 */
export function rollRandomRelic(
	state: GameState,
	exclude: readonly string[],
	fixedTier?: Tier,
): { id: RelicId | null; state: GameState } {
	const owned = new Set([...state.relics.map((r) => r.id as string), ...exclude]);
	const pool = getAllRelics().filter(
		(r) =>
			!r.unobtainable &&
			!owned.has(r.id as string) &&
			!["boss", "event", "starter", "special"].includes(r.tier),
	);
	if (pool.length === 0) return { id: null, state };
	let rng = state.rng.relicRng;
	let tier: string | undefined = fixedTier;
	if (!tier) {
		const tierRoll = random(rng, 99);
		rng = tierRoll.state;
		tier = tierRoll.value < 50 ? "common" : tierRoll.value < 83 ? "uncommon" : "rare";
	}
	const tierPool = pool.filter((r) => r.tier === tier);
	const finalPool = tierPool.length > 0 ? tierPool : pool;
	const roll = random(rng, finalPool.length - 1);
	const relic = finalPool[roll.value];
	return {
		id: relic?.id ?? null,
		state: { ...state, rng: { ...state.rng, relicRng: roll.state } },
	};
}

// ── Treasure room ───────────────────────────────────────

/**
 * AbstractChest.open (non-boss): onChestOpen (Cursed Key curse, Matryoshka extra
 * relic), the chest's own relic, then onChestOpenAfter (N'loth's Hungry Face
 * removes the first relic reward). Relic rewards are taken at once. The caller
 * has already set the reward phase.
 */
export function openTreasureChest(state: GameState): GameState {
	let s = state;
	const rewards: RelicId[] = [];
	for (const relic of state.relics) {
		if (relic.id === "CURSED_KEY") s = obtainRandomCurse(s);
		if (relic.id === "MATRYOSHKA" && relic.counter > 0) {
			s = setRelicCounter(s, "MATRYOSHKA", relic.counter === 1 ? -2 : relic.counter - 1);
			const coin = randomBooleanWithChance(s.rng.relicRng, 0.75);
			s = { ...s, rng: { ...s.rng, relicRng: coin.state } };
			const r = rollRandomRelic(s, rewards, coin.value ? "common" : "uncommon");
			s = r.state;
			if (r.id) rewards.push(r.id);
		}
	}
	const own = rollRandomRelic(s, rewards);
	s = own.state;
	if (own.id) rewards.push(own.id);
	if (relicCounter(s, "NLOTHS_HUNGRY_FACE") > 0 && hasRelic(s, "NLOTHS_HUNGRY_FACE")) {
		s = setRelicCounter(s, "NLOTHS_HUNGRY_FACE", -2);
		rewards.shift();
	}
	// Sapphire Key: the chest's own relic is offered instead of taken (one or the other).
	const linked = !hasKey(s, "sapphire") && own.id && rewards.includes(own.id) ? own.id : null;
	for (const id of rewards) if (id !== linked) s = obtainRelic(s, id);
	if (linked && s.phase.type === "reward") {
		s = { ...s, phase: { ...s.phase, sapphireKey: true, chestRelic: linked } };
	}
	return s;
}

/** EventHelper.roll with Tiny Chest: every 4th ? room is a treasure room. */
export function rollTinyChest(state: GameState): { state: GameState; treasure: boolean } {
	if (!hasRelic(state, "TINY_CHEST")) return { state, treasure: false };
	const count = relicCounter(state, "TINY_CHEST") + 1;
	const every = relicVal("TINY_CHEST", 0, 4);
	const treasure = count >= every;
	return { state: setRelicCounter(state, "TINY_CHEST", treasure ? 0 : count), treasure };
}

// ── Rewards ─────────────────────────────────────────────

/** A card reward screen (getRewardCards) placed before `next`. */
export function cardRewardPhase(
	state: GameState,
	next: GamePhase,
	extra: { gold?: number; potion?: PotionId | null } = {},
): GameState {
	const reward = generateCardReward(state, cardRewardCount(state));
	return {
		...state,
		rng: { ...state.rng, cardRng: reward.rng },
		phase: {
			type: "reward",
			cardRewards: reward.cards,
			potionReward: extra.potion ?? null,
			gold: extra.gold ?? 0,
			next,
		},
	};
}

/** Dream Catcher: resting opens a card reward. */
export function dreamCatcherReward(state: GameState): GameState {
	if (!hasRelic(state, "DREAM_CATCHER")) return state;
	return cardRewardPhase(state, state.phase);
}

/**
 * Combat reward extras (reward phase already set): Prayer Wheel adds a second
 * card reward in normal fights; Black Star an extra relic from elites.
 */
export function addRelicCombatRewards(state: GameState): GameState {
	const room = getCurrentRoomType(state);
	let s = state;
	if (room === "monster" && hasRelic(s, "PRAYER_WHEEL") && s.phase.type === "reward") {
		const first = s.phase;
		const second = cardRewardPhase(s, afterRewardPhase(s));
		s = { ...second, phase: { ...first, next: second.phase } };
	}
	if (room === "elite" && hasRelic(s, "BLACK_STAR")) s = obtainRandomRelic(s);
	return s;
}

/** Singing Bowl: +2 Max HP instead of taking a card. */
export function stepSingingBowl(state: GameState, events: GameEvent[]): StepResult {
	if (state.phase.type !== "reward" || state.phase.cardRewards.length === 0) {
		return { state, events };
	}
	if (!hasRelic(state, "SINGING_BOWL")) return { state, events };
	const amount = relicVal("SINGING_BOWL", 0, 2);
	events.push({ type: "healed", target: { type: "player" }, amount });
	const s = gainMaxHp({ ...state, combat: null }, amount);
	return { state: { ...s, phase: afterRewardPhase(state) }, events };
}

// ── Rest site options ───────────────────────────────────

export function restOptionAvailable(state: GameState, option: RestOption): boolean {
	switch (option) {
		case "lift":
			return hasRelic(state, "GIRYA") && relicCounter(state, "GIRYA") < 3;
		case "toke":
			return hasRelic(state, "PEACE_PIPE") && purgeableIndices(state).length > 0;
		case "dig":
			return hasRelic(state, "SHOVEL");
		case "recall":
			return !hasKey(state, "ruby");
	}
}

/** Girya Lift (+1 Strength each combat, 3 times), Peace Pipe Toke (remove a card), Shovel Dig (relic). */
export function stepRestOption(
	state: GameState,
	option: RestOption,
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "rest" || !restOptionAvailable(state, option)) {
		return { state, events };
	}
	const map: GamePhase = { type: "map" };
	switch (option) {
		case "lift":
			return {
				state: { ...setRelicCounter(state, "GIRYA", relicCounter(state, "GIRYA") + 1), phase: map },
				events,
			};
		case "toke":
			return { state: deckSelectPhase(state, "peacePipe", 1, map), events };
		case "dig": {
			const reward: GamePhase = { type: "reward", cardRewards: [], potionReward: null, gold: 0 };
			return { state: obtainRandomRelic({ ...state, phase: reward }), events };
		}
		case "recall":
			return { state: { ...obtainKey(state, "ruby"), phase: map }, events };
	}
}

// ── Deck selection (Astrolabe, Empty Cage, Dolly's Mirror, Peace Pipe) ──

function eligibleIndices(state: GameState, task: DeckSelectTask): number[] {
	return task === "dollysMirror" ? state.deck.map((_, i) => i) : purgeableIndices(state);
}

/** Open a deck selection of `count` cards (fewer if the deck is short); none → straight to `next`. */
export function deckSelectPhase(
	state: GameState,
	task: DeckSelectTask,
	count: number,
	next: GamePhase,
): GameState {
	const n = Math.min(count, eligibleIndices(state, task).length);
	if (n <= 0) return { ...state, phase: next };
	return { ...state, phase: { type: "deckSelect", task, count: n, next } };
}

export function stepChooseDeckCards(
	state: GameState,
	indices: number[],
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "deckSelect") return { state, events };
	const { task, count, next } = state.phase;
	// Peace Pipe can be cancelled: back to the rest site.
	if (task === "peacePipe" && indices.length === 0) {
		return { state: { ...state, phase: { type: "rest" } }, events };
	}
	const eligible = new Set(eligibleIndices(state, task));
	const unique = [...new Set(indices)];
	if (unique.length !== count || !unique.every((i) => eligible.has(i))) {
		return { state, events };
	}
	const cards = unique.map((i) => state.deck[i] as CardInstance);
	const s: GameState = { ...state, phase: next };
	return { state: applyDeckSelection(s, task, cards), events };
}

function removeFromDeck(state: GameState, cards: readonly CardInstance[]): GameState {
	const uids = new Set(cards.map((c) => c.uniqueId));
	return { ...state, deck: state.deck.filter((c) => !uids.has(c.uniqueId)) };
}

function applyDeckSelection(
	state: GameState,
	task: DeckSelectTask,
	cards: readonly CardInstance[],
): GameState {
	switch (task) {
		case "emptyCage":
		case "peacePipe":
			return removeFromDeck(state, cards);
		case "astrolabe":
			return astrolabeTransform(removeFromDeck(state, cards), cards);
		case "dollysMirror":
			return cards.reduce(copyIntoDeck, state);
	}
}

/** Astrolabe: transform each (miscRng), upgrade, obtain. */
function astrolabeTransform(state: GameState, cards: readonly CardInstance[]): GameState {
	let s = state;
	for (const card of cards) {
		const t = transformTarget(s, card);
		s = t.state;
		if (!t.id) continue;
		s = obtainCard(s, t.id);
		const added = s.deck[s.deck.length - 1];
		if (added?.id === t.id) s = upgradeDeckCard(s, added.uniqueId);
	}
	return s;
}

/** Dolly's Mirror: makeStatEquivalentCopy (upgrade, misc, cost) then obtain. */
function copyIntoDeck(state: GameState, card: CardInstance): GameState {
	const s = obtainCard(state, card.id);
	const added = s.deck[s.deck.length - 1];
	if (!added || added.id !== card.id) return s;
	const copy = {
		...added,
		upgraded: card.upgraded || added.upgraded,
		costForTurn: card.costForTurn,
		costOverride: card.costOverride,
		misc: card.misc,
	};
	return { ...s, deck: s.deck.map((c) => (c.uniqueId === added.uniqueId ? copy : c)) };
}
