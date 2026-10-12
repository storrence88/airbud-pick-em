import { createFileRoute } from "@tanstack/react-router";
import { discordTime, dueSlate, reminderMessage } from "#/lib/reminders";
import { ApiError, botHandler, leagueMembers } from "#/server/bot";
import { openPicks } from "#/server/reminders";
import { syncWeek } from "#/server/sync";

/**
 * Who the bot should DM a pick reminder right now: members who chose Discord
 * DMs on their profile and still have open picks on a game day whose first
 * kickoff is within `?hours=` (default 3). Each reminder has a stable `id`
 * so the bot can skip ones it already sent.
 */
export const Route = createFileRoute("/api/bot/reminders")({
	server: {
		handlers: {
			GET: botHandler(async (ctx, request) => {
				const url = new URL(request.url);
				const param = url.searchParams.get("hours");
				const hours = param === null ? undefined : Number(param);
				if (hours !== undefined && !(hours > 0 && hours <= 72))
					throw new ApiError(400, "hours must be a number from 1 to 72.");
				const slate = dueSlate(await syncWeek(), new Date(), hours);
				if (!slate?.games.length) return { slate: null, reminders: [] };

				const [members, open] = await Promise.all([
					leagueMembers(ctx),
					openPicks(ctx.admin, [ctx.league], slate.games),
				]);
				const discord = new Map(members.map((m) => [m.userId, m.discordId]));
				return {
					slate: { id: slate.id, firstKickoff: slate.firstKickoff },
					reminders: open.flatMap((o) => {
						const discordId = discord.get(o.userId);
						if (o.channel !== "discord" || !discordId) return [];
						const msg = reminderMessage({
							name: o.displayName,
							style: o.style,
							when: discordTime(slate.firstKickoff),
							leagues: [
								{
									name: o.leagueName,
									games: o.games.map((g) => ({
										away: g.away.abbr,
										home: g.home.abbr,
									})),
								},
							],
							seed: `${slate.id}:${o.userId}`,
						});
						return [
							{
								id: `${slate.id}:${discordId}`,
								discordId,
								displayName: o.displayName,
								style: o.style,
								openGames: o.games.map((g) => ({
									id: g.id,
									kickoff: g.kickoff,
									away: g.away.abbr,
									home: g.home.abbr,
								})),
								message: `${msg.intro}\n${msg.games.join("\n")}\nMake your picks: ${url.origin}/league/${ctx.league.id}`,
							},
						];
					}),
				};
			}),
		},
	},
});
