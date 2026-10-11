import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { WeekStatus } from "#/lib/flair";
import type { PublicProfile } from "#/lib/profile";
import type { ScoringSettings } from "#/lib/scoring";
import { cn } from "#/lib/utils";
import { rankWeek, type WeekRow, weekWinners } from "#/lib/weekly";
import { leagueWeekQuery, standingsQuery } from "#/server/leagues";
import { Avatar } from "./Avatar";

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Weeks with at least one final, oldest first. */
const startedWeeks = (weeks: WeekStatus) =>
	Object.entries(weeks)
		.filter(([, w]) => w.final > 0)
		.map(([wk]) => Number(wk))
		.sort((a, b) => a - b);

const isDone = (weeks: WeekStatus, wk: number) =>
	(weeks[wk]?.total ?? 0) > 0 && weeks[wk].final === weeks[wk].total;

function useLeagueData(leagueId: string) {
	const { data: week } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const query = useQuery(standingsQuery(leagueId));
	const { mode } = week.league;
	const { pushValue } = week.league.settings;
	const settings = useMemo<ScoringSettings>(
		() => ({ mode, pushValue }),
		[mode, pushValue],
	);
	return { week, settings, ...query };
}

/** Who won the most recent finished week, above the tabs. */
export function WeekWinnerBanner({ leagueId }: { leagueId: string }) {
	const { week, settings, data } = useLeagueData(leagueId);
	const result = useMemo(() => {
		if (!data) return null;
		const wk = startedWeeks(data.weeks)
			.filter((w) => isDone(data.weeks, w))
			.at(-1);
		if (wk == null) return null;
		const ids = week.members.map((m) => m.user_id);
		const winners = weekWinners(
			rankWeek(ids, data.picks, data.games, wk, settings),
		);
		return winners.length ? { wk, winners } : null;
	}, [data, week, settings]);
	const members = new Map(week.members.map((m) => [m.user_id, m]));

	return (
		<AnimatePresence>
			{result && (
				<motion.div
					initial={{ opacity: 0, y: -6 }}
					animate={{ opacity: 1, y: 0 }}
					className="mt-5 flex items-center gap-3 rounded-xl border border-amber-500/40 dark:border-amber-300/30 bg-gradient-to-r from-amber-300/25 dark:from-amber-300/10 to-transparent px-3 py-2.5 sm:px-4"
				>
					<Crown
						className="size-5 shrink-0 text-amber-600 dark:text-amber-300"
						aria-hidden
					/>
					<div className="flex shrink-0 -space-x-2">
						{result.winners.slice(0, 3).map((w) => {
							const m = members.get(w.userId);
							return m ? (
								<Avatar
									key={w.userId}
									profile={m}
									size={28}
									className="ring-2 ring-background"
								/>
							) : null;
						})}
					</div>
					<div className="min-w-0 text-sm">
						<div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-300">
							Week {result.wk}{" "}
							{result.winners.length > 1 ? "co-winners" : "winner"}
						</div>
						<div className="truncate font-semibold">
							{result.winners
								.map((w) => members.get(w.userId)?.display_name ?? "Player")
								.join(" & ")}
							<span className="font-normal text-muted-foreground">
								{" "}
								· {fmt(result.winners[0].points)} pts
								{result.winners.length === 1 &&
									result.winners[0].tiebroken &&
									", won on the tiebreaker"}
							</span>
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** One week's leaderboard, with a stepper through the weeks played so far. */
export function WeekLeaderboard({ leagueId }: { leagueId: string }) {
	const { week, settings, data, isLoading } = useLeagueData(leagueId);
	const weeks = data ? startedWeeks(data.weeks) : [];
	const [picked, setPicked] = useState<number | null>(null);
	const wk = picked != null && weeks.includes(picked) ? picked : weeks.at(-1);
	const at = wk == null ? -1 : weeks.indexOf(wk);

	const { rows, formerRows } = useMemo(() => {
		if (!data || wk == null) return { rows: [], formerRows: [] };
		const ids = week.members.map((m) => m.user_id);
		return {
			rows: rankWeek(ids, data.picks, data.games, wk, settings),
			// Removed members keep their week but sit outside the ranking.
			formerRows: rankWeek(
				data.formers.map((f) => f.user_id),
				data.picks,
				data.games,
				wk,
				settings,
			).filter((r) => r.picked > 0),
		};
	}, [data, week, wk, settings]);

	if (isLoading)
		return <p className="text-muted-foreground">Loading this week…</p>;
	if (!data || wk == null)
		return (
			<p className="text-sm text-muted-foreground">
				No finished games yet. The weekly board fills in as games go final.
			</p>
		);

	const status = data.weeks[wk];
	const done = isDone(data.weeks, wk);
	const winners = new Set(done ? weekWinners(rows).map((r) => r.userId) : []);
	const members = new Map(week.members.map((m) => [m.user_id, m]));
	const formers = new Map(data.formers.map((f) => [f.user_id, f]));

	return (
		<div>
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="flex items-center gap-1">
					<StepButton
						label="Previous week"
						disabled={at <= 0}
						onClick={() => setPicked(weeks[at - 1])}
					>
						<ChevronLeft className="size-4" aria-hidden />
					</StepButton>
					<span className="min-w-20 text-center font-display text-lg font-semibold uppercase">
						Week {wk}
					</span>
					<StepButton
						label="Next week"
						disabled={at >= weeks.length - 1}
						onClick={() => setPicked(weeks[at + 1])}
					>
						<ChevronRight className="size-4" aria-hidden />
					</StepButton>
				</div>
				<span className="text-xs text-muted-foreground">
					{done ? "Final" : `${status.final} of ${status.total} final`}
				</span>
			</div>
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={wk}
					initial={{ opacity: 0, x: 8 }}
					animate={{ opacity: 1, x: 0 }}
					exit={{ opacity: 0, x: -8 }}
					transition={{ duration: 0.15 }}
				>
					<ol className="grid gap-2">
						{rows.map((r) => {
							const m = members.get(r.userId);
							if (!m) return null;
							return (
								<WeekRowItem
									key={r.userId}
									row={r}
									profile={m}
									me={r.userId === week.userId}
									winner={winners.has(r.userId)}
								/>
							);
						})}
					</ol>
					{formerRows.length > 0 && (
						<div className="mt-6">
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Former members
							</h3>
							<ul className="grid gap-1.5">
								{formerRows.map((r) => {
									const f = formers.get(r.userId);
									if (!f) return null;
									return (
										<li
											key={r.userId}
											className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-muted-foreground sm:px-4"
										>
											<Avatar
												profile={f}
												size={28}
												className="opacity-60 grayscale"
											/>
											<span className="min-w-0 flex-1 truncate">
												{f.display_name}
											</span>
											<span className="font-display text-lg font-bold tabular-nums">
												{fmt(r.points)}
											</span>
										</li>
									);
								})}
							</ul>
						</div>
					)}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

function StepButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className="grid size-8 place-items-center rounded-full border transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
		>
			{children}
		</button>
	);
}

function WeekRowItem({
	row,
	profile,
	me,
	winner,
}: {
	row: WeekRow;
	profile: Pick<
		PublicProfile,
		"display_name" | "avatar_url" | "avatar_kind" | "favorite_team"
	>;
	me: boolean;
	winner: boolean;
}) {
	const idle = row.rank == null;
	return (
		<li
			className={cn(
				"flex items-center gap-3 rounded-lg border bg-card px-3 py-3 sm:gap-4 sm:px-4",
				me && "border-primary",
				winner &&
					"bg-gradient-to-r from-amber-300/25 dark:from-amber-300/10 to-card",
				idle && "bg-transparent text-muted-foreground",
			)}
		>
			<span className="w-5 shrink-0 text-center font-display text-xl font-bold text-muted-foreground">
				{row.rank ?? "–"}
			</span>
			<Avatar
				profile={profile}
				size={36}
				className={cn(idle && "opacity-60")}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="truncate font-semibold">{profile.display_name}</span>
					{winner && (
						<span title="Won the week" className="inline-flex shrink-0">
							<Crown
								className="size-4 text-amber-600 dark:text-amber-300"
								aria-hidden
							/>
							<span className="sr-only">Won the week</span>
						</span>
					)}
				</div>
				<div className="text-xs text-muted-foreground">
					{idle
						? "No picks this week"
						: `${row.correct} of ${row.picked} right${
								row.tiebroken && row.miss != null
									? ` · tiebreaker off by ${row.miss}`
									: ""
							}`}
				</div>
			</div>
			<span className="font-display text-2xl font-bold tabular-nums">
				{idle ? "" : fmt(row.points)}
			</span>
		</li>
	);
}
