import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { joinLeague } from "#/server/leagues";

/** Invite links: /join/<code>. Signs you in first if needed, then joins. */
export const Route = createFileRoute("/join/$code")({
	beforeLoad: async ({ context, params, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
		const leagueId = await joinLeague({ data: { code: params.code } });
		throw redirect({ to: "/league/$leagueId", params: { leagueId } });
	},
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-md px-4 py-16 text-center">
			<h1 className="font-display text-2xl font-bold uppercase">
				{/invalid invite code/i.test((error as Error).message)
					? "This invite link doesn't work"
					: "Couldn't join the league"}
			</h1>
			<p className="mt-2 text-muted-foreground">
				{/invalid invite code/i.test((error as Error).message)
					? "It may have been reset. Ask the commissioner for the new link."
					: (error as Error).message}
			</p>
			<Link
				to="/leagues"
				className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground"
			>
				Your leagues
			</Link>
		</main>
	),
});
