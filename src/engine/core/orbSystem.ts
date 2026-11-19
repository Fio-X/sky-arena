import { applyDamage, calculateBlock } from "../combat/damage";
import { random } from "../rng/stsRandom";
import { fireHook } from "./hooks";
import type {
	ActorRef,
	GameEvent,
	GameState,
	OrbInstance,
	OrbType,
	PlayerCombatState,
} from "./types";

function getFocus(player: PlayerCombatState): number {
	const p = player.powers.find((pw) => pw.id === "FOCUS");
	return p ? p.amount : 0;
}

function hasLockOn(state: GameState, target: ActorRef): boolean {
	if (target.type !== "monster") return false;
	const m = state.combat?.monsters[target.index];
	if (!m?.alive) return false;
	return m.powers.some((p) => p.id === "LOCK_ON");
}

function applyLockOn(damage: number, state: GameState, target: ActorRef): number {
	if (!hasLockOn(state, target)) return damage;
	return Math.floor(damage * 1.5);
}

function makeOrb(orbType: OrbType): OrbInstance {
	switch (orbType) {
		case "lightning":
			return { type: "lightning", passive: 3, evoke: 8 };
		case "frost":
			return { type: "frost", passive: 2, evoke: 5 };
		case "dark":
			return { type: "dark", passive: 6, evoke: 0 };
		case "plasma":
			return { type: "plasma", passive: 1, evoke: 2 };
		default:
			return { type: "empty", passive: 0, evoke: 0 };
	}
}

export function channelOrb(
	state: GameState,
	orbType: OrbType,
	events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
	let s = state;
	const c = s.combat;
	if (!c) return { state: s, events };

	const orb = makeOrb(orbType);

	if (c.player.orbs.length >= c.player.orbSlots) {
		const evoked = evokeOrb(s, 1, events);
		s = evoked.state;
		events = evoked.events;
	}

	const c2 = s.combat;
	if (!c2) return { state: s, events };

	const newOrbs = [...c2.player.orbs, orb];
	s = {
		...s,
		combat: { ...c2, player: { ...c2.player, orbs: newOrbs } },
	};

	s = fireHook(s, { type: "player" }, "onChannel", orbType);
	events.push({ type: "orbChanneled", orbType });

	// Track channeled counts for Thunder Strike / Blizzard
	const c3 = s.combat;
	if (c3) {
		if (orbType === "lightning") {
			s = { ...s, combat: { ...c3, lightningChanneled: c3.lightningChanneled + 1 } };
		} else if (orbType === "frost") {
			s = { ...s, combat: { ...c3, frostChanneled: c3.frostChanneled + 1 } };
		}
	}

	return { state: s, events };
}

export function evokeOrb(
	state: GameState,
	times: number,
	events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
	let s = state;
	for (let t = 0; t < times; t++) {
		const c = s.combat;
		if (!c || c.player.orbs.length === 0) break;

		const firstOrb = c.player.orbs[0];
		if (!firstOrb) break;
		const remaining = c.player.orbs.slice(1);
		s = {
			...s,
			combat: { ...c, player: { ...c.player, orbs: remaining } },
		};

		const result = executeEvokeEffect(s, firstOrb, events);
		s = result.state;
		events = result.events;

		s = fireHook(s, { type: "player" }, "onEvoke", firstOrb.type);
	}
	return { state: s, events };
}

function executeEvokeEffect(
	state: GameState,
	orb: OrbInstance,
	events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
	let s = state;
	const c = s.combat;
	if (!c) return { state: s, events };
	const focus = getFocus(c.player);

	switch (orb.type) {
		case "lightning": {
			const baseDmg = orb.evoke + focus;
			const pick = pickLightningTarget(s);
			s = pick.state;
			if (pick.target) {
				const dmg = applyLockOn(Math.max(0, baseDmg), s, pick.target);
				const applied = applyDamage(s, pick.target, dmg);
				s = applied.state;
				events.push({ type: "orbEvoked", orbType: "lightning", damage: dmg });
			}
			break;
		}
		case "frost": {
			const blockAmt = Math.max(0, orb.evoke + focus);
			const calc = calculateBlock(s, { type: "player" }, blockAmt, null);
			s = calc.state;
			const c3 = s.combat;
			if (c3) {
				s = {
					...s,
					combat: { ...c3, player: { ...c3.player, block: c3.player.block + calc.block } },
				};
			}
			events.push({ type: "orbEvoked", orbType: "frost", damage: 0 });
			break;
		}
		case "dark": {
			const baseDmg = orb.passive > 0 ? orb.passive : orb.evoke;
			const accumulated = Math.max(0, baseDmg);
			const target = pickDarkTarget(s);
			if (target) {
				const dmg = applyLockOn(accumulated, s, target);
				const applied = applyDamage(s, target, dmg);
				s = applied.state;
				events.push({ type: "orbEvoked", orbType: "dark", damage: dmg });
			}
			break;
		}
		case "plasma": {
			const c4 = s.combat;
			if (c4) {
				s = { ...s, combat: { ...c4, energy: c4.energy + 2 } };
			}
			events.push({ type: "orbEvoked", orbType: "plasma", damage: 0 });
			break;
		}
		default:
			break;
	}
	return { state: s, events };
}

export function triggerOrbPassives(
	state: GameState,
	events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
	let s = state;
	const c = s.combat;
	if (!c) return { state: s, events };
	const focus = getFocus(c.player);

	const newOrbs: OrbInstance[] = [];
	for (const orb of c.player.orbs) {
		switch (orb.type) {
			case "lightning": {
				const baseDmg = Math.max(0, orb.passive + focus);
				const pick = pickLightningTarget(s);
				s = pick.state;
				if (pick.target) {
					const dmg = applyLockOn(baseDmg, s, pick.target);
					const applied = applyDamage(s, pick.target, dmg);
					s = applied.state;
				}
				newOrbs.push(orb);
				break;
			}
			case "frost": {
				const blockAmt = Math.max(0, orb.passive + focus);
				const calc = calculateBlock(s, { type: "player" }, blockAmt, null);
				s = calc.state;
				const c2 = s.combat;
				if (c2) {
					s = {
						...s,
						combat: { ...c2, player: { ...c2.player, block: c2.player.block + calc.block } },
					};
				}
				newOrbs.push(orb);
				break;
			}
			case "dark": {
				const gain = Math.max(0, orb.passive + focus);
				newOrbs.push({ ...orb, passive: (orb.passive || orb.evoke) + gain });
				break;
			}
			case "plasma": {
				const c3 = s.combat;
				if (c3) {
					s = { ...s, combat: { ...c3, energy: c3.energy + 1 } };
				}
				newOrbs.push(orb);
				break;
			}
			default:
				newOrbs.push(orb);
		}
	}

	const c5 = s.combat;
	if (c5) {
		s = { ...s, combat: { ...c5, player: { ...c5.player, orbs: newOrbs } } };
	}
	return { state: s, events };
}

function pickLightningTarget(state: GameState): { target: ActorRef | null; state: GameState } {
	const c = state.combat;
	if (!c) return { target: null, state };
	const alive = c.monsters.filter((m) => m.alive);
	if (alive.length === 0) return { target: null, state };
	const first = alive[0];
	if (!first) return { target: null, state };
	if (alive.length === 1) return { target: { type: "monster", index: first.index }, state };
	const roll = random(state.rng.miscRng, alive.length - 1);
	const picked = alive[roll.value];
	if (!picked) return { target: null, state };
	const s = { ...state, rng: { ...state.rng, miscRng: roll.state } };
	return { target: { type: "monster", index: picked.index }, state: s };
}

function pickDarkTarget(state: GameState): ActorRef | null {
	const c = state.combat;
	if (!c) return null;
	let lowest: { index: number; hp: number } | null = null;
	for (const m of c.monsters) {
		if (!m.alive) continue;
		if (!lowest || m.currentHp < lowest.hp) {
			lowest = { index: m.index, hp: m.currentHp };
		}
	}
	return lowest ? { type: "monster", index: lowest.index } : null;
}

export function addOrbSlots(state: GameState, count: number): GameState {
	const c = state.combat;
	if (!c) return state;
	return {
		...state,
		combat: { ...c, player: { ...c.player, orbSlots: c.player.orbSlots + count } },
	};
}

export function removeOrbSlot(state: GameState): GameState {
	const c = state.combat;
	if (!c) return state;
	const newSlots = Math.max(0, c.player.orbSlots - 1);
	let orbs = c.player.orbs;
	if (orbs.length > newSlots) {
		orbs = orbs.slice(orbs.length - newSlots);
	}
	return {
		...state,
		combat: { ...c, player: { ...c.player, orbSlots: newSlots, orbs } },
	};
}

export function removeAllOrbs(state: GameState): { state: GameState; orbs: OrbInstance[] } {
	const c = state.combat;
	if (!c) return { state, orbs: [] };
	const orbs = [...c.player.orbs];
	return {
		state: { ...state, combat: { ...c, player: { ...c.player, orbs: [] } } },
		orbs,
	};
}
