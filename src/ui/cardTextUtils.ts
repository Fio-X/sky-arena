import type { getCard } from "../engine/content/loader";
import type { CardInstance } from "../engine/core/types";
import { getLocale, tUi } from "../i18n";

const KEYWORD_ZH: Record<string, string> = {
	Block: "格挡",
	Vulnerable: "易伤",
	Weak: "虚弱",
	Strength: "力量",
	Exhaust: "消耗",
	Exhausted: "已消耗",
	Ethereal: "虚无",
	Innate: "固有",
	Upgrade: "升级",
	Upgraded: "已升级",
	Fatal: "致命",
	Keyword: "",
	Calm: "冷静",
	Wrath: "愤怒",
	Divinity: "神圣",
	Retain: "保留",
	Retained: "保留",
	Scry: "预见",
	Mantra: "真言",
	Dexterity: "敏捷",
	Focus: "集中",
	Intangible: "无实体",
	Lightning: "闪电",
	Frost: "冰霜",
	Dark: "暗",
	Plasma: "等离子",
	Stance: "架势",
	Stances: "架势",
	Plated: "甲",
	Unplayable: "不可打出",
};

export function formatCardText(
	text: string,
	card: CardInstance | null,
	def: ReturnType<typeof getCard>,
): string {
	if (!def) return text;
	const upgraded = card?.upgraded ?? false;
	let result = text
		.replace(/\[(\d+)\|(\d+)]/g, (_m, base, up) => (upgraded ? up : base))
		.replace(/\{\{QueryLink\|[^|]*\|[^|]*\|([^}]*)}}/g, "$1")
		.replace(/\{\{C\|(?:[^|}]*\|)?([^}]+)\}\}/g, "$1")
		.replace(/<br\s*\/?>/g, " ")
		.replace(/@[RGB]E|@PE/g, "[E]")
		.replace(/\[E]/g, "⚡");
	if (getLocale() === "zh") {
		result = result.replace(/\$([A-Z][A-Za-z]+)/g, (_m, kw) => KEYWORD_ZH[kw] ?? kw);
	}
	return result.replace(/\$/g, "");
}

export function formatCardTextSimple(text: string): string {
	let result = text
		.replace(/\[(\d+)\|(\d+)]/g, (_m, base) => base)
		.replace(/\{\{QueryLink\|[^|]*\|[^|]*\|([^}]*)}}/g, "$1")
		.replace(/\{\{C\|(?:[^|}]*\|)?([^}]+)\}\}/g, "$1")
		.replace(/<br\s*\/?>/g, " ")
		.replace(/@[RGB]E|@PE/g, "[E]")
		.replace(/\[E]/g, "⚡");
	if (getLocale() === "zh") {
		result = result.replace(/\$([A-Z][A-Za-z]+)/g, (_m, kw) => KEYWORD_ZH[kw] ?? kw);
	}
	return result.replace(/\$/g, "");
}

export function cardTypeLabel(type?: string): string {
	if (type === "attack") return tUi("cardTypeAttack");
	if (type === "skill") return tUi("cardTypeSkill");
	if (type === "power") return tUi("cardTypePower");
	return "";
}

const RARITY_ZH: Record<string, string> = {
	common: "普通",
	uncommon: "罕见",
	rare: "稀有",
	basic: "基础",
	special: "特殊",
};

export function rarityLabel(rarity?: string): string {
	if (!rarity) return "";
	if (getLocale() === "zh") return RARITY_ZH[rarity] ?? rarity;
	return rarity;
}
