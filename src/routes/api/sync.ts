import { createFileRoute } from "@tanstack/react-router";
import { syncWeek } from "#/server/sync";

/** Scheduled sync (Vercel cron). Requires `Authorization: Bearer $CRON_SECRET`. */
export const Route = createFileRoute("/api/sync")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const secret = process.env.CRON_SECRET;
				if (
					!secret ||
					request.headers.get("authorization") !== `Bearer ${secret}`
				)
					return new Response("Unauthorized", { status: 401 });
				const games = await syncWeek(undefined, true);
				return Response.json({ synced: games.length });
			},
		},
	},
});
