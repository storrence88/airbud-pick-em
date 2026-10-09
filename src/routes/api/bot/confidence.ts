import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { botHandler, memberForDiscord, readJson, rpcError } from "#/server/bot";

const input = z.object({
	discordId: z.string(),
	values: z
		.array(
			z.object({
				gameId: z.string().min(1),
				confidence: z.number().int().min(1).max(20),
			}),
		)
		.min(1)
		.max(20)
		.refine(
			(vs) => new Set(vs.map((v) => v.confidence)).size === vs.length,
			"Each confidence value can only be used once.",
		),
});

/**
 * Sets confidence values in one go (all or nothing). To swap two games, send
 * both. Every value stays unique across the member's week, so a value that's
 * already on another game has to move in the same request.
 */
export const Route = createFileRoute("/api/bot/confidence")({
	server: {
		handlers: {
			POST: botHandler(async (ctx, request) => {
				const body = await readJson(request, input);
				const userId = await memberForDiscord(ctx, body.discordId);
				const { error } = await ctx.admin.rpc("bot_set_confidence", {
					p_user: userId,
					p_league: ctx.league.id,
					p_values: body.values,
				});
				if (error) throw rpcError(error);
				return { ok: true, values: body.values };
			}),
		},
	},
});
