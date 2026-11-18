import { registerRelicHooks } from "../core/hooks";
import type { GameState, PowerId, PowerInstance } from "../core/types";
import {
	addPlayerBlock,
	addPlayerPower,
	drawCards,
	heal,
	isAttack,
	relicVal,
	setRelicCounter,
} from "./relicHelpers";

// ═════════════════════════════════════════════════════════
// STARTER
// ═════════════════════════════════════════════════════════

registerRelicHooks("BURNING_BLOOD", () => ({
	relicId: "BURNING_BLOOD",
	hooks: {
		onVictory: (ctx) => heal(ctx.state, relicVal("BURNING_BLOOD", 0, 6)),
	},
}));

// ═════════════════════════════════════════════════════════
// COMMON
// ═════════════════════════════════════════════════════════

// Akabeko — first attack each combat deals +8
registerRelicHooks("AKABEKO", () => ({
	relicId: "AKABEKO",
	hooks: {
		atBattleStart: (ctx) => setRelicCounter(ctx.state, "AKABEKO", 1),
		atDamageGive: (ctx, damage, card) => {
			if (!card || !isAttack(card)) return damage;
			const relic = ctx.state.relics.find((x) => x.id === "AKABEKO");
			if (!relic || relic.counter === 0) return damage;
			return {
				value: damage + relicVal("AKABEKO", 0, 8),
				state: setRelicCounter(ctx.state, "AKABEKO", 0),
			};
		},
	},
}));

// Anchor — start combat with 10 block
registerRelicHooks("ANCHOR", () => ({
	relicId: "ANCHOR",
	hooks: {
		atBattleStart: (ctx) => addPlayerBlock(ctx.state, relicVal("ANCHOR", 0, 10)),
	},
}));

// Art of War — no attacks played → +1 energy next turn
registerRelicHooks("ART_OF_WAR", () => ({
	relicId: "ART_OF_WAR",
	hooks: {
		atBattleStart: (ctx) => setRelicCounter(ctx.state, "ART_OF_WAR", 0),
		onAfterCardPlayed: (ctx, card) => {
			if (isAttack(card)) return setRelicCounter(ctx.state, "ART_OF_WAR", 1);
			return ctx.state;
		},
		atStartOfTurn: (ctx) => {
			const relic = ctx.state.relics.find((x) => x.id === "ART_OF_WAR");
			if (!relic || relic.counter !== 0 || !ctx.combat) return ctx.state;
			let s: GameState = {
				...ctx.state,
				combat: { ...ctx.combat, energy: ctx.combat.energy + 1 },
			};
			s = setRelicCounter(s, "ART_OF_WAR", 0);
			return s;
		},
		atEndOfTurn: (ctx) => setRelicCounter(ctx.state, "ART_OF_WAR", 0),
	},
}));

// Bag of Marbles — start combat: apply 1 vulnerable to all enemies
registerRelicHooks("BAG_OF_MARBLES", () => ({
	relicId: "BAG_OF_MARBLES",
	hooks: {
		atBattleStart: (ctx) => {
			if (!ctx.combat) return ctx.state;
			const monsters = ctx.combat.monsters.map((m) => {
				if (!m.alive) return m;
				const vuln = m.powers.find((p) => p.id === "vulnerable");
				const powers: PowerInstance[] = vuln
					? m.powers.map((p) => (p.id === "vulnerable" ? { ...p, amount: p.amount + 1 } : p))
					: [...m.powers, { id: "vulnerable" as PowerId, amount: 1, justApplied: true }];
				return { ...m, powers };
			});
			return { ...ctx.state, combat: { ...ctx.combat, monsters } };
		},
	},
}));

// Bronze Scales — when attacked, deal 3 damage back
registerRelicHooks("BRONZE_SCALES", () => ({
	relicId: "BRONZE_SCALES",
	hooks: {
		onAttacked: (ctx, damage, source) => {
			if (damage <= 0 || source.type !== "monster" || !ctx.combat) return ctx.state;
			const amt = relicVal("BRONZE_SCALES", 0, 3);
			const monsters = [...ctx.combat.monsters];
			const m = monsters[source.index];
			if (!m?.alive) return ctx.state;
			const newHp = Math.max(0, m.currentHp - amt);
			monsters[source.index] = { ...m, currentHp: newHp, alive: newHp > 0 };
			return { ...ctx.state, combat: { ...ctx.combat, monsters } };
		},
	},
}));

// Centennial Puzzle — first time you lose HP each combat, draw 3
registerRelicHooks("CENTENNIAL_PUZZLE", () => ({
	relicId: "CENTENNIAL_PUZZLE",
	hooks: {
		atBattleStart: (ctx) => setRelicCounter(ctx.state, "CENTENNIAL_PUZZLE", 0),
		wasHPLost: (ctx, amount) => {
			if (amount <= 0) return ctx.state;
			const relic = ctx.state.relics.find((x) => x.id === "CENTENNIAL_PUZZLE");
			if (!relic || relic.counter > 0) return ctx.state;
			let s = setRelicCounter(ctx.state, "CENTENNIAL_PUZZLE", 1);
			s = drawCards(s, 3);
			return s;
		},
	},
}));

// Happy Flower — every 3 turns gain 1 energy
registerRelicHooks("HAPPY_FLOWER", () => ({
	relicId: "HAPPY_FLOWER",
	hooks: {
		atStartOfTurn: (ctx) => {
			const relic = ctx.state.relics.find((x) => x.id === "HAPPY_FLOWER");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "HAPPY_FLOWER", count % 3);
			if (count % 3 === 0 && s.combat) {
				s = { ...s, combat: { ...s.combat, energy: s.combat.energy + 1 } };
			}
			return s;
		},
	},
}));

// Lantern — gain 1 energy on first turn of combat
registerRelicHooks("LANTERN", () => ({
	relicId: "LANTERN",
	hooks: {
		atBattleStart: (ctx) => {
			if (!ctx.combat) return ctx.state;
			return {
				...ctx.state,
				combat: { ...ctx.combat, energy: ctx.combat.energy + 1 },
			};
		},
	},
}));

// Nunchaku — every 10 attacks, gain 1 energy
registerRelicHooks("NUNCHAKU", () => ({
	relicId: "NUNCHAKU",
	hooks: {
		onAfterCardPlayed: (ctx, card) => {
			if (!isAttack(card)) return ctx.state;
			const relic = ctx.state.relics.find((x) => x.id === "NUNCHAKU");
			const count = (relic?.counter ?? 0) + 1;
			let s = setRelicCounter(ctx.state, "NUNCHAKU", count % 10);
			if (count % 10 === 0 && s.combat) {
				s = { ...s, combat: { ...s.combat, energy: s.combat.energy + 1 } };
			}
			return s;
		},
	},
}));

// Oddly Smooth Stone — +1 dexterity at start of combat
registerRelicHooks("ODDLY_SMOOTH_STONE", () => ({
	relicId: "ODDLY_SMOOTH_STONE",
	hooks: {
		atBattleStart: (ctx) => addPlayerPower(ctx.state, "dexterity", 1),
	},
}));

// Orichalcum — if no block at end of turn, gain 6
registerRelicHooks("ORICHALCUM", () => ({
	relicId: "ORICHALCUM",
	hooks: {
		atEndOfTurn: (ctx) => {
			if (!ctx.combat || ctx.combat.player.block > 0) return ctx.state;
			return addPlayerBlock(ctx.state, relicVal("ORICHALCUM", 0, 6));
		},
	},
}));

// Pen Nib — every 10 attacks, double next attack damage
registerRelicHooks("PEN_NIB", () => ({
	relicId: "PEN_NIB",
	hooks: {
		onAfterCardPlayed: (ctx, card) => {
			if (!isAttack(card)) return ctx.state;
			const relic = ctx.state.relics.find((x) => x.id === "PEN_NIB");
			const count = (relic?.counter ?? 0) + 1;
			return setRelicCounter(ctx.state, "PEN_NIB", count);
		},
		atDamageGive: (ctx, damage, card) => {
			if (!card || !isAttack(card)) return damage;
			const relic = ctx.state.relics.find((x) => x.id === "PEN_NIB");
			if (!relic || relic.counter < 10) return damage;
			return {
				value: damage * 2,
				state: setRelicCounter(ctx.state, "PEN_NIB", 0),
			};
		},
	},
}));

// Red Skull — while HP ≤ 50%, +3 strength
registerRelicHooks("RED_SKULL", () => ({
	relicId: "RED_SKULL",
	hooks: {
		wasHPLost: (ctx, amount) => {
			if (amount <= 0) return ctx.state;
			const half = Math.floor(ctx.state.maxHp / 2);
			const wasAbove = ctx.state.currentHp + amount > half;
			const nowBelow = ctx.state.currentHp <= half;
			if (wasAbove && nowBelow) {
				return addPlayerPower(ctx.state, "strength", relicVal("RED_SKULL", 0, 3));
			}
			return ctx.state;
		},
		onHeal: (ctx, amount) => {
			const half = Math.floor(ctx.state.maxHp / 2);
			if (ctx.state.currentHp <= half && ctx.state.currentHp + amount > half) {
				return {
					value: amount,
					state: addPlayerPower(ctx.state, "strength", -relicVal("RED_SKULL", 0, 3)),
				};
			}
			return amount;
		},
	},
}));

// The Boot — attacks dealing <5 damage deal 5 instead
registerRelicHooks("THE_BOOT", () => ({
	relicId: "THE_BOOT",
	hooks: {
		atDamageFinalGive: (_ctx, damage, card) => {
			if (!card || !isAttack(card)) return damage;
			return damage > 0 && damage < 5 ? 5 : damage;
		},
	},
}));

// Toy Ornithopter — when using a potion, heal 5
registerRelicHooks("TOY_ORNITHOPTER", () => ({
	relicId: "TOY_ORNITHOPTER",
	hooks: {
		onUsePotion: (ctx) => heal(ctx.state, relicVal("TOY_ORNITHOPTER", 0, 5)),
	},
}));

// Vajra — +1 strength at start of combat
registerRelicHooks("VAJRA", () => ({
	relicId: "VAJRA",
	hooks: {
		atBattleStart: (ctx) => addPlayerPower(ctx.state, "strength", 1),
	},
}));
