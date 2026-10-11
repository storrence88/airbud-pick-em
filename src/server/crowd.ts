import { fetchChallenge, parsePublicPicks } from "#/lib/nfl/espn-pickem";
import type { Game } from "#/lib/nfl/types";
import type { StatsGame } from "#/lib/player-stats";
import { getSupabaseAdminClient } from "#/lib/supabase.server";

export type CrowdGameRow = StatsGame & { season: number; state: string };

/**
 * Fills in the ESPN crowd split for finished games that don't have one yet.
 * ESPN keeps each week's locked split after the games end, so earlier weeks
 * backfill the first time anyone opens stats. Best effort: on any failure the
 * games just don't count toward the crowd comparison.
 */
export async function backfillCrowd(games: CrowdGameRow[]) {
	const admin = getSupabaseAdminClient();
	// Before migration 0018 the column doesn't exist, so there's nothing to fill.
	if (!admin || !games.length || !("crowd_home_pct" in games[0])) return;
	const missing = new Map<string, CrowdGameRow[]>();
	for (const g of games) {
		if (g.crowd_home_pct != null) continue;
		const key = `${g.season}-${g.week}`;
		missing.set(key, [...(missing.get(key) ?? []), g]);
	}
	await Promise.all(
		[...missing.values()].map(async (week) => {
			try {
				const { season, week: w } = week[0];
				const splits = parsePublicPicks(
					await fetchChallenge(season, w),
					// The parser only reads the id and the two abbreviations.
					week.map(
						(g) =>
							({
								id: g.id,
								home: { abbr: g.home_team },
								away: { abbr: g.away_team },
							}) as Game,
					),
				);
				await Promise.all(
					week.map(async (g) => {
						const split = splits.get(g.id);
						if (!split) return;
						const { error } = await admin
							.from("games")
							.update({ crowd_home_pct: split.home })
							.eq("id", g.id)
							.is("crowd_home_pct", null);
						if (!error) g.crowd_home_pct = split.home;
					}),
				);
			} catch (err) {
				console.warn("crowd split backfill failed", err);
			}
		}),
	);
}
