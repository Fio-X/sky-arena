export type Locale = "en" | "zh";

/** All translatable string keys used in the UI. */
export interface TranslationTable {
	// Content names keyed by ID
	readonly cards: Record<string, string>;
	readonly cardTexts: Record<string, string>;
	readonly relics: Record<string, string>;
	readonly powers: Record<string, string>;
	readonly potions: Record<string, string>;
	readonly monsters: Record<string, string>;
	readonly events: Record<string, string>;

	// Static UI labels
	readonly ui: {
		readonly endTurn: string;
		readonly draw: string;
		readonly discard: string;
		readonly exhaust: string;
		readonly floor: string;
		readonly act: string;
		readonly gold: string;
		readonly deck: string;
		readonly drawPile: string;
		readonly discardPile: string;
		readonly exhaustPile: string;
		readonly empty: string;
		readonly close: string;
		readonly skip: string;
		readonly continue: string;
		readonly leave: string;
		readonly back: string;
		readonly cancel: string;
		readonly victory: string;
		readonly defeat: string;
		readonly newGame: string;
		readonly seed: string;
		readonly random: string;
		readonly chooseCharacter: string;
		readonly ironclad: string;
		readonly silent: string;
		readonly defect: string;
		readonly slayTheSpire: string;
		readonly rest: string;
		readonly smith: string;
		readonly smithChoose: string;
		readonly restSite: string;
		readonly restHeal: string;
		readonly smithUpgrade: string;
		readonly shop: string;
		readonly leaveShop: string;
		readonly removeCard: string;
		readonly cards: string;
		readonly relics: string;
		readonly potions: string;
		readonly sold: string;
		readonly reward: string;
		readonly chooseCard: string;
		readonly takePotion: string;
		readonly bossDefeated: string;
		readonly chooseBossRelic: string;
		readonly neowLament: string;
		readonly neowChoose: string;
		readonly floorReached: string;
		readonly buff: string;
		readonly debuff: string;
		readonly unknownEvent: string;
		readonly chooseCardToRemove: string;
		readonly map: string;
		readonly goldUnit: string;
		readonly cardTypeAttack: string;
		readonly cardTypeSkill: string;
		readonly cardTypePower: string;
	};

	// Neow blessing labels/descriptions
	readonly neow: Record<string, { label: string; description: string }>;

	// Card select task labels
	readonly cardSelect: Record<string, string>;
}
