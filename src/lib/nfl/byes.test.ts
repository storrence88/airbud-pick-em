import { describe, expect, it } from "vitest";
import { byeTeams } from "./byes";
import { NFL_TEAMS } from "./teams";

const pair = (home: string, away: string) => ({
	home: { abbr: home },
	away: { abbr: away },
});

/** Pairs every team up except the given ones. */
function weekWithout(...off: string[]) {
	const playing = NFL_TEAMS.map((t) => t.abbr).filter((a) => !off.includes(a));
	const games = [];
	for (let i = 0; i < playing.length; i += 2)
		games.push(pair(playing[i], playing[i + 1]));
	return games as Parameters<typeof byeTeams>[0];
}

describe("byeTeams", () => {
	it("lists the teams without a game, sorted by name", () => {
		expect(
			byeTeams(weekWithout("SF", "ARI", "KC", "DAL")).map((t) => t.abbr),
		).toEqual(["ARI", "DAL", "KC", "SF"]);
	});

	it("is empty when every team plays", () => {
		expect(byeTeams(weekWithout())).toEqual([]);
	});

	it("is empty with no games or a partial feed", () => {
		expect(byeTeams([])).toEqual([]);
		expect(byeTeams(weekWithout().slice(0, 4))).toEqual([]);
	});
});
