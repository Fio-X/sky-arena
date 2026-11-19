/**
 * Executors for monster-side actions: split, escape, suicide, summons, monster
 * heals, debuff removal, vampire damage, Bronze Orb card theft and master-deck
 * curses.
 */
import { resolveMonsterDeath } from "../combat/death";
import {
	createMonster,
	emptySlot,
	pickGremlin,
	rollFirstIntent,
	withMinion,
} from "../combat/monsterFactory";
import { getCard, getPower } from "../content/loader";
import { random } from "../rng/stsRandom";
import { canonicalPowerId } from "./hooks";
import { obtainCard } from "./obtain";
import type {
	Action,
	CardInstance,
	GameEvent,
	GameState,
	MonsterMoveId,
	MonsterState,
} from "./types";

type Result = { state: GameState };

export function executeSplit(
	state: GameState,
	action: Extract<Action, { type: "split" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const source = combat.monsters[action.sourceIndex];
	if (!source) return { state };

	const monsters = [...combat.monsters];
	const sourceHp = source.currentHp;
	if (source.alive) {
		monsters[action.sourceIndex] = { ...source, alive: false, currentHp: 0 };
		events.push({ type: "monsterDied", index: action.sourceIndex });
	}

	const newIndices: number[] = [];
	for (let i = 0; i < action.count; i++) {
		const idx = monsters.length;
		newIndices.push(idx);
		const child: MonsterState = {
			id: action.spawnId,
			index: idx,
			maxHp: sourceHp,
			currentHp: sourceHp,
			block: 0,
			powers: [],
			intent: {
				moveId: "" as MonsterMoveId,
				baseDamage: null,
				hits: 1,
				isAttack: false,
				isDebuff: false,
				isBuff: false,
			},
			moveHistory: [],
			alive: true,
			halfDead: false,
			miscInfo: 0,
		};
		monsters.push(child);
	}

	events.push({ type: "monsterSplit", sourceIndex: action.sourceIndex, newIndices });
	// Spawned monsters roll their first move immediately (AbstractMonster.init → rollMove).
	let s: GameState = { ...state, combat: { ...combat, monsters } };
	for (const idx of newIndices) s = rollFirstIntent(s, idx);
	return { state: s };
}

export function executeEscape(
	state: GameState,
	action: Extract<Action, { type: "escape" }>,
	events: GameEvent[],
): { state: GameState } {
	const combat = state.combat;
	if (!combat) return { state };
	const m = combat.monsters[action.monsterIndex];
	if (!m?.alive) return { state };

	const monsters = [...combat.monsters];
	monsters[action.monsterIndex] = { ...m, alive: false, currentHp: 0 };
	events.push({ type: "monsterEscaped", index: action.monsterIndex });
	return { state: { ...state, combat: { ...combat, monsters } } };
}

/** SuicideAction (Exploder, Dagger EXPLODE, Fading): no damage path, so no Regrow/rebirth. */
export function executeMonsterDie(
	state: GameState,
	action: Extract<Action, { type: "monsterDie" }>,
	events: GameEvent[],
): Result {
	const combat = state.combat;
	const m = combat?.monsters[action.monsterIndex];
	if (!combat || !m?.alive) return { state };
	const monsters = [...combat.monsters];
	monsters[action.monsterIndex] = { ...m, alive: false, currentHp: 0, block: 0 };
	const s = { ...state, combat: { ...combat, monsters } };
	return { state: resolveMonsterDeath(s, action.monsterIndex, events, false) };
}

export function executeAddCardToMasterDeck(
	state: GameState,
	action: Extract<Action, { type: "addCardToMasterDeck" }>,
): Result {
	return { state: obtainCard(state, action.cardId) };
}

export function executeSpawnMonster(
	state: GameState,
	action: Extract<Action, { type: "spawnMonster" }>,
	events: GameEvent[],
): Result {
	const combat = state.combat;
	if (!combat) return { state };
	let rng = state.rng;
	let id = action.monsterId;
	if (id === "RANDOM_GREMLIN") {
		const pick = pickGremlin(rng.aiRng);
		id = pick.id;
		rng = { ...rng, aiRng: pick.rng };
	}
	const created = createMonster(id, action.slot, state.ascension, rng.monsterHpRng);
	if (!created) return { state };

	const monsters = [...combat.monsters];
	while (monsters.length < action.slot) monsters.push(emptySlot(monsters.length));
	monsters[action.slot] = action.minion ? withMinion(created.monster) : created.monster;
	rng = { ...rng, monsterHpRng: created.rng };
	if (action.burnAiRoll) rng = { ...rng, aiRng: random(rng.aiRng, 99).state };

	events.push({ type: "monsterSplit", sourceIndex: action.slot, newIndices: [action.slot] });
	const s: GameState = { ...state, combat: { ...combat, monsters }, rng };
	return { state: rollFirstIntent(s, action.slot) };
}

export function executeMonsterHeal(
	state: GameState,
	action: Extract<Action, { type: "heal" }>,
	events: GameEvent[],
): Result {
	const combat = state.combat;
	if (!combat || action.target.type !== "monster") return { state };
	const index = action.target.index;
	const m = combat.monsters[index];
	if (!m?.alive) return { state };
	const healed = Math.min(action.amount, m.maxHp - m.currentHp);
	if (healed <= 0) return { state };
	const monsters = [...combat.monsters];
	monsters[index] = { ...m, currentHp: m.currentHp + healed };
	events.push({ type: "healed", target: action.target, amount: healed });
	return { state: { ...state, combat: { ...combat, monsters } } };
}

/** Remove every debuff (powers.json kind = debuff) and negative Strength. */
export function executeRemoveDebuffs(
	state: GameState,
	action: Extract<Action, { type: "removeDebuffs" }>,
): Result {
	const combat = state.combat;
	if (!combat || action.target.type !== "monster") return { state };
	const index = action.target.index;
	const m = combat.monsters[index];
	if (!m) return { state };
	const powers = m.powers.filter((p) => {
		if (p.id.toUpperCase() === "STRENGTH") return p.amount >= 0;
		return getPower(p.id)?.kind !== "debuff";
	});
	const monsters = [...combat.monsters];
	monsters[index] = { ...m, powers };
	return { state: { ...state, combat: { ...combat, monsters } } };
}

type DamageFn = (
	state: GameState,
	action: Extract<Action, { type: "damage" }>,
	events: GameEvent[],
) => Result;

export function executeVampireDamage(
	state: GameState,
	action: Extract<Action, { type: "vampireDamage" }>,
	events: GameEvent[],
	runDamage: DamageFn,
): Result {
	const before = state.currentHp;
	const hit = { ...action, type: "damage" as const, hits: 1 };
	const { state: s } = runDamage(state, hit, events);
	const lost = action.target.type === "player" ? before - s.currentHp : 0;
	if (lost <= 0 || action.source.type !== "monster") return { state: s };
	return executeMonsterHeal(s, { type: "heal", target: action.source, amount: lost }, events);
}

const STEAL_RARITY_ORDER = ["rare", "uncommon", "common"] as const;

/**
 * Bronze Orb STASIS. Pile = draw pile, else discard pile. Prefer the highest of
 * rare/uncommon/common; ties picked with cardRandomRng over a list sorted by card id
 * (approximation of the game's fixed card sort order).
 */
export function executeStealCard(
	state: GameState,
	action: Extract<Action, { type: "stealCard" }>,
): Result {
	const combat = state.combat;
	const m = combat?.monsters[action.monsterIndex];
	if (!combat || !m?.alive) return { state };
	const pileName = combat.drawPile.length > 0 ? "drawPile" : "discardPile";
	const pile = combat[pileName];
	if (pile.length === 0) return { state };

	const rarityOf = (c: CardInstance) => getCard(c.id)?.rarity;
	const tier = STEAL_RARITY_ORDER.find((r) => pile.some((c) => rarityOf(c) === r));
	const candidates = tier
		? pile.filter((c) => rarityOf(c) === tier).sort((a, b) => cmp(a.id, b.id))
		: [...pile];
	const roll = random(state.rng.cardRandomRng, candidates.length - 1);
	const stolen = candidates[roll.value];
	if (!stolen) return { state };

	const monsters = [...combat.monsters];
	const stasis = { id: canonicalPowerId("STASIS"), amount: 1, justApplied: false };
	monsters[action.monsterIndex] = { ...m, heldCard: stolen, powers: [...m.powers, stasis] };
	return {
		state: {
			...state,
			combat: {
				...combat,
				monsters,
				[pileName]: pile.filter((c) => c.uniqueId !== stolen.uniqueId),
			},
			rng: { ...state.rng, cardRandomRng: roll.state },
		},
	};
}

function cmp(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
