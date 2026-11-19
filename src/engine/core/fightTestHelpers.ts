/**
 * Helpers for encounter-level tests: load all reference data, start a real
 * encounter through initCombat (so prebattle data, layouts and power-id
 * conversion are exercised), force a monster's next move, and end turns.
 */
import cardsJson from "../../../data-reference/cards.json";
import monstersAct1Json from "../../../data-reference/monsters-act1.json";
import monstersAct2Json from "../../../data-reference/monsters-act2.json";
import monstersAct34Json from "../../../data-reference/monsters-act34.json";
import powersJson from "../../../data-reference/powers.json";
import relicsJson from "../../../data-reference/relics.json";
import { getEncounterMonsters } from "../combat/encounters";
import { initCombat } from "../combat/init";
import { buildIntent } from "../combat/monsterTurn";
import "../content/index";
import { getMonster, loadCards, loadMonsters, loadPowers, loadRelics } from "../content/loader";
import { createAllStreams } from "../rng/stsRandom";
import { step } from "./step";
import type { CardId, CardInstance, GameState, MonsterMoveId, MonsterState } from "./types";

export const KNOWN_POWER_IDS = new Set(
	(powersJson as Array<{ id: string }>).map((p) => p.id.toUpperCase()),
);

export function loadAllData(): void {
	loadCards(cardsJson as never);
	loadPowers(powersJson as never);
	loadRelics(relicsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadMonsters(monstersAct2Json as never);
	loadMonsters(monstersAct34Json.monsters as never);
}

export function card(id: string, uid: number): CardInstance {
	return {
		id: id as CardId,
		uniqueId: uid,
		upgraded: false,
		costOverride: null,
		costForTurn: 1,
		freeToPlay: false,
		misc: 0,
	};
}

/** 5 Strikes + 5 Defends unless a deck is given. */
export function runState(seed: bigint, deck?: CardInstance[], ascension = 0): GameState {
	const cards =
		deck ?? [...Array(10).keys()].map((i) => card(i < 5 ? "STRIKE_RED" : "DEFEND_RED", i + 1));
	return {
		seed,
		character: "IRONCLAD",
		ascension,
		act: 2,
		floor: 20,
		gold: 99,
		maxHp: 999,
		currentHp: 999,
		potionSlots: 3,
		potions: [null, null, null],
		deck: cards,
		relics: [],
		map: { nodes: [], currentNode: null, visitedNodes: [] },
		combat: null,
		encounterIndex: { weak: 0, strong: 0, elite: 0 },
		encounterLists: { weak: [], strong: [], elites: [], boss: "" },
		rng: createAllStreams(seed),
		phase: { type: "map" },
	};
}

export function startFight(
	encounterId: string,
	seed = 1n,
	deck?: CardInstance[],
	ascension = 0,
): GameState {
	return initCombat(
		runState(seed, deck, ascension),
		getEncounterMonsters(encounterId),
		encounterId,
	);
}

export function monsterAt(s: GameState, i: number): MonsterState {
	const m = s.combat?.monsters[i];
	if (!m) throw new Error(`no monster at ${i}`);
	return m;
}

export function powerAmount(
	actor: { powers: readonly { id: string; amount: number }[] },
	id: string,
) {
	return actor.powers.find((p) => p.id.toUpperCase() === id)?.amount;
}

export function forceMove(s: GameState, i: number, moveId: string): GameState {
	const c = s.combat;
	if (!c) return s;
	const monsters = [...c.monsters];
	const m = monsterAt(s, i);
	if (!getMonster(m.id)?.moves[moveId]) throw new Error(`${m.id} has no move ${moveId}`);
	monsters[i] = {
		...m,
		intent: buildIntent(m, moveId as MonsterMoveId, s.ascension, s.currentHp),
	};
	return { ...s, combat: { ...c, monsters } };
}

export function patchMonster(s: GameState, i: number, patch: Partial<MonsterState>): GameState {
	const c = s.combat;
	if (!c) return s;
	const monsters = [...c.monsters];
	monsters[i] = { ...monsterAt(s, i), ...patch };
	return { ...s, combat: { ...c, monsters } };
}

export function endTurn(s: GameState): GameState {
	return step(s, { type: "endTurn" }).state;
}

/** Play a card by id; if it is not in hand, move it there from the draw/discard pile first. */
export function playCard(s: GameState, cardId: string, target = 0): GameState {
	let st = s;
	let idx = st.combat?.hand.findIndex((c) => c.id === cardId) ?? -1;
	if (idx < 0) {
		const c = st.combat;
		const found =
			c?.drawPile.find((x) => x.id === cardId) ?? c?.discardPile.find((x) => x.id === cardId);
		if (!c || !found) throw new Error(`${cardId} not in combat piles`);
		st = moveCard(st, found.uniqueId, "hand");
		idx = (st.combat?.hand.length ?? 1) - 1;
	}
	return step(st, { type: "playCard", handIndex: idx, targetIndex: target }).state;
}

/** Move a card (by uniqueId) from any combat pile to the end of `to` (end of drawPile = top). */
export function moveCard(s: GameState, uid: number, to: "hand" | "drawPile"): GameState {
	const c = s.combat;
	if (!c) return s;
	const all = [...c.hand, ...c.drawPile, ...c.discardPile];
	const found = all.find((x) => x.uniqueId === uid);
	if (!found) return s;
	const strip = (pile: readonly CardInstance[]) => pile.filter((x) => x.uniqueId !== uid);
	const hand = strip(c.hand);
	const drawPile = strip(c.drawPile);
	const discardPile = strip(c.discardPile);
	const next =
		to === "hand"
			? { ...c, hand: [...hand, found], drawPile, discardPile }
			: { ...c, hand, drawPile: [...drawPile, found], discardPile };
	return { ...s, combat: next };
}

export function aliveIds(s: GameState): string[] {
	return (s.combat?.monsters ?? []).filter((m) => m.alive).map((m) => m.id as string);
}
