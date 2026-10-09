import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { syncWeek } from "./sync";

const weekInput = z.object({
	week: z.number().int().min(1).max(23).optional(),
});

export const getWeekGames = createServerFn({ method: "GET" })
	.inputValidator(weekInput)
	.handler(async ({ data }) => syncWeek(data.week));

export const weekGamesQuery = (week?: number) =>
	queryOptions({
		queryKey: ["games", week ?? "current"],
		queryFn: () => getWeekGames({ data: { week } }),
		// Live scores: refresh every 30s while the page is open.
		refetchInterval: 30_000,
	});
