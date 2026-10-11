import { describe, expect, it } from "vitest";
import type { Game } from "#/lib/nfl/types";
import { fromRow, type GameRow, lockSpread, toRow } from "./sync";

const team = (abbr: string) => ({
	id: abbr,
	abbr,
	name: abbr,
	shortName: abbr,
	color: "#000",
	altColor: "#fff",
	logo: "",
});
const game = (over: Partial<Game> = {}): Game => ({
	id: "1",
	season: 2026,
	week: 6,
	kickoff: "2026-10-11T17:00Z",
	state: "pre",
	statusText: "",
	home: team("KC"),
	away: team("BUF"),
	homeScore: 0,
	awayScore: 0,
	spread: -3,
	spreadText: "KC -3",
	...over,
});

describe("lockSpread", () => {
	it("does not lock before kickoff", () => {
		expect(lockSpread(game())).toBeNull();
	});
	it("locks the last pre-kickoff line, not the live one", () => {
		expect(
			lockSpread(game({ state: "in", spread: -7 }), {
				current_spread: -3,
				locked_spread: null,
			}),
		).toBe(-3);
	});
	it("never changes once locked", () => {
		expect(
			lockSpread(game({ state: "post", spread: 1 }), {
				current_spread: 1,
				locked_spread: -3,
			}),
		).toBe(-3);
	});
});

describe("toRow", () => {
	it("keeps the pre-kickoff line after the game starts", () => {
		const existing = toRow(game()) as GameRow;
		const live = toRow(game({ state: "in", spread: null }), existing);
		expect(live.current_spread).toBe(-3);
		expect(live.locked_spread).toBe(-3);
	});
});

describe("fromRow", () => {
	const row = (over: Partial<GameRow> = {}): GameRow => ({
		...(toRow(game()) as GameRow),
		...over,
	});
	it("rebuilds a saved game with team names and the line", () => {
		const g = fromRow(row());
		expect(g.home).toMatchObject({ abbr: "KC", name: "Kansas City Chiefs" });
		expect(g.spreadText).toBe("KC -3");
		expect(fromRow(row({ current_spread: 2.5 })).spreadText).toBe("BUF -2.5");
	});
	it("labels finished games", () => {
		expect(fromRow(row({ state: "post" })).statusText).toBe("Final");
	});
});
