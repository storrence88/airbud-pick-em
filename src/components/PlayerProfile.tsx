import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Crown, Toilet } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import { FLAME_AT } from "#/lib/flair";
import { teamByAbbr, teamLogo } from "#/lib/nfl/teams";
import { ordinal, profileSummary } from "#/lib/player-profile";
import { winPct } from "#/lib/player-stats";
import { accentVars } from "#/lib/team-colors";
import { cn } from "#/lib/utils";
import { leagueWeekQuery, standingsQuery } from "#/server/leagues";
import { Avatar } from "./Avatar";
import { BADGE_STYLE, StreakFlame } from "./Flair";

/** One player's profile numbers, from data the league page already loads. */
export function useProfile(leagueId: string, userId: string) {
	const { data: week } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const { data: standings } = useQuery(standingsQuery(leagueId));
	const member = week.members.find((m) => m.user_id === userId) ?? null;
	const { mode } = week.league;
	const { pushValue } = week.league.settings;
	const summary = useMemo(() => {
		if (!standings || !member) return null;
		return profileSummary(
			userId,
			week.members.map((m) => m.user_id),
			standings.picks,
			standings.games,
			standings.weeks,
			{ mode, pushValue },
		);
	}, [standings, member, week.members, userId, mode, pushValue]);
	const talk = week.trashTalk.lines.find((l) => l.user_id === userId)?.body;
	return { week, member, summary, talk, me: userId === week.userId };
}

export type ProfileData = ReturnType<typeof useProfile>;

const memberSince = (iso: string) =>
	new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		year: "numeric",
	});

/** Avatar, name, title, favorite team, flair and this week's trash talk. */
export function ProfileHeader({
	profile: { member, summary, talk, me },
	titleId,
	compact,
}: {
	profile: ProfileData;
	titleId?: string;
	compact?: boolean;
}) {
	const [open, setOpen] = useState<string | null>(null);
	if (!member) return null;
	const team = teamByAbbr(member.favorite_team);
	const badges = summary?.badges ?? [];
	const detail = badges.find((b) => b.id === open)?.detail;
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl border bg-card",
				team && "team-accent",
				compact ? "p-4" : "p-5 sm:p-6",
			)}
			style={team ? accentVars(team) : undefined}
		>
			{team && (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--tc) 22%, transparent), transparent 60%)",
					}}
				/>
			)}
			{team && !compact && (
				<img
					src={teamLogo(team.abbr)}
					alt=""
					aria-hidden
					className="pointer-events-none absolute -top-6 -right-6 size-40 object-contain opacity-[0.08] sm:size-48"
				/>
			)}
			<div className="relative flex items-center gap-4">
				<Avatar profile={member} size={compact ? 56 : 76} />
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-1.5">
						<h1
							id={titleId}
							className={cn(
								"truncate font-display font-bold uppercase",
								compact ? "text-2xl" : "text-3xl sm:text-4xl",
							)}
						>
							{member.display_name}
						</h1>
						{summary && summary.streak >= FLAME_AT && (
							<StreakFlame streak={summary.streak} />
						)}
						{summary?.lastPlace && (
							<span
								title="Last place last week"
								className="inline-flex shrink-0 text-amber-600/80 dark:text-amber-200/80"
							>
								<Toilet className="size-4" aria-hidden />
								<span className="sr-only">Last place last week</span>
							</span>
						)}
					</div>
					{member.title && (
						<div className="truncate text-sm text-muted-foreground italic">
							{member.title}
						</div>
					)}
					<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
						{team && (
							<span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
								<img
									src={teamLogo(team.abbr)}
									alt=""
									className="size-4 object-contain"
								/>
								{team.name}
							</span>
						)}
						{member.role === "commissioner" && <span>Commissioner</span>}
						{!compact && member.joined_at && (
							<span>Joined {memberSince(member.joined_at)}</span>
						)}
						{me && <span className="text-primary">You</span>}
					</div>
				</div>
			</div>
			{badges.length > 0 && (
				<div className="relative mt-4 flex flex-wrap items-center gap-1.5">
					{badges.map((b) => {
						const { icon: Icon, className } = BADGE_STYLE[b.id];
						return (
							<button
								key={b.id}
								type="button"
								title={b.detail}
								aria-label={b.detail}
								aria-expanded={open === b.id}
								onClick={() => setOpen(open === b.id ? null : b.id)}
								className={cn(
									"inline-flex h-6 items-center gap-1 rounded-full border bg-muted/50 px-2 text-xs font-semibold tabular-nums",
									className,
									open === b.id && "bg-muted",
								)}
							>
								<Icon className="size-3.5" aria-hidden />
								{b.label}
							</button>
						);
					})}
				</div>
			)}
			{detail && (
				<p className="relative mt-2 text-xs text-muted-foreground">{detail}</p>
			)}
			{talk && (
				<blockquote className="relative mt-4 border-l-2 border-[var(--tc,var(--primary))] pl-3 text-sm italic">
					“{talk}”
				</blockquote>
			)}
		</div>
	);
}

/** Standings place, points, win rate and streak. */
export function SeasonTiles({
	profile: { summary, week },
}: {
	profile: ProfileData;
}) {
	const mode = week.league.mode;
	const pct = summary ? winPct(summary.record) : null;
	const tiles: { label: string; value: ReactNode; note?: string }[] = [
		{
			label: "Place",
			value: summary ? ordinal(summary.place) : "—",
			note: summary ? `of ${summary.of}` : undefined,
		},
		{
			label: "Points",
			value: summary ? Math.round(summary.points * 10) / 10 : "—",
			note: summary?.weeksWon
				? `${summary.weeksWon} ${summary.weeksWon === 1 ? "week" : "weeks"} won`
				: undefined,
		},
		{
			label: mode === "spread" ? "Covered" : "Right",
			value: pct == null ? "—" : `${Math.round(pct * 100)}%`,
			note: summary
				? `${summary.record.w}-${summary.record.l}${summary.record.p ? `-${summary.record.p}` : ""}`
				: undefined,
		},
		{
			label: "Streak",
			value: summary ? summary.streak : "—",
			note: summary ? `best ${summary.longestStreak}` : undefined,
		},
	];
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{tiles.map((t, i) => (
				<motion.div
					key={t.label}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: i * 0.04, duration: 0.2 }}
					className="rounded-xl border bg-card px-3 py-2.5"
				>
					<div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						{t.label}
					</div>
					<div className="flex items-baseline gap-1.5">
						<span
							className={cn(
								"font-display text-2xl font-bold tabular-nums",
								!summary && "text-muted-foreground/50",
							)}
						>
							{t.value}
						</span>
						{t.note && (
							<span className="truncate text-xs text-muted-foreground">
								{t.note}
							</span>
						)}
					</div>
				</motion.div>
			))}
		</div>
	);
}

/** Crown used for weeks won. */
export function WinCrown({ className }: { className?: string }) {
	return (
		<Crown
			className={cn("text-amber-600 dark:text-amber-300", className)}
			aria-hidden
		/>
	);
}
