import { getCard } from "../content/loader";
import { random } from "../rng/stsRandom";
import type { CardId, CardInstance, GameEvent, GameState } from "./types";

export interface NeowBlessing {
	id: string;
	label: string;
	description: string;
}

export const NEOW_BLESSINGS: NeowBlessing[] = [
	{ id: "gold100", label: "+100 Gold", description: "Obtain 100 Gold." },
	{
		id: "upgradeRandom",
		label: "Upgrade a Card",
		description: "Upgrade a random card in your deck.",
	},
	{ id: "maxHp10", label: "+8 Max HP", description: "Gain 8 Max HP." },
	{ id: "removeCard", label: "Remove a Card", description: "Remove a Strike from your deck." },
];

type StepResult = { state: GameState; events: GameEvent[] };

export function stepChooseNeowBlessing(
	state: GameState,
	index: number,
	events: GameEvent[],
): StepResult {
	if (state.phase.type !== "neow") return { state, events };
	if (index < 0 || index >= NEOW_BLESSINGS.length) return { state, events };

	const blessing = NEOW_BLESSINGS[index];
	if (!blessing) return { state, events };

	let s = state;

	switch (blessing.id) {
		case "gold100":
			s = { ...s, gold: s.gold + 100 };
			events.push({ type: "goldChanged", delta: 100 });
			break;

		case "upgradeRandom": {
			const upgradable = s.deck
				.map((c, i) => ({ card: c, index: i }))
				.filter((e) => !e.card.upgraded);
			if (upgradable.length > 0) {
				const roll = random(s.rng.miscRng, upgradable.length - 1);
				s = { ...s, rng: { ...s.rng, miscRng: roll.state } };
				const target = upgradable[roll.value];
				if (target) {
					const def = getCard(target.card.id);
					const newDeck = [...s.deck];
					newDeck[target.index] = {
						...target.card,
						upgraded: true,
						costForTurn: def?.upgrade.cost ?? target.card.costForTurn,
					};
					s = { ...s, deck: newDeck };
				}
			}
			break;
		}

		case "maxHp10":
			s = { ...s, maxHp: s.maxHp + 8, currentHp: s.currentHp + 8 };
			break;

		case "removeCard": {
			const strikeIdx = s.deck.findIndex((c) => c.id === ("STRIKE_RED" as CardId));
			if (strikeIdx >= 0) {
				const newDeck = s.deck.filter((_: CardInstance, i: number) => i !== strikeIdx);
				s = { ...s, deck: newDeck };
			}
			break;
		}
	}

	events.push({ type: "neowBlessingChosen", blessing: blessing.id });
	return { state: { ...s, phase: { type: "map" } }, events };
}
