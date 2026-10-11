import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WeekStatus } from "#/lib/flair";
import { fetchChallenge, parsePublicPicks } from "#/lib/nfl/espn-pickem";
import type { Game } from "#/lib/nfl/types";
import type { StatsGame, StatsPick } from "#/lib/player-stats";
import { PUBLIC_PROFILE_COLUMNS, type PublicProfile } from "#/lib/profile";
import type { ScoringMode } from "#/lib/scoring";
import {
	getSupabaseAdminClient,
	getSupabaseServerClient,
} from "#/lib/supabase.server";

type GameRow = StatsGame & { season: number; state: string };

/**
 * Fills in the ESPN crowd split for finished games that don't have one yet.
 * ESPN keeps each week's locked split after the games end, so earlier weeks
 * backfill the first time anyone opens stats. Best effort: on any failure the
 * games just don't count toward the crowd comparison.
 */
export async function backfillCrowd(games: GameRow[]) {
	const admin = getSupabaseAdminClient();
	// Before migration 0018 the column doesn't exist, so there's nothing to fill.
	if (!admin || !games.length || !("crowd_home_pct" in games[0])) return;
	const missing = new Map<string, GameRow[]>();
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

export interface StatsPlayer extends PublicProfile {
	user_id: string;
}

/** One player's finished picks this season, plus what the stats page needs around them. */
export const getPlayerStats = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({ leagueId: z.string().uuid(), userId: z.string().uuid() }),
	)
	.handler(async ({ data }) => {
		const sb = getSupabaseServerClient();
		const { data: auth } = await sb.auth.getUser();
		if (!auth.user) throw new Error("Please sign in first.");

		const { data: league, error } = await sb
			.from("leagues")
			.select("id, name, season, mode, settings")
			.eq("id", data.leagueId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!league) throw new Error("League not found, or you are not a member.");

		const [{ data: all }, { data: roster, error: rosterError }] =
			await Promise.all([
				// "*" so this still works before the crowd column exists.
				sb.from("games").select("*").eq("season", league.season),
				sb
					.from("league_members")
					.select(`user_id, profiles(${PUBLIC_PROFILE_COLUMNS})`)
					.eq("league_id", data.leagueId),
			]);
		if (rosterError) throw new Error(rosterError.message);

		const weeks: WeekStatus = {};
		for (const g of all ?? []) {
			const w = weeks[g.week] ?? { total: 0, final: 0 };
			w.total += 1;
			if (g.state === "post") w.final += 1;
			weeks[g.week] = w;
		}
		const games = ((all ?? []) as GameRow[]).filter((g) => g.state === "post");

		// Row-level security only returns other players' picks after kickoff.
		const [{ data: picks, error: picksError }] = await Promise.all([
			games.length
				? sb
						.from("picks")
						.select("game_id, team, confidence")
						.eq("league_id", data.leagueId)
						.eq("user_id", data.userId)
						.in(
							"game_id",
							games.map((g) => g.id),
						)
				: Promise.resolve({ data: [], error: null }),
			backfillCrowd(games),
		]);
		if (picksError) throw new Error(picksError.message);

		const members: StatsPlayer[] = (roster ?? []).map((m) => ({
			user_id: m.user_id as string,
			...(m.profiles as unknown as PublicProfile),
		}));
		let player = members.find((m) => m.user_id === data.userId);
		// A removed member whose picks were kept still has stats.
		if (!player && picks?.length) {
			const { data: p } = await sb
				.from("profiles")
				.select(PUBLIC_PROFILE_COLUMNS)
				.eq("id", data.userId)
				.maybeSingle();
			if (p) player = { user_id: data.userId, ...(p as PublicProfile) };
		}
		if (!player) throw new Error("That player isn't in this league.");

		return {
			userId: auth.user.id,
			league: league as {
				id: string;
				name: string;
				season: number;
				mode: ScoringMode;
				settings: { pushValue?: number };
			},
			player,
			members,
			games: games.map((g) => ({
				id: g.id,
				week: g.week,
				home_team: g.home_team,
				away_team: g.away_team,
				home_score: g.home_score,
				away_score: g.away_score,
				locked_spread: g.locked_spread,
				crowd_home_pct: g.crowd_home_pct ?? null,
			})) as StatsGame[],
			weeks,
			picks: (picks ?? []) as StatsPick[],
		};
	});

export const playerStatsQuery = (leagueId: string, userId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "stats", userId],
		queryFn: () => getPlayerStats({ data: { leagueId, userId } }),
	});
