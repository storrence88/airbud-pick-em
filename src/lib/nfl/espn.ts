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

/** ESPN season types: 1 preseason, 2 regular season, 3 playoffs, 4 offseason. */
const REGULAR_SEASON = 2;

interface EspnSeason {
	year: number;
	type?: number;
}

interface EspnEvent {
	id: string;
	date: string;
	season?: EspnSeason;
	week?: { number: number };
	competitions: {
		status: { type: { state: GameState; shortDetail?: string } };
		competitors: EspnCompetitor[];
		odds?: { details?: string; spread?: number }[];
	}[];
}

export interface EspnScoreboard {
	season?: EspnSeason;
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

/**
 * Only regular-season games are pickable. Preseason and playoff weeks reuse
 * the numbers 1 to 5, so saving them would mix them into the real weeks.
 */
const isRegularSeason = (ev: EspnEvent, data: EspnScoreboard) =>
	(ev.season?.type ?? data.season?.type ?? REGULAR_SEASON) === REGULAR_SEASON;

export function parseScoreboard(data: EspnScoreboard): Game[] {
	return data.events.flatMap((ev) => {
		if (!isRegularSeason(ev, data)) return [];
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

/**
 * When ESPN's "current week" is outside the regular season, the week to show
 * instead: week 1 during the preseason, week 18 once the playoffs start (the
 * app stays on the final regular-season week until playoff picks exist).
 */
export function regularSeasonStandIn(
	data: EspnScoreboard,
): { season: number; week: number } | null {
	const season = data.season;
	if (!season?.type || season.type === REGULAR_SEASON) return null;
	return { season: season.year, week: season.type === 1 ? 1 : 18 };
}

async function fetchScoreboard(opts: { season?: number; week?: number }) {
	const url = new URL(SCOREBOARD);
	if (opts.season) url.searchParams.set("dates", String(opts.season));
	if (opts.week) {
		url.searchParams.set("week", String(opts.week));
		url.searchParams.set("seasontype", String(REGULAR_SEASON));
	}
	const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`ESPN scoreboard ${res.status}`);
	return (await res.json()) as EspnScoreboard;
}

export const espnProvider: NflProvider = {
	async getWeek({ season, week } = {}) {
		const data = await fetchScoreboard({ season, week });
		const standIn = week ? null : regularSeasonStandIn(data);
		if (!standIn) return parseScoreboard(data);
		const games = parseScoreboard(await fetchScoreboard(standIn));
		// In the offseason ESPN may already be on next year; fall back a season.
		if (games.length > 0 || season) return games;
		return parseScoreboard(
			await fetchScoreboard({ ...standIn, season: standIn.season - 1 }),
		);
	},
};
