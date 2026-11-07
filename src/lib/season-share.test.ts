import { describe, expect, it } from "vitest";
import { seasonShare, seasonText } from "./season-share";
import type { StandingRow } from "./standings";

const row = (
	userId: string,
	total: number,
	byWeek: Record<number, number>,
): StandingRow => ({ userId, total, correct: 0, byWeek });

const names = new Map([
	["a", "queen_brooklet"],
	["b", "cowboard"],
	["c", "HE STEVE ME"],
]);

describe("seasonShare", () => {
	it("is null before any game is final", () => {
		expect(
			seasonShare({
				rows: [row("a", 0, {})],
				names,
				weeks: { 1: { total: 16, final: 0 } },
				league: "L",
			}),
		).toBeNull();
	});

	it("shows places, last week's points, the gap and who moved", () => {
		const share = seasonShare({
			rows: [
				row("a", 628, { 8: 60, 9: 40 }),
				row("b", 610, { 8: 80, 9: 15 }),
				row("c", 593, { 8: 86, 9: 8 }),
			],
			names,
			weeks: {
				8: { total: 14, final: 14 },
				9: { total: 14, final: 14 },
			},
			league: "Airbud Thunderdome",
		});
		expect(share?.status).toEqual({ kind: "final", label: "After Week 9" });
		// Before week 9: a 588, b 595, c 585 → b 1st, a 2nd, c 3rd.
		expect(
			share?.rows.map((r) => [r.place, r.week, r.moved, r.behind]),
		).toEqual([
			[1, 40, 1, 0],
			[2, 15, -1, 18],
			[3, 8, 0, 35],
		]);
	});

	it("says the week is still going and skips moves in week 1", () => {
		const share = seasonShare({
			rows: [row("a", 20, { 1: 20 }), row("b", 10, { 1: 10 })],
			names,
			weeks: { 1: { total: 16, final: 3 } },
			league: "L",
		});
		expect(share?.status.label).toBe("Week 1 so far");
		expect(share?.rows.every((r) => r.moved === 0)).toBe(true);
	});
});

describe("seasonText", () => {
	it("lines the table up in a code block", () => {
		const share = seasonShare({
			rows: [row("a", 628, { 8: 0, 9: 15 }), row("b", 593, { 8: 0, 9: 50 })],
			names,
			weeks: { 9: { total: 14, final: 14 } },
			league: "Airbud Thunderdome",
		});
		if (!share) throw new Error("no share");
		expect(seasonText(share)).toBe(
			[
				"🏆 Airbud Thunderdome · Season standings · After Week 9",
				"```",
				"                   Total  Wk 9",
				"1  queen_brooklet    628   +15",
				"2  cowboard          593   +50",
				"```",
			].join("\n"),
		);
	});
});
