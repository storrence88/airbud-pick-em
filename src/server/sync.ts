import { espnProvider } from "#/lib/nfl/espn";
import type { Game } from "#/lib/nfl/types";
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

const lastSync = new Map<string, number>();
const SYNC_TTL_MS = 60_000;

/**
 * Fetches a week from ESPN and saves it. Called lazily when someone opens a
 * week (at most once a minute per instance) and by the /api/sync cron.
 */
export async function syncWeek(week?: number, force = false): Promise<Game[]> {
	const games = await espnProvider.getWeek({ week });
	const admin = getSupabaseAdminClient();
	const key = String(week ?? "current");
	if (!admin || games.length === 0) return games;
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
