import { describe, expect, it } from "vitest";
import { colorDistance, contrast, splitColors } from "./team-colors";

const team = (color: string, altColor: string) => ({ color, altColor });
// ESPN's primary and alternate colors.
const BUF = team("#00338d", "#d50a0a");
const LAR = team("#003594", "#ffd100");
const LV = team("#000000", "#a5acaf");
const NE = team("#002244", "#c60c30");
const HOU = team("#03202f", "#a71930");
const TEN = team("#4b92db", "#0c2340");
const SF = team("#aa0000", "#b3995d");
const IND = team("#003b75", "#ffffff");
const PIT = team("#000000", "#ffb612");

describe("splitColors", () => {
	it("keeps both primaries when they're readable and distinct", () => {
		expect(splitColors(SF, TEN)).toEqual({ away: "#aa0000", home: "#4b92db" });
	});

	it("switches a too-similar team to its alternate", () => {
		expect(splitColors(BUF, LAR)).toEqual({ away: "#00338d", home: "#ffd100" });
	});

	it("swaps dark primaries for their alternates", () => {
		expect(splitColors(LV, NE)).toEqual({ away: "#a5acaf", home: "#c60c30" });
		expect(splitColors(HOU, TEN).away).toBe("#a71930");
		expect(splitColors(IND, PIT).home).toBe("#ffb612");
	});

	it("lightens a team whose colors are all too dark", () => {
		const { away } = splitColors(team("#000000", "#050505"), SF);
		expect(contrast(away, "#181b22")).toBeGreaterThanOrEqual(1.5);
	});

	it("still separates teams with identical colors", () => {
		const { away, home } = splitColors(SF, SF);
		expect(colorDistance(away, home)).toBeGreaterThan(10);
	});
});
