import { espnProvider } from "#/lib/nfl/espn";
import { teamByAbbr, teamLogo } from "#/lib/nfl/teams";
import type { Game, Team } from "#/lib/nfl/types";
import { weekIsOver } from "#/lib/nfl/week";
import { getSupabaseAdminClient } from "#/lib/supabase.server";

export interface GameRow {
	id: string;
	season: number;
	week: number;
	kickoff: string;
	state: "pre" | "in" | "post";
	home_team: string;
	away_team: string;
	home_score: number;
	away_score: number;
	current_spread: number | null;
	locked_spread: number | null;
}

/**
 * Decides the spread to freeze for ATS scoring. Once a game leaves 'pre' the
 * line stays at the last value we saw before kickoff and never changes again.
 */
export function lockSpread(
	game: Game,
	existing?: Pick<GameRow, "current_spread" | "locked_spread">,
) {
	if (existing?.locked_spread != null) return existing.locked_spread;
	if (game.state === "pre") return null;
	return existing?.current_spread ?? game.spread;
}

export function toRow(game: Game, existing?: GameRow): GameRow {
	return {
		id: game.id,
		season: game.season,
		week: game.week,
		kickoff: game.kickoff,
		state: game.state,
		home_team: game.home.abbr,
		away_team: game.away.abbr,
		home_score: game.homeScore,
		away_score: game.awayScore,
		// Keep the pre-kickoff line once the game starts; feeds often drop it.
		current_spread:
			game.state === "pre"
				? game.spread
				: (existing?.current_spread ?? game.spread),
		locked_spread: lockSpread(game, existing),
	};
}

function savedTeam(abbr: string): Team {
	const team = teamByAbbr(abbr);
	const name = team?.name ?? abbr;
	return {
		id: abbr,
		abbr,
		name,
		shortName: name.split(" ").at(-1) ?? abbr,
		color: team?.color ?? "#333333",
		altColor: team?.altColor ?? "#cccccc",
		logo: teamLogo(abbr),
	};
}

function spreadText(row: GameRow): string | null {
	const line = row.locked_spread ?? row.current_spread;
	if (line == null) return null;
	if (line === 0) return "EVEN";
	return line < 0 ? `${row.home_team} ${line}` : `${row.away_team} -${line}`;
}

/** A saved game as the app's Game, for when ESPN can't be reached. */
export function fromRow(row: GameRow): Game {
	return {
		id: row.id,
		season: row.season,
		week: row.week,
		kickoff: row.kickoff,
		state: row.state,
		statusText:
			row.state === "post" ? "Final" : row.state === "in" ? "Live" : "",
		home: savedTeam(row.home_team),
		away: savedTeam(row.away_team),
		homeScore: row.home_score,
		awayScore: row.away_score,
		spread: row.current_spread,
		spreadText: spreadText(row),
	};
}

/**
 * The week as last saved: that week of the newest season, or for the current
 * week the first one that isn't over yet by the same rule as live (else the
 * latest week).
 */
async function savedWeek(week?: number): Promise<Game[]> {
	const admin = getSupabaseAdminClient();
	if (!admin) return [];
	const { data: latest } = await admin
		.from("games")
		.select("season, week, state, kickoff")
		.order("season", { ascending: false })
		.order("week", { ascending: true })
		.limit(400);
	const rows = (latest ?? []) as Pick<
		GameRow,
		"season" | "week" | "state" | "kickoff"
	>[];
	const season = rows[0]?.season;
	if (season == null) return [];
	const inSeason = rows.filter((r) => r.season === season);
	const now = new Date();
	const target =
		week ??
		inSeason.find(
			(r) =>
				!weekIsOver(
					inSeason.filter((g) => g.week === r.week),
					now,
				),
		)?.week ??
		inSeason.at(-1)?.week;
	const { data } = await admin
		.from("games")
		.select("*")
		.eq("season", season)
		.eq("week", target)
		.order("kickoff");
	return ((data ?? []) as GameRow[]).map(fromRow);
}

const lastSync = new Map<string, number>();
const lastGood = new Map<string, Game[]>();
const SYNC_TTL_MS = 60_000;

/**
 * ESPN's week, or if ESPN is down, the last copy this instance saw, then the
 * copy saved in the database, so a feed hiccup never takes the app down.
 */
async function fetchWeek(
	week?: number,
): Promise<{ games: Game[]; live: boolean }> {
	const key = String(week ?? "current");
	try {
		const games = await espnProvider.getWeek({ week });
		if (games.length > 0) lastGood.set(key, games);
		return { games, live: true };
	} catch (err) {
		console.error("ESPN unavailable, using saved games", err);
		const cached = lastGood.get(key);
		if (cached) return { games: cached, live: false };
		const saved = await savedWeek(week);
		if (saved.length === 0) throw err;
		return { games: saved, live: false };
	}
}

/**
 * Fetches a week from ESPN and saves it. Called lazily when someone opens a
 * week (at most once a minute per instance) and by the /api/sync cron.
 */
export async function syncWeek(week?: number, force = false): Promise<Game[]> {
	const { games, live } = await fetchWeek(week);
	const admin = getSupabaseAdminClient();
	const key = String(week ?? "current");
	if (!live || !admin || games.length === 0) return games;
	if (!force && Date.now() - (lastSync.get(key) ?? 0) < SYNC_TTL_MS)
		return games;
	lastSync.set(key, Date.now());

	const { data: existing } = await admin
		.from("games")
		.select("*")
		.in(
			"id",
			games.map((g) => g.id),
		);
	const byId = new Map((existing as GameRow[] | null)?.map((r) => [r.id, r]));
	const rows = games.map((g) => ({
		...toRow(g, byId.get(g.id)),
		updated_at: new Date().toISOString(),
	}));
	const { error } = await admin.from("games").upsert(rows);
	if (error) console.error("game sync failed", error);
	return games;
}
