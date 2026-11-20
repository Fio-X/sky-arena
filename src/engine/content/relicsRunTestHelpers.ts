/** Helpers for the run-level relic tests (relicsRun*.test.ts): small maps, shops, fights. */
import eventsJson from "../../../data-reference/events.json";
import potionsJson from "../../../data-reference/potions.json";
import { loadEvents } from "../core/event";
import { loadAllData, patchMonster, playCard, runState } from "../core/fightTestHelpers";
import { obtainRelic } from "../core/obtain";
import { initPotionPool } from "../core/potion";
import { step } from "../core/step";
import type {
	CardId,
	Command,
	GameState,
	MapNode,
	PotionId,
	RelicId,
	RoomType,
	ShopData,
} from "../core/types";
import { loadPotions } from "./loader";

export function loadRunData(): void {
	loadAllData();
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
	loadEvents(eventsJson as never);
}

/** One column of rooms (x = 0), each linked to the next; extra nodes may be appended. */
export function linearMap(types: RoomType[], extra: MapNode[] = []): GameState["map"] {
	const nodes: MapNode[][] = types.map((type, y) => [
		{ x: 0, y, type, edges: y < types.length - 1 ? [{ x: 0, y: y + 1 }] : [] },
	]);
	for (const n of extra) (nodes[n.y] as MapNode[]).push(n);
	return { nodes, currentNode: null, visitedNodes: [] };
}

/** Act 1, 80 max HP / 50 HP / 100 gold, 5 Strikes + 5 Defends; relics obtained via obtainRelic. */
export function base(rooms: RoomType[] = ["monster"], relics: string[] = []): GameState {
	let s: GameState = {
		...runState(7n),
		act: 1,
		floor: 0,
		maxHp: 80,
		currentHp: 50,
		gold: 100,
		map: linearMap(rooms),
		encounterLists: {
			weak: ["CULTIST", "CULTIST"],
			strong: ["CULTIST"],
			elites: ["GREMLIN_NOB"],
			boss: "THE_GUARDIAN",
		},
	};
	for (const id of relics) s = obtainRelic(s, id as RelicId);
	return s;
}

export function run(s: GameState, ...commands: Command[]): GameState {
	return commands.reduce((st, c) => step(st, c).state, s);
}

export const enter = (s: GameState, y: number, x = 0) => run(s, { type: "chooseMapNode", x, y });

/** Enter the fight at row y and win it with one Strike. */
export function winFight(s: GameState, y: number, x = 0): GameState {
	const fight = patchMonster(enter(s, y, x), 0, { currentHp: 1 });
	return playCard(fight, "STRIKE_RED");
}

export const counter = (s: GameState, id: string) => s.relics.find((r) => r.id === id)?.counter;
export const ids = (s: GameState) => s.deck.map((c) => c.id as string);

export function rewardPhase(cards: string[], potion: string | null = null): GameState["phase"] {
	return {
		type: "reward",
		cardRewards: cards as CardId[],
		potionReward: potion as PotionId | null,
		gold: 0,
	};
}

export function potionItem(id: string, price: number) {
	return { kind: "potion" as const, potionId: id as PotionId, price, sold: false };
}
export function relicItem(id: string, price: number) {
	return { kind: "relic" as const, relicId: id as RelicId, price, sold: false };
}
export function cardItem(id: string, price: number) {
	return { kind: "card" as const, cardId: id as CardId, price, sold: false };
}

export function shopWith(
	items: Partial<ShopData>,
	relics: string[] = [],
	s0?: GameState,
): GameState {
	const shop: ShopData = {
		cards: [],
		relics: [],
		potions: [],
		purgePrice: 75,
		purgeUsed: false,
		...items,
	};
	return { ...(s0 ?? base([], relics)), phase: { type: "shop", shop } };
}

/** Buy a relic at a shop (real purchase path, onEquip fires). */
export function buyRelic(id: string, s0?: GameState): GameState {
	return run(shopWith({ relics: [relicItem(id, 0)] }, [], s0), {
		type: "chooseShopItem",
		index: 0,
	});
}
