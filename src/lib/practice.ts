// The practice week: three made-up games a new player picks, then watches
// play out. Nothing here touches the database. The finals are arranged so
// the week always teaches something: your key pick hits, one other pick
// misses, and a friend ties you on points so the Monday night tiebreaker
// decides the week.

import { teamByAbbr, teamLogo } from "./nfl/teams";
import type { Game, Team } from "./nfl/types";
import type { ScoringMode } from "./scoring";
import type { WeekPick } from "./week-results";

export const PRACTICE_USER = "practice-you";
/** The Monday night game's final total. */
export const PRACTICE_TOTAL = 43;
/** The friend who ties you guesses this, so a guess within 7 wins the week. */
export const RIVAL_GUESS = 51;

interface Matchup {
	away: string;
	home: string;
	/** Home line; every winning margin below clears it. */
	spread: number;
	/** Day offset from the coming Sunday, and local kickoff hour. */
	day: number;
	hour: number;
	minute: number;
	/** Winner's and loser's final score. */
	final: [number, number];
	records: [string, string];
}

const MATCHUPS: Matchup[] = [
	{
		away: "KC",
		home: "BUF",
		spread: -2.5,
		day: 0,
		hour: 13,
		minute: 0,
		final: [27, 20],
		records: ["4-1", "4-1"],
	},
	{
		away: "PHI",
		home: "DAL",
		spread: 3,
		day: 0,
		hour: 20,
		minute: 20,
		final: [31, 17],
		records: ["3-2", "2-3"],
	},
	{
		away: "SF",
		home: "SEA",
		spread: -1.5,
		day: 1,
		hour: 20,
		minute: 15,
		final: [24, 19],
		records: ["3-2", "3-2"],
	},
];

function team(abbr: string, record: string): Team {
	const t = teamByAbbr(abbr);
	if (!t) throw new Error(`Unknown team ${abbr}`);
	return {
		id: abbr,
		abbr,
		name: t.name,
		shortName: t.name.split(" ").at(-1) ?? t.name,
		color: t.color,
		altColor: t.altColor,
		logo: teamLogo(abbr),
		record,
	};
}

function nextSunday(now: Date) {
	const d = new Date(now);
	d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
	return d;
}

const spreadText = (m: Matchup) =>
	m.spread < 0 ? `${m.home} ${m.spread}` : `${m.away} -${m.spread}`;

/** The three practice games, not started yet, with kickoffs this coming weekend. */
export function practiceGames(now = new Date()): Game[] {
	const sunday = nextSunday(now);
	return MATCHUPS.map((m, i) => {
		const kickoff = new Date(sunday);
		kickoff.setDate(kickoff.getDate() + m.day);
		kickoff.setHours(m.hour, m.minute, 0, 0);
		return {
			id: `practice-${i + 1}`,
			season: now.getFullYear(),
			week: 0,
			kickoff: kickoff.toISOString(),
			state: "pre",
			statusText: "",
			away: team(m.away, m.records[0]),
			home: team(m.home, m.records[1]),
			homeScore: 0,
			awayScore: 0,
			spread: m.spread,
			spreadText: spreadText(m),
		};
	});
}

/**
 * The pick that has to hit: your most confident one in confidence leagues,
 * otherwise your Lock of the Week (or the first game if there's no lock).
 */
export function keyGame(
	games: Game[],
	mine: Record<string, { team: string; confidence: number | null }>,
	lock: string | null,
	mode: ScoringMode,
): string {
	if (mode === "confidence") {
		const top = games
			.filter((g) => mine[g.id])
			.sort(
				(a, b) => (mine[b.id].confidence ?? 0) - (mine[a.id].confidence ?? 0),
			)[0];
		if (top) return top.id;
	}
	return lock ?? games[0].id;
}

/**
 * The game you miss: the least confident one in confidence leagues, otherwise
 * the last game that isn't your key pick.
 */
export function missGame(
	games: Game[],
	mine: Record<string, { team: string; confidence: number | null }>,
	key: string,
	mode: ScoringMode,
): string {
	const rest = games.filter((g) => g.id !== key);
	if (mode === "confidence")
		return rest.sort(
			(a, b) => (mine[a.id]?.confidence ?? 0) - (mine[b.id]?.confidence ?? 0),
		)[0].id;
	return rest[rest.length - 1].id;
}

/** Final scores so each of your picks wins or loses as planned. */
export function practiceFinals(
	games: Game[],
	mine: Record<string, { team: string }>,
	miss: string,
): Record<string, { home: number; away: number }> {
	return Object.fromEntries(
		games.map((g, i) => {
			const [w, l] = MATCHUPS[i].final;
			const picked = mine[g.id]?.team ?? g.home.abbr;
			const youWin = g.id !== miss;
			const homeWins = (picked === g.home.abbr) === youWin;
			return [g.id, homeWins ? { home: w, away: l } : { home: l, away: w }];
		}),
	);
}

const other = (g: Game, abbr: string) =>
	abbr === g.home.abbr ? g.away.abbr : g.home.abbr;

/**
 * Three friends' picks: a rival who picked exactly like you (so you tie on
 * points), one who missed one of your winners, and one who went against you
 * on everything.
 */
export function friendPicks(
	games: Game[],
	mine: Record<string, { team: string; confidence: number | null }>,
	key: string,
	miss: string,
	friendIds: [string, string, string],
): WeekPick[] {
	const [rival, close, contrarian] = friendIds;
	const flip = games.find((g) => g.id !== key && g.id !== miss)?.id;
	const last = games[games.length - 1].id;
	return games.flatMap((g, i) => {
		const you = mine[g.id];
		const confidence = you?.confidence ?? null;
		const team = you?.team ?? g.home.abbr;
		const tb = (guess: number) => (g.id === last ? guess : null);
		return [
			{
				user_id: rival,
				game_id: g.id,
				team,
				confidence,
				is_lock: g.id === flip,
				tiebreaker: tb(RIVAL_GUESS),
			},
			{
				user_id: close,
				game_id: g.id,
				team: g.id === flip ? other(g, team) : team,
				confidence,
				is_lock: i === 0,
				tiebreaker: tb(38),
			},
			{
				user_id: contrarian,
				game_id: g.id,
				team: other(g, team),
				confidence,
				is_lock: g.id === miss,
				tiebreaker: tb(47),
			},
		];
	});
}

/** Game clock text for a game this far through (0 to 1). */
export function clockText(progress: number): string {
	if (progress >= 1) return "Final";
	const quarter = Math.min(3, Math.floor(progress * 4));
	if (quarter === 2 && progress * 4 - 2 < 0.08) return "Halftime";
	const left = Math.max(1, Math.round((1 - (progress * 4 - quarter)) * 900));
	const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
	return `${["1st", "2nd", "3rd", "4th"][quarter]} ${clock}`;
}

/**
 * The score shown partway through: it climbs in field-goal and touchdown
 * sized steps and lands on the final.
 */
export function scoreAt(final: number, progress: number): number {
	if (progress >= 1) return final;
	const raw = final * Math.max(0, progress);
	// Snap down to a football-looking number (no 1s, 2s, 4s or 5s early on).
	const steps = [
		0, 3, 6, 7, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31,
	];
	let best = 0;
	for (const s of steps) if (s <= raw && s <= final) best = s;
	return best;
}
