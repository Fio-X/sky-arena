import type { RngState } from "../core/types";

// ── MurmurHash3 64-bit finalizer ──────────────────────────

const C1 = 0xff51afd7ed558ccdn;
const C2 = 0xc4ceb9fe1a85ec53n;
const MASK64 = 0xffffffffffffffffn;

export function murmurHash3(input: bigint): bigint {
	let x = input & MASK64;
	x ^= x >> 33n;
	x = (x * C1) & MASK64;
	x ^= x >> 33n;
	x = (x * C2) & MASK64;
	x ^= x >> 33n;
	return x;
}

// ── Create RNG state from seed ────────────────────────────

const ONE_MSB = 1n << 63n;

export function createRng(seed: bigint): RngState {
	const s = seed === 0n ? ONE_MSB : seed;
	const seed0 = murmurHash3(s);
	const seed1 = murmurHash3(seed0);
	return { seed0, seed1, counter: 0 };
}

// ── xorshift128+ core ─────────────────────────────────────

function nextLong(state: RngState): { value: bigint; state: RngState } {
	let s1 = state.seed0;
	const s0 = state.seed1;
	const newSeed0 = s0;
	s1 ^= (s1 << 23n) & MASK64;
	const newSeed1 = (s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n)) & MASK64;
	const value = (newSeed1 + s0) & MASK64;
	return {
		value,
		state: { seed0: newSeed0, seed1: newSeed1, counter: state.counter },
	};
}

// ── nextInt with rejection sampling (matches sts_lightspeed) ──
// Uses unsigned >> 1 to get [0, 2^63), then modulo + Java-style rejection.

function nextIntBounded(state: RngState, bound: bigint): { value: number; state: RngState } {
	let s = state;
	let bits: bigint;
	let val: bigint;
	do {
		const r = nextLong(s);
		s = r.state;
		bits = r.value >> 1n;
		val = bits % bound;
	} while (bits - val + (bound - 1n) < 0n);
	return { value: Number(val), state: s };
}

// ── Public API (all return new state — pure functions) ────

export function random(state: RngState, range: number): { value: number; state: RngState } {
	const newCounter = state.counter + 1;
	const { value, state: newState } = nextIntBounded(
		{ ...state, counter: newCounter },
		BigInt(range + 1),
	);
	return { value, state: { ...newState, counter: newCounter } };
}

/** Random.randomLong: one raw 64-bit draw (seeds java.util.Random for Collections.shuffle). */
export function randomLong(state: RngState): { value: bigint; state: RngState } {
	const newCounter = state.counter + 1;
	const { value, state: newState } = nextLong({ ...state, counter: newCounter });
	return { value, state: { ...newState, counter: newCounter } };
}

export function randomBoolean(state: RngState): { value: boolean; state: RngState } {
	const newCounter = state.counter + 1;
	const { value: raw, state: newState } = nextLong({ ...state, counter: newCounter });
	return {
		value: (raw & 1n) === 1n,
		state: { ...newState, counter: newCounter },
	};
}

export function randomFloat(state: RngState): { value: number; state: RngState } {
	const newCounter = state.counter + 1;
	const { value: raw, state: newState } = nextLong({ ...state, counter: newCounter });
	const top24 = Number(raw >> 40n) & 0xffffff;
	const float = top24 / 0x1000000; // 2^24
	return { value: float, state: { ...newState, counter: newCounter } };
}

export function randomBooleanWithChance(
	state: RngState,
	chance: number,
): { value: boolean; state: RngState } {
	const { value: float, state: newState } = randomFloat(state);
	return {
		value: Math.fround(float) < Math.fround(chance),
		state: newState,
	};
}

// ── Fisher-Yates shuffle using xorshift128+ ─────────────

export function stsShuffle<T>(arr: readonly T[], rng: RngState): { result: T[]; rng: RngState } {
	const result = [...arr];
	let s = rng;
	for (let i = result.length - 1; i > 0; i--) {
		const r = random(s, i);
		s = r.state;
		const j = r.value;
		const tmp = result[i] as T;
		result[i] = result[j] as T;
		result[j] = tmp;
	}
	return { result, rng: s };
}

// ── Initialize all 14 RNG streams from a single run seed ──

export function createAllStreams(runSeed: bigint) {
	return {
		cardRng: createRng(runSeed),
		relicRng: createRng(runSeed),
		potionRng: createRng(runSeed),
		monsterRng: createRng(runSeed),
		eventRng: createRng(runSeed),
		merchantRng: createRng(runSeed),
		treasureRng: createRng(runSeed),
		mapRng: createRng(runSeed),
		neowRng: createRng(runSeed),
		miscRng: createRng(runSeed),
		shuffleRng: createRng(runSeed),
		cardRandomRng: createRng(runSeed),
		aiRng: createRng(runSeed),
		monsterHpRng: createRng(runSeed),
	};
}

// ── Per-floor stream re-seeding ───────────────────────────

export function createFloorRng(
	runSeed: bigint,
	floorNum: number,
): { aiRng: RngState; monsterHpRng: RngState } {
	const floorSeed = (runSeed + BigInt(floorNum)) & MASK64;
	return {
		aiRng: createRng(floorSeed),
		monsterHpRng: createRng(floorSeed),
	};
}
