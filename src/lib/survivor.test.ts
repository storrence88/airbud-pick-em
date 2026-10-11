import { describe, expect, it } from "vitest";
import {
	pickResult,
	type SurvivorGame,
	type SurvivorPick,
	survivorState,
} from "./survivor";

const final = (home: number, away: number): SurvivorGame => ({
	state: "post",
	home_team: "KC",
	away_team: "BUF",
	home_score: home,
	away_score: away,
});
const live: SurvivorGame = { ...final(0, 0), state: "in" };

const pick = (
	user_id: string,
	week: number,
	team: string,
	game: SurvivorGame | null,
): SurvivorPick => ({ user_id, week, team, game });

const status = (s: ReturnType<typeof survivorState>, id: string) =>
	s.players.find((p) => p.userId === id);

describe("pickResult", () => {
	it("reads wins, losses and ties from either side", () => {
		expect(pickResult("KC", final(24, 20))).toBe("win");
		expect(pickResult("BUF", final(24, 20))).toBe("loss");
		expect(pickResult("BUF", final(17, 17))).toBe("tie");
		expect(pickResult("KC", live)).toBe("pending");
	});
});

describe("survivorState", () => {
	it("knocks out losses, ties and missed weeks", () => {
		const s = survivorState({
			entrants: ["a", "b", "c", "d"],
			picks: [
				pick("a", 1, "KC", final(24, 20)),
				pick("b", 1, "BUF", final(24, 20)),
				pick("c", 1, "KC", final(20, 20)),
			],
			startWeek: 1,
			currentWeek: 2,
			currentWeekClosed: false,
		});
		expect(status(s, "a")?.alive).toBe(true);
		expect(status(s, "b")).toMatchObject({
			alive: false,
			outWeek: 1,
			outReason: "loss",
		});
		expect(status(s, "c")).toMatchObject({ alive: false, outReason: "tie" });
		expect(status(s, "d")).toMatchObject({ alive: false, outReason: "missed" });
		// Only one left: the pool is won.
		expect(s.winners).toEqual(["a"]);
	});

	it("doesn't count a missing pick as missed until the week closes", () => {
		const s = survivorState({
			entrants: ["a", "b"],
			picks: [pick("a", 3, "KC", final(30, 10))],
			startWeek: 3,
			currentWeek: 3,
			currentWeekClosed: false,
		});
		expect(status(s, "b")).toMatchObject({
			alive: true,
			weeks: { 3: "pending" },
		});
		expect(s.winners).toEqual([]);
	});

	it("keeps everyone alive when they all go out the same week", () => {
		const s = survivorState({
			entrants: ["a", "b", "c"],
			picks: [
				pick("a", 1, "KC", final(24, 20)),
				pick("b", 1, "KC", final(24, 20)),
				pick("a", 2, "BUF", final(24, 20)),
				pick("b", 2, "BUF", final(24, 20)),
			],
			startWeek: 1,
			currentWeek: 3,
			currentWeekClosed: false,
		});
		expect(status(s, "c")?.outWeek).toBe(1);
		expect(s.reprieves).toEqual([2]);
		expect(status(s, "a")?.alive).toBe(true);
		expect(status(s, "b")?.alive).toBe(true);
	});

	it("marks a loss provisional while nobody left has won yet", () => {
		const s = survivorState({
			entrants: ["a", "b"],
			picks: [pick("a", 1, "BUF", final(24, 20)), pick("b", 1, "KC", live)],
			startWeek: 1,
			currentWeek: 1,
			currentWeekClosed: true,
		});
		expect(status(s, "a")).toMatchObject({ alive: false, provisional: true });
		expect(status(s, "b")?.alive).toBe(true);
	});

	it("ignores weeks before the start and picks after you're out", () => {
		const s = survivorState({
			entrants: ["a", "b"],
			picks: [
				pick("a", 4, "KC", final(24, 20)),
				pick("b", 4, "KC", final(24, 20)),
				pick("a", 5, "BUF", final(24, 20)),
				pick("b", 5, "KC", final(24, 20)),
				pick("a", 6, "KC", final(24, 20)),
			],
			startWeek: 4,
			currentWeek: 7,
			currentWeekClosed: false,
		});
		expect(status(s, "a")?.outWeek).toBe(5);
		expect(status(s, "a")?.weeks[6]).toBeUndefined();
		expect(s.winners).toEqual(["b"]);
	});

	it("crowns everyone who survives week 18", () => {
		const s = survivorState({
			entrants: ["a", "b"],
			picks: [
				pick("a", 18, "KC", final(24, 20)),
				pick("b", 18, "KC", final(24, 20)),
			],
			startWeek: 18,
			currentWeek: 18,
			currentWeekClosed: true,
		});
		expect(s.winners).toEqual(["a", "b"]);
	});
});
