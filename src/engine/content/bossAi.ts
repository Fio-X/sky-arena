import { registerMoveHandler } from "../combat/moveEffects";
import { canonicalPowerId } from "../core/hooks";
import type { Action, CardId, CardInstance, GameState, MonsterMoveId } from "../core/types";
import { random } from "../rng/stsRandom";
import { getMonster } from "./loader";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── Slime Boss ───────────────────────────────────────────
const SB_GOOP = "SLIME_BOSS_GOOP_SPRAY" as MonsterMoveId;
const SB_PREP = "SLIME_BOSS_PREPARING" as MonsterMoveId;
const SB_SLAM = "SLIME_BOSS_SLAM" as MonsterMoveId;
const SB_SPLIT = "SLIME_BOSS_SPLIT" as MonsterMoveId;

registerMonsterAi("SLIME_BOSS", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SB_GOOP, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: SB_GOOP, aiRng: ctx.aiRng };
	// Reached half HP: split on its next turn (as Acid/Spike Slime L do).
	if (monster.splitPending) return { moveId: SB_SPLIT, aiRng: ctx.aiRng };

	const last = h[h.length - 1];
	if (last === SB_GOOP) return { moveId: SB_PREP, aiRng: ctx.aiRng };
	if (last === SB_PREP) return { moveId: SB_SLAM, aiRng: ctx.aiRng };
	return { moveId: SB_GOOP, aiRng: ctx.aiRng };
});

// ── The Guardian ─────────────────────────────────────────
const TG_CHARGE = "THE_GUARDIAN_CHARGING_UP" as MonsterMoveId;
const TG_FIERCE = "THE_GUARDIAN_FIERCE_BASH" as MonsterMoveId;
const TG_VENT = "THE_GUARDIAN_VENT_STEAM" as MonsterMoveId;
const TG_WHIRL = "THE_GUARDIAN_WHIRLWIND" as MonsterMoveId;
const TG_DEFEND = "THE_GUARDIAN_DEFENSIVE_MODE" as MonsterMoveId;
const TG_ROLL = "THE_GUARDIAN_ROLL_ATTACK" as MonsterMoveId;
const TG_TWIN = "THE_GUARDIAN_TWIN_SLAM" as MonsterMoveId;

registerMonsterAi("THE_GUARDIAN", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: TG_CHARGE, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: TG_CHARGE, aiRng: ctx.aiRng };

	const last = h[h.length - 1];
	const next: Record<string, MonsterMoveId> = {
		[TG_CHARGE as string]: TG_FIERCE,
		[TG_FIERCE as string]: TG_VENT,
		[TG_VENT as string]: TG_WHIRL,
		[TG_WHIRL as string]: TG_CHARGE,
		[TG_DEFEND as string]: TG_ROLL,
		[TG_ROLL as string]: TG_TWIN,
		[TG_TWIN as string]: TG_WHIRL,
	};
	return { moveId: next[last as string] ?? TG_CHARGE, aiRng: ctx.aiRng };
});

/** Mode Shift threshold at combat start: data prebattle (30, A9 35, A19 40). */
function modeShiftBase(ascension: number): number {
	type Entry = { power: string; amount: number; asc?: Record<string, number> };
	const pre = (getMonster("THE_GUARDIAN")?.prebattle ?? []) as Entry[];
	const entry = pre.find((e) => e.power === "MODE_SHIFT");
	let amount = entry?.amount ?? 30;
	for (const [threshold, value] of Object.entries(entry?.asc ?? {})) {
		if (ascension >= Number(threshold)) amount = value;
	}
	return amount;
}

function removeOwnPower(state: GameState, index: number, powerId: string): GameState {
	const c = state.combat;
	const m = c?.monsters[index];
	if (!c || !m) return state;
	const monsters = [...c.monsters];
	monsters[index] = { ...m, powers: m.powers.filter((p) => p.id.toUpperCase() !== powerId) };
	return { ...state, combat: { ...c, monsters } };
}

/**
 * TWIN_SLAM: changeState("Offensive Mode") re-applies Mode Shift with the
 * threshold raised by 10 per shift so far (dmgThreshold += 10 on every
 * Defensive Mode), then Sharp Hide is removed.
 */
registerMoveHandler(TG_TWIN as string, (ctx, actions): Action[] => {
	const shifts = ctx.monster.moveHistory.filter((m) => m === TG_DEFEND).length;
	const threshold = modeShiftBase(ctx.state.ascension) + 10 * shifts;
	const index = ctx.monster.index;
	return [
		...actions,
		{
			type: "applyPower",
			source: ctx.self,
			target: ctx.self,
			powerId: canonicalPowerId("MODE_SHIFT"),
			amount: threshold,
		},
		{ type: "custom", execute: (s) => removeOwnPower(s, index, "SHARP_HIDE") },
	];
});

// ── Hexaghost ────────────────────────────────────────────
const HG_ACTIVATE = "HEXAGHOST_ACTIVATE" as MonsterMoveId;
const HG_DIVIDER = "HEXAGHOST_DIVIDER" as MonsterMoveId;
const HG_SEAR = "HEXAGHOST_SEAR" as MonsterMoveId;
const HG_TACKLE = "HEXAGHOST_TACKLE" as MonsterMoveId;
const HG_INFLAME = "HEXAGHOST_INFLAME" as MonsterMoveId;
const HG_INFERNO = "HEXAGHOST_INFERNO" as MonsterMoveId;

const HG_LOOP: MonsterMoveId[] = [
	HG_SEAR,
	HG_TACKLE,
	HG_SEAR,
	HG_INFLAME,
	HG_TACKLE,
	HG_SEAR,
	HG_INFERNO,
];

// Inferno (BurnIncreaseAction): after the hits, upgrade every Burn the player has
// and add 3 Burn+ to the discard pile. From then on Sear's Burns come upgraded.
registerMoveHandler(HG_INFERNO as string, (_ctx, actions): Action[] => [
	...actions,
	{ type: "custom", execute: upgradeAllBurns },
	...Array.from(
		{ length: 3 },
		(): Action => ({ type: "addCardToDiscardPile", cardId: "BURN" as CardId, upgraded: true }),
	),
]);

registerMoveHandler(HG_SEAR as string, (ctx, actions): Action[] => {
	if (!ctx.monster.moveHistory.includes(HG_INFERNO)) return [...actions];
	return actions.map((a) =>
		a.type === "addCardToDiscardPile" && a.cardId === "BURN" ? { ...a, upgraded: true } : a,
	);
});

function upgradeAllBurns(s: GameState): GameState {
	const c = s.combat;
	if (!c) return s;
	const up = (pile: readonly CardInstance[]) =>
		pile.map((x) => (x.id === "BURN" && !x.upgraded ? { ...x, upgraded: true } : x));
	return {
		...s,
		combat: {
			...c,
			hand: up(c.hand),
			drawPile: up(c.drawPile),
			discardPile: up(c.discardPile),
		},
	};
}

registerMonsterAi("HEXAGHOST", (ctx): MonsterAiResult => {
	const { state: rng } = random(ctx.aiRng, 99);
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: HG_ACTIVATE, aiRng: rng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: HG_ACTIVATE, aiRng: rng };

	const last = h[h.length - 1];
	if (last === HG_ACTIVATE) return { moveId: HG_DIVIDER, aiRng: rng };

	// Count moves since last DIVIDER or INFERNO (the two loop-reset landmarks)
	let movesSince = 0;
	for (let i = h.length - 1; i >= 0; i--) {
		if (h[i] === HG_DIVIDER || h[i] === HG_INFERNO) break;
		movesSince++;
	}
	return { moveId: HG_LOOP[movesSince % 7] as MonsterMoveId, aiRng: rng };
});
