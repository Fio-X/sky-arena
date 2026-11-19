import type { CardDef, PotionDef, RelicDef } from "../content/loader";
import { getAllCards, getAllPotions, getAllRelics, getCard } from "../content/loader";
import { random } from "../rng/stsRandom";
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

	return {
		shop: {
			cards: cards.items,
			relics: relics.items,
			potions: potions.items,
			purgePrice: 75,
			purgeUsed: false,
		},
		rng,
	};
}

function generateShopCards(
	rng: RngState,
	character: GameState["character"],
): { items: ShopData["cards"][number][]; rng: RngState } {
	const colorMap = { IRONCLAD: "red", SILENT: "green", DEFECT: "blue", WATCHER: "purple" } as const;
	const charColor = colorMap[character] ?? "red";
	const classCards = getAllCards().filter(
		(c) =>
			c.color === charColor && !c.unobtainable && c.rarity !== "basic" && c.rarity !== "special",
	);
	const colorlessCards = getAllCards().filter(
		(c) =>
			c.color === "colorless" &&
			!c.unobtainable &&
			c.rarity !== "basic" &&
			c.rarity !== "special" &&
			c.rarity !== "curse",
	);

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
	const relicPool = getAllRelics().filter(
		(r) =>
			!r.unobtainable &&
			!ownedRelics.has(r.id as string) &&
			r.tier !== "boss" &&
			r.tier !== "event" &&
			r.tier !== "starter" &&
			r.tier !== "special",
	);

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
	const potionPool = getAllPotions().filter((p) => p.class === "shared" || p.class === "red");
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

	let s = { ...state, gold: state.gold - item.price };
	let newShop: ShopData;

	switch (item.kind) {
		case "card": {
			let uid = 1;
			for (const c of s.deck) {
				if (c.uniqueId >= uid) uid = c.uniqueId + 1;
			}
			const def = getCard(item.cardId as string);
			s = {
				...s,
				deck: [
					...s.deck,
					{
						id: item.cardId,
						uniqueId: uid,
						upgraded: false,
						costOverride: null,
						costForTurn: def?.cost ?? 1,
						freeToPlay: false,
						misc: 0,
					},
				],
			};
			newShop = {
				...shop,
				cards: shop.cards.map((c) =>
					c.cardId === item.cardId && !c.sold ? { ...c, sold: true } : c,
				),
			};
			break;
		}
		case "relic": {
			s = { ...s, relics: [...s.relics, { id: item.relicId, counter: 0 }] };
			newShop = {
				...shop,
				relics: shop.relics.map((r) =>
					r.relicId === item.relicId && !r.sold ? { ...r, sold: true } : r,
				),
			};
			break;
		}
		case "potion": {
			const emptySlot = s.potions.indexOf(null);
			if (emptySlot < 0) return { state, events };
			const newPotions = [...s.potions];
			newPotions[emptySlot] = item.potionId;
			s = { ...s, potions: newPotions };
			newShop = {
				...shop,
				potions: shop.potions.map((p) =>
					p.potionId === item.potionId && !p.sold ? { ...p, sold: true } : p,
				),
			};
			break;
		}
	}

	events.push({ type: "goldChanged", delta: -item.price });
	s = { ...s, phase: { type: "shop", shop: newShop } };
	return { state: s, events };
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
			...state,
			deck: newDeck,
			gold: state.gold - shop.purgePrice,
			phase: { type: "shop", shop: newShop },
		},
		events,
	};
}

type GameEvent = StepResult["events"][number];
