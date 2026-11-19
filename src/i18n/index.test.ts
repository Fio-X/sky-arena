import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, tPower } from "./index";

const original = getLocale();
afterEach(() => setLocale(original));

describe("tPower", () => {
	it("translates lowercase engine power ids (strength, minion) via the UPPERCASE table key", () => {
		setLocale("zh");
		expect(tPower("strength", "Strength")).toBe("力量");
		expect(tPower("STRENGTH", "Strength")).toBe("力量");
		expect(tPower("minion", "Minion")).toBe("仆从");
		expect(tPower("not_a_power", "Fallback")).toBe("Fallback");
	});
});
