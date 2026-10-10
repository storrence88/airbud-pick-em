import { createFileRoute } from "@tanstack/react-router";
import { computeStandings, type FinishedGame } from "#/lib/standings";
import { botHandler, leagueMembers, type PickRow } from "#/server/bot";

/** Season standings from finished games, best first. */
export const Route = createFileRoute("/api/bot/standings")({
	server: {
		handlers: {
			GET: botHandler(async (ctx) => {
				const { admin, league } = ctx;
				const { data: games } = await admin
					.from("games")
					.select(
						"id, week, home_team, away_team, home_score, away_score, locked_spread",
					)
					.eq("season", league.season)
					.eq("state", "post");
				const ids = (games ?? []).map((g) => g.id);
				const [members, { data: picks }] = await Promise.all([
					leagueMembers(ctx),
					ids.length
						? admin
								.from("picks")
								.select("user_id, game_id, team, confidence")
								.eq("league_id", league.id)
								.in("game_id", ids)
						: Promise.resolve({ data: [] as PickRow[] }),
				]);
				const byUser = new Map(members.map((m) => [m.userId, m]));
				const rows = computeStandings(
					members.map((m) => m.userId),
					(picks ?? []) as PickRow[],
					(games ?? []) as FinishedGame[],
					{ mode: league.mode, pushValue: league.settings?.pushValue },
				);
				return {
					standings: rows.map((r, i) => ({
						rank: i + 1,
						displayName: byUser.get(r.userId)?.displayName ?? "Player",
						discordId: byUser.get(r.userId)?.discordId ?? null,
						points: r.total,
						correct: r.correct,
						byWeek: r.byWeek,
					})),
				};
			}),
		},
	},
});
