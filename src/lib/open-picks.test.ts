import { describe, expect, it } from "vitest";
import { countdown, openPicksLabel, summarizeOpenPicks } from "./open-picks";

const sun = { kickoff: "2026-10-11T17:00:00Z" };
const snf = { kickoff: "2026-10-12T00:20:00Z" };
const mnf = { kickoff: "2026-10-13T00:15:00Z" };

describe("summarizeOpenPicks", () => {
	it("counts open games across leagues and finds the next kickoff", () => {
		const s = summarizeOpenPicks([
			{ leagueId: "a", games: [snf, mnf] },
			{ leagueId: "b", games: [sun] },
		]);
		expect(s.total).toBe(3);
		expect(s.byLeague).toEqual({ a: 2, b: 1 });
		expect(s.nextKickoff).toBe("2026-10-11T17:00:00.000Z");
		expect(s.firstLeagueId).toBe("b");
	});

	it("leaves out leagues with nothing open", () => {
		const s = summarizeOpenPicks([{ leagueId: "a", games: [] }]);
		expect(s).toEqual({
			total: 0,
			byLeague: {},
			nextKickoff: null,
			firstLeagueId: null,
		});
	});

	it("counts a missing survivor pick as one pick", () => {
		const s = summarizeOpenPicks(
			[{ leagueId: "a", games: [mnf] }],
			[{ leagueId: "a", games: [snf, mnf] }],
		);
		expect(s.total).toBe(2);
		expect(s.byLeague).toEqual({ a: 2 });
		expect(s.nextKickoff).toBe("2026-10-12T00:20:00.000Z");
	});

	it("skips survivor when no game is left to take", () => {
		const s = summarizeOpenPicks([], [{ leagueId: "a", games: [] }]);
		expect(s.total).toBe(0);
	});
});

describe("countdown", () => {
	it("shortens as kickoff gets close", () => {
		expect(countdown((2 * 24 + 4) * 3_600_000 + 60_000)).toBe("2d 4h");
		expect(countdown(3 * 3_600_000 + 12 * 60_000)).toBe("3h 12m");
		expect(countdown(12 * 60_000 + 5_000)).toBe("12m 05s");
		expect(countdown(0)).toBe("now");
	});
});

describe("openPicksLabel", () => {
	it("pluralizes", () => {
		expect(openPicksLabel(1)).toBe("1 open pick");
		expect(openPicksLabel(4)).toBe("4 open picks");
	});
});
