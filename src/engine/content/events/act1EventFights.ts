/** Act 1 events that can start a fight: Dead Adventurer, Hypnotizing Colored Mushrooms. */
import { registerEncounterSetup } from "../../combat/encounterSetup";
import { registerEncounterLayout } from "../../combat/encounters";
import { startEventCombat } from "../../core/eventCombat";
import { eventScreen, leaveEvent, registerEvent } from "../../core/eventRegistry";
import { hasRelic } from "../../core/obtain";
import { gainGold } from "../../core/playerActions";
import type { GameEvent, GameState, MonsterId, RelicId } from "../../core/types";
import { random, stsShuffle } from "../../rng/stsRandom";
import {
	a15,
	curse,
	dataOf,
	heal,
	LEAVE,
	obtainScreenlessRelic,
	pctOfMax,
	screenOf,
	toMap,
} from "./act1EventUtils";

const FIGHT = { label: "[Fight!]", zh: "[战斗！]" };
const withMisc = (s: GameState, miscRng: GameState["rng"]["miscRng"]): GameState => ({
	...s,
	rng: { ...s.rng, miscRng },
});

// ── Event-only encounters ────────────────────────────────

registerEncounterLayout("MUSHROOMS_EVENT", [
	"FUNGI_BEAST" as MonsterId,
	"FUNGI_BEAST" as MonsterId,
	"FUNGI_BEAST" as MonsterId,
]);
registerEncounterLayout("LAGAVULIN_EVENT", ["LAGAVULIN" as MonsterId]);

/** new Lagavulin(false): awake, so no Asleep, no Metallicize and no starting Block. */
registerEncounterSetup("LAGAVULIN_EVENT", (state) => {
	const combat = state.combat;
	if (!combat) return state;
	const monsters = combat.monsters.map((m) =>
		m.id === "LAGAVULIN"
			? {
					...m,
					block: 0,
					powers: m.powers.filter(
						(p) => !["ASLEEP", "METALLICIZE"].includes((p.id as string).toUpperCase()),
					),
				}
			: m,
	);
	return { ...state, combat: { ...combat, monsters } };
});

// ── Dead Adventurer ──────────────────────────────────────

const GOLD = 0;
const RELIC = 2;
const ENEMIES = ["SENTRY", "GREMLIN_NOB", "LAGAVULIN_EVENT"];

/**
 * Constructor rolls (miscRng): the three rewards [GOLD, NOTHING, RELIC]
 * shuffled, then the enemy random(0, 2). Done before the first choice.
 */
function setupAdventurer(s: GameState): GameState {
	if (dataOf(s).init) return s;
	const sh = stsShuffle([0, 1, 2], s.rng.miscRng);
	const enemy = random(sh.rng, 2);
	const [r0, r1, r2] = sh.result as [number, number, number];
	return eventScreen(withMisc(s, enemy.state), 0, {
		init: 1,
		r0,
		r1,
		r2,
		enemy: enemy.value,
		n: 0,
		chance: a15(s) ? 35 : 25,
	});
}

const adventurerChance = (s: GameState) => dataOf(s).chance ?? (a15(s) ? 35 : 25);

function searchAdventurer(state: GameState, events: GameEvent[]): GameState {
	const s = setupAdventurer(state);
	const d = dataOf(s);
	const n = d.n ?? 0;
	const chance = d.chance ?? 25;
	const roll = random(s.rng.miscRng, 99);
	const rolled = withMisc(s, roll.state);
	if (roll.value < chance) return eventScreen(rolled, 1);
	const reward = d[`r${n}`];
	const next =
		n + 1 >= 3 ? toMap(rolled) : eventScreen(rolled, 0, { n: n + 1, chance: chance + 25 });
	if (reward === GOLD) return gainGold(next, 30, events);
	if (reward === RELIC) return obtainScreenlessRelic(next);
	return next;
}

/** The elite returns: unclaimed gold (+30 each) and relic are added to the fight's rewards. */
function fightAdventurer(s: GameState, events: GameEvent[]): GameState {
	const d = dataOf(s);
	const left = [0, 1, 2].filter((i) => i >= (d.n ?? 0)).map((i) => d[`r${i}`]);
	const g = random(s.rng.miscRng, 10);
	const gold = 25 + g.value + (left.includes(GOLD) ? 30 : 0);
	const encounter = ENEMIES[d.enemy ?? 0] ?? "SENTRY";
	return startEventCombat(
		withMisc(s, g.state),
		encounter,
		{
			gold,
			relics: left.includes(RELIC) ? ["random"] : [],
			cardReward: true,
			potion: true,
			elite: true,
		},
		events,
	);
}

registerEvent("DEAD_ADVENTURER", {
	options: (s) => {
		if (screenOf(s) === 1) return [FIGHT];
		const chance = adventurerChance(s);
		return [
			{
				label: `[Search] Find Loot. ${chance}% chance that the monster returns.`,
				zh: `[搜索] 寻找战利品。${chance}% 几率怪物回来。`,
			},
			LEAVE,
		];
	},
	choose: (s, i, events) => {
		if (screenOf(s) === 1) return fightAdventurer(s, events);
		if (i === 1) return leaveEvent(setupAdventurer(s));
		return searchAdventurer(s, events);
	},
});

// ── Hypnotizing Colored Mushrooms ────────────────────────

registerEvent("HYPNOTIZING_COLORED_MUSHROOMS", {
	options: (s) => {
		if (screenOf(s) === 1) return [FIGHT];
		const amt = pctOfMax(s, 0.25);
		return [
			{ label: "[Stomp] Anger the mushrooms.", zh: "[践踏] 激怒蘑菇。" },
			{
				label: `[Eat] Heal ${amt} HP. Become Cursed - Parasite.`,
				zh: `[吃掉] 回复 ${amt} 点生命。被诅咒——寄生虫。`,
			},
		];
	},
	choose: (s, i, events) => {
		if (screenOf(s) === 1) {
			const g = random(s.rng.miscRng, 10);
			const relic = (hasRelic(s, "ODD_MUSHROOM") ? "CIRCLET" : "ODD_MUSHROOM") as RelicId;
			return startEventCombat(
				withMisc(s, g.state),
				"MUSHROOMS_EVENT",
				{ gold: 20 + g.value, relicIds: [relic], cardReward: true, potion: true },
				events,
			);
		}
		if (i === 0) return eventScreen(s, 1);
		return curse(heal(toMap(s), pctOfMax(s, 0.25), events), "PARASITE");
	},
});
