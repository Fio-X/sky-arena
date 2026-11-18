import type { MonsterMoveId } from "../core/types";
import { random } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── Slime Boss ───────────────────────────────────────────
const SB_GOOP = "SLIME_BOSS_GOOP_SPRAY" as MonsterMoveId;
const SB_PREP = "SLIME_BOSS_PREPARING" as MonsterMoveId;
const SB_SLAM = "SLIME_BOSS_SLAM" as MonsterMoveId;

registerMonsterAi("SLIME_BOSS", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SB_GOOP, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: SB_GOOP, aiRng: ctx.aiRng };

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
