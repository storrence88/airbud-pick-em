import type { SupabaseClient } from "@supabase/supabase-js";
import { SURVIVOR_LAST_WEEK } from "#/lib/survivor";
import { syncWeek } from "./sync";

// Its own module so client code that imports the survivor server functions
// never pulls in the ESPN sync.

/**
 * The survivor week in play for a season: this NFL week, or one past the last
 * once the regular season is over (no more survivor picks then).
 */
export async function survivorWeek(sb: SupabaseClient, season: number) {
	const games = await syncWeek();
	const espnWeek = games[0]?.week ?? 0;
	const sameSeason = (games[0]?.season ?? season) === season;
	// Playoff weeks reuse 1 to 5, so a finished week 18 means the regular season is over.
	const { data: week18 } = await sb
		.from("games")
		.select("state")
		.eq("season", season)
		.eq("week", SURVIVOR_LAST_WEEK);
	const regularSeasonOver =
		!sameSeason ||
		(!!week18?.length && week18.every((g) => g.state === "post"));
	const currentWeek = regularSeasonOver ? SURVIVOR_LAST_WEEK + 1 : espnWeek;
	const weekGames = regularSeasonOver ? [] : games;
	return {
		currentWeek,
		weekGames,
		currentWeekClosed:
			weekGames.length > 0 && weekGames.every((g) => g.state !== "pre"),
		started: weekGames.some((g) => g.state !== "pre"),
	};
}
