import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { SCORING_MODES, type ScoringMode } from "#/lib/scoring";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main className="mx-auto max-w-5xl px-4 py-16">
			<motion.h1
				initial={{ opacity: 0, y: 24 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ type: "spring", stiffness: 120, damping: 18 }}
				className="font-display text-5xl font-bold uppercase leading-none tracking-tight sm:text-7xl"
			>
				Make your picks.
				<br />
				<span className="text-primary">Talk your trash.</span>
			</motion.h1>
			<motion.p
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.2 }}
				className="mt-6 max-w-xl text-lg text-muted-foreground"
			>
				A private NFL pick'em league for you and your friends. Straight up,
				against the spread, or confidence points.
			</motion.p>
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.3 }}
				className="mt-8 flex gap-3"
			>
				<Link
					to="/leagues"
					className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95"
				>
					This week's games
				</Link>
				<Link
					to="/league/new"
					className="rounded-full border px-6 py-3 font-semibold transition-colors hover:bg-muted"
				>
					Start a league
				</Link>
			</motion.div>
			<div className="mt-16 grid gap-4 sm:grid-cols-3">
				{(Object.keys(SCORING_MODES) as ScoringMode[]).map((mode, i) => (
					<motion.div
						key={mode}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{
							delay: 0.4 + i * 0.08,
							type: "spring",
							stiffness: 200,
							damping: 22,
						}}
						className="rounded-lg border bg-card p-5"
					>
						<div className="text-xs font-semibold uppercase tracking-wider text-primary">
							{SCORING_MODES[mode].tagline}
						</div>
						<div className="mt-1 font-display text-xl font-semibold">
							{SCORING_MODES[mode].label}
						</div>
						<p className="mt-2 text-sm text-muted-foreground">
							{SCORING_MODES[mode].explanation}
						</p>
					</motion.div>
				))}
			</div>
		</main>
	);
}
