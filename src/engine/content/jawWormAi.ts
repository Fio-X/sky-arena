import type { MonsterMoveId } from "../core/types";
import { random, randomBooleanWithChance } from "../rng/stsRandom";
import type { MonsterAiContext, MonsterAiResult } from "./monsterAi";
import { registerMonsterAi } from "./monsterAi";

const CHOMP = "JAW_WORM_CHOMP" as MonsterMoveId;
const THRASH = "JAW_WORM_THRASH" as MonsterMoveId;
const BELLOW = "JAW_WORM_BELLOW" as MonsterMoveId;

registerMonsterAi("JAW_WORM", (ctx: MonsterAiContext): MonsterAiResult => {
	const monster = ctx.state.combat?.monsters[ctx.monsterIndex];
	if (!monster) return { moveId: CHOMP, aiRng: ctx.aiRng };

	const history = monster.moveHistory;
	let rng = ctx.aiRng;

	if (history.length === 0) {
		return { moveId: CHOMP, aiRng: rng };
	}

	const { value: roll, state: rng2 } = random(rng, 99);
	rng = rng2;

	const lastMove = history[history.length - 1];
	const lastTwoSame =
		history.length >= 2 && history[history.length - 1] === history[history.length - 2];

	if (roll < 25) {
		if (lastMove === CHOMP) {
			const { value: pick, state: rng3 } = randomBooleanWithChance(rng, 0.5625);
			return { moveId: pick ? BELLOW : THRASH, aiRng: rng3 };
		}
		return { moveId: CHOMP, aiRng: rng };
	}

	if (roll < 55) {
		if (lastTwoSame && lastMove === THRASH) {
			const { value: pick, state: rng3 } = randomBooleanWithChance(rng, 0.357);
			return { moveId: pick ? CHOMP : BELLOW, aiRng: rng3 };
		}
		return { moveId: THRASH, aiRng: rng };
	}

	if (lastMove === BELLOW) {
		const { value: pick, state: rng3 } = randomBooleanWithChance(rng, 0.416);
		return { moveId: pick ? CHOMP : THRASH, aiRng: rng3 };
	}
	return { moveId: BELLOW, aiRng: rng };
});
