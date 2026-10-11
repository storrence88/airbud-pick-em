import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { leaveLeague } from "#/server/leagues";

/** Quiet footer action for leaving the league, confirmed inline. */
export function LeaveLeague({
	leagueId,
	leagueName,
	isCommissioner,
}: {
	leagueId: string;
	leagueName: string;
	isCommissioner: boolean;
}) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [confirming, setConfirming] = useState(false);

	const leave = useMutation({
		mutationFn: () => leaveLeague({ data: { leagueId } }),
		onSuccess: async () => {
			await navigate({ to: "/leagues" });
			qc.removeQueries({ queryKey: ["league", leagueId] });
			qc.invalidateQueries({ queryKey: ["leagues"] });
		},
	});

	return (
		<div className="mt-10 border-t pt-4 text-sm">
			<AnimatePresence mode="wait" initial={false}>
				{confirming ? (
					<motion.div
						key="confirm"
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className={
							isCommissioner
								? "rounded-md border bg-card p-3"
								: "rounded-md border border-loss/40 bg-loss/5 p-3"
						}
					>
						{isCommissioner ? (
							<>
								<div className="font-semibold">
									You're the commissioner of {leagueName}.
								</div>
								<p className="mt-1 text-muted-foreground">
									Hand the role to another member in league settings, then you
									can leave.
								</p>
								<div className="mt-3 flex justify-end gap-2">
									<button
										type="button"
										onClick={() => setConfirming(false)}
										className="h-10 rounded-full px-4 font-semibold text-muted-foreground hover:bg-muted"
									>
										Cancel
									</button>
									<Link
										to="/league/$leagueId/settings"
										params={{ leagueId }}
										className="grid h-10 place-items-center rounded-full border px-4 font-semibold transition-transform hover:bg-muted active:scale-95"
									>
										Transfer commissioner
									</Link>
								</div>
							</>
						) : (
							<>
								<div className="font-semibold">Leave {leagueName}?</div>
								<p className="mt-1 text-muted-foreground">
									Your picks on games that haven't started yet are cleared.
									Finished games stay in the standings under Former members, and
									come back if you rejoin with the invite link.
								</p>
								<div className="mt-3 flex justify-end gap-2">
									<button
										type="button"
										onClick={() => {
											setConfirming(false);
											leave.reset();
										}}
										disabled={leave.isPending}
										className="h-10 rounded-full px-4 font-semibold text-muted-foreground hover:bg-muted"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={() => leave.mutate()}
										disabled={leave.isPending}
										className="h-10 rounded-full bg-loss px-4 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
									>
										{leave.isPending ? "Leaving…" : "Leave league"}
									</button>
								</div>
								{leave.error && (
									<p className="mt-2 text-loss">
										{(leave.error as Error).message}
									</p>
								)}
							</>
						)}
					</motion.div>
				) : (
					<motion.div
						key="start"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="flex justify-end"
					>
						<button
							type="button"
							onClick={() => setConfirming(true)}
							className="flex h-9 items-center gap-2 rounded-full px-3 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-loss"
						>
							<LogOut className="size-4" aria-hidden />
							Leave league
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
