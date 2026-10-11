import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, TrendingDown, TrendingUp, Users } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import { Avatar } from "#/components/Avatar";
import { teamByAbbr, teamLogo } from "#/lib/nfl/teams";
import {
	computePlayerStats,
	formatRecord,
	type Tally,
	type WeekLine,
	winPct,
} from "#/lib/player-stats";
import { SCORING_MODES } from "#/lib/scoring";
import { cn } from "#/lib/utils";
import { playerStatsQuery } from "#/server/stats";

export const Route = createFileRoute("/league/$leagueId_/stats/$userId")({
	beforeLoad: ({ context, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
	},
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(
			playerStatsQuery(params.leagueId, params.userId),
		),
	component: PlayerStatsPage,
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-3xl px-4 py-16 text-muted-foreground">
			{(error as Error).message}
		</main>
	),
});

/** Teams shown before "Show all". */
const TEAM_PREVIEW = 8;

const pct = (r: Tally) => {
	const p = winPct(r);
	return p == null ? "—" : `${Math.round(p * 100)}%`;
};

function PlayerStatsPage() {
	const { leagueId, userId } = Route.useParams();
	const { data } = useSuspenseQuery(playerStatsQuery(leagueId, userId));
	const { league, player, members } = data;
	const stats = useMemo(
		() =>
			computePlayerStats(data.picks, data.games, data.weeks, {
				mode: league.mode,
				pushValue: league.settings.pushValue,
			}),
		[data, league],
	);
	const me = player.user_id === data.userId;
	const ats = league.mode === "spread";
	const decided = stats.overall.w + stats.overall.l + stats.overall.p;

	return (
		<main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
			<Link
				to="/league/$leagueId"
				params={{ leagueId }}
				className="-ml-2 inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4 shrink-0" aria-hidden />
				<span className="truncate">{league.name}</span>
			</Link>

			<div className="mt-3 flex items-center gap-4">
				<Avatar profile={player} size={64} />
				<div className="min-w-0 flex-1">
					<div className="text-xs font-semibold uppercase tracking-wider text-primary">
						{league.season} season · {SCORING_MODES[league.mode].label}
					</div>
					<h1 className="truncate font-display text-3xl font-bold uppercase sm:text-4xl">
						{me ? "Your stats" : player.display_name}
					</h1>
					{player.title && (
						<div className="truncate text-sm text-muted-foreground italic">
							{player.title}
						</div>
					)}
				</div>
				<div className="shrink-0 text-right">
					<div className="font-display text-3xl font-bold tabular-nums sm:text-4xl">
						{formatRecord(stats.overall)}
					</div>
					<div className="text-xs text-muted-foreground">
						{pct(stats.overall)} {ats ? "against the spread" : "right"}
					</div>
				</div>
			</div>

			{members.length > 1 && (
				<nav
					aria-label="Other players"
					className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1"
				>
					{members.map((m) => (
						<Link
							key={m.user_id}
							to="/league/$leagueId/stats/$userId"
							params={{ leagueId, userId: m.user_id }}
							title={m.display_name}
							className={cn(
								"flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card pr-3 pl-1 text-sm font-semibold transition-colors",
								m.user_id === player.user_id
									? "border-primary text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<Avatar profile={m} size={28} />
							<span className="max-w-28 truncate">
								{m.user_id === data.userId ? "You" : m.display_name}
							</span>
						</Link>
					))}
				</nav>
			)}

			{decided === 0 ? (
				<p className="mt-8 rounded-lg border border-dashed p-6 text-center text-muted-foreground">
					No finished picks yet. Stats fill in as games go final.
				</p>
			) : (
				<div className="mt-6 grid gap-3 sm:grid-cols-2">
					<Card title="Home or away">
						<Split
							a={["Picked home", stats.home]}
							b={["Picked away", stats.away]}
						/>
					</Card>
					<Card
						title="Favorite or underdog"
						note="By the line when picks locked. Pick'ems are left out."
					>
						<Split
							a={["Favorites", stats.favorite]}
							b={["Underdogs", stats.underdog]}
						/>
					</Card>
					<Card title="Best and worst week">
						<Weeks best={stats.best} worst={stats.worst} unit={league.mode} />
					</Card>
					<Card
						title="Versus the ESPN crowd"
						note="The side most ESPN Pick'em players took when picks locked."
					>
						<Crowd crowd={stats.crowd} you={me ? "You" : player.display_name} />
					</Card>
					<Card title="Record by team picked" className="sm:col-span-2">
						<Teams teams={stats.byTeam} />
					</Card>
				</div>
			)}
		</main>
	);
}

function Card({
	title,
	note,
	className,
	children,
}: {
	title: string;
	note?: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className={cn("rounded-lg border bg-card p-4", className)}
		>
			<h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
				{title}
			</h2>
			<div className="mt-3">{children}</div>
			{note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
		</motion.section>
	);
}

/** A labeled record with a thin bar showing its win rate. */
function RecordBar({ label, record }: { label: string; record: Tally }) {
	const p = winPct(record);
	return (
		<div>
			<div className="flex items-baseline justify-between gap-2 text-sm">
				<span className="truncate">{label}</span>
				<span className="shrink-0 tabular-nums">
					<span className="font-semibold">{formatRecord(record)}</span>
					<span className="ml-2 inline-block w-9 text-right text-muted-foreground">
						{pct(record)}
					</span>
				</span>
			</div>
			<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
				<motion.div
					className="h-full rounded-full bg-primary"
					initial={{ width: 0 }}
					animate={{ width: `${(p ?? 0) * 100}%` }}
					transition={{ type: "spring", stiffness: 120, damping: 22 }}
				/>
			</div>
		</div>
	);
}

function Split({ a, b }: { a: [string, Tally]; b: [string, Tally] }) {
	return (
		<div className="grid gap-3">
			<RecordBar label={a[0]} record={a[1]} />
			<RecordBar label={b[0]} record={b[1]} />
		</div>
	);
}

function Weeks({
	best,
	worst,
	unit,
}: {
	best: WeekLine | null;
	worst: WeekLine | null;
	unit: string;
}) {
	if (!best)
		return (
			<p className="text-sm text-muted-foreground">
				Shows up once a full week is final.
			</p>
		);
	const line = (w: WeekLine) =>
		unit === "confidence"
			? `${w.points} pts · ${formatRecord(w)}`
			: formatRecord(w);
	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-3">
				<TrendingUp className="size-4 shrink-0 text-win" aria-hidden />
				<span className="flex-1 text-sm">Best · Week {best.week}</span>
				<span className="font-semibold tabular-nums">{line(best)}</span>
			</div>
			{worst && (
				<div className="flex items-center gap-3">
					<TrendingDown className="size-4 shrink-0 text-loss" aria-hidden />
					<span className="flex-1 text-sm">Worst · Week {worst.week}</span>
					<span className="font-semibold tabular-nums">{line(worst)}</span>
				</div>
			)}
		</div>
	);
}

function Crowd({
	crowd,
	you,
}: {
	crowd: ReturnType<typeof computePlayerStats>["crowd"];
	you: string;
}) {
	if (crowd.games === 0)
		return (
			<p className="text-sm text-muted-foreground">
				No ESPN crowd numbers saved for these games yet.
			</p>
		);
	const yours = winPct(crowd.you) ?? 0;
	const theirs = winPct(crowd.crowd) ?? 0;
	const lead = Math.round((yours - theirs) * 100);
	const against = crowd.against.w + crowd.against.l + crowd.against.p;
	return (
		<div className="grid gap-3">
			<RecordBar label={you} record={crowd.you} />
			<RecordBar label="ESPN crowd" record={crowd.crowd} />
			<p className="flex items-start gap-2 text-sm text-muted-foreground">
				<Users className="mt-0.5 size-4 shrink-0" aria-hidden />
				<span>
					{lead === 0
						? "Dead even with the crowd"
						: lead > 0
							? `${lead}% better than the crowd`
							: `${-lead}% worse than the crowd`}
					{against > 0 &&
						`. Went against it ${against} ${against === 1 ? "time" : "times"} and went ${formatRecord(crowd.against)}.`}
				</span>
			</p>
		</div>
	);
}

function Teams({
	teams,
}: {
	teams: ReturnType<typeof computePlayerStats>["byTeam"];
}) {
	const [all, setAll] = useState(false);
	const shown = all ? teams : teams.slice(0, TEAM_PREVIEW);
	return (
		<>
			<ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
				{shown.map((t) => (
					<li key={t.team} className="flex items-center gap-3">
						<img
							src={teamLogo(t.team)}
							alt=""
							className="size-7 shrink-0 object-contain"
							loading="lazy"
						/>
						<div className="min-w-0 flex-1">
							<RecordBar
								label={teamByAbbr(t.team)?.name ?? t.team}
								record={t}
							/>
						</div>
					</li>
				))}
			</ul>
			{teams.length > TEAM_PREVIEW && (
				<button
					type="button"
					onClick={() => setAll(!all)}
					className="mt-4 h-9 rounded-full border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					{all ? "Show fewer" : `Show all ${teams.length} teams`}
				</button>
			)}
		</>
	);
}
