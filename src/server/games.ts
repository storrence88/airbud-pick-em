import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withPublicPicks } from "#/lib/nfl/espn-pickem";
import { fetchSummary, parseSummary } from "#/lib/nfl/espn-summary";
import type { Game } from "#/lib/nfl/types";
import { syncWeek } from "./sync";

const weekInput = z.object({
	week: z.number().int().min(1).max(23).optional(),
});

export const getWeekGames = createServerFn({ method: "GET" })
	.inputValidator(weekInput)
	.handler(async ({ data }) => withPublicPicks(await syncWeek(data.week)));

export const weekGamesQuery = (week?: number) =>
	queryOptions({
		queryKey: ["games", week ?? "current"],
		queryFn: () => getWeekGames({ data: { week } }),
		// Live scores: refresh every 30s while the page is open.
		refetchInterval: 30_000,
	});

const teamKey = z.object({ id: z.string().max(10), abbr: z.string().max(5) });
const detailsInput = z.object({
	id: z.string().regex(/^\d{1,12}$/),
	season: z.number().int().min(2000).max(2100),
	home: teamKey,
	away: teamKey,
});

export const getGameDetails = createServerFn({ method: "GET" })
	.inputValidator(detailsInput)
	.handler(async ({ data }) => parseSummary(await fetchSummary(data.id), data));

/** Loaded only when someone opens a game's details sheet. */
export const gameDetailsQuery = (game: Game) =>
	queryOptions({
		queryKey: ["game-details", game.id],
		queryFn: () =>
			getGameDetails({
				data: {
					id: game.id,
					season: game.season,
					home: { id: game.home.id, abbr: game.home.abbr },
					away: { id: game.away.id, abbr: game.away.abbr },
				},
			}),
		// Injury reports and lines move slowly; no need to refetch every open.
		staleTime: 5 * 60_000,
	});
