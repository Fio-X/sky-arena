/**
 * End of the player's turn through the start of the next one: discard, block,
 * end-of-turn hooks, orb passives, monster turns, turn-based ticks, new turn
 * and draw. Split out of step.ts.
 */
import { takesTurns } from "../combat/death";
import { buildIntent, resolveMonsterMove, rollMonsterMove } from "../combat/monsterTurn";
import { clearBlockAtEndOfTurn, tickTurnBasedPowers } from "../combat/powers";
import { getCard } from "../content/loader";
import { preventPlayerDeath, recordEndTurnHand } from "../content/relicsCombatRules";
import { drainActions } from "./actionExecutor";
import { addToBot } from "./actionQueue";
import { anyHook, fireHook, fireHookOnAllActors, foldHook } from "./hooks";
import { triggerOrbPassives } from "./orbSystem";
import type { ActorRef, CardInstance, GameEvent, GameState, StepResult } from "./types";

const TURN_BASED_POWER_IDS = new Set([
	"vulnerable",
	"weak",
	"frail",
	"intangible",
	"INTANGIBLE",
	"regen",
]);

export function stepEndTurn(rawState: GameState, events: GameEvent[]): StepResult {
	if (!rawState.combat || rawState.phase.type !== "combat") return { state: rawState, events };
	const state = recordEndTurnHand(rawState); // Cloak Clasp: hand size before discarding
	const combat = state.combat;
	if (!combat) return { state, events };

	const wlp = combat.player.powers.find((p) => p.id === "WELL_LAID_PLANS");
	if (wlp && wlp.amount > 0 && combat.hand.length > 0) {
		return {
			state: { ...state, phase: { type: "cardSelect", task: "wellLaidPlans" } },
			events,
		};
	}

	return stepEndTurnContinue(state, events);
}

/**
 * End-of-turn hand: ethereal cards exhaust, Retain/selfRetain cards stay (onRetain),
 * Runic Pyramid keeps the rest, everything else is discarded; Burns in hand hurt.
 */
function endOfTurnHand(
	state: GameState,
	combat: NonNullable<GameState["combat"]>,
	events: GameEvent[],
): GameState {
	const retained: CardInstance[] = [];
	const toDiscard: CardInstance[] = [];
	const toExhaust: CardInstance[] = [];
	const keepHand = anyHook(state, { type: "player" }, "retainsHand");
	const reallyRetained: CardInstance[] = [];
	for (const card of combat.hand) {
		const def = getCard(card.id);
		if (def?.flags.includes("ethereal")) {
			toExhaust.push(card);
			events.push({ type: "cardExhausted", card });
		} else if (def?.flags.includes("selfRetain") || card.misc === 1) {
			retained.push({ ...card, misc: 0 });
			reallyRetained.push(card);
		} else if (keepHand) {
			retained.push(card);
		} else {
			toDiscard.push(card);
			events.push({ type: "cardDiscarded", card });
		}
	}
	let s: GameState = {
		...state,
		combat: {
			...combat,
			hand: retained,
			discardPile: [...combat.discardPile, ...toDiscard],
			exhaustPile: [...combat.exhaustPile, ...toExhaust],
		},
	};
	for (const card of reallyRetained) s = fireHook(s, { type: "player" }, "onRetain", card);
	for (const card of [...toDiscard, ...retained]) {
		if (card.id !== ("BURN" as never)) continue;
		const def = getCard(card.id);
		const dmg = (card.upgraded ? def?.upgrade.magic : def?.values.magic) ?? 2;
		s = { ...s, currentHp: Math.max(0, s.currentHp - dmg) };
		events.push({ type: "hpLost", target: { type: "player" }, amount: dmg });
		s = preventPlayerDeath(s, events);
	}
	return s;
}

export function stepEndTurnContinue(
	state: GameState,
	events: GameEvent[],
	skipDiscard = false,
): StepResult {
	const combat = state.combat;
	if (!combat) return { state, events };

	let s = state;

	if (!skipDiscard) s = endOfTurnHand(state, combat, events);

	events.push({ type: "turnEnded", turn: combat.turn });

	const playerRef: ActorRef = { type: "player" };
	const blockRetain = foldHook(s, playerRef, "modifyBlockRetention", 0);
	s = blockRetain.state;
	if (s.combat) {
		s = clearBlockAtEndOfTurn(s, Math.min(blockRetain.value, s.combat.player.block));
	}

	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "atEndOfTurn", true));

	({ state: s, events } = triggerOrbPassives(s, events));

	s = executeMonsterTurns(s, events);

	s = fireHookOnAllActors(s, (st, actor) => tickTurnBasedPowers(st, actor, TURN_BASED_POWER_IDS));

	const c = s.combat;
	if (!c) return { state: s, events };

	const newTurn = c.turn + 1;

	s = {
		...s,
		combat: {
			...c,
			turn: newTurn,
			// Ice Cream: unspent energy carries over.
			energy: c.maxEnergy + (anyHook(s, { type: "player" }, "retainsEnergy") ? c.energy : 0),
			cardsPlayedThisTurn: 0,
			cardsDiscardedThisTurn: 0,
			actionQueue: [],
		},
		phase: { type: "combat", turn: newTurn },
	};

	if (s.combat) {
		const pp = s.combat.player.powers.filter((p) => p.id !== "ENTANGLED");
		if (pp.length !== s.combat.player.powers.length) {
			s = { ...s, combat: { ...s.combat, player: { ...s.combat.player, powers: pp } } };
		}
	}

	if (s.combat?.player.stance === "divinity") {
		s = { ...s, combat: addToBot(s.combat, { type: "changeStance", stance: "neutral" }) };
		({ state: s } = drainActions(s, events));
	}
	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "atStartOfTurn"));

	const draw = foldHook(s, { type: "player" }, "modifyDrawPerTurn", 5);
	s = draw.state;
	const count = Math.max(0, draw.value);
	s = { ...s, combat: addToBot(s.combat as typeof c, { type: "drawCards", count }) };
	({ state: s } = drainActions(s, events));

	s = fireHookOnAllActors(s, (st, actor) => fireHook(st, actor, "atStartOfTurnPostDraw"));

	events.push({ type: "turnStarted", turn: newTurn });

	return { state: s, events };
}

function executeMonsterTurns(state: GameState, events: GameEvent[]): GameState {
	let s = state;
	const combat = s.combat;
	if (!combat) return s;

	for (let i = 0; i < combat.monsters.length; i++) {
		const monster = s.combat?.monsters[i];
		// halfDead monsters still act (Regrow/Rebirth); summoned this turn: no action
		if (!monster || !takesTurns(monster) || !takesTurns(combat.monsters[i])) continue;

		const moveId = monster.intent.moveId;
		const actions = resolveMonsterMove(monster, moveId, s.ascension, s.currentHp, s);

		for (const action of actions) {
			if (!s.combat) break;
			s = { ...s, combat: addToBot(s.combat, action) };
		}
		({ state: s } = drainActions(s, events));

		// Update history BEFORE rolling next move so the AI sees the just-executed move
		if (s.combat) {
			const ms1 = [...s.combat.monsters];
			const m1 = ms1[i];
			if (m1) {
				ms1[i] = { ...m1, moveHistory: [...m1.moveHistory, moveId] };
				s = { ...s, combat: { ...s.combat, monsters: ms1 } };
			}
		}

		const { moveId: nextMoveId, state: s2 } = rollMonsterMove(s, i);
		s = s2;

		if (s.combat) {
			const ms2 = [...s.combat.monsters];
			const m2 = ms2[i];
			if (m2) {
				ms2[i] = { ...m2, intent: buildIntent(m2, nextMoveId, s.ascension, s.currentHp) };
				s = { ...s, combat: { ...s.combat, monsters: ms2 } };
			}
		}
	}
	return s;
}
