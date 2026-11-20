/**
 * Shared helpers for the Act 1/2 ascension tests (ascensionAct12*.test.ts):
 * one-monster layouts, forced moves through endTurn, per-hit damage from events,
 * and the original game's HP table.
 */
import {
	card,
	endTurn,
	forceMove,
	monsterAt,
	patchMonster,
	startFight,
} from "../core/fightTestHelpers";
import { step } from "../core/step";
import type { CardInstance, GameState, MonsterId } from "../core/types";
import { registerEncounterLayout } from "./encounters";

export const SEEDS = Array.from({ length: 25 }, (_, i) => BigInt(i + 1));

/** One-monster layout so no other monster's buffs or debuffs touch the numbers. */
export function solo(id: string): string {
	const enc = `ASC12_${id}`;
	registerEncounterLayout(enc, [id as MonsterId]);
	return enc;
}

export const fight = (id: string, asc: number, seed = 1n, deck?: CardInstance[]) =>
	startFight(solo(id), seed, deck, asc);

/** End the turn; per-hit damage (before block) the monster in `slot` dealt to the player. */
export function endTurnHits(s: GameState, slot = 0): { state: GameState; hits: number[] } {
	const r = step(s, { type: "endTurn" });
	const hits = r.events.flatMap((e) =>
		e.type === "damageDealt" &&
		e.source.type === "monster" &&
		e.source.index === slot &&
		e.target.type === "player"
			? [e.amount + e.blocked]
			: [],
	);
	return { state: r.state, hits };
}

/** Run a forced move of a solo monster at `asc`; returns the state after the turn and the hits. */
export function run(id: string, move: string, asc: number, seed = 1n) {
	return endTurnHits(forceMove(fight(id, asc, seed), 0, move));
}

export const player = (s: GameState) => ({ powers: s.combat?.player.powers ?? [] });
export const discardCount = (s: GameState, id: string) =>
	(s.combat?.discardPile ?? []).filter((c) => c.id === id).length;
export const intentOf = (s: GameState, slot = 0) => monsterAt(s, slot).intent.moveId as string;
export const withEnergy = (s: GameState, energy = 99): GameState =>
	s.combat ? { ...s, combat: { ...s.combat, energy } } : s;
export const deckOf = (ids: string[]) => ids.map((id, i) => card(id, i + 1));

/** Intent rolled after `forced` runs on top of `history`, over many seeds. */
export function nextIntents(id: string, asc: number, history: string[], forced: string): string[] {
	return SEEDS.map((seed) => {
		let s = patchMonster(fight(id, asc, seed), 0, { moveHistory: history as never });
		s = endTurn(forceMove(s, 0, forced));
		return intentOf(s);
	});
}

// ── HP ─────────────────────────────────────────────────────

export type Range = [number, number];
export const HP: Array<[string, number, Range, Range]> = [
	// id, threshold, below, at/above
	["CULTIST", 7, [48, 54], [50, 56]],
	["JAW_WORM", 7, [40, 44], [42, 46]],
	["RED_LOUSE", 7, [10, 15], [11, 16]],
	["GREEN_LOUSE", 7, [11, 17], [12, 18]],
	["ACID_SLIME_S", 7, [8, 12], [9, 13]],
	["ACID_SLIME_M", 7, [28, 32], [29, 34]],
	["ACID_SLIME_L", 7, [65, 69], [68, 72]],
	["SPIKE_SLIME_S", 7, [10, 14], [11, 15]],
	["SPIKE_SLIME_M", 7, [28, 32], [29, 34]],
	["SPIKE_SLIME_L", 7, [64, 70], [67, 73]],
	["MAD_GREMLIN", 7, [20, 24], [21, 25]],
	["SNEAKY_GREMLIN", 7, [10, 14], [11, 15]],
	["FAT_GREMLIN", 7, [13, 17], [14, 18]],
	["SHIELD_GREMLIN", 7, [12, 15], [13, 17]],
	["GREMLIN_WIZARD", 7, [21, 25], [22, 26]],
	["LOOTER", 7, [44, 48], [46, 50]],
	["FUNGI_BEAST", 7, [22, 28], [24, 28]],
	["BLUE_SLAVER", 7, [46, 50], [48, 52]],
	["RED_SLAVER", 7, [46, 50], [48, 52]],
	["GREMLIN_NOB", 8, [82, 86], [85, 90]],
	["LAGAVULIN", 8, [109, 111], [112, 115]],
	["SENTRY", 8, [38, 42], [39, 45]],
	["SLIME_BOSS", 9, [140, 140], [150, 150]],
	["THE_GUARDIAN", 9, [240, 240], [250, 250]],
	["HEXAGHOST", 9, [250, 250], [264, 264]],
	["SPHERIC_GUARDIAN", 7, [20, 20], [20, 20]],
	["CHOSEN", 7, [95, 99], [98, 103]],
	["SHELLED_PARASITE", 7, [68, 72], [70, 75]],
	["BYRD", 7, [25, 31], [26, 33]],
	["MUGGER", 7, [48, 52], [50, 54]],
	["CENTURION", 7, [76, 80], [78, 83]],
	["MYSTIC", 7, [48, 56], [50, 58]],
	["SNAKE_PLANT", 7, [75, 79], [78, 82]],
	["SNECKO", 7, [114, 120], [120, 125]],
	["BEAR", 7, [38, 42], [40, 44]],
	["ROMEO", 7, [35, 39], [37, 41]],
	["POINTY", 7, [30, 30], [34, 34]],
	["BOOK_OF_STABBING", 8, [160, 164], [168, 172]],
	["GREMLIN_LEADER", 8, [140, 148], [145, 155]],
	["TASKMASTER", 8, [54, 60], [57, 64]],
	["BRONZE_AUTOMATON", 9, [300, 300], [320, 320]],
	["BRONZE_ORB", 9, [52, 58], [54, 60]],
	["THE_COLLECTOR", 9, [282, 282], [300, 300]],
	["TORCH_HEAD", 9, [38, 40], [40, 45]],
	["THE_CHAMP", 9, [420, 420], [440, 440]],
];
