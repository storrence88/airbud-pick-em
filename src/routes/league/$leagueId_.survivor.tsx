import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, Check, Crown, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Avatar } from "#/components/Avatar";
import { useOnline } from "#/components/ConnectionBanner";
import { teamLogo } from "#/lib/nfl/teams";
import type { Game, Team } from "#/lib/nfl/types";
import {
	type PlayerStatus,
	pickResult,
	SURVIVOR_LAST_WEEK,
	usedTeams,
	type WeekResult,
} from "#/lib/survivor";
import { cn } from "#/lib/utils";
import {
	type getSurvivor,
	type SurvivorEntrant,
	saveSurvivorPick,
	survivorQuery,
} from "#/server/survivor";

export const Route = createFileRoute("/league/$leagueId_/survivor")({
	beforeLoad: ({ context, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
	},
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(survivorQuery(params.leagueId)),
	component: SurvivorPage,
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-3xl px-4 py-16 text-muted-foreground">
			{(error as Error).message}
		</main>
	),
});

type Data = Awaited<ReturnType<typeof getSurvivor>>;

function SurvivorPage() {
	const { leagueId } = Route.useParams();
	const { data } = useSuspenseQuery(survivorQuery(leagueId));
	const { league, pool, state } = data;

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
			<h1 className="mt-2 font-display text-3xl font-bold uppercase sm:text-4xl">
				Survivor
			</h1>
			<p className="mt-1 text-sm text-muted-foreground">
				Pick one team to win each week, and use each team only once. A loss, a
				tie or a missed week and you're out. If everyone left goes out the same
				week, they all stay in.
			</p>
			{!pool || !state ? (
				<div className="mt-6 rounded-lg border bg-card px-4 py-3 text-muted-foreground">
					Survivor isn't on for this league yet.{" "}
					{data.isCommissioner ? (
						<Link
							to="/league/$leagueId/settings"
							params={{ leagueId }}
							className="font-semibold text-primary"
						>
							Turn it on in league settings.
						</Link>
					) : (
						"The commissioner can turn it on in league settings."
					)}
				</div>
			) : (
				<>
					<StatusCard data={data} />
					<WeekPick leagueId={leagueId} />
					<Board data={data} />
				</>
			)}
		</main>
	);
}

function StatusCard({ data }: { data: Data }) {
	const state = data.state;
	const pool = data.pool;
	if (!state || !pool) return null;
	const me = state.players.find((p) => p.userId === data.userId);
	const alive = state.players.filter((p) => p.alive).length;
	const names = new Map(data.members.map((m) => [m.user_id, m.display_name]));
	const won = state.winners.length > 0;
	const notStarted = data.currentWeek < pool.start_week;

	let headline: string;
	let detail: string;
	if (won) {
		const iWon = state.winners.includes(data.userId);
		headline = iWon
			? state.winners.length > 1
				? "You survived the season"
				: "You won survivor"
			: `${state.winners.map((w) => names.get(w) ?? "Player").join(" & ")} won`;
		detail =
			state.winners.length > 1
				? "Everyone still standing after week 18 shares the win."
				: "Last one standing.";
	} else if (notStarted) {
		headline = `Starts week ${pool.start_week}`;
		detail = `Everyone in the league is in. Picks open when week ${pool.start_week} is up.`;
	} else if (!me) {
		headline = "You're not in this pool";
		detail = "Only league members play.";
	} else if (me.alive) {
		headline = "You're alive";
		detail = `${alive} of ${state.players.length} still standing.`;
	} else {
		headline = `Out in week ${me.outWeek}`;
		detail = me.provisional
			? "Unless everyone still in goes out this week too, in which case you're all back."
			: `${outText(me.outReason)}. ${alive} of ${state.players.length} still standing.`;
	}

	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			className={cn(
				"mt-6 flex items-center gap-4 rounded-lg border p-4",
				won || me?.alive ? "bg-card" : "bg-card/40",
			)}
		>
			<span
				className={cn(
					"grid size-11 shrink-0 place-items-center rounded-full",
					won
						? "bg-amber-400/15 text-amber-600 dark:text-amber-400"
						: me?.alive || notStarted
							? "bg-win/15 text-win"
							: "bg-loss/15 text-loss",
				)}
			>
				{won ? (
					<Crown className="size-5" aria-hidden />
				) : (
					<span className="font-display text-lg font-bold tabular-nums">
						{alive}
					</span>
				)}
			</span>
			<div className="min-w-0">
				<div className="font-display text-xl font-semibold uppercase">
					{headline}
				</div>
				<p className="text-sm text-muted-foreground">{detail}</p>
			</div>
		</motion.section>
	);
}

function outText(reason: PlayerStatus["outReason"]) {
	return reason === "tie" ? "Tied" : reason === "missed" ? "No pick" : "Lost";
}

function WeekPick({ leagueId }: { leagueId: string }) {
	const qc = useQueryClient();
	const query = survivorQuery(leagueId);
	const { data } = useSuspenseQuery(query);
	const [error, setError] = useState("");
	const online = useOnline();
	const { pool, state, userId } = data;
	const games = data.games as Game[];
	const week = data.currentWeek;

	const used = useMemo(
		() => usedTeams(data.picks, userId),
		[data.picks, userId],
	);
	const mine = data.picks.find((p) => p.user_id === userId && p.week === week);

	const pick = useMutation({
		mutationFn: (vars: { gameId: string; team: string }) =>
			saveSurvivorPick({ data: { leagueId, ...vars } }),
		onMutate: async (vars) => {
			setError("");
			await qc.cancelQueries({ queryKey: query.queryKey });
			const prev = qc.getQueryData(query.queryKey);
			qc.setQueryData(query.queryKey, (old) =>
				old
					? {
							...old,
							picks: [
								...old.picks.filter(
									(p) => !(p.user_id === userId && p.week === week),
								),
								{
									user_id: userId,
									week,
									team: vars.team,
									game_id: vars.gameId,
									game: null,
								},
							],
						}
					: old,
			);
			return { prev };
		},
		onError: (err, _vars, ctx) => {
			setError((err as Error).message);
			if (ctx?.prev) qc.setQueryData(query.queryKey, ctx.prev);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: query.queryKey }),
	});

	if (!pool || !state || state.winners.length) return null;
	if (week < pool.start_week || week > SURVIVOR_LAST_WEEK || !games.length)
		return null;
	const me = state.players.find((p) => p.userId === userId);
	if (!me?.alive) return null;

	const pickedGame = mine && games.find((g) => g.id === mine.game_id);
	const lockedIn = !!pickedGame && pickedGame.state !== "pre";
	const allStarted = games.every((g) => g.state !== "pre");

	return (
		<section className="mt-8">
			<div className="flex items-end justify-between gap-3">
				<h2 className="font-display text-2xl font-semibold uppercase">
					Week {week} pick
				</h2>
				<span className="text-sm text-muted-foreground">
					{lockedIn ? (
						<span className="inline-flex items-center gap-1.5">
							<Lock className="size-3.5" aria-hidden /> Locked in
						</span>
					) : mine ? (
						"You can switch until kickoff"
					) : allStarted ? (
						"Every game has started"
					) : (
						"Pick before kickoff"
					)}
				</span>
			</div>
			{error && <p className="mt-3 text-sm text-loss">{error}</p>}
			<div
				inert={!online}
				className={cn(
					"mt-4 grid gap-2 transition-opacity sm:grid-cols-2",
					!online && "opacity-60",
				)}
			>
				{games.map((g) => (
					<div
						key={g.id}
						className={cn(
							"grid grid-cols-2 gap-1.5 rounded-lg border p-1.5",
							g.state !== "pre"
								? "bg-card/40 bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklab,var(--foreground)_7%,transparent)_9px_11px)]"
								: "bg-card",
						)}
					>
						{[g.away, g.home].map((team) => {
							const usedWeek = used.get(team.abbr);
							const usedElsewhere = usedWeek != null && usedWeek !== week;
							return (
								<TeamChoice
									key={team.abbr}
									team={team}
									selected={mine?.team === team.abbr}
									note={
										usedElsewhere
											? `Used wk ${usedWeek}`
											: g.state !== "pre"
												? "Started"
												: null
									}
									disabled={lockedIn || g.state !== "pre" || usedElsewhere}
									onClick={() => pick.mutate({ gameId: g.id, team: team.abbr })}
								/>
							);
						})}
					</div>
				))}
			</div>
		</section>
	);
}

function TeamChoice({
	team,
	selected,
	note,
	disabled,
	onClick,
}: {
	team: Team;
	selected: boolean;
	note: string | null;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			disabled={disabled}
			whileTap={disabled ? undefined : { scale: 0.96 }}
			aria-pressed={selected}
			className={cn(
				"relative flex min-h-14 items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-2 text-left transition-colors",
				selected ? "text-white" : !disabled && "hover:bg-muted",
				disabled && !selected && "cursor-default opacity-45 saturate-[.35]",
				disabled && "cursor-default",
			)}
		>
			<AnimatePresence>
				{selected && (
					<motion.span
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ type: "spring", stiffness: 300, damping: 24 }}
						className="absolute inset-0"
						style={{
							background: `linear-gradient(135deg, ${team.color}, color-mix(in oklab, ${team.color} 60%, black))`,
						}}
					/>
				)}
			</AnimatePresence>
			{team.logo && (
				<img src={team.logo} alt="" className="relative size-8 drop-shadow" />
			)}
			<span className="relative min-w-0 flex-1">
				<span className="block truncate font-display text-base font-semibold leading-tight">
					{team.shortName}
				</span>
				{note && (
					<span className="block text-[11px] text-muted-foreground">
						{note}
					</span>
				)}
			</span>
			{selected && (
				<Check
					className="relative size-4 shrink-0"
					strokeWidth={3}
					aria-hidden
				/>
			)}
		</motion.button>
	);
}

const RESULT_STYLE: Record<WeekResult, string> = {
	win: "border-win/50 bg-win/10",
	loss: "border-loss/60 bg-loss/10",
	tie: "border-loss/60 bg-loss/10",
	missed: "border-loss/60 border-dashed",
	pending: "border-border bg-muted/40",
};

function Board({ data }: { data: Data }) {
	const { state, pool } = data;
	const byKey = useMemo(
		() => new Map(data.picks.map((p) => [`${p.user_id}:${p.week}`, p])),
		[data.picks],
	);
	if (!state || !pool) return null;
	const lastWeek = Math.min(data.currentWeek, SURVIVOR_LAST_WEEK);
	const weeks: number[] = [];
	for (let w = pool.start_week; w <= lastWeek; w++) weeks.push(w);
	if (!weeks.length) return null;

	const profiles = new Map(data.members.map((m) => [m.user_id, m]));
	const rows = [...state.players].sort(
		(a, b) =>
			Number(b.alive) - Number(a.alive) ||
			(b.outWeek ?? 0) - (a.outWeek ?? 0) ||
			(profiles.get(a.userId)?.display_name ?? "").localeCompare(
				profiles.get(b.userId)?.display_name ?? "",
			),
	);

	return (
		<section className="mt-10">
			<h2 className="font-display text-2xl font-semibold uppercase">Board</h2>
			{state.reprieves.length > 0 && (
				<p className="mt-1 text-sm text-muted-foreground">
					Everyone left went out in week {state.reprieves.join(", ")}, so they
					all stayed in.
				</p>
			)}
			<div className="mt-4 overflow-x-auto rounded-lg border bg-card">
				<table className="w-full border-separate border-spacing-0 text-sm">
					<thead>
						<tr className="text-xs uppercase tracking-wider text-muted-foreground">
							<th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold">
								Player
							</th>
							{weeks.map((w) => (
								<th key={w} className="px-1 py-2 font-semibold tabular-nums">
									{w}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((p) => {
							const profile = profiles.get(p.userId);
							if (!profile) return null;
							return (
								<tr
									key={p.userId}
									className={cn(!p.alive && "text-muted-foreground")}
								>
									<td className="sticky left-0 z-10 border-t bg-card px-3 py-2">
										<PlayerCell
											profile={profile}
											alive={p.alive}
											winner={state.winners.includes(p.userId)}
										/>
									</td>
									{weeks.map((w) => (
										<td key={w} className="border-t px-1 py-2 text-center">
											<Cell
												result={p.weeks[w]}
												team={byKey.get(`${p.userId}:${w}`)?.team}
											/>
										</td>
									))}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				Friends' picks show once their game kicks off.
			</p>
			<FormerMembers data={data} weeks={weeks} />
		</section>
	);
}

function PlayerCell({
	profile,
	alive,
	winner,
}: {
	profile: SurvivorEntrant;
	alive: boolean;
	winner: boolean;
}) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			<Avatar
				profile={profile}
				size={24}
				className={cn(!alive && "opacity-60 grayscale")}
			/>
			<span
				className={cn(
					"max-w-28 truncate font-semibold sm:max-w-40",
					!alive && "line-through decoration-muted-foreground/50",
				)}
			>
				{profile.display_name}
			</span>
			{winner && (
				<Crown
					className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
					aria-label="Winner"
				/>
			)}
		</span>
	);
}

/** One week on the board: the team picked, framed by how it went. */
function Cell({ result, team }: { result?: WeekResult; team?: string }) {
	if (!result) return <span className="text-muted-foreground/40">·</span>;
	if (result === "missed")
		return (
			<span
				className={cn(
					"mx-auto grid h-8 w-11 place-items-center rounded-md border text-[10px] font-semibold uppercase text-loss",
					RESULT_STYLE.missed,
				)}
				title="No pick"
			>
				None
			</span>
		);
	if (!team)
		return (
			<span
				className="mx-auto grid h-8 w-11 place-items-center rounded-md border border-dashed text-muted-foreground"
				title="Hidden until kickoff"
			>
				<Lock className="size-3" aria-hidden />
				<span className="sr-only">Hidden until kickoff</span>
			</span>
		);
	return (
		<span
			className={cn(
				"mx-auto flex h-8 w-11 items-center justify-center rounded-md border",
				RESULT_STYLE[result],
			)}
			title={`${team} · ${result === "pending" ? "in play" : result}`}
		>
			<img src={teamLogo(team)} alt={team} className="size-6" />
		</span>
	);
}

function FormerMembers({ data, weeks }: { data: Data; weeks: number[] }) {
	if (!data.formers.length) return null;
	return (
		<div className="mt-6">
			<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Former members
			</h3>
			<ul className="grid gap-1.5">
				{data.formers.map((f) => {
					const theirs = data.picks.filter(
						(p) => p.user_id === f.user_id && weeks.includes(p.week),
					);
					const wins = theirs.filter(
						(p) => pickResult(p.team, p.game) === "win",
					).length;
					return (
						<li
							key={f.user_id}
							className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-muted-foreground sm:px-4"
						>
							<Avatar profile={f} size={28} className="opacity-60 grayscale" />
							<span className="min-w-0 flex-1 truncate">{f.display_name}</span>
							<span className="text-sm tabular-nums">
								{wins} {wins === 1 ? "win" : "wins"}
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
