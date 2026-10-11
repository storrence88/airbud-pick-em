import { Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Game } from "#/lib/nfl/types";
import { MAX_TIEBREAKER } from "#/lib/tiebreaker";
import { cn } from "#/lib/utils";

export interface Guess {
	userId: string;
	name: string;
	guess: number;
}

/**
 * The Monday night tiebreaker: guess the total points in the week's last game.
 * Friends' guesses show once that game kicks off, closest first once it's scoring.
 */
export function Tiebreaker({
	game,
	picked,
	guess,
	others,
	saving,
	onSave,
}: {
	game: Game;
	picked: boolean;
	guess: number | null;
	others: Guess[];
	saving: boolean;
	onSave: (points: number | null) => void;
}) {
	const locked = game.state !== "pre";
	const total = game.homeScore + game.awayScore;
	const [draft, setDraft] = useState(guess == null ? "" : String(guess));
	// Follow the saved value when it changes underneath (refetch, another tab).
	useEffect(() => setDraft(guess == null ? "" : String(guess)), [guess]);
	const parsed = draft.trim() === "" ? null : Number(draft);
	const valid =
		parsed == null ||
		(Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_TIEBREAKER);
	const dirty = parsed !== guess;
	const matchup = `${game.away.abbr} @ ${game.home.abbr}`;

	const everyone = [
		...(guess != null ? [{ userId: "me", name: "You", guess }] : []),
		...others,
	].sort((a, b) =>
		locked
			? Math.abs(a.guess - total) - Math.abs(b.guess - total) ||
				a.name.localeCompare(b.name)
			: 0,
	);

	return (
		<div className="mt-6 rounded-lg border bg-card p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-xs font-semibold uppercase tracking-wider text-primary">
						Monday night tiebreaker
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						Total points in {matchup}. Weekly ties go to the closest guess.
					</p>
				</div>
				{locked && (
					<div className="shrink-0 text-right">
						<div className="font-display text-2xl font-bold tabular-nums">
							{total}
						</div>
						<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
							{game.state === "post" ? "Final" : "So far"}
						</div>
					</div>
				)}
			</div>

			{locked ? (
				everyone.length === 0 ? (
					<p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
						<Lock className="size-3.5" aria-hidden />
						No guesses this week.
					</p>
				) : (
					<ul className="mt-3 flex flex-wrap gap-2">
						{everyone.map((g, i) => (
							<motion.li
								key={g.userId}
								layout
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: i * 0.03 }}
								className={cn(
									"inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm",
									g.userId === "me" && "border-primary",
								)}
							>
								<span className="max-w-32 truncate">{g.name}</span>
								<span className="font-display font-semibold tabular-nums">
									{g.guess}
								</span>
							</motion.li>
						))}
					</ul>
				)
			) : (
				<form
					className="mt-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid && dirty) onSave(parsed);
					}}
				>
					<div className="flex gap-2">
						<input
							aria-label={`Total points in ${matchup}`}
							type="number"
							inputMode="numeric"
							min={0}
							max={MAX_TIEBREAKER}
							step={1}
							value={draft}
							disabled={!picked}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={picked ? "e.g. 45" : "–"}
							className="h-10 w-28 rounded-full border bg-background px-4 text-base tabular-nums outline-none focus:border-primary disabled:opacity-50 sm:text-sm"
						/>
						<button
							type="submit"
							disabled={!picked || !valid || !dirty || saving}
							className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
						>
							{saving
								? "Saving…"
								: guess != null && parsed == null
									? "Clear"
									: "Save"}
						</button>
					</div>
					<AnimatePresence mode="wait" initial={false}>
						<motion.p
							key={!picked ? "pick" : !valid ? "bad" : dirty ? "" : "saved"}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className={cn(
								"mt-1.5 min-h-4 px-1 text-xs text-muted-foreground",
								!valid && "text-loss",
							)}
						>
							{!picked
								? `Pick a winner in ${matchup} first.`
								: !valid
									? `Enter a whole number from 0 to ${MAX_TIEBREAKER}.`
									: !dirty && guess != null
										? "Saved. Locks at kickoff; friends see it then."
										: ""}
						</motion.p>
					</AnimatePresence>
				</form>
			)}
		</div>
	);
}
