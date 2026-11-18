/**
 * Content loader — loads card/relic/monster/event definitions from JSON.
 * JSON files are in data-reference/ and will be bundled or fetched at runtime.
 *
 * Type definitions here match the actual JSON structure (validated by schemas/).
 */

import type { CardId, MonsterId, PotionId, PowerId, RelicId } from "../core/types";

// ── Card definition (from cards.json) ─────────────────────

export type CardTarget = "enemy" | "allenemy" | "all" | "self" | "selfandenemy" | "none";

export interface CardDef {
	readonly id: CardId;
	readonly name: string;
	readonly gameId: string;
	readonly color: "red" | "green" | "blue" | "purple" | "colorless" | "curse";
	readonly type: "attack" | "skill" | "power" | "curse" | "status";
	readonly rarity: "basic" | "common" | "uncommon" | "rare" | "special" | "curse";
	readonly cost: number | null;
	readonly target: CardTarget;
	readonly values: {
		readonly damage: number | null;
		readonly block: number | null;
		readonly magic: number | null;
		readonly hits: number | null;
	};
	readonly flags: string[];
	readonly upgrade: {
		readonly cost: number | null;
		readonly damage: number | null;
		readonly block: number | null;
		readonly magic: number | null;
		readonly hits: number | null;
		readonly flags: string[];
	};
	readonly pool: string;
	readonly text: string;
	readonly noUpgrade?: boolean;
	readonly unobtainable?: boolean;
}

// ── Relic definition (from relics.json) ───────────────────

export interface RelicDef {
	readonly id: RelicId;
	readonly name: string;
	readonly gameId?: string | null;
	readonly tier: "common" | "uncommon" | "rare" | "boss" | "shop" | "event" | "starter" | "special";
	readonly pool: "shared" | "red" | "green" | "blue" | "purple";
	readonly counter: "combat" | "persistent" | "turn" | "none";
	readonly values: (number | null)[] | null;
	readonly text: string;
	readonly inCharacterPools?: string[];
	readonly lightspeedMissing?: boolean;
	readonly note?: string;
	readonly unobtainable?: boolean;
}

// ── Potion definition (from potions.json) ─────────────────

export interface PotionDef {
	readonly id: PotionId;
	readonly name: string;
	readonly gameId?: string;
	readonly rarity: "common" | "uncommon" | "rare";
	readonly class: string;
	readonly targeted: boolean;
	readonly text: string;
	readonly inClassPool?: string[];
	readonly potency?: Record<string, number>;
}

// ── Monster definition (from monsters-*.json) ─────────────

export type MoveStat = number | [number, number] | null;

export interface MonsterDef {
	readonly id: MonsterId;
	readonly name: string;
	readonly hp: {
		readonly base: [number, number];
		readonly asc: [number, number];
		readonly ascLevel: number;
	};
	readonly moves: Record<string, MonsterMoveDef>;
	readonly ai: MonsterAiDef;
	readonly acts?: number[];
	readonly category?: string;
	readonly prebattle?: unknown;
}

export interface MonsterMoveDef {
	readonly intent: string;
	readonly damage: MoveStat;
	readonly hits: MoveStat;
	readonly block?: MoveStat;
	readonly effects?: MonsterMoveEffect[];
	readonly asc?: Record<string, Partial<MonsterMoveDef>>;
}

export interface MonsterMoveEffect {
	readonly power?: string;
	readonly amount?: number;
	readonly target?: string;
}

export interface MonsterAiDef {
	readonly roll: string;
	readonly firstTurn?: string;
	readonly spec: string;
	readonly historyRules: string[];
}

// ── Power definition (from powers.json) ───────────────────

export interface PowerDef {
	readonly id: PowerId;
	readonly name: string;
	readonly kind: "buff" | "debuff";
	readonly stacking: "intensity" | "duration" | "none";
	readonly turnBased: boolean;
	readonly owner: "player" | "monster" | "both";
	readonly text: string;
	readonly notes?: string;
}

// ── Content registry ──────────────────────────────────────

const cards = new Map<string, CardDef>();
const relics = new Map<string, RelicDef>();
const potions = new Map<string, PotionDef>();
const monsters = new Map<string, MonsterDef>();
const powers = new Map<string, PowerDef>();

export function getCard(id: string): CardDef | undefined {
	return cards.get(id);
}

export function getRelic(id: string): RelicDef | undefined {
	return relics.get(id);
}

export function getPotion(id: string): PotionDef | undefined {
	return potions.get(id);
}

export function getMonster(id: string): MonsterDef | undefined {
	return monsters.get(id);
}

export function getPower(id: string): PowerDef | undefined {
	return powers.get(id);
}

export function getAllCards(): CardDef[] {
	return [...cards.values()];
}

export function getCardsByColor(color: CardDef["color"]): CardDef[] {
	return getAllCards().filter((c) => c.color === color);
}

export function getCardsByRarity(rarity: CardDef["rarity"]): CardDef[] {
	return getAllCards().filter((c) => c.rarity === rarity);
}

export function getAllRelics(): RelicDef[] {
	return [...relics.values()];
}

export function getRelicsByTier(tier: RelicDef["tier"]): RelicDef[] {
	return getAllRelics().filter((r) => r.tier === tier);
}

export function getAllPotions(): PotionDef[] {
	return [...potions.values()];
}

// ── Loaders (called once at startup) ──────────────────────

export function loadCards(data: CardDef[]): void {
	cards.clear();
	for (const c of data) cards.set(c.id, c);
}

export function loadRelics(data: RelicDef[]): void {
	relics.clear();
	for (const r of data) relics.set(r.id, r);
}

export function loadPotions(data: PotionDef[]): void {
	potions.clear();
	for (const p of data) potions.set(p.id, p);
}

export function loadMonsters(data: MonsterDef[]): void {
	for (const m of data) monsters.set(m.id, m);
}

export function loadPowers(data: PowerDef[]): void {
	powers.clear();
	for (const p of data) powers.set(p.id, p);
}
