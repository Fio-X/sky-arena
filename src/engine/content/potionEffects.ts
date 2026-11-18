import type { Action, ActorRef, GameState, PotionId, PowerId } from "../core/types";

export type PotionEffectFn = (state: GameState, targetIndex: number) => Action[];

const registry = new Map<string, PotionEffectFn>();

export function registerPotionEffect(id: string, fn: PotionEffectFn): void {
	registry.set(id, fn);
}

export function getPotionEffect(id: PotionId | string): PotionEffectFn | undefined {
	return registry.get(id);
}

// ── Helper ───────────────────────────────────────────────

const player: ActorRef = { type: "player" };
function monster(i: number): ActorRef {
	return { type: "monster", index: i };
}
function pow(id: string): PowerId {
	return id as PowerId;
}

// ── Common potions (shared + red) ────────────────────────

registerPotionEffect("FIRE_POTION", (_s, t) => [
	{ type: "damage", source: player, target: monster(t), baseDamage: 20, hits: 1 },
]);

registerPotionEffect("BLOCK_POTION", () => [{ type: "block", source: player, amount: 12 }]);

registerPotionEffect("STRENGTH_POTION", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("strength"), amount: 2 },
]);

registerPotionEffect("DEXTERITY_POTION", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("dexterity"), amount: 2 },
]);

registerPotionEffect("ENERGY_POTION", () => [{ type: "gainEnergy", amount: 2 }]);

registerPotionEffect("SWIFT_POTION", () => [{ type: "drawCards", count: 3 }]);

registerPotionEffect("FEAR_POTION", (_s, t) => [
	{ type: "applyPower", source: player, target: monster(t), powerId: pow("vulnerable"), amount: 3 },
]);

registerPotionEffect("WEAK_POTION", (_s, t) => [
	{ type: "applyPower", source: player, target: monster(t), powerId: pow("weak"), amount: 3 },
]);

registerPotionEffect("EXPLOSIVE_POTION", (s) => {
	if (!s.combat) return [];
	return s.combat.monsters
		.filter((m) => m.alive)
		.map((m) => ({
			type: "damage" as const,
			source: player,
			target: monster(m.index),
			baseDamage: 10,
			hits: 1,
		}));
});

registerPotionEffect("FLEX_POTION", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("strength"), amount: 5 },
	{
		type: "applyPower",
		source: player,
		target: player,
		powerId: pow("loseStrength") as PowerId,
		amount: 5,
	},
]);

registerPotionEffect("SPEED_POTION", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("dexterity"), amount: 5 },
	{
		type: "applyPower",
		source: player,
		target: player,
		powerId: pow("loseDexterity") as PowerId,
		amount: 5,
	},
]);

// ── Red class potions ────────────────────────────────────

registerPotionEffect("BLOOD_POTION", (s) => [
	{ type: "heal", target: player, amount: Math.floor(s.maxHp * 0.2) },
]);

// Fruit Juice — works outside combat
registerPotionEffect("FRUIT_JUICE", () => [{ type: "gainMaxHp", amount: 5 }]);

// Cultist Potion — gain 1 Ritual
registerPotionEffect("CULTIST_POTION", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("RITUAL"), amount: 1 },
]);

// Ancient Potion — gain 1 Artifact
registerPotionEffect("ANCIENT_POTION", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("ARTIFACT"), amount: 1 },
]);

// Liquid Bronze — gain 3 Thorns
registerPotionEffect("LIQUID_BRONZE", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("thorns"), amount: 3 },
]);

// Essence of Steel — gain 4 Plated Armor
registerPotionEffect("ESSENCE_OF_STEEL", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("PLATED_ARMOR"), amount: 4 },
]);

// Regen Potion — gain 5 Regen
registerPotionEffect("REGEN_POTION", () => [
	{ type: "applyPower", source: player, target: player, powerId: pow("REGENERATION"), amount: 5 },
]);

// Heart of Iron — gain 6 Metallicize
registerPotionEffect("HEART_OF_IRON", () => [
	{
		type: "applyPower",
		source: player,
		target: player,
		powerId: pow("metallicize"),
		amount: 6,
	},
]);
