import type { MonsterMoveId } from "../core/types";
import { random } from "../rng/stsRandom";
import type { MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

// ── Red Louse ────────────────────────────────────────────
const RL_BITE = "RED_LOUSE_BITE" as MonsterMoveId;
const RL_GROW = "RED_LOUSE_GROW" as MonsterMoveId;

registerMonsterAi("RED_LOUSE", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: RL_BITE, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;
	const last = h[h.length - 1];
	const prevGrow = h.length >= 2 && h[h.length - 2] === RL_GROW;

	if (roll < 25) {
		if (last === RL_GROW && (ctx.state.ascension >= 17 || prevGrow)) {
			return { moveId: RL_BITE, aiRng: rng };
		}
		return { moveId: RL_GROW, aiRng: rng };
	}
	const lastTwoBite = h.length >= 2 && last === RL_BITE && h[h.length - 2] === RL_BITE;
	if (lastTwoBite) return { moveId: RL_GROW, aiRng: rng };
	return { moveId: RL_BITE, aiRng: rng };
});

// ── Green Louse ──────────────────────────────────────────
const GL_BITE = "GREEN_LOUSE_BITE" as MonsterMoveId;
const GL_SPIT = "GREEN_LOUSE_SPIT_WEB" as MonsterMoveId;

registerMonsterAi("GREEN_LOUSE", (ctx): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: GL_BITE, aiRng: ctx.aiRng };

	const { value: roll, state: rng } = random(ctx.aiRng, 99);
	const h = monster.moveHistory;
	const last = h[h.length - 1];
	const prevSpit = h.length >= 2 && h[h.length - 2] === GL_SPIT;

	if (roll < 25) {
		if (last === GL_SPIT && (ctx.state.ascension >= 17 || prevSpit)) {
			return { moveId: GL_BITE, aiRng: rng };
		}
		return { moveId: GL_SPIT, aiRng: rng };
	}
	const lastTwoBite = h.length >= 2 && last === GL_BITE && h[h.length - 2] === GL_BITE;
	if (lastTwoBite) return { moveId: GL_SPIT, aiRng: rng };
	return { moveId: GL_BITE, aiRng: rng };
});
