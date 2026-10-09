import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { SCORING_MODES } from "#/lib/scoring";
import { joinLeague, myLeaguesQuery } from "#/server/leagues";

export const Route = createFileRoute("/leagues/")({
	beforeLoad: ({ context, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(myLeaguesQuery()),
	component: MyLeagues,
});

function MyLeagues() {
	const { data } = useSuspenseQuery(myLeaguesQuery());
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const [error, setError] = useState("");

	async function join(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		try {
			const id = await joinLeague({ data: { code } });
			navigate({ to: "/league/$leagueId", params: { leagueId: id } });
		} catch (err) {
			setError((err as Error).message);
		}
	}

	return (
		<main className="mx-auto max-w-3xl px-4 py-10">
			<div className="flex items-center justify-between">
				<h1 className="font-display text-4xl font-bold uppercase">
					My leagues
				</h1>
				<Link
					to="/league/new"
					className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95"
				>
					New league
				</Link>
			</div>
			<div className="mt-6 grid gap-3">
				{data.length === 0 && (
					<p className="text-muted-foreground">
						You're not in a league yet. Start one, or join with an invite code
						below.
					</p>
				)}
				{data.map(({ league, role }, i) => (
					<motion.div
						key={league.id}
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: i * 0.05 }}
					>
						<Link
							to="/league/$leagueId"
							params={{ leagueId: league.id }}
							className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:border-primary"
						>
							<span>
								<span className="block font-display text-xl font-semibold">
									{league.name}
								</span>
								<span className="text-sm text-muted-foreground">
									{SCORING_MODES[league.mode].label} · {league.season} season
								</span>
							</span>
							{role === "commissioner" && (
								<span className="text-xs font-semibold uppercase tracking-wider text-primary">
									Commish
								</span>
							)}
						</Link>
					</motion.div>
				))}
			</div>
			<form onSubmit={join} className="mt-10 flex gap-2">
				<input
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder="Invite code"
					className="flex-1 rounded-md border bg-card px-4 py-2 outline-none ring-ring/40 focus:ring-4"
				/>
				<button
					type="submit"
					className="rounded-full border px-4 py-2 font-semibold transition-colors hover:bg-muted"
				>
					Join
				</button>
			</form>
			{error && <p className="mt-2 text-sm text-loss">{error}</p>}
		</main>
	);
}
