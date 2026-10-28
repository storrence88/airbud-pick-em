import { NFL_TEAMS, type NflTeam } from "./teams";
import type { Game } from "./types";

/** A full week never has more than six teams off; more means the feed is missing games. */
const MAX_BYES = 8;

/** Teams with no game this week, in alphabetical order by name. */
export function byeTeams(games: Pick<Game, "home" | "away">[]): NflTeam[] {
	if (games.length === 0) return [];
	const playing = new Set(games.flatMap((g) => [g.home.abbr, g.away.abbr]));
	const off = NFL_TEAMS.filter((team) => !playing.has(team.abbr));
	if (off.length > MAX_BYES) return [];
	return off.sort((a, b) => a.name.localeCompare(b.name));
}
