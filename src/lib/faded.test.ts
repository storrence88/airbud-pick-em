import { describe, expect, it } from "vitest";
import { type FadeGame, fadedThePublic } from "./faded";

const game: FadeGame = {
	id: "g1",
	state: "post",
	home: { abbr: "KC" },
	away: { abbr: "LV" },
	homeScore: 17,
	awayScore: 20,
	lockedSpread: -9.5,
};
const picks = [
	{ user_id: "a", game_id: "g1", team: "LV" },
	{ user_id: "b", game_id: "g1", team: "KC" },
	{ user_id: "c", game_id: "g1", team: "LV" },
	{ user_id: "d", game_id: "g2", team: "LV" },
];

describe("fadedThePublic", () => {
	it("names everyone who won on the side 80%+ of ESPN faded", () => {
		expect(
			fadedThePublic(game, { home: 86, away: 14 }, picks, "straight"),
		).toEqual({ team: "LV", crowd: 86, userIds: ["a", "c"] });
	});

	it("counts exactly 80% as a fade", () => {
		expect(
			fadedThePublic(game, { home: 80, away: 20 }, picks, "straight")?.crowd,
		).toBe(80);
	});

	it("needs a lopsided crowd", () => {
		expect(
			fadedThePublic(game, { home: 79, away: 21 }, picks, "straight"),
		).toBeNull();
	});

	it("needs the pick to win", () => {
		const kcWon = { ...game, homeScore: 30 };
		expect(
			fadedThePublic(kcWon, { home: 86, away: 14 }, picks, "straight"),
		).toBeNull();
	});

	it("waits for the final and for a split", () => {
		expect(
			fadedThePublic(
				{ ...game, state: "in" },
				{ home: 86, away: 14 },
				picks,
				"straight",
			),
		).toBeNull();
		expect(fadedThePublic(game, null, picks, "straight")).toBeNull();
	});

	it("uses the league's scoring against the spread", () => {
		// KC wins by 3 but doesn't cover -9.5, so the LV pick wins ATS.
		const close = { ...game, homeScore: 23 };
		expect(
			fadedThePublic(close, { home: 90, away: 10 }, picks, "spread")?.userIds,
		).toEqual(["a", "c"]);
		expect(
			fadedThePublic(close, { home: 90, away: 10 }, picks, "straight"),
		).toBeNull();
	});
});
