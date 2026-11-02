import { describe, expect, it } from "vitest";
import type { Game, Team } from "./nfl/types";
import {
	groupShare,
	groupText,
	maxPoints,
	ordinal,
	personalText,
	shareablePicks,
	shareCard,
	shareText,
	squares,
	weekStatus,
} from "./share-card";
import { weekResults } from "./week-results";

const team = (abbr: string): Team => ({
	id: abbr,
	abbr,
	name: abbr,
	shortName: abbr,
	color: "#000000",
	altColor: "#ffffff",
	logo: "",
});

const game = (
	id: string,
	home: number,
	away: number,
	state: Game["state"] = "post",
): Game & { lockedSpread: number | null } => ({
	id,
	season: 2026,
	week: 6,
	kickoff: `2026-10-11T17:0${id.slice(1)}:00Z`,
	state,
	statusText: "Final",
	home: team("KC"),
	away: team("BUF"),
	homeScore: home,
	awayScore: away,
	spread: -3,
	spreadText: "KC -3",
	lockedSpread: -3,
});

const pick = (
	user_id: string,
	game_id: string,
	team: string,
	extra: { confidence?: number; is_lock?: boolean } = {},
) => ({
	user_id,
	game_id,
	team,
	confidence: extra.confidence ?? null,
	is_lock: extra.is_lock ?? false,
});

const games = [game("g1", 24, 20), game("g2", 17, 17), game("g3", 10, 31)];

// Sunday evening: every fixture game has kicked off by now.
const NOW = Date.parse("2026-10-11T23:00:00Z");

function card(
	picks: ReturnType<typeof pick>[],
	opts: { games?: typeof games; mode?: "straight" | "confidence" } = {},
) {
	const gs = opts.games ?? games;
	const mode = opts.mode ?? "straight";
	return shareCard({
		userId: "me",
		rows: weekResults(["me", "a", "b"], shareablePicks(picks, gs, NOW), gs, {
			mode,
		}),
		games: gs,
		week: 6,
		league: "Sunday Crew",
		mode,
		now: NOW,
	});
}

describe("shareCard", () => {
	it("sums the record, the lock and the place", () => {
		const c = card([
			pick("me", "g1", "KC", { is_lock: true }),
			pick("me", "g2", "KC"),
			pick("me", "g3", "KC"),
			pick("a", "g1", "KC"),
			pick("a", "g3", "BUF"),
		]);
		expect(c).toMatchObject({
			record: "1-1-1",
			points: null,
			lock: { team: "KC", hit: true },
			place: "2nd of 2",
			winner: false,
			missed: 0,
		});
		expect(c?.picks.map((p) => p.outcome)).toEqual(["win", "push", "loss"]);
	});

	it("shares a week in progress without a final place", () => {
		const live = [games[0], games[1], game("g3", 0, 0, "in")];
		const c = card(
			[pick("me", "g1", "KC"), pick("me", "g3", "BUF", { is_lock: true })],
			{ games: live },
		);
		expect(c).toMatchObject({
			status: { kind: "live", label: "Live" },
			record: "1-0",
			live: 1,
			missed: 1,
			lock: { team: "BUF", hit: null, live: true },
			winner: false,
		});
		expect(c?.picks.map((p) => p.outcome)).toEqual(["win", "missed", "live"]);
	});

	it("never shares a pick before its game kicks off", () => {
		const monday = {
			...game("g3", 0, 0, "pre"),
			kickoff: "2026-10-13T00:15:00Z",
		};
		const c = card(
			[
				pick("me", "g1", "KC"),
				pick("me", "g3", "BUF", { is_lock: true, confidence: 9 }),
			],
			{ games: [games[0], games[1], monday] },
		);
		expect(c?.picks[2]).toEqual({
			team: "",
			outcome: "hidden",
			isLock: false,
			confidence: null,
		});
		expect(c?.lock).toBeNull();
		expect(c?.hidden).toBe(1);
		expect(c?.status.label).toBe("Through Sunday");
	});

	it("waits for the first kickoff", () => {
		const early = Date.parse("2026-10-01T00:00:00Z");
		const pre = games.map((g) => ({ ...g, state: "pre" as const }));
		expect(weekStatus(pre, early)).toBeNull();
		expect(weekStatus(pre, NOW)?.kind).toBe("live");
	});

	it("needs at least one pick", () => {
		expect(card([pick("a", "g1", "KC")])).toBeNull();
	});

	it("marks missed games and skips the place when only you played", () => {
		const c = card([pick("me", "g1", "KC"), pick("me", "g3", "BUF")]);
		expect(c).toMatchObject({ record: "2-0", missed: 1, place: null });
		expect(c?.picks[1]).toMatchObject({ outcome: "missed", team: "" });
		expect(c?.lock).toBeNull();
	});

	it("names the winner and co-winners", () => {
		expect(card([pick("me", "g1", "KC"), pick("a", "g1", "BUF")])?.place).toBe(
			"Won the week",
		);
		expect(card([pick("me", "g1", "KC"), pick("a", "g1", "KC")])?.place).toBe(
			"Co-winner",
		);
	});

	it("shows points in confidence leagues", () => {
		const c = card(
			[
				pick("me", "g1", "KC", { confidence: 3 }),
				pick("me", "g3", "BUF", { confidence: 2, is_lock: true }),
			],
			{ mode: "confidence" },
		);
		expect(c).toMatchObject({ points: 5, record: "2-0" });
		expect(shareText(c as NonNullable<typeof c>)).toBe(
			"Week 6: 2-0, 5 pts, Lock hit.",
		);
	});
});

describe("shareText", () => {
	it("reads like a group chat message", () => {
		const c = card([
			pick("me", "g1", "BUF", { is_lock: true }),
			pick("me", "g3", "BUF"),
			pick("a", "g1", "KC"),
		]);
		expect(shareText(c as NonNullable<typeof c>)).toBe(
			"Week 6: 1-1, Lock missed. Co-winner in Sunday Crew.",
		);
	});
});

describe("ordinal", () => {
	it.each([
		[1, "1st"],
		[2, "2nd"],
		[3, "3rd"],
		[4, "4th"],
		[11, "11th"],
		[12, "12th"],
		[21, "21st"],
		[112, "112th"],
	])("%i is %s", (n, s) => expect(ordinal(n)).toBe(s));
});

describe("personalText", () => {
	it("is a Wordle-style row from surest pick to shakiest, hidden last", () => {
		const gs = [
			game("g1", 24, 20),
			game("g2", 10, 31),
			game("g3", 0, 0, "in"),
			{ ...game("g4", 0, 0, "pre"), kickoff: "2026-10-13T00:15:00Z" },
		];
		const c = card(
			[
				pick("me", "g1", "KC", { confidence: 1 }),
				pick("me", "g2", "KC", { confidence: 4, is_lock: true }),
				pick("me", "g3", "KC", { confidence: 2 }),
				pick("me", "g4", "KC", { confidence: 3 }),
				pick("a", "g1", "BUF", { confidence: 4 }),
			],
			{ games: gs, mode: "confidence" },
		);
		expect(squares(c as NonNullable<typeof c>)).toBe("🟥🟦🟩⬛");
		expect(personalText(c as NonNullable<typeof c>, "Steven")).toBe(
			[
				"Sunday Crew · Week 6 · Live",
				"Steven: 1 pts · 1-1 · 1st of 2",
				"🟥🟦🟩⬛",
				"🔒 Lock of the week: Chiefs ❌",
				"1 in progress · 1 pick hidden until kickoff",
			].join("\n"),
		);
	});
});

describe("maxPoints", () => {
	it("adds live picks and the best unused values for unseen games", () => {
		const gs = [
			game("g1", 24, 20),
			game("g2", 0, 0, "in"),
			{ ...game("g3", 0, 0, "pre"), kickoff: "2026-10-13T00:15:00Z" },
			{ ...game("g4", 0, 0, "pre"), kickoff: "2026-10-13T00:16:00Z" },
		];
		const [row] = weekResults(
			["me"],
			[
				pick("me", "g1", "KC", { confidence: 4 }),
				pick("me", "g2", "KC", { confidence: 1 }),
			],
			gs,
			{ mode: "confidence" },
		);
		// 4 won, 1 live, and 3 + 2 are the best values left for the two unseen games.
		expect(maxPoints(row, gs, "confidence", NOW)).toBe(10);
		expect(maxPoints(row, gs, "straight", NOW)).toBe(4 + 1 + 2);
	});
});

describe("groupText", () => {
	const names = new Map([
		["me", "Steven"],
		["a", "Nate"],
		["b", "Josh"],
	]);

	it("lines up a simple standings table with what's left", () => {
		const gs = [
			game("g1", 24, 20),
			{ ...game("g2", 0, 0, "pre"), kickoff: "2026-10-13T00:15:00Z" },
		];
		const picks = [
			pick("me", "g1", "KC", { confidence: 2 }),
			pick("me", "g2", "KC", { confidence: 1 }),
			pick("a", "g1", "BUF", { confidence: 1 }),
		];
		const g = groupShare({
			rows: weekResults(["me", "a", "b"], shareablePicks(picks, gs, NOW), gs, {
				mode: "confidence",
			}),
			names,
			games: gs,
			week: 6,
			league: "Sunday Crew",
			mode: "confidence",
			now: NOW,
		});
		expect(groupText(g as NonNullable<typeof g>)).toBe(
			[
				"🏈 Sunday Crew · Week 6 · Through Sunday",
				"```",
				"1  Steven        2  max 3",
				"2  Nate          0  max 2",
				"2  Josh          0  max 2",
				"```",
				"Still to play: BUF @ KC",
			].join("\n"),
		);
	});

	it("crowns the winner and lists who didn't play once final", () => {
		const picks = [pick("me", "g1", "KC"), pick("a", "g1", "BUF")];
		const g = groupShare({
			rows: weekResults(["me", "a", "b"], picks, games, { mode: "straight" }),
			names,
			games,
			week: 6,
			league: "Sunday Crew",
			mode: "straight",
			now: NOW,
		});
		expect(groupText(g as NonNullable<typeof g>)).toBe(
			[
				"🏈 Sunday Crew · Week 6 · Final",
				"👑 Steven wins the week",
				"```",
				"1  Steven        1-0",
				"2  Nate          0-1",
				"```",
				"No picks: Josh",
			].join("\n"),
		);
	});
});
