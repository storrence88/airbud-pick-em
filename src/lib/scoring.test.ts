import { describe, expect, it } from "vitest";
import {
	type GameResult,
	pickOutcome,
	scorePick,
	scoreWeek,
	validateConfidence,
} from "./scoring";

const game = (over: Partial<GameResult> = {}): GameResult => ({
	id: "g1",
	homeTeam: "KC",
	awayTeam: "BUF",
	homeScore: 24,
	awayScore: 20,
	final: true,
	lockedSpread: -3.5,
	...over,
});

describe("straight up", () => {
	it("scores the winner", () => {
		expect(
			scorePick({ gameId: "g1", team: "KC" }, game(), { mode: "straight" }),
		).toBe(1);
		expect(
			scorePick({ gameId: "g1", team: "BUF" }, game(), { mode: "straight" }),
		).toBe(0);
	});
	it("treats unfinished games as pending", () => {
		expect(
			pickOutcome(
				{ gameId: "g1", team: "KC" },
				game({ final: false }),
				"straight",
			),
		).toBe("pending");
	});
});

describe("against the spread", () => {
	it("favorite must cover", () => {
		// KC wins by 4 laying 3.5: covers
		expect(pickOutcome({ gameId: "g1", team: "KC" }, game(), "spread")).toBe(
			"win",
		);
		// KC wins by 3 laying 3.5: BUF covers
		expect(
			pickOutcome(
				{ gameId: "g1", team: "BUF" },
				game({ homeScore: 23 }),
				"spread",
			),
		).toBe("win");
	});
	it("handles pushes with configurable value", () => {
		const push = game({ homeScore: 23, lockedSpread: -3 });
		expect(pickOutcome({ gameId: "g1", team: "KC" }, push, "spread")).toBe(
			"push",
		);
		expect(
			scorePick({ gameId: "g1", team: "KC" }, push, { mode: "spread" }),
		).toBe(0);
		expect(
			scorePick({ gameId: "g1", team: "KC" }, push, {
				mode: "spread",
				pushValue: 0.5,
			}),
		).toBe(0.5);
	});
});

describe("confidence", () => {
	it("earns the confidence value of correct picks", () => {
		const games = [game(), game({ id: "g2", homeScore: 10 })];
		const picks = [
			{ gameId: "g1", team: "KC", confidence: 2 },
			{ gameId: "g2", team: "KC", confidence: 1 },
		];
		expect(scoreWeek(picks, games, { mode: "confidence" })).toBe(2);
	});
	it("validates a full permutation", () => {
		expect(
			validateConfidence(
				[
					{ gameId: "a", team: "x", confidence: 1 },
					{ gameId: "b", team: "y", confidence: 2 },
				],
				2,
			),
		).toBe(true);
		expect(
			validateConfidence(
				[
					{ gameId: "a", team: "x", confidence: 2 },
					{ gameId: "b", team: "y", confidence: 2 },
				],
				2,
			),
		).toBe(false);
	});
});
