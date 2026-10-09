import { createFileRoute } from "@tanstack/react-router";
import { botHandler, leagueMembers } from "#/server/bot";

/** The league this API key belongs to, and its members. */
export const Route = createFileRoute("/api/bot/league")({
	server: {
		handlers: {
			GET: botHandler(async (ctx) => {
				const { league } = ctx;
				const members = await leagueMembers(ctx);
				return {
					league: {
						id: league.id,
						name: league.name,
						season: league.season,
						mode: league.mode,
					},
					members: members.map(({ displayName, discordId, role }) => ({
						displayName,
						discordId,
						role,
					})),
				};
			}),
		},
	},
});
