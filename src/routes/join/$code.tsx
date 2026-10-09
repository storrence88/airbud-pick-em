import { createFileRoute, redirect } from "@tanstack/react-router";
import { joinLeague } from "#/server/leagues";

/** Invite links: /join/<code>. Signs you in first if needed, then joins. */
export const Route = createFileRoute("/join/$code")({
	beforeLoad: async ({ context, params, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
		const leagueId = await joinLeague({ data: { code: params.code } });
		throw redirect({ to: "/league/$leagueId", params: { leagueId } });
	},
});
