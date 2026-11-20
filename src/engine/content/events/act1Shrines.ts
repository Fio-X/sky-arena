/** Shrines: Golden Shrine, Transmogrifier, Purifier, Upgrade Shrine, Wheel of Change. */
import type { EventChoice } from "../../core/eventRegistry";
import { eventScreen, leaveEvent, registerEvent } from "../../core/eventRegistry";
import { gainGold } from "../../core/playerActions";
import type { DeckSelectTask, GameEvent, GameState } from "../../core/types";
import { random } from "../../rng/stsRandom";
import {
	a15,
	canPick,
	curse,
	dataOf,
	heal,
	LEAVE,
	loseHp,
	obtainScreenlessRelic,
	pctOfMax,
	pickCard,
	screenOf,
	toMap,
} from "./act1EventUtils";

// ── Golden Shrine ────────────────────────────────────────

const shrineGold = (s: GameState) => (a15(s) ? 50 : 100);

registerEvent("GOLDEN_SHRINE", {
	options: (s) => [
		{ label: `[Pray] Gain ${shrineGold(s)} Gold.`, zh: `[祈祷] 获得 ${shrineGold(s)} 金币。` },
		{
			label: "[Desecrate] Gain 275 Gold. Become Cursed - Regret.",
			zh: "[亵渎] 获得 275 金币。被诅咒——悔恨。",
		},
		LEAVE,
	],
	choose: (s, i, events) => {
		if (i === 0) return gainGold(toMap(s), shrineGold(s), events);
		if (i === 1) return curse(gainGold(toMap(s), 275, events), "REGRET");
		return leaveEvent(s);
	},
});

// ── One-card shrines ─────────────────────────────────────

function cardShrine(id: string, task: DeckSelectTask, pray: EventChoice, locked: EventChoice) {
	registerEvent(id, {
		options: (s) => [canPick(s, task) ? pray : { ...locked, disabled: true }, LEAVE],
		choose: (s, i) => (i === 0 ? pickCard(s, task) : leaveEvent(s)),
	});
}

cardShrine(
	"TRANSMORGRIFIER",
	"transform",
	{ label: "[Pray] Transform a card.", zh: "[祈祷] 变化一张牌。" },
	{ label: "[Locked] Requires a removable card.", zh: "[锁定] 需要一张可移除的牌。" },
);
cardShrine(
	"PURIFIER",
	"remove",
	{ label: "[Pray] Remove a card from your deck.", zh: "[祈祷] 从牌组中移除一张牌。" },
	{ label: "[Locked] Requires a removable card.", zh: "[锁定] 需要一张可移除的牌。" },
);
cardShrine(
	"UPGRADE_SHRINE",
	"upgrade",
	{ label: "[Pray] Upgrade a card.", zh: "[祈祷] 升级一张牌。" },
	{ label: "[Locked] Requires an upgradable card.", zh: "[锁定] 需要一张可升级的牌。" },
);

// ── Wheel of Change (Gremlin Wheel Game) ─────────────────

const wheelHpLoss = (s: GameState) => pctOfMax(s, a15(s) ? 0.15 : 0.1);

/** The prize for result 0-5, as the button shown after the spin. */
function wheelPrize(s: GameState, result: number): EventChoice {
	switch (result) {
		case 0:
			return { label: `[Gain ${s.act * 100} Gold]`, zh: `[获得 ${s.act * 100} 金币]` };
		case 1:
			return { label: "[Obtain a Relic]", zh: "[获得一件遗物]" };
		case 2:
			return { label: "[Heal to full HP]", zh: "[回复全部生命]" };
		case 3:
			return { label: "[Become Cursed - Decay]", zh: "[被诅咒——腐朽]" };
		case 4:
			return { label: "[Remove a card from your deck]", zh: "[从牌组中移除一张牌]" };
		default:
			return { label: `[Lose ${wheelHpLoss(s)} HP]`, zh: `[失去 ${wheelHpLoss(s)} 点生命]` };
	}
}

function applyWheel(s: GameState, result: number, events: GameEvent[]): GameState {
	const done = toMap(s);
	switch (result) {
		case 0:
			return gainGold(done, s.act * 100, events);
		case 1:
			return obtainScreenlessRelic(done);
		case 2:
			return heal(done, s.maxHp, events);
		case 3:
			return curse(done, "DECAY");
		case 4:
			return pickCard(s, "remove");
		default:
			return loseHp(done, wheelHpLoss(s), events);
	}
}

registerEvent("WHEEL_OF_CHANGE", {
	options: (s) => {
		if (screenOf(s) === 1) return [wheelPrize(s, dataOf(s).result ?? 0)];
		return [{ label: "[Play] Spin the wheel.", zh: "[游戏] 转动轮盘。" }];
	},
	choose: (s, _i, events) => {
		if (screenOf(s) === 1) return applyWheel(s, dataOf(s).result ?? 0, events);
		const r = random(s.rng.miscRng, 5);
		return eventScreen({ ...s, rng: { ...s.rng, miscRng: r.state } }, 1, { result: r.value });
	},
});
