import { describe, expect, it } from "vitest";
import { createJavaRandom, nextInt as javaNextInt, javaShuffle } from "./javaRandom";
import { createRng, random, randomBooleanWithChance } from "./stsRandom";

// Test vectors from slay-the-cli: data-reference/rng-vectors.json

describe("sts Random — random(99)", () => {
	const cases: Record<string, number[]> = {
		"1": [55, 5, 88, 32, 21, 19, 63, 84, 80, 8, 90, 20, 23, 4, 24, 51, 8, 66, 7, 4],
		"42": [24, 41, 71, 88, 61, 27, 25, 23, 77, 87, 34, 77, 95, 19, 33, 70, 49, 17, 31, 71],
		"123456789": [47, 63, 62, 86, 15, 91, 19, 52, 58, 87, 2, 81, 75, 34, 31, 63, 64, 77, 23, 33],
		"0": [72, 60, 52, 92, 31, 68, 42, 24, 79, 31, 24, 91, 20, 76, 55, 67, 63, 97, 38, 96],
		"18446744073709551615": [
			41, 62, 73, 81, 37, 10, 96, 90, 61, 47, 22, 93, 54, 5, 11, 89, 12, 1, 90, 98,
		],
	};

	for (const [seed, expected] of Object.entries(cases)) {
		it(`seed=${seed}: first 20 random(99) values`, () => {
			let rng = createRng(BigInt(seed));
			const results: number[] = [];
			for (let i = 0; i < 20; i++) {
				const r = random(rng, 99);
				results.push(r.value);
				rng = r.state;
			}
			expect(results).toEqual(expected);
		});
	}
});

describe("sts Random — randomBoolean with chance", () => {
	it("seed=555, chance=0.4: first 30 values", () => {
		const expected = [
			1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1,
		];
		let rng = createRng(555n);
		const results: number[] = [];
		for (let i = 0; i < 30; i++) {
			const r = randomBooleanWithChance(rng, 0.4);
			results.push(r.value ? 1 : 0);
			rng = r.state;
		}
		expect(results).toEqual(expected);
	});
});

describe("Java Random — nextInt", () => {
	it("seed=123456789, bound=60: first 20 values", () => {
		const expected = [25, 0, 23, 4, 30, 34, 33, 7, 37, 47, 41, 41, 24, 22, 44, 21, 40, 49, 50, 19];
		let jrng = createJavaRandom(123456789n);
		const results: number[] = [];
		for (let i = 0; i < 20; i++) {
			const r = javaNextInt(jrng, 60);
			results.push(r.value);
			jrng = r.state;
		}
		expect(results).toEqual(expected);
	});
});

describe("Java Collections.shuffle", () => {
	it("seed=42, 20 elements", () => {
		const expected = [15, 16, 14, 13, 5, 11, 17, 18, 8, 2, 6, 7, 3, 1, 19, 4, 12, 0, 9, 10];
		const arr = Array.from({ length: 20 }, (_, i) => i);
		const jrng = createJavaRandom(42n);
		javaShuffle(arr, jrng);
		expect(arr).toEqual(expected);
	});
});
