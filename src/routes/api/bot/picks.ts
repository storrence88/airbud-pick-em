import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { botHandler, memberForDiscord, readJson, rpcError } from "#/server/bot";

const input = z.object({
	discordId: z.string(),
	gameId: z.string().min(1),
	team: z
		.string()
		.min(2)
		.max(4)
		.transform((t) => t.toUpperCase()),
});

/**
 * Makes or changes one pick. In confidence leagues a first pick gets the
 * lowest free value that week, like in the app; changing teams keeps it.
 */
export const Route = createFileRoute("/api/bot/picks")({
	server: {
		handlers: {
			POST: botHandler(async (ctx, request) => {
				const body = await readJson(request, input);
				const userId = await memberForDiscord(ctx, body.discordId);
				const { data: confidence, error } = await ctx.admin.rpc(
					"bot_save_pick",
					{
						p_user: userId,
						p_league: ctx.league.id,
						p_game: body.gameId,
						p_team: body.team,
					},
				);
				if (error) throw rpcError(error);
				return {
					gameId: body.gameId,
					team: body.team,
					confidence: (confidence as number | null) ?? null,
				};
			}),
		},
	},
});
