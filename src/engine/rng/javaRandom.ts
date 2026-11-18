/**
 * Java-compatible LCG (java.util.Random).
 * Used for map generation and Collections.shuffle in the original game.
 * NOT the same as the xorshift128+ used for combat RNG.
 */

const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK48 = (1n << 48n) - 1n;

export interface JavaRandomState {
	readonly seed: bigint;
}

export function createJavaRandom(seed: bigint): JavaRandomState {
	return { seed: (seed ^ MULTIPLIER) & MASK48 };
}

function next(state: JavaRandomState, bits: number): { value: number; state: JavaRandomState } {
	const newSeed = (state.seed * MULTIPLIER + ADDEND) & MASK48;
	const value = Number(newSeed >> (48n - BigInt(bits)));
	return { value, state: { seed: newSeed } };
}

export function nextInt(
	state: JavaRandomState,
	bound: number,
): { value: number; state: JavaRandomState } {
	if (bound <= 0) throw new Error("bound must be positive");

	// Power-of-two shortcut (use Math.trunc to avoid JS 32-bit truncation on >>)
	if ((bound & (bound - 1)) === 0) {
		const { value: raw, state: s } = next(state, 31);
		return { value: Math.trunc((raw * bound) / 0x80000000), state: s };
	}

	// Rejection loop
	let s = state;
	let bits: number;
	let val: number;
	do {
		const r = next(s, 31);
		bits = r.value;
		s = r.state;
		val = bits % bound;
	} while (bits - val + (bound - 1) < 0);

	return { value: val, state: s };
}

/**
 * Java Collections.shuffle — Fisher-Yates using Java's Random.
 * Mutates the array in place and returns updated RNG state.
 */
export function javaShuffle<T>(arr: T[], state: JavaRandomState): JavaRandomState {
	let s = state;
	for (let i = arr.length; i > 1; i--) {
		const { value: j, state: ns } = nextInt(s, i);
		s = ns;
		const tmp = arr[i - 1];
		arr[i - 1] = arr[j] as T;
		arr[j] = tmp as T;
	}
	return s;
}
