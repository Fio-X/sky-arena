import { en } from "./en";
import type { Locale, TranslationTable } from "./types";
import { zh } from "./zh";

export type { Locale, TranslationTable };

const tables: Record<Locale, TranslationTable> = { en, zh };

let currentLocale: Locale = "zh";
let currentTable: TranslationTable = tables[currentLocale];

/** Get the active locale. */
export function getLocale(): Locale {
	return currentLocale;
}

/** Set the active locale and update the translation table in use. */
export function setLocale(locale: Locale): void {
	currentLocale = locale;
	currentTable = tables[locale];
}

/** Look up a card name by ID. Falls back to the English name from JSON data. */
export function tCard(id: string, fallback: string): string {
	return currentTable.cards[id] || fallback;
}

/** Look up a relic name by ID. */
export function tRelic(id: string, fallback: string): string {
	return currentTable.relics[id] || fallback;
}

/** Look up a power name by ID. */
export function tPower(id: string, fallback: string): string {
	return currentTable.powers[id] || fallback;
}

/** Look up a potion name by ID. */
export function tPotion(id: string, fallback: string): string {
	return currentTable.potions[id] || fallback;
}

/** Look up a monster name by ID. */
export function tMonster(id: string, fallback: string): string {
	return currentTable.monsters[id] || fallback;
}

/** Look up an event name by ID. */
export function tEvent(id: string, fallback: string): string {
	return currentTable.events[id] || fallback;
}

/** Get a UI label. */
export function tUi(key: keyof TranslationTable["ui"]): string {
	return currentTable.ui[key];
}

/**
 * Format a UI string with positional arguments.
 * Replaces {0}, {1}, etc. with the provided values.
 */
export function tUiFmt(key: keyof TranslationTable["ui"], ...args: (string | number)[]): string {
	let text = currentTable.ui[key];
	for (let i = 0; i < args.length; i++) {
		text = text.replace(`{${i}}`, String(args[i]));
	}
	return text;
}

/** Get a Neow blessing label/description. */
export function tNeow(id: string): { label: string; description: string } | undefined {
	return currentTable.neow[id];
}

/** Get a card-select task label. */
export function tCardSelect(task: string): string {
	return currentTable.cardSelect[task] ?? tUi("chooseCard");
}
