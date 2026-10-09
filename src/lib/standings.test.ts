import { describe, expect, it } from "vitest";
import { computeStandings } from "./standings";

const g = {
	id: "g1",
	week: 5,
	home_team: "KC",
	away_team: "BUF",
	home_score: 24,
	away_score: 20,
	locked_spread: -6.5,
};

describe("computeStandings", () => {
	it("ranks members and includes people with no picks", () => {
		const picks = [
			{ user_id: "a", game_id: "g1", team: "KC", confidence: null },
			{ user_id: "b", game_id: "g1", team: "BUF", confidence: null },
		];
		const straight = computeStandings(["a", "b", "c"], picks, [g], {
			mode: "straight",
		});
		expect(straight.map((r) => r.userId)).toEqual(["a", "b", "c"]);
		expect(straight[0].byWeek[5]).toBe(1);
		const ats = computeStandings(["a", "b"], picks, [g], { mode: "spread" });
		expect(ats[0]).toMatchObject({ userId: "b", total: 1 });
	});
});
