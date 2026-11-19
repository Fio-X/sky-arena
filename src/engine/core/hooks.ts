import type {
	ActorRef,
	CardInstance,
	CombatState,
	GameState,
	PowerId,
	PowerInstance,
	RelicInstance,
	StanceId,
} from "./types";

// ── Hook source: a power or relic that can respond to hooks ──

export interface HookSource {
	readonly powerId?: string;
	readonly relicId?: string;
	readonly hooks: Partial<HookTable>;
}

// ── Context passed to every hook ──────────────────────────

export interface HookCtx {
	readonly state: GameState;
	readonly combat: CombatState;
	readonly owner: ActorRef;
}

// ── Fold result: fold hooks can modify both value and state ──

export interface FoldResult {
	readonly value: number;
	readonly state: GameState;
}

// ── The hook table: all possible hooks and their signatures ──

export interface HookTable {
	// Turn structure
	atBattleStartPreDraw: (ctx: HookCtx) => GameState;
	atBattleStart: (ctx: HookCtx) => GameState;
	atStartOfTurn: (ctx: HookCtx) => GameState;
	atStartOfTurnPostDraw: (ctx: HookCtx) => GameState;
	atEndOfTurn: (ctx: HookCtx, isPlayerTurn: boolean) => GameState;
	atEndOfRound: (ctx: HookCtx) => GameState;
	onEnergyRecharge: (ctx: HookCtx) => GameState;

	// Card lifecycle
	onUseCard: (ctx: HookCtx, card: CardInstance) => GameState;
	onAfterCardPlayed: (ctx: HookCtx, card: CardInstance) => GameState;
	onDraw: (ctx: HookCtx, card: CardInstance) => GameState;
	onManualDiscard: (ctx: HookCtx, card: CardInstance) => GameState;
	onEndOfTurnDiscard: (ctx: HookCtx, card: CardInstance) => GameState;
	onExhaust: (ctx: HookCtx, card: CardInstance) => GameState;
	onShuffle: (ctx: HookCtx) => GameState;
	onRetain: (ctx: HookCtx, card: CardInstance) => GameState;
	onScry: (ctx: HookCtx, count: number) => GameState;

	// Damage pipeline (fold — returns number or FoldResult)
	atDamageGive: (ctx: HookCtx, damage: number, card: CardInstance | null) => number | FoldResult;
	atDamageFinalGive: (
		ctx: HookCtx,
		damage: number,
		card: CardInstance | null,
	) => number | FoldResult;
	atDamageReceive: (ctx: HookCtx, damage: number, card: CardInstance | null) => number | FoldResult;
	atDamageFinalReceive: (
		ctx: HookCtx,
		damage: number,
		card: CardInstance | null,
	) => number | FoldResult;

	// Notifications
	onAttack: (ctx: HookCtx, damage: number, target: ActorRef) => GameState;
	onAttacked: (ctx: HookCtx, damage: number, source: ActorRef) => GameState;
	onLoseHp: (ctx: HookCtx, amount: number) => GameState;
	wasHPLost: (ctx: HookCtx, amount: number) => GameState;
	onMonsterDeath: (ctx: HookCtx, monsterIndex: number) => GameState;
	onVictory: (ctx: HookCtx) => GameState;

	// Block (fold)
	modifyBlock: (ctx: HookCtx, block: number, card: CardInstance | null) => number | FoldResult;
	onGainedBlock: (ctx: HookCtx, amount: number) => GameState;

	// Card cost (fold)
	modifyCardCost: (ctx: HookCtx, cost: number, card: CardInstance) => number | FoldResult;

	// Draw (fold)
	modifyDrawPerTurn: (ctx: HookCtx, draw: number) => number | FoldResult;
	modifyBlockRetention: (ctx: HookCtx, retained: number) => number | FoldResult;

	// Heal (fold)
	onHeal: (ctx: HookCtx, amount: number) => number | FoldResult;

	// Powers
	onApplyPower: (ctx: HookCtx, powerId: string, amount: number) => boolean;

	// Defect
	onChannel: (ctx: HookCtx, orbType: string) => GameState;
	onEvoke: (ctx: HookCtx, orbType: string) => GameState;
	modifyFocus: (ctx: HookCtx, focus: number) => number | FoldResult;

	// Watcher
	onChangeStance: (ctx: HookCtx, from: StanceId, to: StanceId) => GameState;

	// Run-level
	onGainGold: (ctx: HookCtx, amount: number) => number | FoldResult;
	onEnterRoom: (ctx: HookCtx) => GameState;
	onUsePotion: (ctx: HookCtx, potionId: string) => GameState;
	modifyPrice: (ctx: HookCtx, price: number) => number | FoldResult;

	// Boolean checks (any-true)
	retainsEnergy: (ctx: HookCtx) => boolean;
	retainsHand: (ctx: HookCtx) => boolean;
	canPlayCard: (ctx: HookCtx, card: CardInstance) => boolean;
}

// ── Collect hook sources in correct order ─────────────────
// Player: powers (application order) → stance → relics (obtain order)
// Monster: that monster's powers (application order)

function playerSources(state: GameState): HookSource[] {
	if (!state.combat) return [];
	const sources: HookSource[] = [];
	for (const p of state.combat.player.powers) {
		const def = getPowerHooks(p);
		if (def) sources.push(def);
	}
	// stance hooks would go here
	for (const r of state.relics) {
		const def = getRelicHooks(r);
		if (def) sources.push(def);
	}
	return sources;
}

function monsterSources(state: GameState, index: number): HookSource[] {
	if (!state.combat) return [];
	const monster = state.combat.monsters[index];
	if (!monster) return [];
	const sources: HookSource[] = [];
	for (const p of monster.powers) {
		const def = getPowerHooks(p);
		if (def) sources.push(def);
	}
	return sources;
}

function getSources(state: GameState, actor: ActorRef): HookSource[] {
	return actor.type === "player" ? playerSources(state) : monsterSources(state, actor.index);
}

function makeCtx(state: GameState, actor: ActorRef): HookCtx | null {
	if (!state.combat) return null;
	return { state, combat: state.combat, owner: actor };
}

// ── Hook dispatchers ──────────────────────────────────────

export function fireHook<K extends keyof HookTable>(
	state: GameState,
	actor: ActorRef,
	hookName: K,
	...args: DropFirst<Parameters<HookTable[K]>>
): GameState {
	const sources = getSources(state, actor);
	let current = state;
	for (const source of sources) {
		const fn = source.hooks[hookName] as ((...a: unknown[]) => GameState) | undefined;
		if (fn) {
			const ctx = makeCtx(current, actor);
			if (!ctx) break;
			current = fn(ctx, ...args);
		}
	}
	return current;
}

export function foldHook<K extends FoldHookKeys>(
	state: GameState,
	actor: ActorRef,
	hookName: K,
	value: number,
	...args: DropFirstTwo<Parameters<HookTable[K]>>
): FoldResult {
	const sources = getSources(state, actor);
	let currentValue = value;
	let currentState = state;
	for (const source of sources) {
		const fn = source.hooks[hookName] as ((...a: unknown[]) => number | FoldResult) | undefined;
		if (fn) {
			const ctx = makeCtx(currentState, actor);
			if (!ctx) break;
			const result = fn(ctx, currentValue, ...args);
			if (typeof result === "number") {
				currentValue = result;
			} else {
				currentValue = result.value;
				currentState = result.state;
			}
		}
	}
	return { value: currentValue, state: currentState };
}

export function anyHook<K extends BoolHookKeys>(
	state: GameState,
	actor: ActorRef,
	hookName: K,
	...args: DropFirst<Parameters<HookTable[K]>>
): boolean {
	const sources = getSources(state, actor);
	for (const source of sources) {
		const fn = source.hooks[hookName] as ((...a: unknown[]) => boolean) | undefined;
		if (fn) {
			const ctx = makeCtx(state, actor);
			if (!ctx) return false;
			if (fn(ctx, ...args)) return true;
		}
	}
	return false;
}

export function vetoHook(
	state: GameState,
	actor: ActorRef,
	hookName: "onApplyPower" | "canPlayCard",
	...args: unknown[]
): boolean {
	const sources = getSources(state, actor);
	for (const source of sources) {
		const fn = source.hooks[hookName] as ((...a: unknown[]) => boolean) | undefined;
		if (fn) {
			const ctx = makeCtx(state, actor);
			if (!ctx) return true;
			if (!fn(ctx, ...args)) return false;
		}
	}
	return true;
}

// ── Registries (populated by content modules) ─────────────

const powerHookRegistry = new Map<string, (p: PowerInstance) => HookSource>();
const relicHookRegistry = new Map<string, (r: RelicInstance) => HookSource>();

export function registerPowerHooks(
	powerId: string,
	factory: (p: PowerInstance) => HookSource,
): void {
	powerHookRegistry.set(powerId, factory);
}

/**
 * Map a power name from monster data (e.g. "CURL_UP", "STRENGTH") to the id
 * its hooks were registered under. Registrations use two conventions
 * (lowercase for shared/player powers, UPPERCASE for most monster powers), and
 * hook lookup is exact, so data must be converted through here.
 * Preference: lowercase if registered, else UPPERCASE if registered, else lowercase.
 */
export function canonicalPowerId(raw: string): PowerId {
	const lower = raw.toLowerCase();
	if (powerHookRegistry.has(lower)) return lower as PowerId;
	const upper = raw.toUpperCase();
	if (powerHookRegistry.has(upper)) return upper as PowerId;
	return lower as PowerId;
}

export function registerRelicHooks(
	relicId: string,
	factory: (r: RelicInstance) => HookSource,
): void {
	relicHookRegistry.set(relicId, factory);
}

function getPowerHooks(p: PowerInstance): HookSource | null {
	const factory = powerHookRegistry.get(p.id);
	return factory ? factory(p) : null;
}

function getRelicHooks(r: RelicInstance): HookSource | null {
	const factory = relicHookRegistry.get(r.id);
	return factory ? factory(r) : null;
}

export function fireHookOnAllActors(
	state: GameState,
	fn: (s: GameState, actor: ActorRef) => GameState,
): GameState {
	let s = state;
	s = fn(s, { type: "player" });
	const monsterCount = s.combat?.monsters.length ?? 0;
	for (let i = 0; i < monsterCount; i++) {
		if (s.combat?.monsters[i]?.alive) {
			s = fn(s, { type: "monster", index: i });
		}
	}
	return s;
}

// ── Utility types ─────────────────────────────────────────

type DropFirst<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;
type DropFirstTwo<T extends unknown[]> = T extends [unknown, unknown, ...infer R] ? R : never;

type FoldHookKeys =
	| "atDamageGive"
	| "atDamageFinalGive"
	| "atDamageReceive"
	| "atDamageFinalReceive"
	| "modifyBlock"
	| "modifyCardCost"
	| "modifyDrawPerTurn"
	| "modifyBlockRetention"
	| "onHeal"
	| "modifyFocus"
	| "onGainGold"
	| "modifyPrice";

type BoolHookKeys = "retainsEnergy" | "retainsHand" | "canPlayCard";
