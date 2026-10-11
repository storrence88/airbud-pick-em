import type { Game, GameState, NflProvider, Team } from "./types";

const SCOREBOARD =
	"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// Minimal shape of ESPN's public scoreboard JSON (unofficial, can change).
interface EspnCompetitor {
	homeAway: "home" | "away";
	score?: string;
	records?: { type?: string; summary?: string }[];
	team: {
		id: string;
		abbreviation: string;
		displayName: string;
		shortDisplayName: string;
		color?: string;
		alternateColor?: string;
		logo?: string;
	};
}

interface EspnEvent {
	id: string;
	date: string;
	season?: { year: number };
	week?: { number: number };
	competitions: {
		status: { type: { state: GameState; shortDetail?: string } };
		competitors: EspnCompetitor[];
		odds?: { details?: string; spread?: number }[];
	}[];
}

export interface EspnScoreboard {
	season?: { year: number };
	week?: { number: number };
	events: EspnEvent[];
}

function toTeam(c: EspnCompetitor): Team {
	return {
		id: c.team.id,
		abbr: c.team.abbreviation,
		name: c.team.displayName,
		shortName: c.team.shortDisplayName,
		color: `#${c.team.color ?? "333333"}`,
		altColor: `#${c.team.alternateColor ?? "cccccc"}`,
		logo: c.team.logo ?? "",
		record: c.records?.[0]?.summary,
		homeRecord: c.records?.find((r) => r.type === "home")?.summary,
		roadRecord: c.records?.find((r) => r.type === "road")?.summary,
	};
}

/**
 * Converts ESPN's odds into the home team's line. `details` reads like
 * "KC -3.5" (favorite and its line) or "EVEN", which is unambiguous, so it
 * wins over the numeric `spread` field.
 */
export function parseHomeSpread(
	details: string | undefined,
	homeAbbr: string,
	awayAbbr: string,
): number | null {
	if (!details) return null;
	if (/^even|pk|pick/i.test(details.trim())) return 0;
	const m = details.trim().match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)$/);
	if (!m) return null;
	const line = Number(m[2]);
	if (m[1] === homeAbbr) return line;
	if (m[1] === awayAbbr) return -line;
	return null;
}

export function parseScoreboard(data: EspnScoreboard): Game[] {
	return data.events.flatMap((ev) => {
		const comp = ev.competitions[0];
		const home = comp?.competitors.find((c) => c.homeAway === "home");
		const away = comp?.competitors.find((c) => c.homeAway === "away");
		if (!comp || !home || !away) return [];
		const odds = comp.odds?.[0];
		return [
			{
				id: ev.id,
				season: ev.season?.year ?? data.season?.year ?? 0,
				week: ev.week?.number ?? data.week?.number ?? 0,
				kickoff: ev.date,
				state: comp.status.type.state,
				statusText: comp.status.type.shortDetail ?? "",
				home: toTeam(home),
				away: toTeam(away),
				homeScore: Number(home.score ?? 0),
				awayScore: Number(away.score ?? 0),
				spread: parseHomeSpread(
					odds?.details,
					home.team.abbreviation,
					away.team.abbreviation,
				),
				spreadText: odds?.details ?? null,
			},
		];
	});
}

export const espnProvider: NflProvider = {
	async getWeek({ season, week } = {}) {
		const url = new URL(SCOREBOARD);
		if (season) url.searchParams.set("dates", String(season));
		if (week) {
			url.searchParams.set("week", String(week));
			url.searchParams.set("seasontype", "2");
		}
		const res = await fetch(url);
		if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
		return parseScoreboard((await res.json()) as EspnScoreboard);
	},
};
