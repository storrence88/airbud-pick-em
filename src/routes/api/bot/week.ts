import { createFileRoute } from "@tanstack/react-router";
import { withPublicPicks } from "#/lib/nfl/espn-pickem";
import { ApiError, botHandler, gameViews } from "#/server/bot";
import { syncWeek } from "#/server/sync";

/** A week's games; `?week=` defaults to the current week. */
export const Route = createFileRoute("/api/bot/week")({
	server: {
		handlers: {
			GET: botHandler(async (ctx, request) => {
				const weekParam = new URL(request.url).searchParams.get("week");
				const week = weekParam ? Number(weekParam) : undefined;
				if (
					week !== undefined &&
					!(Number.isInteger(week) && week >= 1 && week <= 23)
				)
					throw new ApiError(400, "week must be a number from 1 to 23.");
				const games = await withPublicPicks(await syncWeek(week));
				const { league } = ctx;
				return {
					league: { id: league.id, name: league.name, mode: league.mode },
					week: games[0]?.week ?? week ?? null,
					games: await gameViews(ctx, games),
				};
			}),
		},
	},
});
