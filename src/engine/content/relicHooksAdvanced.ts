import { allMonstersGone } from "../combat/death";
import { registerRelicHooks } from "../core/hooks";
import type { CardInstance, PowerId, PowerInstance } from "../core/types";
import { getCard } from "./loader";
import {
	addPlayerBlock,
	addPlayerPower,
	addRandomCardToHand,
	damageAllMonsters,
	drawCards,
	heal,
	isAttack,
	relicVal,
	setRelicCounter,
} from "./relicHelpers";

// ═════════════════════════════════════════════════════════
// UNCOMMON
// ═════════════════════════════════════════════════════════

// Gremlin Horn — enemy dies: gain 1 energy + draw 1
registerRelicHooks("GREMLIN_HORN", () => ({
	relicId: "GREMLIN_HORN",
	hooks: {
		onMonsterDeath: (ctx) => {
			// Original: only while the fight goes on (not for the last kill).
			if (allMonstersGone(ctx.state)) return ctx.state;
			let s = drawCards(ctx.state, 1);
			if (s.combat) s = { ...s, combat: { ...s.combat, energy: s.combat.energy + 1 } };
			return s;
		},
	},
}));

// Horn Cleat — turn 2: gain 14 block
registerRelicHooks("HORN_CLEAT", () => ({
	relicId: "HORN_CLEAT",
	hooks: {
		atStartOfTurn: (ctx) => {
			if (ctx.combat.turn !== 2) return ctx.state;
			return addPlayerBlock(ctx.state, relicVal("HORN_CLEAT", 0, 14));
		},
	},
}));

// Ink Bottle — every 10 cards played, draw 1
registerRelicHooks("INK_BOTTLE", () => ({
	relicId: "INK_BOTTLE",
	hooks: {
		onAfterCardPlayed: (ctx) => {
			const relic = ctx.state.relics.find((x) => x.id === "INK_BOTTLE");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "INK_BOTTLE", count % 10);
			if (count % 10 === 0) s = drawCards(s, 1);
			return s;
		},
	},
}));

// Kunai — every 3 attacks in a turn, gain 1 dexterity
registerRelicHooks("KUNAI", () => ({
	relicId: "KUNAI",
	hooks: {
		atStartOfTurn: (ctx) => setRelicCounter(ctx.state, "KUNAI", 0),
		onAfterCardPlayed: (ctx, card) => {
			if (!isAttack(card)) return ctx.state;
			const relic = ctx.state.relics.find((x) => x.id === "KUNAI");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "KUNAI", count);
			if (count === 3) s = addPlayerPower(s, "dexterity", 1);
			return s;
		},
	},
}));

// Letter Opener — every 3 skills in a turn, deal 5 to all
registerRelicHooks("LETTER_OPENER", () => ({
	relicId: "LETTER_OPENER",
	hooks: {
		atStartOfTurn: (ctx) => setRelicCounter(ctx.state, "LETTER_OPENER", 0),
		onAfterCardPlayed: (ctx, card) => {
			const def = getCard(card.id);
			if (def?.type !== "skill") return ctx.state;
			const relic = ctx.state.relics.find((x) => x.id === "LETTER_OPENER");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "LETTER_OPENER", count);
			if (count === 3) s = damageAllMonsters(s, relicVal("LETTER_OPENER", 0, 5));
			return s;
		},
	},
}));

// Mercury Hourglass — start of turn: deal 3 to all
registerRelicHooks("MERCURY_HOURGLASS", () => ({
	relicId: "MERCURY_HOURGLASS",
	hooks: {
		atStartOfTurn: (ctx) => damageAllMonsters(ctx.state, relicVal("MERCURY_HOURGLASS", 0, 3)),
	},
}));

// Ornamental Fan — every 3 attacks in a turn, gain 4 block
registerRelicHooks("ORNAMENTAL_FAN", () => ({
	relicId: "ORNAMENTAL_FAN",
	hooks: {
		atStartOfTurn: (ctx) => setRelicCounter(ctx.state, "ORNAMENTAL_FAN", 0),
		onAfterCardPlayed: (ctx, card) => {
			if (!isAttack(card)) return ctx.state;
			const relic = ctx.state.relics.find((x) => x.id === "ORNAMENTAL_FAN");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "ORNAMENTAL_FAN", count);
			if (count === 3) s = addPlayerBlock(s, relicVal("ORNAMENTAL_FAN", 0, 4));
			return s;
		},
	},
}));

// Paper Phrog — vulnerable = 75% more instead of 50%
registerRelicHooks("PAPER_PHROG", () => ({
	relicId: "PAPER_PHROG",
	hooks: {
		atDamageFinalGive: (ctx, damage, card) => {
			if (!card || !ctx.combat) return damage;
			const target = ctx.combat.monsters[0];
			if (!target?.powers.some((p) => p.id === "vulnerable")) return damage;
			return Math.floor((damage / 1.5) * 1.75);
		},
	},
}));

// Self-Forming Clay — when you lose HP, gain 3 block next turn
registerRelicHooks("SELF_FORMING_CLAY", () => ({
	relicId: "SELF_FORMING_CLAY",
	hooks: {
		wasHPLost: (ctx, amount) => {
			if (amount <= 0) return ctx.state;
			return setRelicCounter(ctx.state, "SELF_FORMING_CLAY", relicVal("SELF_FORMING_CLAY", 0, 3));
		},
		atStartOfTurn: (ctx) => {
			const relic = ctx.state.relics.find((x) => x.id === "SELF_FORMING_CLAY");
			if (!relic || relic.counter <= 0) return ctx.state;
			let s = addPlayerBlock(ctx.state, relic.counter);
			s = setRelicCounter(s, "SELF_FORMING_CLAY", 0);
			return s;
		},
	},
}));

// Shuriken — every 3 attacks in a turn, gain 1 strength
registerRelicHooks("SHURIKEN", () => ({
	relicId: "SHURIKEN",
	hooks: {
		atStartOfTurn: (ctx) => setRelicCounter(ctx.state, "SHURIKEN", 0),
		onAfterCardPlayed: (ctx, card) => {
			if (!isAttack(card)) return ctx.state;
			const relic = ctx.state.relics.find((x) => x.id === "SHURIKEN");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "SHURIKEN", count);
			if (count === 3) s = addPlayerPower(s, "strength", 1);
			return s;
		},
	},
}));

// Strike Dummy — Strikes deal 3 more damage
registerRelicHooks("STRIKE_DUMMY", () => ({
	relicId: "STRIKE_DUMMY",
	hooks: {
		atDamageGive: (_ctx, damage, card) => {
			if (!card) return damage;
			const id = card.id as string;
			const isSt = id.startsWith("STRIKE_") || id === "PERFECTED_STRIKE" || id === "TWIN_STRIKE";
			return isSt ? damage + relicVal("STRIKE_DUMMY", 0, 3) : damage;
		},
	},
}));

// Meat on the Bone — end of combat: if HP ≤ 50%, heal 12
registerRelicHooks("MEAT_ON_THE_BONE", () => ({
	relicId: "MEAT_ON_THE_BONE",
	hooks: {
		onVictory: (ctx) => {
			if (ctx.state.currentHp > Math.floor(ctx.state.maxHp / 2)) return ctx.state;
			return heal(ctx.state, relicVal("MEAT_ON_THE_BONE", 0, 12));
		},
	},
}));

// ═════════════════════════════════════════════════════════
// RARE
// ═════════════════════════════════════════════════════════

// Bird-Faced Urn — play a Power card: heal 2
registerRelicHooks("BIRD_FACED_URN", () => ({
	relicId: "BIRD_FACED_URN",
	hooks: {
		onAfterCardPlayed: (ctx, card) => {
			if (getCard(card.id)?.type !== "power") return ctx.state;
			return heal(ctx.state, relicVal("BIRD_FACED_URN", 0, 2));
		},
	},
}));

// Calipers — retain 15 block between turns
registerRelicHooks("CALIPERS", () => ({
	relicId: "CALIPERS",
	hooks: {
		modifyBlockRetention: () => relicVal("CALIPERS", 0, 15),
	},
}));

// Captain's Wheel — turn 3: gain 18 block
registerRelicHooks("CAPTAINS_WHEEL", () => ({
	relicId: "CAPTAINS_WHEEL",
	hooks: {
		atStartOfTurn: (ctx) => {
			if (ctx.combat.turn !== 3) return ctx.state;
			return addPlayerBlock(ctx.state, relicVal("CAPTAINS_WHEEL", 0, 18));
		},
	},
}));

// Charon's Ashes — whenever you exhaust a card, deal 3 to ALL enemies
registerRelicHooks("CHARONS_ASHES", () => ({
	relicId: "CHARONS_ASHES",
	hooks: {
		onExhaust: (ctx) => damageAllMonsters(ctx.state, relicVal("CHARONS_ASHES", 0, 3)),
	},
}));

const CHARACTER_COLOR: Record<string, string> = {
	IRONCLAD: "RED",
	SILENT: "GREEN",
	DEFECT: "BLUE",
	WATCHER: "PURPLE",
};

registerRelicHooks("DEAD_BRANCH", () => ({
	relicId: "DEAD_BRANCH",
	hooks: {
		onExhaust: (ctx) =>
			addRandomCardToHand(ctx.state, CHARACTER_COLOR[ctx.state.character] ?? "RED"),
	},
}));

// Fossilized Helix — start of combat: gain 1 Buffer
registerRelicHooks("FOSSILIZED_HELIX", () => ({
	relicId: "FOSSILIZED_HELIX",
	hooks: {
		atBattleStart: (ctx) => addPlayerPower(ctx.state, "BUFFER", 1),
	},
}));

// Ginger — can't be weakened
registerRelicHooks("GINGER", () => ({
	relicId: "GINGER",
	hooks: {
		onApplyPower: (_ctx, powerId) => powerId !== "weak",
	},
}));

// Ice Cream — energy carries over between turns
registerRelicHooks("ICE_CREAM", () => ({
	relicId: "ICE_CREAM",
	hooks: {
		retainsEnergy: () => true,
	},
}));

// Incense Burner — every 6 turns, gain 1 Intangible
registerRelicHooks("INCENSE_BURNER", () => ({
	relicId: "INCENSE_BURNER",
	hooks: {
		atEndOfTurn: (ctx) => {
			const relic = ctx.state.relics.find((x) => x.id === "INCENSE_BURNER");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "INCENSE_BURNER", count % 6);
			if (count % 6 === 0) s = addPlayerPower(s, "intangible", 1);
			return s;
		},
	},
}));

// Torii — damage between 1-5 is reduced to 1
registerRelicHooks("TORII", () => ({
	relicId: "TORII",
	hooks: {
		atDamageFinalReceive: (_ctx, damage) => {
			if (damage >= 1 && damage <= 5) return 1;
			return damage;
		},
	},
}));

// Tungsten Rod — whenever you lose HP, lose 1 less
registerRelicHooks("TUNGSTEN_ROD", () => ({
	relicId: "TUNGSTEN_ROD",
	hooks: {
		wasHPLost: (ctx, amount) => {
			if (amount <= 0) return ctx.state;
			return heal(ctx.state, 1);
		},
	},
}));

// Turnip — can't be frailed
registerRelicHooks("TURNIP", () => ({
	relicId: "TURNIP",
	hooks: {
		onApplyPower: (_ctx, powerId) => powerId !== "frail",
	},
}));

// Thread and Needle — start combat with 4 Plated Armor
registerRelicHooks("THREAD_AND_NEEDLE", () => ({
	relicId: "THREAD_AND_NEEDLE",
	hooks: {
		atBattleStart: (ctx) =>
			addPlayerPower(ctx.state, "platedArmor", relicVal("THREAD_AND_NEEDLE", 0, 4)),
	},
}));

// Du-Vu Doll — +1 strength per curse in deck
registerRelicHooks("DU_VU_DOLL", () => ({
	relicId: "DU_VU_DOLL",
	hooks: {
		atBattleStart: (ctx) => {
			const curses = ctx.state.deck.filter((c) => getCard(c.id)?.type === "curse").length;
			return curses > 0 ? addPlayerPower(ctx.state, "strength", curses) : ctx.state;
		},
	},
}));

// Pocketwatch — if <3 cards played, draw 3 extra next turn
registerRelicHooks("POCKETWATCH", () => ({
	relicId: "POCKETWATCH",
	hooks: {
		atEndOfTurn: (ctx) => {
			if (!ctx.combat) return ctx.state;
			return setRelicCounter(ctx.state, "POCKETWATCH", ctx.combat.cardsPlayedThisTurn < 3 ? 1 : 0);
		},
		atStartOfTurnPostDraw: (ctx) => {
			const relic = ctx.state.relics.find((x) => x.id === "POCKETWATCH");
			if (!relic || relic.counter === 0) return ctx.state;
			let s = drawCards(ctx.state, 3);
			s = setRelicCounter(s, "POCKETWATCH", 0);
			return s;
		},
	},
}));

// Stone Calendar — end of turn 7: deal 52 to all
registerRelicHooks("STONE_CALENDAR", () => ({
	relicId: "STONE_CALENDAR",
	hooks: {
		atEndOfTurn: (ctx) => {
			if (ctx.combat.turn !== 7) return ctx.state;
			return damageAllMonsters(ctx.state, relicVal("STONE_CALENDAR", 0, 52));
		},
	},
}));

// Unceasing Top — when hand is empty, draw 1
registerRelicHooks("UNCEASING_TOP", () => ({
	relicId: "UNCEASING_TOP",
	hooks: {
		onAfterCardPlayed: (ctx) => {
			if (!ctx.combat || ctx.combat.hand.length > 0) return ctx.state;
			return drawCards(ctx.state, 1);
		},
	},
}));

// ═════════════════════════════════════════════════════════
// BOSS
// ═════════════════════════════════════════════════════════

// Black Blood — upgrade of Burning Blood: heal 12 at combat end
registerRelicHooks("BLACK_BLOOD", () => ({
	relicId: "BLACK_BLOOD",
	hooks: {
		onVictory: (ctx) => heal(ctx.state, relicVal("BLACK_BLOOD", 0, 12)),
	},
}));

// Runic Cube — when you lose HP, draw 1
registerRelicHooks("RUNIC_CUBE", () => ({
	relicId: "RUNIC_CUBE",
	hooks: {
		wasHPLost: (ctx, amount) => {
			if (amount <= 0) return ctx.state;
			return drawCards(ctx.state, 1);
		},
	},
}));

// Runic Pyramid — retain hand between turns
registerRelicHooks("RUNIC_PYRAMID", () => ({
	relicId: "RUNIC_PYRAMID",
	hooks: {
		retainsHand: () => true,
	},
}));

// Velvet Choker — can only play 6 cards per turn
registerRelicHooks("VELVET_CHOKER", () => ({
	relicId: "VELVET_CHOKER",
	hooks: {
		canPlayCard: (ctx) => ctx.combat.cardsPlayedThisTurn < 6,
	},
}));

// Philosopher's Stone — all enemies gain 1 strength at combat start
registerRelicHooks("PHILOSOPHERS_STONE", () => ({
	relicId: "PHILOSOPHERS_STONE",
	hooks: {
		atBattleStart: (ctx) => {
			if (!ctx.combat) return ctx.state;
			const monsters = ctx.combat.monsters.map((m) => {
				if (!m.alive) return m;
				const str = m.powers.find((p) => p.id === "strength");
				const powers: PowerInstance[] = str
					? m.powers.map((p) => (p.id === "strength" ? { ...p, amount: p.amount + 1 } : p))
					: [...m.powers, { id: "strength" as PowerId, amount: 1, justApplied: true }];
				return { ...m, powers };
			});
			return { ...ctx.state, combat: { ...ctx.combat, monsters } };
		},
	},
}));

// Mark of Pain — draw 2 Wounds into hand at combat start
registerRelicHooks("MARK_OF_PAIN", () => ({
	relicId: "MARK_OF_PAIN",
	hooks: {
		atBattleStart: (ctx) => {
			if (!ctx.combat) return ctx.state;
			let uid = 1;
			for (const card of [...ctx.combat.hand, ...ctx.combat.drawPile, ...ctx.combat.discardPile]) {
				if (card.uniqueId >= uid) uid = card.uniqueId + 1;
			}
			const wounds: CardInstance[] = [
				{
					id: "WOUND" as never,
					uniqueId: uid,
					upgraded: false,
					costOverride: null,
					costForTurn: -2,
					freeToPlay: false,
					misc: 0,
				},
				{
					id: "WOUND" as never,
					uniqueId: uid + 1,
					upgraded: false,
					costOverride: null,
					costForTurn: -2,
					freeToPlay: false,
					misc: 0,
				},
			];
			return {
				...ctx.state,
				combat: { ...ctx.combat, hand: [...ctx.combat.hand, ...wounds] },
			};
		},
	},
}));

// Snecko Eye — draw 2 extra + confused at start of combat
registerRelicHooks("SNECKO_EYE", () => ({
	relicId: "SNECKO_EYE",
	hooks: {
		atBattleStart: (ctx) => addPlayerPower(ctx.state, "confused", 1),
		modifyDrawPerTurn: (_ctx, draw) => draw + 2,
	},
}));

// Ectoplasm — can't gain gold
registerRelicHooks("ECTOPLASM", () => ({
	relicId: "ECTOPLASM",
	hooks: {
		onGainGold: () => 0,
	},
}));
