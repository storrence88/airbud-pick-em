import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GameCard } from "#/components/GameCard";
import { weekGamesQuery } from "#/server/games";

export const Route = createFileRoute("/picks")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(weekGamesQuery()),
	component: PicksPage,
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">
			Couldn&apos;t load games: {(error as Error).message}
		</main>
	),
});

// Picks live in the browser until the Supabase project is connected.
const STORAGE_KEY = "pickem:picks";

function usePicks() {
	const [picks, setPicks] = useState<Record<string, string>>({});
	useEffect(() => {
		try {
			setPicks(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
		} catch {}
	}, []);
	const pick = (gameId: string, team: string) =>
		setPicks((prev) => {
			const next = { ...prev, [gameId]: team };
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch {}
			return next;
		});
	return [picks, pick] as const;
}

function PicksPage() {
	const { data: games } = useSuspenseQuery(weekGamesQuery());
	const [picks, pick] = usePicks();
	const made = games.filter((g) => picks[g.id]).length;
	const week = games[0]?.week;

	return (
		<main className="mx-auto max-w-5xl px-4 py-8">
			<div className="flex items-end justify-between gap-4">
				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-primary">
						Straight up
					</div>
					<h1 className="font-display text-4xl font-bold uppercase">
						Week {week}
					</h1>
				</div>
				<div className="text-right">
					<div className="font-display text-3xl font-bold tabular-nums">
						{made}
						<span className="text-muted-foreground">/{games.length}</span>
					</div>
					<div className="text-xs text-muted-foreground">picks made</div>
				</div>
			</div>
			<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
				<motion.div
					className="h-full rounded-full bg-primary"
					animate={{
						width: `${games.length ? (made / games.length) * 100 : 0}%`,
					}}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
			</div>
			<div className="mt-6 grid gap-4 md:grid-cols-2">
				{games.map((g) => (
					<GameCard
						key={g.id}
						game={g}
						picked={picks[g.id]}
						onPick={(team) => pick(g.id, team)}
					/>
				))}
			</div>
		</main>
	);
}
