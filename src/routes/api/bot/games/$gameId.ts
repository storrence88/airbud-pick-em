import { createFileRoute } from "@tanstack/react-router";
import { withPublicPicks } from "#/lib/nfl/espn-pickem";
import type { Game } from "#/lib/nfl/types";
import { ApiError, type BotContext, botHandler, gameViews } from "#/server/bot";
import { syncWeek } from "#/server/sync";

/** The week a game id belongs to, from our games table. */
async function weekOf({ admin }: BotContext, gameId: string) {
	const { data } = await admin
		.from("games")
		.select("week")
		.eq("id", gameId)
		.maybeSingle();
	if (!data) throw new ApiError(404, `Unknown game ${gameId}.`);
	return data.week as number;
}

/** The game that kicked off most recently, looking back to last week if needed. */
async function latest() {
	const now = Date.now();
	const started = (gs: Game[]) =>
		gs
			.filter((g) => Date.parse(g.kickoff) <= now)
			.sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))[0];
	const current = await syncWeek();
	const found = started(current);
	if (found) return found;
	const week = current[0]?.week;
	if (week && week > 1) return started(await syncWeek(week - 1));
}

/** The next game to kick off this week. */
async function next() {
	const now = Date.now();
	return (await syncWeek())
		.filter((g) => Date.parse(g.kickoff) > now)
		.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0];
}

/**
 * One game by ESPN id, or `latest` (most recently kicked off) or `next`
 * (next to kick off). Same shape as a game in /week.
 */
export const Route = createFileRoute("/api/bot/games/$gameId")({
	server: {
		handlers: {
			GET: botHandler(async (ctx, request) => {
				const id = decodeURIComponent(
					new URL(request.url).pathname.split("/").pop() ?? "",
				);
				let game: Game | undefined;
				if (id === "latest") game = await latest();
				else if (id === "next") game = await next();
				else
					game = (await syncWeek(await weekOf(ctx, id))).find(
						(g) => g.id === id,
					);
				if (!game)
					throw new ApiError(
						404,
						id === "latest"
							? "No game has kicked off yet."
							: id === "next"
								? "No more games this week."
								: `Unknown game ${id}.`,
					);
				const [withPct] = await withPublicPicks([game]);
				const [view] = await gameViews(ctx, [withPct]);
				return { game: view };
			}),
		},
	},
});
