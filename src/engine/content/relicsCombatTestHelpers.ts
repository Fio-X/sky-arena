/**
 * Test helpers for the combat relic tests: enter a one-node map room through
 * step(chooseMapNode) so combat init, atBattleStart and the room type are the
 * real ones.
 */
import { card, runState } from "../core/fightTestHelpers";
import { step } from "../core/step";
import type {
	CardInstance,
	CharacterId,
	CombatState,
	GameState,
	RelicId,
	RoomType,
} from "../core/types";
import { getCard } from "./loader";

export interface RoomOpts {
	readonly room?: RoomType;
	readonly enc?: string;
	readonly deck?: CardInstance[];
	readonly character?: CharacterId;
	readonly hp?: number;
	readonly maxHp?: number;
	readonly counters?: Readonly<Record<string, number>>;
}

export function roomState(relics: readonly string[], opts: RoomOpts = {}): GameState {
	const enc = opts.enc ?? "CULTIST";
	const base = runState(1n, opts.deck);
	return {
		...base,
		character: opts.character ?? "IRONCLAD",
		maxHp: opts.maxHp ?? base.maxHp,
		currentHp: opts.hp ?? base.currentHp,
		relics: relics.map((id) => ({ id: id as RelicId, counter: opts.counters?.[id] ?? 0 })),
		map: {
			nodes: [[{ x: 0, y: 0, type: opts.room ?? "monster", edges: [] }]],
			currentNode: null,
			visitedNodes: [],
		},
		encounterLists: { weak: [enc], strong: [enc], elites: [enc], boss: enc },
	};
}

/** Enter the room (step chooseMapNode): combat starts and atBattleStart fires. */
export function enter(relics: readonly string[], opts: RoomOpts = {}): GameState {
	return step(roomState(relics, opts), { type: "chooseMapNode", x: 0, y: 0 }).state;
}

export function combat(s: GameState): CombatState {
	if (!s.combat) throw new Error("not in combat");
	return s.combat;
}

/** Deck card with its real cost. */
export function deckCard(id: string, uid: number): CardInstance {
	return { ...card(id, uid), costForTurn: getCard(id)?.cost ?? 1 };
}

export function deckOf(ids: readonly string[]): CardInstance[] {
	return ids.map((id, i) => deckCard(id, i + 1));
}

export function withCombat(s: GameState, patch: Partial<CombatState>): GameState {
	return { ...s, combat: { ...combat(s), ...patch } };
}

export function counterOf(s: GameState, id: string): number | undefined {
	return s.relics.find((r) => r.id === id)?.counter;
}
