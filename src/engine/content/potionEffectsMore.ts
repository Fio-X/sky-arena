/**
 * The 22 potions not in potionEffects.ts (Fairy in a Bottle lives in the death
 * check, relicsCombatRules.preventPlayerDeath). Amounts that Sacred Bark doubles
 * through a plain action amount are left to `potionPotency`; counts of cards,
 * orbs and plays are doubled here.
 */

import { registerPowerHooks } from "../core/hooks";
import { hasRelic } from "../core/obtain";
import { addOrbSlots } from "../core/orbSystem";
import { obtainPotion, randomPotion } from "../core/potion";
import { returnFromDiscard, STANCE_CHOICES } from "../core/potionSelect";
import type {
	Action,
	ActorRef,
	CardId,
	CardInstance,
	CardSelectTask,
	CombatState,
	GameState,
	PowerId,
} from "../core/types";
import { random } from "../rng/stsRandom";
import { type CardDef, getAllCards, getCard } from "./loader";
import { registerPotionEffect } from "./potionEffects";

const player: ActorRef = { type: "player" };
const bark = (s: GameState) => hasRelic(s, "SACRED_BARK");
const custom = (execute: (s: GameState) => GameState): Action => ({ type: "custom", execute });
const selfPower = (powerId: string, amount: number): Action => ({
	type: "applyPower",
	source: player,
	target: player,
	powerId: powerId as PowerId,
	amount,
});

function withCombat(s: GameState, fn: (c: CombatState) => CombatState): GameState {
	return s.combat ? { ...s, combat: fn(s.combat) } : s;
}

function openSelect(task: CardSelectTask, options?: CardInstance[]) {
	return (s: GameState): GameState => ({ ...s, phase: { type: "cardSelect", task, options } });
}

function addCards(cardId: string, upgraded: boolean, count: number): Action[] {
	return Array.from({ length: count }, () => ({
		type: "addCardToHand" as const,
		cardId: cardId as CardId,
		upgraded,
	}));
}

// ── Simple ───────────────────────────────────────────────

registerPotionEffect("AMBROSIA", () => [{ type: "changeStance", stance: "divinity" }]);
registerPotionEffect("FOCUS_POTION", () => [selfPower("FOCUS", 2)]);
registerPotionEffect("GHOST_IN_A_JAR", () => [selfPower("intangible", 1)]);
registerPotionEffect("DUPLICATION_POTION", () => [selfPower("DUPLICATION", 1)]);
registerPotionEffect("POISON_POTION", (_s, t) => [
	{
		type: "applyPower",
		source: player,
		target: { type: "monster", index: t },
		powerId: "POISON" as PowerId,
		amount: 6,
	},
]);
registerPotionEffect("BOTTLED_MIRACLE", (s) => addCards("MIRACLE", false, bark(s) ? 4 : 2));
registerPotionEffect("CUNNING_POTION", (s) => addCards("SHIV", true, bark(s) ? 6 : 3));
registerPotionEffect("POTION_OF_CAPACITY", (s) => [
	custom((st) => addOrbSlots(st, bark(s) ? 4 : 2)),
]);
registerPotionEffect("ESSENCE_OF_DARKNESS", (s) => {
	const slots = s.combat?.player.orbSlots ?? 0;
	return Array.from({ length: slots * (bark(s) ? 2 : 1) }, () => ({
		type: "channelOrb" as const,
		orbType: "dark" as const,
	}));
});
registerPotionEffect("DISTILLED_CHAOS", (s) => [
	custom((st) =>
		withCombat(st, (c) => ({ ...c, autoplayTop: (c.autoplayTop ?? 0) + (bark(s) ? 6 : 3) })),
	),
]);

// DuplicationPower: removed at the end of the round (the copy itself is in core/replay.ts).
registerPowerHooks("DUPLICATION", () => ({
	powerId: "DUPLICATION",
	hooks: {
		atEndOfRound: (ctx) =>
			withCombat(ctx.state, (c) => ({
				...c,
				player: { ...c.player, powers: c.player.powers.filter((p) => p.id !== "DUPLICATION") },
			})),
	},
}));

// ── Hand / pile manipulation ─────────────────────────────

/** AbstractCard.canUpgrade: curses and statuses (except Burn) cannot be upgraded. */
function canUpgrade(card: CardInstance): boolean {
	const def = getCard(card.id);
	if (!def || card.upgraded) return false;
	if (def.type === "curse") return false;
	return def.type !== "status" || card.id === "BURN";
}

/** Upgrade in hand; a cost-lowering upgrade also lowers this turn's cost when it was unmodified. */
function upgradeInHand(card: CardInstance): CardInstance {
	const def = getCard(card.id);
	const newCost = def?.upgrade.cost;
	const unmodified = card.costOverride === null && card.costForTurn === def?.cost;
	return {
		...card,
		upgraded: true,
		costForTurn: unmodified && newCost != null ? newCost : card.costForTurn,
	};
}

registerPotionEffect("BLESSING_OF_THE_FORGE", () => [
	custom((st) =>
		withCombat(st, (c) => ({
			...c,
			hand: c.hand.map((x) => (canUpgrade(x) ? upgradeInHand(x) : x)),
		})),
	),
]);

registerPotionEffect("ELIXIR_POTION", () => [
	custom((st) => (st.combat?.hand.length ? openSelect("elixir")(st) : st)),
]);

registerPotionEffect("GAMBLERS_BREW", () => [
	custom((st) => (st.combat?.hand.length ? openSelect("gamble")(st) : st)),
]);

// BetterDiscardPileToHandAction: nothing to choose when the pile has no more cards than the amount.
registerPotionEffect("LIQUID_MEMORIES", (s) => [
	custom((st) => {
		const pile = st.combat?.discardPile ?? [];
		const n = bark(s) ? 2 : 1;
		if (pile.length === 0) return st;
		if (pile.length <= n)
			return returnFromDiscard(
				st,
				pile.map((_, i) => i),
			);
		return openSelect("liquidMemories")(st);
	}),
]);

// RandomizeHandCostAction: every card with a cost gets cardRandomRng.random(3) for the combat.
function randomizeHandCosts(st: GameState): GameState {
	const c = st.combat;
	if (!c) return st;
	let rng = st.rng.cardRandomRng;
	const hand = c.hand.map((card) => {
		const cost = card.costOverride ?? getCard(card.id)?.cost ?? -2;
		if (cost < 0) return card;
		const r = random(rng, 3);
		rng = r.state;
		if (r.value === cost) return { ...card, freeToPlay: false };
		return { ...card, costOverride: r.value, costForTurn: r.value, freeToPlay: false };
	});
	return { ...st, rng: { ...st.rng, cardRandomRng: rng }, combat: { ...c, hand } };
}

registerPotionEffect("SNECKO_OIL", () => [
	{ type: "drawCards", count: 5 },
	custom(randomizeHandCosts),
]);

// ── Choices ──────────────────────────────────────────────

function pseudoCard(id: string, uniqueId: number): CardInstance {
	return {
		id: id as CardId,
		uniqueId,
		upgraded: false,
		costOverride: null,
		costForTurn: -2,
		freeToPlay: false,
		misc: 0,
	};
}

registerPotionEffect("STANCE_POTION", () => [
	custom((st) =>
		openSelect(
			"stancePotion",
			Object.keys(STANCE_CHOICES).map((id, i) => pseudoCard(id, -1 - i)),
		)(st),
	),
]);

const COLOR: Record<string, string> = {
	IRONCLAD: "red",
	SILENT: "green",
	DEFECT: "blue",
	WATCHER: "purple",
};
const CLASS_COLORS = Object.values(COLOR);
const RARITY_ORDER = ["common", "uncommon", "rare"];

const isHealing = (c: CardDef) => (c.flags ?? []).includes("tag:healing");

/** srcCommon + srcUncommon + srcRare (Prismatic Shard: every color), no HEALING cards. */
function classCardsInCombat(s: GameState, type: string): CardDef[] {
	const colors = hasRelic(s, "PRISMATIC_SHARD") ? CLASS_COLORS : [COLOR[s.character] ?? "red"];
	const cards = getAllCards().filter(
		(c) =>
			colors.includes(c.color) &&
			c.pool === "class" &&
			c.type === type &&
			RARITY_ORDER.includes(c.rarity) &&
			!c.unobtainable &&
			!isHealing(c),
	);
	return RARITY_ORDER.flatMap((r) => cards.filter((c) => c.rarity === r));
}

function colorlessCardsInCombat(): CardDef[] {
	return getAllCards().filter((c) => c.pool === "colorless" && !c.unobtainable && !isHealing(c));
}

/** generateCardChoices: three different cards, rerolling duplicates, from cardRandomRng. */
function discoveryChoices(st: GameState, pool: CardDef[]): GameState {
	if (pool.length === 0 || !st.combat) return st;
	let rng = st.rng.cardRandomRng;
	const ids: string[] = [];
	const want = Math.min(3, new Set(pool.map((c) => c.id)).size);
	while (ids.length < want) {
		const r = random(rng, pool.length - 1);
		rng = r.state;
		const id = pool[r.value]?.id;
		if (id && !ids.includes(id)) ids.push(id);
	}
	const options = ids.map((id) => ({
		...pseudoCard(id, -1 - ids.indexOf(id)),
		costForTurn: getCard(id)?.cost ?? 0,
	}));
	return openSelect("potionDiscovery", options)({ ...st, rng: { ...st.rng, cardRandomRng: rng } });
}

for (const [id, type] of [
	["ATTACK_POTION", "attack"],
	["SKILL_POTION", "skill"],
	["POWER_POTION", "power"],
] as const) {
	registerPotionEffect(id, () => [
		custom((st) => discoveryChoices(st, classCardsInCombat(st, type))),
	]);
}
registerPotionEffect("COLORLESS_POTION", () => [
	custom((st) => discoveryChoices(st, colorlessCardsInCombat())),
]);

// ── Run-level ────────────────────────────────────────────

/**
 * Entropic Brew: one returnRandomPotion(true) per potion slot (Sozu: nothing).
 * Outside combat the original still holds the brew while filling, so its own
 * slot stays empty.
 */
registerPotionEffect("ENTROPIC_BREW", (s) => [
	custom((st) => {
		if (hasRelic(st, "SOZU")) return st;
		let out = st;
		let room = st.potions.filter((p) => p === null).length - (s.combat ? 0 : 1);
		for (let i = 0; i < st.potions.length; i++) {
			const r = randomPotion(out.rng.potionRng, out.character, true);
			out = { ...out, rng: { ...out.rng, potionRng: r.rng } };
			if (r.potion && room > 0) {
				out = obtainPotion(out, r.potion, []);
				room--;
			}
		}
		return out;
	}),
]);

// Smoke Bomb: leave the fight with no rewards (canUsePotion keeps it out of boss fights).
registerPotionEffect("SMOKE_BOMB", () => [
	custom((st) => ({ ...st, combat: null, phase: { type: "map" } })),
]);
