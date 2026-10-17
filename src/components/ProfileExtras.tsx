import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { HeartCrack, Repeat, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { teamByAbbr, teamLogo } from "#/lib/nfl/teams";
import { ordinal, profileSummary } from "#/lib/player-profile";
import { formatRecord, winPct } from "#/lib/player-stats";
import {
	headToHead,
	type SeasonPoint,
	type Signature,
	type SignaturePick,
} from "#/lib/profile-extras";
import { cn } from "#/lib/utils";
import { leagueWeekQuery, standingsQuery } from "#/server/leagues";
import { Avatar } from "./Avatar";

const round = (n: number) => Math.round(n * 10) / 10;
const lineText = (n: number | null) =>
	n == null || n === 0 ? "" : n > 0 ? ` +${n}` : ` ${n}`;

/** Most-picked team, boldest correct call and the loss that hurt most. */
export function SignatureMoves({ signature }: { signature: Signature | null }) {
	if (!signature)
		return <div className="h-28 animate-pulse rounded-xl bg-muted/60" />;
	const { team, boldest, worstBeat } = signature;
	if (!team && !boldest && !worstBeat)
		return (
			<p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
				Fills in as games go final.
			</p>
		);
	const nickname = (abbr: string) =>
		teamByAbbr(abbr)?.name.split(" ").at(-1) ?? abbr;
	return (
		<div className="grid gap-2 sm:grid-cols-3">
			{team && (
				<Move
					icon={<Repeat className="size-4 text-primary" />}
					label="Go-to team"
					logo={team.team}
					title={`Rides the ${nickname(team.team)}`}
					note={`${team.count} picks, ${formatRecord(team)}`}
				/>
			)}
			{boldest && (
				<Move
					icon={<Zap className="size-4 text-sky-600 dark:text-sky-300" />}
					label="Boldest call"
					logo={boldest.team}
					title={`${boldest.team}${lineText(boldest.line)} beat ${boldest.opponent}`}
					note={`Week ${boldest.week}`}
				/>
			)}
			{worstBeat && (
				<Move
					icon={<HeartCrack className="size-4 text-loss" />}
					label="Worst beat"
					logo={worstBeat.team}
					title={`${worstBeat.team}${lineText(worstBeat.line)} lost to ${worstBeat.opponent}`}
					note={beatNote(worstBeat)}
				/>
			)}
		</div>
	);
}

function beatNote(p: SignaturePick) {
	const why =
		p.confidence != null && p.confidence > 0
			? `${p.confidence} confidence`
			: p.lock
				? "Lock of the Week"
				: null;
	return why ? `Week ${p.week}, ${why}` : `Week ${p.week}`;
}

function Move({
	icon,
	label,
	logo,
	title,
	note,
}: {
	icon: ReactNode;
	label: string;
	logo: string;
	title: string;
	note: string;
}) {
	return (
		<div className="relative overflow-hidden rounded-xl border bg-card px-3 py-3">
			<img
				src={teamLogo(logo)}
				alt=""
				aria-hidden
				className="pointer-events-none absolute -right-3 -bottom-3 size-20 object-contain opacity-15"
			/>
			<div className="relative flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
				<span aria-hidden>{icon}</span>
				{label}
			</div>
			<div className="relative mt-1.5 font-semibold">{title}</div>
			<div className="relative text-xs text-muted-foreground">{note}</div>
		</div>
	);
}

/**
 * Running points, week by week, against the league average. Two lines, a
 * legend, and a tap or hover on any week shows both numbers.
 */
export function SeasonChart({
	points,
	name,
}: {
	points: SeasonPoint[] | null;
	name: string;
}) {
	const [hover, setHover] = useState<number | null>(null);
	// Draw at the real pixel width so the labels stay readable on phones.
	const [W, setW] = useState(640);
	const box = useRef<HTMLDivElement>(null);
	const drawn = (points?.length ?? 0) >= 2;
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) =>
			setW(Math.max(240, Math.round(e.contentRect.width))),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, [drawn]);
	if (!points)
		return <div className="h-44 animate-pulse rounded-xl bg-muted/60" />;
	if (points.length < 2)
		return (
			<p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
				Shows up after two full weeks.
			</p>
		);
	const H = 180;
	const pad = { l: 8, r: 44, t: 12, b: 24 };
	const max = Math.max(1, ...points.flatMap((p) => [p.you, p.avg]));
	const x = (i: number) =>
		pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
	const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
	const path = (key: "you" | "avg") =>
		points
			.map(
				(p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`,
			)
			.join("");
	const last = points.at(-1) as SeasonPoint;
	const shown = hover != null ? points[hover] : null;
	const step = (W - pad.l - pad.r) / (points.length - 1);

	return (
		<div ref={box} className="rounded-xl border bg-card p-3">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<span className="h-0.5 w-4 rounded-full bg-primary" />
					{name}
				</span>
				<span className="flex items-center gap-1.5">
					<span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground/60" />
					League average
				</span>
				<span className="ml-auto h-4 tabular-nums">
					{shown &&
						`Wk ${shown.week}: ${round(shown.you)} vs ${round(shown.avg)} avg`}
				</span>
			</div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="mt-2 block h-auto w-full touch-pan-y"
				role="img"
				aria-label={`${name} has ${round(last.you)} points through week ${last.week}; the league average is ${round(last.avg)}.`}
				onPointerLeave={() => setHover(null)}
			>
				{[0, 0.5, 1].map((f) => (
					<line
						key={f}
						x1={pad.l}
						x2={W - pad.r}
						y1={y(max * f)}
						y2={y(max * f)}
						className="stroke-border"
						strokeWidth={1}
					/>
				))}
				{shown && hover != null && (
					<line
						x1={x(hover)}
						x2={x(hover)}
						y1={pad.t}
						y2={H - pad.b}
						className="stroke-muted-foreground/40"
						strokeWidth={1}
					/>
				)}
				<path
					d={path("avg")}
					fill="none"
					className="stroke-muted-foreground/60"
					strokeWidth={2}
					strokeDasharray="5 5"
					strokeLinecap="round"
				/>
				<motion.path
					d={path("you")}
					fill="none"
					className="stroke-primary"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					initial={{ pathLength: 0 }}
					animate={{ pathLength: 1 }}
					transition={{ duration: 0.8, ease: "easeOut" }}
				/>
				{points.map((p, i) => (
					<circle
						key={p.week}
						cx={x(i)}
						cy={y(p.you)}
						r={hover === i ? 5 : 3}
						className="fill-primary stroke-card"
						strokeWidth={2}
					/>
				))}
				<text
					x={W - pad.r + 6}
					y={y(last.you) + 4}
					className="fill-foreground text-[13px] font-semibold tabular-nums"
				>
					{round(last.you)}
				</text>
				<text
					x={W - pad.r + 6}
					y={
						y(last.avg) +
						4 +
						(Math.abs(y(last.avg) - y(last.you)) < 14 ? 14 : 0)
					}
					className="fill-muted-foreground text-[12px] tabular-nums"
				>
					{round(last.avg)}
				</text>
				{points.map((p, i) => (
					<text
						key={p.week}
						x={x(i)}
						y={H - 6}
						textAnchor="middle"
						className="fill-muted-foreground text-[11px]"
					>
						{points.length > 10 && i % 2 && i !== points.length - 1
							? ""
							: p.week}
					</text>
				))}
				{points.map((p, i) => (
					// Wide hit areas, one per week.
					<rect
						key={p.week}
						x={x(i) - step / 2}
						y={0}
						width={step}
						height={H}
						fill="transparent"
						onPointerEnter={() => setHover(i)}
						onPointerDown={() => setHover(i)}
					/>
				))}
			</svg>
		</div>
	);
}

/**
 * Two players side by side: their record on the games they split on, who
 * won more weeks, and the season numbers. Defaults to you.
 */
export function HeadToHead({
	leagueId,
	userId,
}: {
	leagueId: string;
	userId: string;
}) {
	const { data: week } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const { data: standings } = useQuery(standingsQuery(leagueId));
	const others = week.members.filter((m) => m.user_id !== userId);
	const [picked, setPicked] = useState<string | null>(null);
	const otherId =
		picked && others.some((m) => m.user_id === picked)
			? picked
			: userId !== week.userId
				? week.userId
				: (others[0]?.user_id ?? null);
	const player = week.members.find((m) => m.user_id === userId);
	const other = week.members.find((m) => m.user_id === otherId);
	const { mode } = week.league;
	const { pushValue } = week.league.settings;

	const data = useMemo(() => {
		if (!standings || !otherId) return null;
		const ids = week.members.map((m) => m.user_id);
		const settings = { mode, pushValue };
		const { picks, games, weeks } = standings;
		return {
			h2h: headToHead(userId, otherId, picks, games, weeks, settings),
			a: profileSummary(userId, ids, picks, games, weeks, settings),
			b: profileSummary(otherId, ids, picks, games, weeks, settings),
		};
	}, [standings, otherId, userId, week.members, mode, pushValue]);

	if (!others.length || !player) return null;
	const name = (id: string, n: string) => (id === week.userId ? "You" : n);
	const aName = name(userId, player.display_name);
	const bName = other ? name(other.user_id, other.display_name) : "";
	const pct = (r: { w: number; l: number; p: number }) => {
		const p = winPct(r);
		return p == null ? "—" : `${Math.round(p * 100)}%`;
	};

	const rows: [string, string, string, number][] = data
		? [
				// Last value: who's better, 1 for the left, -1 for the right.
				[
					"Place",
					ordinal(data.a.place),
					ordinal(data.b.place),
					Math.sign(data.b.place - data.a.place),
				],
				[
					"Points",
					String(round(data.a.points)),
					String(round(data.b.points)),
					Math.sign(data.a.points - data.b.points),
				],
				[
					mode === "spread" ? "Covered" : "Right",
					pct(data.a.record),
					pct(data.b.record),
					Math.sign(
						(winPct(data.a.record) ?? 0) - (winPct(data.b.record) ?? 0),
					),
				],
				[
					"Weeks won",
					String(data.a.weeksWon),
					String(data.b.weeksWon),
					Math.sign(data.a.weeksWon - data.b.weeksWon),
				],
				[
					"Locks",
					formatRecord(data.a.locks),
					formatRecord(data.b.locks),
					Math.sign(
						data.a.locks.w - data.a.locks.l - (data.b.locks.w - data.b.locks.l),
					),
				],
				[
					"Best streak",
					String(data.a.longestStreak),
					String(data.b.longestStreak),
					Math.sign(data.a.longestStreak - data.b.longestStreak),
				],
			]
		: [];

	return (
		<div className="rounded-xl border bg-card p-3 sm:p-4">
			{others.length > 1 && (
				<div
					role="group"
					aria-label="Compare with"
					className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4"
				>
					{others.map((m) => (
						<button
							key={m.user_id}
							type="button"
							aria-pressed={m.user_id === otherId}
							onClick={() => setPicked(m.user_id)}
							className={cn(
								"flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-3 pl-0.5 text-xs font-semibold transition-colors",
								m.user_id === otherId
									? "border-primary bg-primary/10 text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<Avatar profile={m} size={26} />
							{name(m.user_id, m.display_name)}
						</button>
					))}
				</div>
			)}
			{!data || !other ? (
				<div className="h-48 animate-pulse rounded-lg bg-muted/60" />
			) : (
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={otherId}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.15 }}
					>
						<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
							<div className="flex min-w-0 flex-col items-center gap-1 text-center">
								<Avatar profile={player} size={44} />
								<span className="max-w-full truncate text-sm font-semibold">
									{aName}
								</span>
							</div>
							<div className="text-center">
								{data.h2h.games ? (
									<>
										<div className="font-display text-3xl font-bold tabular-nums">
											<span
												className={cn(
													data.h2h.a.w < data.h2h.b.w &&
														"text-muted-foreground",
												)}
											>
												{data.h2h.a.w}
											</span>
											<span className="px-1.5 text-muted-foreground">–</span>
											<span
												className={cn(
													data.h2h.b.w < data.h2h.a.w &&
														"text-muted-foreground",
												)}
											>
												{data.h2h.b.w}
											</span>
										</div>
										<div className="text-[11px] text-muted-foreground">
											when they split on a game
										</div>
									</>
								) : (
									<div className="max-w-32 text-xs text-muted-foreground">
										No split picks yet
									</div>
								)}
							</div>
							<div className="flex min-w-0 flex-col items-center gap-1 text-center">
								<Avatar profile={other} size={44} />
								<span className="max-w-full truncate text-sm font-semibold">
									{bName}
								</span>
							</div>
						</div>
						{data.h2h.weeks.a + data.h2h.weeks.b + data.h2h.weeks.tied > 0 && (
							<p className="mt-2 text-center text-xs text-muted-foreground">
								Weeks with more points: {aName} {data.h2h.weeks.a}, {bName}{" "}
								{data.h2h.weeks.b}
								{data.h2h.weeks.tied ? `, ${data.h2h.weeks.tied} tied` : ""}
							</p>
						)}
						<div className="mt-3 divide-y border-t text-sm">
							{rows.map(([label, a, b, better]) => (
								<div
									key={label}
									className="grid grid-cols-[1fr_auto_1fr] items-center py-1.5"
								>
									<span
										className={cn(
											"text-center tabular-nums",
											better > 0 ? "font-semibold" : "text-muted-foreground",
										)}
									>
										{a}
									</span>
									<span className="w-24 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										{label}
									</span>
									<span
										className={cn(
											"text-center tabular-nums",
											better < 0 ? "font-semibold" : "text-muted-foreground",
										)}
									>
										{b}
									</span>
								</div>
							))}
						</div>
					</motion.div>
				</AnimatePresence>
			)}
		</div>
	);
}
