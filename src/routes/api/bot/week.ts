import { createFileRoute } from "@tanstack/react-router";
import { withPublicPicks } from "#/lib/nfl/espn-pickem";
import type { Team } from "#/lib/nfl/types";
import {
	ApiError,
	botHandler,
	leagueMembers,
	memberForDiscord,
	type PickRow,
	visiblePicks,
} from "#/server/bot";
import { syncWeek } from "#/server/sync";

function team(t: Team, score: number) {
	return {
		abbr: t.abbr,
		name: t.name,
		shortName: t.shortName,
		record: t.record ?? null,
		logo: t.logo,
		score,
	};
}

/**
 * A week's games with the asking member's picks, plus everyone's picks on
 * games that have kicked off. `?week=` defaults to the current week.
 */
export const Route = createFileRoute("/api/bot/week")({
	server: {
		handlers: {
			GET: botHandler(async (ctx, request) => {
				const { admin, league } = ctx;
				const params = new URL(request.url).searchParams;
				const weekParam = params.get("week");
				const week = weekParam ? Number(weekParam) : undefined;
				if (
					week !== undefined &&
					!(Number.isInteger(week) && week >= 1 && week <= 23)
				)
					throw new ApiError(400, "week must be a number from 1 to 23.");
				const discordId = params.get("discordId");
				const viewerId = discordId
					? await memberForDiscord(ctx, discordId)
					: null;

				const games = await withPublicPicks(await syncWeek(week));
				const ids = games.map((g) => g.id);
				const [members, { data: picks }, { data: locked }] = await Promise.all([
					leagueMembers(ctx),
					admin
						.from("picks")
						.select("user_id, game_id, team, confidence")
						.eq("league_id", league.id)
						.in("game_id", ids),
					admin.from("games").select("id, locked_spread").in("id", ids),
				]);
				const byUser = new Map(members.map((m) => [m.userId, m]));
				const lockedSpread = new Map(
					(locked ?? []).map((r) => [r.id, r.locked_spread as number | null]),
				);
				const shown = visiblePicks((picks ?? []) as PickRow[], games, viewerId);
				const now = new Date();

				return {
					league: { id: league.id, name: league.name, mode: league.mode },
					week: games[0]?.week ?? week ?? null,
					games: games.map((g) => {
						const gamePicks = shown.filter((p) => p.game_id === g.id);
						const mine = gamePicks.find((p) => p.user_id === viewerId);
						return {
							id: g.id,
							kickoff: g.kickoff,
							locked: new Date(g.kickoff) <= now,
							state: g.state,
							status: g.statusText,
							away: team(g.away, g.awayScore),
							home: team(g.home, g.homeScore),
							// Home team's line (negative = home favored); frozen at kickoff.
							spread: lockedSpread.get(g.id) ?? g.spread,
							spreadText: g.spreadText,
							// Share of ESPN Pick'em players picking each side, when ESPN has it.
							publicPicks: g.publicPicks ?? null,
							myPick: mine
								? { team: mine.team, confidence: mine.confidence }
								: null,
							picks: gamePicks
								.filter((p) => p.user_id !== viewerId)
								.map((p) => ({
									displayName: byUser.get(p.user_id)?.displayName ?? "Player",
									discordId: byUser.get(p.user_id)?.discordId ?? null,
									team: p.team,
									confidence: p.confidence,
								})),
						};
					}),
				};
			}),
		},
	},
});
