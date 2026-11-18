import type { MonsterMoveId } from "../core/types";
import { random } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── Shield Gremlin ───────────────────────────────────────
const SG_PROTECT = "SHIELD_GREMLIN_PROTECT" as MonsterMoveId;
const SG_BASH = "SHIELD_GREMLIN_SHIELD_BASH" as MonsterMoveId;

registerMonsterAi("SHIELD_GREMLIN", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: SG_PROTECT, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: SG_PROTECT, aiRng: ctx.aiRng };

	const last = h[h.length - 1];
	if (last === SG_BASH) return { moveId: SG_BASH, aiRng: ctx.aiRng };

	const combat = ctx.state.combat;
	if (!combat) return { moveId: SG_BASH, aiRng: ctx.aiRng };

	const otherAlive = combat.monsters.some(
		(m, i) => i !== ctx.monsterIndex && m.alive && !m.halfDead,
	);
	return { moveId: otherAlive ? SG_PROTECT : SG_BASH, aiRng: ctx.aiRng };
});

// ── Gremlin Wizard ───────────────────────────────────────
const GW_CHARGING = "GREMLIN_WIZARD_CHARGING" as MonsterMoveId;
const GW_BLAST = "GREMLIN_WIZARD_ULTIMATE_BLAST" as MonsterMoveId;

registerMonsterAi("GREMLIN_WIZARD", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: GW_CHARGING, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: GW_CHARGING, aiRng: ctx.aiRng };

	const last = h[h.length - 1];
	if (last === GW_BLAST) {
		if (ctx.state.ascension >= 17) return { moveId: GW_BLAST, aiRng: ctx.aiRng };
		return { moveId: GW_CHARGING, aiRng: ctx.aiRng };
	}

	// Count trailing CHARGINGs
	let trailing = 0;
	for (let i = h.length - 1; i >= 0; i--) {
		if (h[i] === GW_CHARGING) trailing++;
		else break;
	}
	// First cycle starts with implicit charge=1 (the init CHARGING counts)
	const hasBlasted = h.includes(GW_BLAST);
	const charge = (hasBlasted ? 0 : 1) + trailing;

	if (charge >= 3) return { moveId: GW_BLAST, aiRng: ctx.aiRng };
	return { moveId: GW_CHARGING, aiRng: ctx.aiRng };
});

// ── Gremlin Nob (elite) ─────────────────────────────────
const GN_BELLOW = "GREMLIN_NOB_BELLOW" as MonsterMoveId;
const GN_RUSH = "GREMLIN_NOB_RUSH" as MonsterMoveId;
const GN_SKULL = "GREMLIN_NOB_SKULL_BASH" as MonsterMoveId;

registerMonsterAi("GREMLIN_NOB", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: GN_BELLOW, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: GN_BELLOW, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	if (ctx.state.ascension >= 18) {
		// Lightspeed bug: always RUSH after BELLOW
		return { moveId: GN_RUSH, aiRng: rng };
	}

	const lastTwoRush = h.length >= 2 && h[h.length - 1] === GN_RUSH && h[h.length - 2] === GN_RUSH;
	if (roll < 33 || lastTwoRush) return { moveId: GN_SKULL, aiRng: rng };
	return { moveId: GN_RUSH, aiRng: rng };
});
