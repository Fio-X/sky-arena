import type { CardDef, PotionDef, RelicDef } from "../content/loader";
import { getAllCards, getAllPotions, getAllRelics } from "../content/loader";
import { random } from "../rng/stsRandom";
import { hasRelic, obtainCard, obtainRelic } from "./obtain";
import type { GameState, RngState, ShopData, StepResult } from "./types";

// ── Price tables (STS base values) ──────────────────────

function cardBasePrice(rarity: CardDef["rarity"]): [number, number] {
	switch (rarity) {
		case "rare":
			return [150, 182];
		case "uncommon":
			return [68, 82];
		default:
			return [50, 62];
	}
}

function relicBasePrice(tier: RelicDef["tier"]): [number, number] {
	switch (tier) {
		case "rare":
			return [285, 315];
		case "uncommon":
			return [238, 262];
		default:
			return [143, 157];
	}
}

function potionBasePrice(rarity: PotionDef["rarity"]): [number, number] {
	switch (rarity) {
		case "rare":
			return [95, 105];
		case "uncommon":
			return [72, 78];
		default:
			return [48, 52];
	}
}

function rollPrice(rng: RngState, range: [number, number]): { price: number; rng: RngState } {
	const spread = range[1] - range[0];
	const r = random(rng, spread);
	return { price: range[0] + r.value, rng: r.state };
}

function pickRandom<T>(rng: RngState, pool: T[]): { item: T; rng: RngState } | null {
	if (pool.length === 0) return null;
	const r = random(rng, pool.length - 1);
	return { item: pool[r.value]!, rng: r.state };
}

// ── Pools ───────────────────────────────────────────────

function shopCardPools(character: GameState["character"]): {
	cls: CardDef[];
	colorless: CardDef[];
} {
	const colorMap = { IRONCLAD: "red", SILENT: "green", DEFECT: "blue", WATCHER: "purple" } as const;
	const charColor = colorMap[character] ?? "red";
	const cls = getAllCards().filter(
		(c) =>
			c.color === charColor && !c.unobtainable && c.rarity !== "basic" && c.rarity !== "special",
	);
	const colorless = getAllCards().filter(
		(c) =>
			c.color === "colorless" &&
			!c.unobtainable &&
			c.rarity !== "basic" &&
			c.rarity !== "special" &&
			c.rarity !== "curse",
	);
	return { cls, colorless };
}

function shopRelicPool(ownedRelics: Set<string>): RelicDef[] {
	return getAllRelics().filter(
		(r) =>
			!r.unobtainable &&
			!ownedRelics.has(r.id as string) &&
			r.tier !== "boss" &&
			r.tier !== "event" &&
			r.tier !== "starter" &&
			r.tier !== "special",
	);
}

function shopPotionPool(): PotionDef[] {
	return getAllPotions().filter((p) => p.class === "shared" || p.class === "red");
}

// ── Generate shop inventory ─────────────────────────────

export function generateShop(state: GameState): { shop: ShopData; rng: RngState } {
	let rng = state.rng.merchantRng;
	const ownedRelics = new Set(state.relics.map((r) => r.id as string));

	const cards = generateShopCards(rng, state.character);
	rng = cards.rng;

	const relics = generateShopRelics(rng, ownedRelics);
	rng = relics.rng;

	const potions = generateShopPotions(rng);
	rng = potions.rng;

	let shop: ShopData = {
		cards: cards.items,
		relics: relics.items,
		potions: potions.items,
		purgePrice: 75,
		purgeUsed: false,
	};
	// ShopScreen.init: The Courier ×0.8, then Membership Card ×0.5; Smiling Mask fixes purge at 50.
	if (hasRelic(state, "THE_COURIER")) shop = applyDiscount(state, shop, 0.8);
	if (hasRelic(state, "MEMBERSHIP_CARD")) shop = applyDiscount(state, shop, 0.5);
	if (hasRelic(state, "SMILING_MASK")) shop = { ...shop, purgePrice: 50 };
	return { shop, rng };
}

const roundPrice = (p: number, multiplier: number) => Math.floor(p * multiplier + 0.5);

/** ShopScreen.applyDiscount(multiplier, affectPurge=true): MathUtils.round on every price. */
function applyDiscount(state: GameState, shop: ShopData, multiplier: number): ShopData {
	return {
		...shop,
		cards: shop.cards.map((c) => ({ ...c, price: roundPrice(c.price, multiplier) })),
		relics: shop.relics.map((r) => ({ ...r, price: roundPrice(r.price, multiplier) })),
		potions: shop.potions.map((p) => ({ ...p, price: roundPrice(p.price, multiplier) })),
		purgePrice: hasRelic(state, "SMILING_MASK") ? 50 : roundPrice(shop.purgePrice, multiplier),
	};
}

function generateShopCards(
	rng: RngState,
	character: GameState["character"],
): { items: ShopData["cards"][number][]; rng: RngState } {
	const { cls: classCards, colorless: colorlessCards } = shopCardPools(character);

	const items: ShopData["cards"][number][] = [];
	const used = new Set<string>();

	for (let i = 0; i < 3; i++) {
		const pool = classCards.filter((c) => !used.has(c.id as string));
		const pick = pickRandom(rng, pool);
		if (!pick) break;
		rng = pick.rng;
		used.add(pick.item.id as string);
		const pr = rollPrice(rng, cardBasePrice(pick.item.rarity));
		rng = pr.rng;
		items.push({ kind: "card", cardId: pick.item.id, price: pr.price, sold: false });
	}

	for (let i = 0; i < 2; i++) {
		const pool = colorlessCards.filter((c) => !used.has(c.id as string));
		const pick = pickRandom(rng, pool);
		if (!pick) break;
		rng = pick.rng;
		used.add(pick.item.id as string);
		const pr = rollPrice(rng, cardBasePrice(pick.item.rarity));
		rng = pr.rng;
		items.push({ kind: "card", cardId: pick.item.id, price: pr.price, sold: false });
	}

	return { items, rng };
}

function generateShopRelics(
	rng: RngState,
	ownedRelics: Set<string>,
): { items: ShopData["relics"][number][]; rng: RngState } {
	const relicPool = shopRelicPool(ownedRelics);

	const items: ShopData["relics"][number][] = [];
	const used = new Set<string>();

	const shopTier = relicPool.filter((r) => r.tier === "shop");
	const shopPick = pickRandom(rng, shopTier);
	if (shopPick) {
		rng = shopPick.rng;
		used.add(shopPick.item.id as string);
		const pr = rollPrice(rng, relicBasePrice("common"));
		rng = pr.rng;
		items.push({ kind: "relic", relicId: shopPick.item.id, price: pr.price, sold: false });
	}

	const tiers: RelicDef["tier"][] = ["common", "uncommon", "rare"];
	for (const tier of tiers) {
		if (items.length >= 3) break;
		const pool = relicPool.filter((r) => r.tier === tier && !used.has(r.id as string));
		const pick = pickRandom(rng, pool);
		if (!pick) continue;
		rng = pick.rng;
		used.add(pick.item.id as string);
		const pr = rollPrice(rng, relicBasePrice(tier));
		rng = pr.rng;
		items.push({ kind: "relic", relicId: pick.item.id, price: pr.price, sold: false });
	}

	return { items, rng };
}

function generateShopPotions(rng: RngState): {
	items: ShopData["potions"][number][];
	rng: RngState;
} {
	const potionPool = shopPotionPool();
	const items: ShopData["potions"][number][] = [];
	const used = new Set<string>();

	for (let i = 0; i < 3; i++) {
		const pool = potionPool.filter((p) => !used.has(p.id as string));
		const pick = pickRandom(rng, pool);
		if (!pick) break;
		rng = pick.rng;
		used.add(pick.item.id as string);
		const pr = rollPrice(rng, potionBasePrice(pick.item.rarity));
		rng = pr.rng;
		items.push({ kind: "potion", potionId: pick.item.id, price: pr.price, sold: false });
	}

	return { items, rng };
}

// ── Buy item from shop ──────────────────────────────────

export function stepChooseShopItem(
	state: GameState,
	index: number,
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "shop") return { state, events };
	const shop = state.phase.shop;

	const allItems = [...shop.cards, ...shop.relics, ...shop.potions];
	const item = allItems[index];
	if (!item || item.sold) return { state, events };
	if (state.gold < item.price) return { state, events };
	// Sozu: StorePotion.purchasePotion refuses.
	if (item.kind === "potion" && (state.potions.indexOf(null) < 0 || hasRelic(state, "SOZU"))) {
		return { state, events };
	}

	events.push({ type: "goldChanged", delta: -item.price });
	const bought = item.kind === "relic" ? (item.relicId as string) : null;
	const restocked = afterPurchase(state, shop, index, bought);
	// The shop phase is set before obtaining, so a pickup choice (Orrery…) returns to it.
	let s: GameState = {
		...spendGold(state, item.price),
		rng: { ...state.rng, merchantRng: restocked.rng },
		phase: { type: "shop", shop: restocked.shop },
	};

	switch (item.kind) {
		case "card":
			s = obtainCard(s, item.cardId);
			break;
		case "relic":
			s = obtainRelic(s, item.relicId);
			break;
		case "potion": {
			const newPotions = [...s.potions];
			newPotions[s.potions.indexOf(null)] = item.potionId;
			s = { ...s, potions: newPotions };
			break;
		}
	}
	return { state: s, events };
}

/** Spending gold at the shop: Maw Bank stops working (onSpendGold → counter −2). */
function spendGold(state: GameState, amount: number): GameState {
	return {
		...state,
		gold: state.gold - amount,
		relics: state.relics.map((r) => (r.id === "MAW_BANK" ? { ...r, counter: -2 } : r)),
	};
}

/**
 * StoreRelic/StoreCard/StorePotion purchase: a bought Courier or Membership Card
 * discounts the shop at once, Smiling Mask fixes the purge cost; with The Courier
 * the slot restocks, otherwise it is marked sold.
 */
function afterPurchase(
	state: GameState,
	shop: ShopData,
	index: number,
	boughtRelic: string | null,
): { shop: ShopData; rng: RngState } {
	const owns = (id: string) => hasRelic(state, id) || boughtRelic === id;
	let s = shop;
	if (boughtRelic === "THE_COURIER") s = applyDiscount(state, s, 0.8);
	if (boughtRelic === "MEMBERSHIP_CARD") s = applyDiscount(state, s, 0.5);
	if (boughtRelic === "SMILING_MASK") s = { ...s, purgePrice: 50 };
	if (!owns("THE_COURIER")) return { shop: markSold(s, index), rng: state.rng.merchantRng };
	const multiplier = (owns("THE_COURIER") ? 0.8 : 1) * (owns("MEMBERSHIP_CARD") ? 0.5 : 1);
	return restockSlot(state, s, index, multiplier, boughtRelic);
}

function markSold(shop: ShopData, index: number): ShopData {
	const nc = shop.cards.length;
	const nr = shop.relics.length;
	const sold = <T extends { sold: boolean }>(arr: readonly T[], i: number) =>
		arr.map((x, j) => (j === i ? { ...x, sold: true } : x));
	if (index < nc) return { ...shop, cards: sold(shop.cards, index) };
	if (index < nc + nr) return { ...shop, relics: sold(shop.relics, index - nc) };
	return { ...shop, potions: sold(shop.potions, index - nc - nr) };
}

/**
 * The Courier restock (assumption: drawn with merchantRng like the rest of this
 * shop): a class card of the same type, a colorless card of the same rarity, a
 * relic of a rolled shop tier (48/34/18), or a random potion; not already shown.
 */
function restockSlot(
	state: GameState,
	shop: ShopData,
	index: number,
	multiplier: number,
	boughtRelic: string | null,
): { shop: ShopData; rng: RngState } {
	const nc = shop.cards.length;
	const nr = shop.relics.length;
	const rng = state.rng.merchantRng;
	const fallback = { shop: markSold(shop, index), rng };
	if (index < nc) {
		const r = restockCard(state, shop, index, rng);
		if (!r) return fallback;
		const cards = shop.cards.map((c, i) =>
			i === index ? { ...c, cardId: r.def.id, price: roundPrice(r.price, multiplier) } : c,
		);
		return { shop: { ...shop, cards }, rng: r.rng };
	}
	if (index < nc + nr) {
		const r = restockRelic(state, shop, boughtRelic, rng);
		if (!r) return fallback;
		const relics = shop.relics.map((x, i) =>
			i === index - nc ? { ...x, relicId: r.def.id, price: roundPrice(r.price, multiplier) } : x,
		);
		return { shop: { ...shop, relics }, rng: r.rng };
	}
	const pool = shopPotionPool().filter((p) => !shop.potions.some((x) => x.potionId === p.id));
	const pick = pickRandom(rng, pool);
	if (!pick) return fallback;
	const pr = rollPrice(pick.rng, potionBasePrice(pick.item.rarity));
	const potions = shop.potions.map((x, i) =>
		i === index - nc - nr
			? { ...x, potionId: pick.item.id, price: roundPrice(pr.price, multiplier) }
			: x,
	);
	return { shop: { ...shop, potions }, rng: pr.rng };
}

function restockCard(state: GameState, shop: ShopData, index: number, rng: RngState) {
	const old = getAllCards().find((c) => c.id === shop.cards[index]?.cardId);
	if (!old) return null;
	const pools = shopCardPools(state.character);
	const shown = new Set(shop.cards.map((c) => c.cardId as string));
	const pool =
		old.color === "colorless"
			? pools.colorless.filter((c) => c.rarity === old.rarity)
			: pools.cls.filter((c) => c.type === old.type);
	const pick = pickRandom(
		rng,
		pool.filter((c) => !shown.has(c.id as string)),
	);
	if (!pick) return null;
	const pr = rollPrice(pick.rng, cardBasePrice(pick.item.rarity));
	return { def: pick.item, price: pr.price, rng: pr.rng };
}

function restockRelic(state: GameState, shop: ShopData, boughtRelic: string | null, rng: RngState) {
	const owned = new Set(state.relics.map((r) => r.id as string));
	if (boughtRelic) owned.add(boughtRelic);
	for (const r of shop.relics) owned.add(r.relicId as string);
	const tierRoll = random(rng, 99);
	const tier = tierRoll.value < 48 ? "common" : tierRoll.value < 82 ? "uncommon" : "rare";
	const pool = shopRelicPool(owned).filter((r) => r.tier === tier);
	const pick = pickRandom(tierRoll.state, pool);
	if (!pick) return null;
	const pr = rollPrice(pick.rng, relicBasePrice(pick.item.tier));
	return { def: pick.item, price: pr.price, rng: pr.rng };
}

// ── Purge card from deck ────────────────────────────────

export function stepShopPurge(
	state: GameState,
	cardIndex: number,
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "shop") return { state, events };
	const shop = state.phase.shop;
	if (shop.purgeUsed || state.gold < shop.purgePrice) return { state, events };
	if (cardIndex < 0 || cardIndex >= state.deck.length) return { state, events };

	const newDeck = state.deck.filter((_, i) => i !== cardIndex);
	const newShop: ShopData = { ...shop, purgeUsed: true };
	events.push({ type: "goldChanged", delta: -shop.purgePrice });
	return {
		state: {
			...spendGold(state, shop.purgePrice),
			deck: newDeck,
			phase: { type: "shop", shop: newShop },
		},
		events,
	};
}

type GameEvent = StepResult["events"][number];
