import type { MonsterMoveId } from "../core/types";
import { random, randomBooleanWithChance } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── Fungi Beast ──────────────────────────────────────────
const FB_BITE = "FUNGI_BEAST_BITE" as MonsterMoveId;
const FB_GROW = "FUNGI_BEAST_GROW" as MonsterMoveId;

registerMonsterAi("FUNGI_BEAST", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: FB_BITE, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;
	const lastTwoBite = h.length >= 2 && h[h.length - 1] === FB_BITE && h[h.length - 2] === FB_BITE;
	const lastGrow = h.length > 0 && h[h.length - 1] === FB_GROW;

	if (roll < 60) return { moveId: lastTwoBite ? FB_GROW : FB_BITE, aiRng: rng };
	return { moveId: lastGrow ? FB_BITE : FB_GROW, aiRng: rng };
});

// ── Blue Slaver ──────────────────────────────────────────
const BS_STAB = "BLUE_SLAVER_STAB" as MonsterMoveId;
const BS_RAKE = "BLUE_SLAVER_RAKE" as MonsterMoveId;

registerMonsterAi("BLUE_SLAVER", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: BS_STAB, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;
	const lastTwoStab = h.length >= 2 && h[h.length - 1] === BS_STAB && h[h.length - 2] === BS_STAB;
	const lastTwoRake = h.length >= 2 && h[h.length - 1] === BS_RAKE && h[h.length - 2] === BS_RAKE;

	if (roll >= 40 && !lastTwoStab) return { moveId: BS_STAB, aiRng: rng };
	// A17: Rake never twice in a row (the original branches on asc; lightspeed's
	// flattened OR makes this dead code).
	if (ctx.state.ascension >= 17) {
		return { moveId: h[h.length - 1] === BS_RAKE ? BS_STAB : BS_RAKE, aiRng: rng };
	}
	if (!lastTwoRake) return { moveId: BS_RAKE, aiRng: rng };
	return { moveId: BS_STAB, aiRng: rng };
});

// ── Red Slaver ───────────────────────────────────────────
const RS_STAB = "RED_SLAVER_STAB" as MonsterMoveId;
const RS_SCRAPE = "RED_SLAVER_SCRAPE" as MonsterMoveId;
const RS_ENTANGLE = "RED_SLAVER_ENTANGLE" as MonsterMoveId;

registerMonsterAi("RED_SLAVER", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: RS_STAB, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	if (h.length === 0) return { moveId: RS_STAB, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);

	// usedEntangle stuck false in lightspeed → 25% ENTANGLE every turn
	if (roll >= 75) return { moveId: RS_ENTANGLE, aiRng: rng };

	// A17: Scrape never twice in a row (same OR-flattening as Blue Slaver in lightspeed).
	if (ctx.state.ascension >= 17) {
		return { moveId: h[h.length - 1] === RS_SCRAPE ? RS_STAB : RS_SCRAPE, aiRng: rng };
	}
	const lastTwoScrape =
		h.length >= 2 && h[h.length - 1] === RS_SCRAPE && h[h.length - 2] === RS_SCRAPE;
	if (!lastTwoScrape) return { moveId: RS_SCRAPE, aiRng: rng };
	return { moveId: RS_STAB, aiRng: rng };
});

// ── Looter ───────────────────────────────────────────────
const LT_MUG = "LOOTER_MUG" as MonsterMoveId;
const LT_LUNGE = "LOOTER_LUNGE" as MonsterMoveId;
const LT_SMOKE = "LOOTER_SMOKE_BOMB" as MonsterMoveId;
const LT_ESCAPE = "LOOTER_ESCAPE" as MonsterMoveId;

registerMonsterAi("LOOTER", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: LT_MUG, aiRng: ctx.aiRng };
	const h = monster.moveHistory;

	// Init: MUG
	if (h.length === 0) return { moveId: LT_MUG, aiRng: ctx.aiRng };

	const last = h[h.length - 1];

	// After first MUG (turn 1 just executed): consume dialog roll, next = MUG
	if (h.length === 1 && last === LT_MUG) {
		const { state: rng } = randomBooleanWithChance(ctx.aiRng, 0.6);
		return { moveId: LT_MUG, aiRng: rng };
	}

	// After second MUG (turn 2): 50/50 SMOKE_BOMB or LUNGE
	if (last === LT_MUG) {
		const { value: pick, state: rng } = randomBooleanWithChance(ctx.aiRng, 0.5);
		return { moveId: pick ? LT_SMOKE : LT_LUNGE, aiRng: rng };
	}

	// Deterministic chain
	if (last === LT_LUNGE) return { moveId: LT_SMOKE, aiRng: ctx.aiRng };
	if (last === LT_SMOKE) return { moveId: LT_ESCAPE, aiRng: ctx.aiRng };
	return { moveId: LT_ESCAPE, aiRng: ctx.aiRng };
});
