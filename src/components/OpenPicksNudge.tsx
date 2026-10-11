import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { countdown, openPicksLabel } from "#/lib/open-picks";
import { openPicksQuery } from "#/server/open-picks";

/** Ticks once a second, refetching the count when the next game kicks off. */
function useCountdown(to: string | null, onDone: () => void) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!to) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [to]);
	const left = to ? Date.parse(to) - now : null;
	const done = left !== null && left <= 0;
	useEffect(() => {
		if (done) onDone();
	}, [done, onDone]);
	return left;
}

/**
 * "You have N open picks", with a countdown to the next kickoff among the
 * games you haven't picked. Hidden when nothing's open.
 */
export function OpenPicksNudge({ className = "" }: { className?: string }) {
	const { data, refetch } = useQuery(openPicksQuery());
	const left = useCountdown(data?.nextKickoff ?? null, refetch);
	const show =
		!!data?.total && !!data.firstLeagueId && left !== null && left > 0;
	const leagues = Object.keys(data?.byLeague ?? {}).length;

	return (
		<AnimatePresence initial={false}>
			{show && (
				<motion.div
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{ opacity: 0, height: 0 }}
					transition={{ type: "spring", stiffness: 260, damping: 28 }}
					className={`overflow-hidden ${className}`}
				>
					<Link
						to="/league/$leagueId"
						params={{ leagueId: data.firstLeagueId ?? "" }}
						className="group flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 pr-2 transition-colors hover:border-primary sm:p-4 sm:pr-3"
					>
						<span className="relative flex size-2.5 shrink-0">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
							<span className="relative inline-flex size-2.5 rounded-full bg-primary" />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block font-semibold">
								You have {openPicksLabel(data.total)}
								{leagues > 1 && (
									<span className="font-normal text-muted-foreground">
										{" "}
										in {leagues} leagues
									</span>
								)}
							</span>
							<span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
								<Clock className="size-3.5 shrink-0" aria-hidden />
								Next kickoff in{" "}
								<span className="font-mono tabular-nums text-foreground">
									{countdown(left)}
								</span>
							</span>
						</span>
						<ChevronRight
							className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
							aria-hidden
						/>
					</Link>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** The small "3 open" pill on a league in the leagues list. */
export function OpenPicksBadge({ leagueId }: { leagueId: string }) {
	const { data } = useQuery(openPicksQuery());
	const n = data?.byLeague[leagueId] ?? 0;
	return (
		<AnimatePresence initial={false}>
			{n > 0 && (
				<motion.span
					initial={{ opacity: 0, scale: 0.8 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.8 }}
					className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums"
				>
					{n} open
				</motion.span>
			)}
		</AnimatePresence>
	);
}
