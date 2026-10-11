import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import {
	setSurvivor,
	survivorPoolQuery,
	survivorQuery,
} from "#/server/survivor";

/** Commissioner-only panel for turning the survivor side game on or off. */
export function SurvivorSettings({ leagueId }: { leagueId: string }) {
	const [open, setOpen] = useState(false);
	const { data: pool } = useQuery(survivorPoolQuery(leagueId));
	return (
		<section className="mt-4 rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left"
			>
				<Shield className="size-5 text-muted-foreground" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Survivor</span>
					<span className="block text-sm text-muted-foreground">
						{pool
							? `On, starting week ${pool.start_week}.`
							: "A side game: one team a week, no repeats, one loss and you're out."}
					</span>
				</span>
				<ChevronDown
					className={cn(
						"size-5 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden
				/>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<Toggle leagueId={leagueId} />
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

function Toggle({ leagueId }: { leagueId: string }) {
	const qc = useQueryClient();
	const { data, isPending, error } = useQuery(survivorQuery(leagueId));
	const [confirming, setConfirming] = useState(false);

	const toggle = useMutation({
		mutationFn: (on: boolean) =>
			setSurvivor({
				data: {
					leagueId,
					on,
					startWeek: on ? (data?.nextStartWeek ?? null) : null,
				},
			}),
		onSuccess: async () => {
			await qc.invalidateQueries({
				queryKey: ["league", leagueId, "survivor"],
			});
			setConfirming(false);
		},
	});

	if (isPending)
		return (
			<div className="border-t px-4 py-4 text-sm text-muted-foreground">
				Loading…
			</div>
		);
	if (error || !data)
		return (
			<div className="border-t px-4 py-4 text-sm text-loss">
				{(error as Error | null)?.message ?? "Couldn't load survivor."}
			</div>
		);

	const on = !!data.pool;
	return (
		<div className="border-t px-4 py-4 text-sm">
			<p className="text-muted-foreground">
				Everyone in the league picks one team to win each week and can't use a
				team twice. A loss, a tie or a week with no pick knocks you out. If
				everyone left goes out the same week, they all stay in. Picks lock at
				each game's kickoff and stay hidden from friends until then.
			</p>
			{on ? (
				<p className="mt-3">
					Running since week {data.pool?.start_week}.{" "}
					<Link
						to="/league/$leagueId/survivor"
						params={{ leagueId }}
						className="font-semibold text-primary"
					>
						Open the board
					</Link>
				</p>
			) : (
				<p className="mt-3">
					{data.nextStartWeek
						? `It starts with week ${data.nextStartWeek}, the next week nobody has played yet.`
						: "The regular season is over, so survivor can't start until next season."}
				</p>
			)}
			<AnimatePresence mode="wait" initial={false}>
				{confirming ? (
					<motion.div
						key="confirm"
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="mt-4 rounded-md border border-loss/40 bg-loss/5 p-3"
					>
						<div className="font-semibold">Turn survivor off?</div>
						<p className="mt-1 text-muted-foreground">
							This clears every survivor pick in the league. Turning it back on
							starts a fresh pool.
						</p>
						<div className="mt-3 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirming(false)}
								disabled={toggle.isPending}
								className="h-10 rounded-full px-4 font-semibold text-muted-foreground hover:bg-muted"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => toggle.mutate(false)}
								disabled={toggle.isPending}
								className="h-10 rounded-full bg-loss px-4 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
							>
								{toggle.isPending ? "Turning off…" : "Turn off"}
							</button>
						</div>
					</motion.div>
				) : (
					<motion.div
						key="start"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="mt-4 flex justify-end"
					>
						{on ? (
							<button
								type="button"
								onClick={() => {
									toggle.reset();
									setConfirming(true);
								}}
								className="h-10 rounded-full border px-4 font-semibold transition-transform hover:bg-muted active:scale-95"
							>
								Turn off survivor
							</button>
						) : (
							<button
								type="button"
								onClick={() => toggle.mutate(true)}
								disabled={!data.nextStartWeek || toggle.isPending}
								className="h-10 rounded-full bg-primary px-4 font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
							>
								{toggle.isPending
									? "Turning on…"
									: `Start survivor in week ${data.nextStartWeek ?? "–"}`}
							</button>
						)}
					</motion.div>
				)}
			</AnimatePresence>
			{toggle.error && (
				<p className="mt-2 text-loss">{(toggle.error as Error).message}</p>
			)}
		</div>
	);
}
