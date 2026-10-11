import { createFileRoute } from "@tanstack/react-router";
import { sendEmailReminders } from "#/server/reminders";

/**
 * Scheduled pick reminders (the GitHub Actions workflow calls this hourly).
 * Requires `Authorization: Bearer $CRON_SECRET`. `?dry=1` only counts who
 * would get an email; `?hours=` widens the window for testing.
 */
export const Route = createFileRoute("/api/reminders")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const secret = process.env.CRON_SECRET;
				if (
					!secret ||
					request.headers.get("authorization") !== `Bearer ${secret}`
				)
					return new Response("Unauthorized", { status: 401 });
				const url = new URL(request.url);
				const hours = Number(url.searchParams.get("hours") ?? "") || undefined;
				try {
					return Response.json(
						await sendEmailReminders({
							hours: hours && Math.min(hours, 72),
							dryRun: url.searchParams.has("dry"),
							appUrl: url.origin,
						}),
					);
				} catch (err) {
					console.error("reminders failed", err);
					return Response.json(
						{ error: (err as Error).message },
						{ status: 500 },
					);
				}
			},
		},
	},
});
