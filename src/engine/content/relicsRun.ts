/**
 * Run-level relics: pickup effects (onEquip), card-obtain effects
 * (onObtainCard), room-entry effects (onEnterRoom), gold (onGainGold) and the
 * +1 Energy boss relics. Relics whose effect lives in a run system are checked
 * there with hasRelic, like the original's player.hasRelic():
 * - card rewards (combat/cardReward.ts): Question Card, Busted Crown, N'loth's Gift, Prismatic Shard
 * - shop (core/shop.ts): Membership Card, The Courier, Smiling Mask, Maw Bank (spend), Sozu
 * - rewards/rest/map (core/step.ts, relicsRun2.ts): Prayer Wheel, Black Star, White Beast
 *   Statue, Regal Pillow, Dream Catcher, Coffee Dripper, Fusion Hammer, Girya, Peace Pipe,
 *   Shovel, Tiny Chest, Wing Boots, Cursed Key, Matryoshka, N'loth's Hungry Face, Singing Bowl
 * - gold rewards (core/bossReward.ts): Golden Idol; potions (core/potion.ts): Sozu
 * - obtainCard (core/obtain.ts): Omamori
 * No gameplay effect: Cultist Headpiece, Spirit Poop, Circlet, Red Circlet.
 * Frozen Eye: UI only (CardPileViewer shows draw pile in order).
 * Juzu Bracelet: inline in eventRoom.ts (? rooms never roll fights).
 */
import { obtainRandomPotion } from "../core/event";
import type { HookSource, HookTable } from "../core/hooks";
import { registerRelicHooks } from "../core/hooks";
import { obtainCard, obtainRelic } from "../core/obtain";
import { gainGold } from "../core/playerActions";
import type { CardInstance, GameState, PotionId } from "../core/types";
import { random } from "../rng/stsRandom";
import { getAllPotions, getCard } from "./loader";
import { addPlayerPower, heal, relicVal, setRelicCounter } from "./relicHelpers";
import {
	cardRewardPhase,
	deckSelectPhase,
	gainMaxHp,
	relicCounter,
	rollRandomRelic,
	trulyRandomCard,
	upgradeDeckCard,
	upgradeRandomCards,
} from "./relicsRun2";

function register(id: string, hooks: Partial<HookTable>): void {
	registerRelicHooks(id, (): HookSource => ({ relicId: id, hooks }));
}

// ═════════════════════════════════════════════════════════
// +1 ENERGY BOSS RELICS — energyMaster +1 (applied at combat start)
// ═════════════════════════════════════════════════════════

/** The original raises energyMaster on equip; combat starts at maxEnergy, so raise both. */
function plusOneEnergy(state: GameState): GameState {
	const c = state.combat;
	if (!c) return state;
	return { ...state, combat: { ...c, maxEnergy: c.maxEnergy + 1, energy: c.energy + 1 } };
}

// Downsides: Busted Crown (card rewards −2), Coffee Dripper (no Rest), Cursed Key (chest
// curse), Fusion Hammer (no Smith), Sozu (no potions) — see the files listed above.
for (const id of ["BUSTED_CROWN", "COFFEE_DRIPPER", "CURSED_KEY", "FUSION_HAMMER", "SOZU"]) {
	register(id, { atBattleStart: (ctx) => plusOneEnergy(ctx.state) });
}

// ═════════════════════════════════════════════════════════
// PICKUP: MAX HP / GOLD / POTIONS
// ═════════════════════════════════════════════════════════

register("STRAWBERRY", { onEquip: (ctx) => gainMaxHp(ctx.state, relicVal("STRAWBERRY", 0, 7)) });
register("PEAR", { onEquip: (ctx) => gainMaxHp(ctx.state, relicVal("PEAR", 0, 10)) });
register("MANGO", { onEquip: (ctx) => gainMaxHp(ctx.state, relicVal("MANGO", 0, 14)) });

// Lee's Waffle — +7 Max HP and heal to full
register("LEES_WAFFLE", {
	onEquip: (ctx) => {
		const s = gainMaxHp(ctx.state, relicVal("LEES_WAFFLE", 0, 7));
		return { ...s, currentHp: s.maxHp };
	},
});

// Old Coin — gain 300 gold (player.gainGold: Ectoplasm / Bloody Idol apply)
register("OLD_COIN", { onEquip: (ctx) => gainGold(ctx.state, 300, []) });

// Potion Belt — +2 potion slots
register("POTION_BELT", {
	onEquip: (ctx) => ({
		...ctx.state,
		potionSlots: ctx.state.potionSlots + 2,
		potions: [...ctx.state.potions, null, null],
	}),
});

// Cauldron — brew 5 random potions (assumption: kept while slots are free; the
// original's reward screen also lets you discard potions to make room)
register("CAULDRON", {
	onEquip: (ctx) => {
		let s = ctx.state;
		for (let i = 0; i < 5; i++) s = obtainRandomPotion(s);
		return s;
	},
});

// ═════════════════════════════════════════════════════════
// PICKUP: DECK CHANGES
// ═════════════════════════════════════════════════════════

register("WAR_PAINT", {
	onEquip: (ctx) => upgradeRandomCards(ctx.state, relicVal("WAR_PAINT", 0, 2), "skill"),
});
register("WHETSTONE", {
	onEquip: (ctx) => upgradeRandomCards(ctx.state, relicVal("WHETSTONE", 0, 2), "attack"),
});

const STARTER_STRIKE_DEFEND = /^(STRIKE|DEFEND)_(RED|GREEN|BLUE|PURPLE)$/;

// Pandora's Box — transform every starter Strike and Defend (returnTrulyRandomCard, cardRandomRng)
register("PANDORAS_BOX", {
	onEquip: (ctx) => {
		const removed = ctx.state.deck.filter((c) => STARTER_STRIKE_DEFEND.test(c.id as string));
		let s: GameState = {
			...ctx.state,
			deck: ctx.state.deck.filter((c) => !STARTER_STRIKE_DEFEND.test(c.id as string)),
		};
		const picks = [];
		for (let i = 0; i < removed.length; i++) {
			const r = trulyRandomCard(s);
			s = r.state;
			if (r.id) picks.push(r.id);
		}
		for (const id of picks) s = obtainCard(s, id);
		return s;
	},
});

// Calling Bell — Curse of the Bell, then a common, an uncommon and a rare relic
register("CALLING_BELL", {
	onEquip: (ctx) => {
		let s = obtainCard(ctx.state, "CURSE_OF_THE_BELL" as never);
		const picked: string[] = [];
		for (const tier of ["common", "uncommon", "rare"] as const) {
			const r = rollRandomRelic(s, picked, tier);
			s = r.state;
			if (r.id) picked.push(r.id);
		}
		for (const id of picked) s = obtainRelic(s, id as never);
		return s;
	},
});

// Choice pickups: the current phase (set by the caller) becomes the choice's `then`.
register("ASTROLABE", {
	onEquip: (ctx) => deckSelectPhase(ctx.state, "astrolabe", 3, ctx.state.phase),
});
register("EMPTY_CAGE", {
	onEquip: (ctx) => deckSelectPhase(ctx.state, "emptyCage", 2, ctx.state.phase),
});
register("DOLLYS_MIRROR", {
	onEquip: (ctx) => deckSelectPhase(ctx.state, "dollysMirror", 1, ctx.state.phase),
});

// Bottled relics: pick a card → counter stores uniqueId → atBattleStart moves it to hand
for (const [id, task] of [
	["BOTTLED_FLAME", "bottledFlame"],
	["BOTTLED_LIGHTNING", "bottledLightning"],
	["BOTTLED_TORNADO", "bottledTornado"],
] as const) {
	register(id, {
		onEquip: (ctx) => deckSelectPhase(ctx.state, task, 1, ctx.state.phase),
		atBattleStart: (ctx) => {
			const uid = relicCounter(ctx.state, id);
			if (!uid || !ctx.combat) return ctx.state;
			const idx = ctx.combat.drawPile.findIndex((c) => c.uniqueId === uid);
			if (idx < 0) return ctx.state;
			const card = ctx.combat.drawPile[idx]!;
			const drawPile = ctx.combat.drawPile.filter((_, i) => i !== idx);
			return {
				...ctx.state,
				combat: { ...ctx.combat, hand: [...ctx.combat.hand, card], drawPile },
			};
		},
	});
}

// Orrery — five card rewards, generated on pickup, taken one after another
register("ORRERY", {
	onEquip: (ctx) => {
		const next = ctx.state.phase;
		const rewards = [];
		let s = ctx.state;
		for (let i = 0; i < 5; i++) {
			s = cardRewardPhase(s, next);
			rewards.push(s.phase);
		}
		const chained = rewards.reduceRight((after, r) => ({ ...r, next: after }), next);
		return { ...s, phase: chained };
	},
});

/** AbstractDungeon.returnRandomPotion (potionRng); the engine's potion pool (shared + red). */
function randomPotion(state: GameState): { id: PotionId | null; state: GameState } {
	const pool = getAllPotions().filter((p) => p.class === "shared" || p.class === "red");
	if (pool.length === 0) return { id: null, state };
	const r = random(state.rng.potionRng, pool.length - 1);
	return {
		id: pool[r.value]?.id ?? null,
		state: { ...state, rng: { ...state.rng, potionRng: r.state } },
	};
}

// Tiny House — upgrade a random card, +5 Max HP, then a reward screen: 50 gold, a potion, a card
register("TINY_HOUSE", {
	onEquip: (ctx) => {
		const next = ctx.state.phase;
		let s = upgradeRandomCards(ctx.state, 1, null);
		s = gainMaxHp(s, relicVal("TINY_HOUSE", 1, 5));
		s = gainGold(s, 50, []);
		const potion = randomPotion(s);
		return cardRewardPhase(potion.state, next, { gold: 50, potion: potion.id });
	},
});

// ═════════════════════════════════════════════════════════
// COUNTERS SET ON PICKUP
// ═════════════════════════════════════════════════════════

register("OMAMORI", { onEquip: (ctx) => setRelicCounter(ctx.state, "OMAMORI", 2) });
register("MATRYOSHKA", { onEquip: (ctx) => setRelicCounter(ctx.state, "MATRYOSHKA", 2) });
register("NLOTHS_HUNGRY_FACE", {
	onEquip: (ctx) => setRelicCounter(ctx.state, "NLOTHS_HUNGRY_FACE", 1),
});
register("WING_BOOTS", { onEquip: (ctx) => setRelicCounter(ctx.state, "WING_BOOTS", 3) });

// Girya — Strength equal to the number of Lifts at the start of each combat
register("GIRYA", {
	atBattleStart: (ctx) => {
		const lifts = relicCounter(ctx.state, "GIRYA");
		return lifts > 0 ? addPlayerPower(ctx.state, "strength", lifts) : ctx.state;
	},
});

// ═════════════════════════════════════════════════════════
// CARD OBTAINED
// ═════════════════════════════════════════════════════════

register("CERAMIC_FISH", {
	onObtainCard: (ctx) => gainGold(ctx.state, relicVal("CERAMIC_FISH", 0, 9), []),
});

register("DARKSTONE_PERIAPT", {
	onObtainCard: (ctx, card) =>
		getCard(card.id)?.type === "curse" ? gainMaxHp(ctx.state, 6) : ctx.state,
});

function eggHook(type: "attack" | "skill" | "power") {
	return (ctx: { state: GameState }, card: CardInstance) =>
		getCard(card.id)?.type === type ? upgradeDeckCard(ctx.state, card.uniqueId) : ctx.state;
}
register("MOLTEN_EGG", { onObtainCard: eggHook("attack") });
register("TOXIC_EGG", { onObtainCard: eggHook("skill") });
register("FROZEN_EGG", { onObtainCard: eggHook("power") });

// ═════════════════════════════════════════════════════════
// ROOMS AND GOLD
// ═════════════════════════════════════════════════════════

// Maw Bank — +12 gold per floor until gold is spent at a shop (counter −2)
register("MAW_BANK", {
	onEnterRoom: (ctx) =>
		relicCounter(ctx.state, "MAW_BANK") === -2
			? ctx.state
			: gainGold(ctx.state, relicVal("MAW_BANK", 0, 12), []),
});

register("MEAL_TICKET", {
	onEnterRoom: (ctx, room) =>
		room === "shop" ? heal(ctx.state, relicVal("MEAL_TICKET", 0, 15)) : ctx.state,
});

register("SSSERPENT_HEAD", {
	onEnterRoom: (ctx, room) =>
		room === "event" ? gainGold(ctx.state, relicVal("SSSERPENT_HEAD", 0, 50), []) : ctx.state,
});

// Eternal Feather — entering a rest site: heal 3 per 5 cards in the deck
register("ETERNAL_FEATHER", {
	onEnterRoom: (ctx, room) => {
		if (room !== "rest") return ctx.state;
		const amount = Math.floor(ctx.state.deck.length / 5) * relicVal("ETERNAL_FEATHER", 1, 3);
		return heal(ctx.state, amount);
	},
});

// Ancient Tea Set — entering a rest site charges it (counter −2); next combat starts with +2 Energy
register("ANCIENT_TEA_SET", {
	onEnterRoom: (ctx, room) =>
		room === "rest" ? setRelicCounter(ctx.state, "ANCIENT_TEA_SET", -2) : ctx.state,
	atBattleStart: (ctx) => {
		if (relicCounter(ctx.state, "ANCIENT_TEA_SET") !== -2 || !ctx.state.combat) return ctx.state;
		const s = setRelicCounter(ctx.state, "ANCIENT_TEA_SET", -1);
		const c = ctx.state.combat;
		return { ...s, combat: { ...c, energy: c.energy + 2 } };
	},
});

// Bloody Idol — whenever gold is gained, heal 5
register("BLOODY_IDOL", {
	onGainGold: (ctx, amount) =>
		amount > 0 ? { value: amount, state: heal(ctx.state, relicVal("BLOODY_IDOL", 0, 5)) } : amount,
});
