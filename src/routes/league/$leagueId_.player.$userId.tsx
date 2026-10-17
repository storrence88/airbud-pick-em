import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	ArrowLeft,
	BarChart3,
	Check,
	ChevronRight,
	Crown,
	Equal,
	LockKeyhole,
	Shield,
	Sparkles,
	TrendingDown,
	X,
} from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useMemo } from "react";
import { Avatar } from "#/components/Avatar";
import {
	ProfileHeader,
	SeasonTiles,
	useProfile,
} from "#/components/PlayerProfile";
import { PlayerSheetProvider } from "#/components/PlayerSheet";
import {
	HeadToHead,
	SeasonChart,
	SignatureMoves,
} from "#/components/ProfileExtras";
import type { Game } from "#/lib/nfl/types";
import { fadeWins, ordinal, type WeekFinish } from "#/lib/player-profile";
import { formatRecord, type Tally } from "#/lib/player-stats";
import { type PickOutcome, pickOutcome, type ScoringMode } from "#/lib/scoring";
import { cn } from "#/lib/utils";
import { toResult } from "#/lib/week-results";
import {
	leagueWeekQuery,
	type PickRow,
	standingsQuery,
} from "#/server/leagues";
import { playerStatsQuery } from "#/server/stats";
import { survivorPoolQuery, survivorQuery } from "#/server/survivor";

export const Route = createFileRoute("/league/$leagueId_/player/$userId")({
	beforeLoad: ({ context, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
	},
	loader: async ({ context, params }) => {
		const qc = context.queryClient;
		qc.prefetchQuery(standingsQuery(params.leagueId));
		await qc.ensureQueryData(leagueWeekQuery(params.leagueId));
	},
	component: PlayerProfilePage,
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-3xl px-4 py-16 text-muted-foreground">
			{(error as Error).message}
		</main>
	),
});

type WeekGame = Game & { lockedSpread: number | null };

function PlayerProfilePage() {
	const { leagueId, userId } = Route.useParams();
	const profile = useProfile(leagueId, userId);
	const { week, member, summary, extras, me } = profile;

	return (
		<PlayerSheetProvider leagueId={leagueId}>
			<main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
				<Link
					to="/league/$leagueId"
					params={{ leagueId }}
					className="-ml-2 inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4 shrink-0" aria-hidden />
					<span className="truncate">{week.league.name}</span>
				</Link>

				{week.members.length > 1 && (
					<nav
						aria-label="Other players"
						className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1"
					>
						{week.members.map((m) => (
							<Link
								key={m.user_id}
								to="/league/$leagueId/player/$userId"
								params={{ leagueId, userId: m.user_id }}
								replace
								className={cn(
									"flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card pr-3 pl-1 text-sm font-semibold transition-colors",
									m.user_id === userId
										? "border-primary text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Avatar profile={m} size={28} />
								<span className="max-w-28 truncate">
									{m.user_id === week.userId ? "You" : m.display_name}
								</span>
							</Link>
						))}
					</nav>
				)}

				{!member ? (
					<NotHere leagueId={leagueId} userId={userId} />
				) : (
					<motion.div
						key={userId}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.2 }}
						className="mt-4 grid grid-cols-1 gap-6 [&>*]:min-w-0"
					>
						<div className="grid gap-3">
							<ProfileHeader profile={profile} />
							<SeasonTiles profile={profile} />
						</div>

						<Section title="Week by week">
							<WeekStrip leagueId={leagueId} weeks={summary?.weeks ?? null} />
						</Section>

						<Section title="Season so far">
							<SeasonChart
								points={extras?.line ?? null}
								name={me ? "You" : member.display_name}
							/>
						</Section>

						<Section title="Trophy shelf">
							<TrophyShelf
								leagueId={leagueId}
								userId={userId}
								weeksWon={summary?.weeksWon ?? null}
								locks={summary?.locks ?? null}
							/>
						</Section>

						<Section title="Signature moves">
							<SignatureMoves signature={extras?.signature ?? null} />
						</Section>

						<Section title={me ? "Compare" : "Head to head"}>
							<HeadToHead leagueId={leagueId} userId={userId} />
						</Section>

						<RecentPicks leagueId={leagueId} userId={userId} me={me} />

						<Link
							to="/league/$leagueId/stats/$userId"
							params={{ leagueId, userId }}
							className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/50"
						>
							<BarChart3 className="size-5 shrink-0 text-primary" aria-hidden />
							<span className="flex-1">
								<span className="block font-semibold">Season stats</span>
								<span className="block text-xs text-muted-foreground">
									Home and away, favorites, by team, versus the crowd
								</span>
							</span>
							<ChevronRight
								className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
								aria-hidden
							/>
						</Link>
					</motion.div>
				)}
			</main>
		</PlayerSheetProvider>
	);
}

/** Removed members keep their stats page but have no profile here. */
function NotHere({ leagueId, userId }: { leagueId: string; userId: string }) {
	return (
		<div className="mt-8 rounded-lg border border-dashed p-6 text-center text-muted-foreground">
			<p>That player isn't in this league anymore.</p>
			<Link
				to="/league/$leagueId/stats/$userId"
				params={{ leagueId, userId }}
				className="mt-3 inline-block font-semibold text-foreground underline-offset-4 hover:underline"
			>
				See their season stats
			</Link>
		</div>
	);
}

function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="min-w-0">
			<div className="mb-2.5 flex items-baseline justify-between gap-3">
				<h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
					{title}
				</h2>
				{action}
			</div>
			{children}
		</section>
	);
}

/** One chip per finished week: their place, a crown when they won it. */
function WeekStrip({
	leagueId,
	weeks,
}: {
	leagueId: string;
	weeks: WeekFinish[] | null;
}) {
	const { data: current } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const thisWeek = current.games[0]?.week ?? 0;
	if (!weeks)
		return <div className="h-[76px] animate-pulse rounded-xl bg-muted/60" />;
	if (!weeks.length)
		return (
			<p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
				Fills in once a full week is final.
			</p>
		);
	return (
		<ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
			{weeks.map((w, i) => {
				const last = w.rank != null && w.of > 1 && w.rank === w.of;
				return (
					<motion.li
						key={w.week}
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.18 }}
						className="shrink-0"
					>
						<Link
							to="/league/$leagueId"
							params={{ leagueId }}
							search={w.week >= thisWeek ? {} : { week: w.week }}
							title={`Week ${w.week}${w.rank ? `: ${ordinal(w.rank)} of ${w.of}` : ": no picks"}`}
							className={cn(
								"relative flex w-16 flex-col items-center rounded-xl border bg-card px-1 pt-1.5 pb-2 transition-colors hover:bg-muted/50",
								w.won &&
									"border-amber-500/50 bg-gradient-to-b from-amber-300/30 to-card dark:border-amber-300/30 dark:from-amber-300/10",
							)}
						>
							<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								Wk {w.week}
							</span>
							<span
								className={cn(
									"font-display text-xl leading-tight font-bold tabular-nums",
									w.rank == null && "text-muted-foreground/50",
								)}
							>
								{w.rank ? ordinal(w.rank) : "–"}
							</span>
							<span className="flex h-4 items-center text-[10px] text-muted-foreground tabular-nums">
								{w.won ? (
									<Crown
										className="size-3.5 text-amber-600 dark:text-amber-300"
										aria-label="Won the week"
									/>
								) : last ? (
									<TrendingDown className="size-3.5" aria-label="Last place" />
								) : w.rank ? (
									`${Math.round(w.points * 10) / 10} pts`
								) : null}
							</span>
						</Link>
					</motion.li>
				);
			})}
		</ol>
	);
}

function TrophyShelf({
	leagueId,
	userId,
	weeksWon,
	locks,
}: {
	leagueId: string;
	userId: string;
	weeksWon: number | null;
	locks: Tally | null;
}) {
	const { data: week } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const settings = useMemo(
		() => ({
			mode: week.league.mode,
			pushValue: week.league.settings.pushValue,
		}),
		[week.league],
	);
	const { data: stats } = useQuery(playerStatsQuery(leagueId, userId));
	const fades = stats ? fadeWins(stats.picks, stats.games, settings) : null;
	const survivor = useSurvivorStatus(leagueId, userId);

	const lockCount = locks ? locks.w + locks.l + locks.p : 0;
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<Trophy
				icon={<Crown className="size-5 text-amber-600 dark:text-amber-300" />}
				label="Weeks won"
				value={weeksWon}
			/>
			<Trophy
				icon={
					<LockKeyhole className="size-5 text-amber-600 dark:text-amber-300" />
				}
				label="Lock of the Week"
				value={locks == null ? null : lockCount ? formatRecord(locks) : "—"}
			/>
			<Trophy
				icon={<Sparkles className="size-5 text-primary" />}
				label="Faded the public"
				value={fades}
				note="Wins on a side 20% or less of ESPN took"
			/>
			{survivor !== undefined && (
				<Trophy
					icon={<SurvivorMark status={survivor} />}
					label="Survivor"
					value={survivor?.text ?? null}
					note={survivor?.note}
				/>
			)}
		</div>
	);
}

function Trophy({
	icon,
	label,
	value,
	note,
}: {
	icon: ReactNode;
	label: string;
	value: ReactNode | null;
	note?: string;
}) {
	return (
		<div className="flex flex-col gap-1 rounded-xl border bg-card px-3 py-3">
			<span aria-hidden className="flex h-5 items-center">
				{icon}
			</span>
			<span
				className={cn(
					"font-display text-xl leading-tight font-bold tabular-nums",
					value == null && "text-muted-foreground/40",
				)}
			>
				{value ?? "…"}
			</span>
			<span className="text-xs font-semibold text-muted-foreground">
				{label}
			</span>
			{note && (
				<span className="text-[11px] leading-snug text-muted-foreground/80">
					{note}
				</span>
			)}
		</div>
	);
}

interface SurvivorStatus {
	tone: "alive" | "out" | "champ";
	text: string;
	note?: string;
}

/**
 * Their survivor run in a few words. Undefined when the league doesn't play
 * survivor (the tile hides), null while it loads.
 */
function useSurvivorStatus(
	leagueId: string,
	userId: string,
): SurvivorStatus | null | undefined {
	const { data: pool, isLoading } = useQuery(survivorPoolQuery(leagueId));
	const { data } = useQuery({
		...survivorQuery(leagueId),
		enabled: !!pool,
	});
	if (isLoading) return null;
	if (!pool) return undefined;
	if (!data?.state) return null;
	const status = data.state.players.find((p) => p.userId === userId);
	if (!status) return undefined;
	if (data.state.winners.includes(userId))
		return { tone: "champ", text: "Champ", note: "Last one standing" };
	const won = Object.values(status.weeks).filter((r) => r === "win").length;
	if (status.alive)
		return {
			tone: "alive",
			text: "Alive",
			note: `${won} ${won === 1 ? "week" : "weeks"} survived`,
		};
	const team = data.picks.find(
		(p) => p.user_id === userId && p.week === status.outWeek,
	)?.team;
	const how =
		status.outReason === "missed"
			? "missed the pick"
			: status.outReason === "tie"
				? `tie on ${team ?? "their pick"}`
				: `on ${team ?? "their pick"}`;
	return {
		tone: "out",
		text: `Out Wk ${status.outWeek}`,
		note: status.provisional ? `${how}, for now` : how,
	};
}

function SurvivorMark({ status }: { status: SurvivorStatus | null }) {
	return (
		<Shield
			className={cn(
				"size-5",
				status?.tone === "out"
					? "text-muted-foreground"
					: status?.tone === "champ"
						? "fill-amber-400/40 text-amber-600 dark:text-amber-300"
						: "text-emerald-600 dark:text-emerald-300",
			)}
		/>
	);
}

/** This week's picks on games that have kicked off, then last week's. */
function RecentPicks({
	leagueId,
	userId,
	me,
}: {
	leagueId: string;
	userId: string;
	me: boolean;
}) {
	const { data: current } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const thisWeek = current.games[0]?.week ?? 0;
	const prev = thisWeek > 1 ? thisWeek - 1 : null;
	const { data: last } = useQuery({
		...leagueWeekQuery(leagueId, prev ?? 1),
		enabled: prev != null,
	});
	const mode = current.league.mode;
	return (
		<>
			<Section
				title={`Week ${thisWeek} picks`}
				action={
					<span className="text-xs text-muted-foreground">
						{me ? "Kicked-off games" : "Show after kickoff"}
					</span>
				}
			>
				<PickList
					games={current.games as WeekGame[]}
					picks={current.picks}
					userId={userId}
					mode={mode}
					empty="Shows up once their games kick off."
				/>
			</Section>
			{prev != null && (
				<Section
					title={`Week ${prev} picks`}
					action={
						<Link
							to="/league/$leagueId"
							params={{ leagueId }}
							search={{ week: prev }}
							className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							Whole week
						</Link>
					}
				>
					{last ? (
						<PickList
							games={last.games as WeekGame[]}
							picks={last.picks}
							userId={userId}
							mode={mode}
							empty="No picks that week."
						/>
					) : (
						<div className="h-24 animate-pulse rounded-xl bg-muted/60" />
					)}
				</Section>
			)}
		</>
	);
}

function PickList({
	games,
	picks,
	userId,
	mode,
	empty,
}: {
	games: WeekGame[];
	picks: PickRow[];
	userId: string;
	mode: ScoringMode;
	empty: string;
}) {
	const mine = new Map(
		picks.filter((p) => p.user_id === userId).map((p) => [p.game_id, p]),
	);
	// Your own picks are visible before kickoff, but the profile keeps to the
	// same rule for everyone.
	const shown = games
		.filter((g) => g.state !== "pre" && mine.has(g.id))
		.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
	if (!shown.length)
		return (
			<p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
				{empty}
			</p>
		);
	return (
		<ul className="grid gap-1.5 sm:grid-cols-2">
			{shown.map((g) => {
				const p = mine.get(g.id) as PickRow;
				const outcome = pickOutcome(
					{ gameId: g.id, team: p.team, confidence: p.confidence },
					toResult(g),
					mode,
				);
				return (
					<PickLine
						key={g.id}
						game={g}
						pick={p}
						outcome={outcome}
						confidence={mode === "confidence"}
					/>
				);
			})}
		</ul>
	);
}

function PickLine({
	game,
	pick,
	outcome,
	confidence,
}: {
	game: WeekGame;
	pick: PickRow;
	outcome: PickOutcome;
	confidence: boolean;
}) {
	const pickedHome = pick.team === game.home.abbr;
	const team = pickedHome ? game.home : game.away;
	const other = pickedHome ? game.away : game.home;
	const ours = pickedHome ? game.homeScore : game.awayScore;
	const theirs = pickedHome ? game.awayScore : game.homeScore;
	const live = game.state === "in";
	return (
		<li className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
			<img
				src={team.logo}
				alt=""
				className="size-8 shrink-0 object-contain"
				loading="lazy"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="font-semibold">{team.abbr}</span>
					<span className="text-xs text-muted-foreground">
						{pickedHome ? "vs" : "at"} {other.abbr}
					</span>
					{pick.is_lock && (
						<LockKeyhole
							className="size-3.5 text-amber-600 dark:text-amber-300"
							aria-label="Lock of the Week"
						/>
					)}
					{confidence && pick.confidence != null && (
						<span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
							{pick.confidence}
						</span>
					)}
				</div>
				<div className="text-xs text-muted-foreground tabular-nums">
					{ours}-{theirs}
					{live && <span className="ml-1.5 text-loss">{game.statusText}</span>}
				</div>
			</div>
			<Outcome outcome={outcome} live={live} />
		</li>
	);
}

function Outcome({ outcome, live }: { outcome: PickOutcome; live: boolean }) {
	if (outcome === "pending")
		return live ? (
			<span className="relative flex size-2.5" title="Live">
				<span className="absolute inline-flex size-full animate-ping rounded-full bg-loss/60" />
				<span className="relative inline-flex size-2.5 rounded-full bg-loss" />
			</span>
		) : null;
	const Icon = outcome === "loss" ? X : outcome === "push" ? Equal : Check;
	const label =
		outcome === "win" ? "Won" : outcome === "loss" ? "Lost" : "Push";
	return (
		<span
			title={label}
			className={cn(
				"grid size-6 shrink-0 place-items-center rounded-full text-white",
				outcome === "win"
					? "bg-win"
					: outcome === "loss"
						? "bg-loss"
						: "bg-zinc-500",
			)}
		>
			<Icon className="size-3.5" strokeWidth={3} aria-hidden />
			<span className="sr-only">{label}</span>
		</span>
	);
}
