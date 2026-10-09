import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SCORING_MODES, type ScoringMode } from "#/lib/scoring";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/league/new")({ component: NewLeague });

const MODES = Object.keys(SCORING_MODES) as ScoringMode[];

function NewLeague() {
	const [name, setName] = useState("");
	const [mode, setMode] = useState<ScoringMode>("straight");

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<h1 className="font-display text-4xl font-bold uppercase">
				Start a league
			</h1>
			<label className="mt-8 block text-sm font-medium" htmlFor="league-name">
				League name
			</label>
			<input
				id="league-name"
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="Sunday Scaries"
				className="mt-2 w-full rounded-md border bg-card px-4 py-3 text-lg outline-none ring-ring/40 focus:ring-4"
			/>
			<fieldset className="mt-8">
				<legend className="text-sm font-medium">
					How do you want to score?
				</legend>
				<div className="mt-3 grid gap-3">
					{MODES.map((m) => {
						const active = m === mode;
						return (
							<motion.button
								key={m}
								type="button"
								layout
								onClick={() => setMode(m)}
								whileTap={{ scale: 0.98 }}
								aria-pressed={active}
								className={cn(
									"relative rounded-lg border-2 bg-card p-4 text-left transition-colors",
									active
										? "border-primary"
										: "border-border hover:border-muted-foreground/40",
								)}
							>
								<div className="flex items-center justify-between">
									<span className="font-display text-xl font-semibold">
										{SCORING_MODES[m].label}
									</span>
									<span className="text-xs font-semibold uppercase tracking-wider text-primary">
										{SCORING_MODES[m].tagline}
									</span>
								</div>
								<AnimatePresence initial={false}>
									{active && (
										<motion.p
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											className="overflow-hidden text-sm text-muted-foreground"
										>
											<span className="block pt-2">
												{SCORING_MODES[m].explanation}
											</span>
										</motion.p>
									)}
								</AnimatePresence>
							</motion.button>
						);
					})}
				</div>
			</fieldset>
			<button
				type="button"
				disabled
				title="Available once the database is connected"
				className="mt-8 w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground opacity-50"
			>
				Create league
			</button>
		</main>
	);
}
