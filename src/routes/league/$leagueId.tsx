import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { GameCard } from "#/components/GameCard";
import type { Game } from "#/lib/nfl/types";
import { SCORING_MODES } from "#/lib/scoring";
import { computeStandings } from "#/lib/standings";
import { cn } from "#/lib/utils";
import {
	leagueWeekQuery,
	type PickRow,
	savePick,
	setConfidence,
	standingsQuery,
} from "#/server/leagues";

export const Route = createFileRoute("/league/$leagueId")({
	beforeLoad: ({ context, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
	},
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(leagueWeekQuery(params.leagueId)),
	component: LeaguePage,
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-3xl px-4 py-16 text-muted-foreground">
			{(error as Error).message}
		</main>
	),
});

type WeekGame = Game & { lockedSpread: number | null };

/** "KC -3.5" style text from the home team's line. */
function lineText(g: WeekGame) {
	const s = g.lockedSpread ?? g.spread;
	if (s == null) return null;
	if (s === 0) return "EVEN";
	return s < 0 ? `${g.home.abbr} ${s}` : `${g.away.abbr} -${s}`;
}

function LeaguePage() {
	const { leagueId } = Route.useParams();
	const [tab, setTab] = useState<"picks" | "standings">("picks");
	const { data } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const { league } = data;

	return (
		<main className="mx-auto max-w-5xl px-4 py-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-primary">
						{SCORING_MODES[league.mode].label}
					</div>
					<h1 className="font-display text-4xl font-bold uppercase">
						{league.name}
					</h1>
				</div>
				<InviteButton code={league.invite_code} />
			</div>
			<div className="relative mt-6 inline-flex rounded-full border bg-card p-1 text-sm font-semibold">
				{(["picks", "standings"] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => setTab(t)}
						className={cn(
							"relative rounded-full px-4 py-1.5 capitalize transition-colors",
							tab === t ? "text-primary-foreground" : "text-muted-foreground",
						)}
					>
						{tab === t && (
							<motion.span
								layoutId="tab"
								className="absolute inset-0 rounded-full bg-primary"
								transition={{ type: "spring", stiffness: 400, damping: 32 }}
							/>
						)}
						<span className="relative">{t}</span>
					</button>
				))}
			</div>
			<AnimatePresence mode="wait">
				<motion.div
					key={tab}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.15 }}
				>
					{tab === "picks" ? (
						<WeekPicks leagueId={leagueId} />
					) : (
						<Standings leagueId={leagueId} />
					)}
				</motion.div>
			</AnimatePresence>
		</main>
	);
}

function InviteButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				await navigator.clipboard.writeText(
					`${window.location.origin}/join/${code}`,
				);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
			className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
		>
			{copied ? (
				<Check className="size-4 text-primary" />
			) : (
				<Copy className="size-4" />
			)}
			{copied ? "Link copied" : `Invite · ${code}`}
		</button>
	);
}

function WeekPicks({ leagueId }: { leagueId: string }) {
	const qc = useQueryClient();
	const query = leagueWeekQuery(leagueId);
	const { data } = useSuspenseQuery(query);
	const { league, userId, members } = data;
	const games = data.games as WeekGame[];
	const [error, setError] = useState("");

	const mine = useMemo(
		() =>
			new Map(
				data.picks
					.filter((p) => p.user_id === userId)
					.map((p) => [p.game_id, p]),
			),
		[data.picks, userId],
	);
	const names = useMemo(
		() => new Map(members.map((m) => [m.user_id, m.display_name])),
		[members],
	);
	const isConfidence = league.mode === "confidence";
	const lockedValues = new Set(
		games
			.filter((g) => g.state !== "pre")
			.map((g) => mine.get(g.id)?.confidence)
			.filter((v) => v != null),
	);

	const updatePicks = (fn: (picks: PickRow[]) => PickRow[]) =>
		qc.setQueryData(query.queryKey, (old) =>
			old ? { ...old, picks: fn(old.picks) } : old,
		);

	const pick = useMutation({
		mutationFn: (vars: {
			gameId: string;
			team: string;
			confidence: number | null;
		}) => savePick({ data: { leagueId, ...vars } }),
		onMutate: async (vars) => {
			setError("");
			await qc.cancelQueries({ queryKey: query.queryKey });
			const prev = qc.getQueryData(query.queryKey);
			updatePicks((picks) => [
				...picks.filter(
					(p) => !(p.user_id === userId && p.game_id === vars.gameId),
				),
				{
					user_id: userId,
					game_id: vars.gameId,
					team: vars.team,
					confidence: vars.confidence,
				},
			]);
			return { prev };
		},
		onError: (err, _vars, ctx) => {
			setError((err as Error).message);
			if (ctx?.prev) qc.setQueryData(query.queryKey, ctx.prev);
		},
	});

	const confidence = useMutation({
		mutationFn: (values: { gameId: string; confidence: number }[]) =>
			setConfidence({ data: { leagueId, values } }),
		onMutate: (values) => {
			const byGame = new Map(values.map((v) => [v.gameId, v.confidence]));
			updatePicks((picks) =>
				picks.map((p) =>
					p.user_id === userId && byGame.has(p.game_id)
						? { ...p, confidence: byGame.get(p.game_id) ?? null }
						: p,
				),
			);
		},
		onError: (err) => {
			setError((err as Error).message);
			qc.invalidateQueries({ queryKey: query.queryKey });
		},
	});

	function choose(g: WeekGame, team: string) {
		let value = mine.get(g.id)?.confidence ?? null;
		if (isConfidence && value == null) {
			const used = new Set([...mine.values()].map((p) => p.confidence));
			value =
				Array.from({ length: games.length }, (_, i) => i + 1).find(
					(v) => !used.has(v),
				) ?? null;
		}
		pick.mutate({ gameId: g.id, team, confidence: value });
	}

	/** Give this game the chosen value; whichever open game had it takes this game's old value. */
	function rank(g: WeekGame, value: number) {
		const current = mine.get(g.id)?.confidence ?? null;
		const other = [...mine.values()].find(
			(p) => p.confidence === value && p.game_id !== g.id,
		);
		const changes = [{ gameId: g.id, confidence: value }];
		if (other && current != null)
			changes.push({ gameId: other.game_id, confidence: current });
		confidence.mutate(changes);
	}

	const made = games.filter((g) => mine.has(g.id)).length;

	return (
		<section className="mt-6">
			<div className="flex items-end justify-between">
				<h2 className="font-display text-2xl font-semibold uppercase">
					Week {games[0]?.week}
				</h2>
				<div className="font-display text-2xl font-bold tabular-nums">
					{made}
					<span className="text-muted-foreground">/{games.length}</span>
				</div>
			</div>
			<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
				<motion.div
					className="h-full rounded-full bg-primary"
					animate={{
						width: `${games.length ? (made / games.length) * 100 : 0}%`,
					}}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
			</div>
			{error && <p className="mt-3 text-sm text-loss">{error}</p>}
			<div className="mt-6 grid gap-4 md:grid-cols-2">
				{games.map((g) => {
					const myPick = mine.get(g.id);
					const locked = g.state !== "pre";
					const others: Record<string, string[]> = {};
					if (locked) {
						for (const p of data.picks) {
							if (p.game_id !== g.id || p.user_id === userId) continue;
							others[p.team] = [
								...(others[p.team] ?? []),
								names.get(p.user_id) ?? "Player",
							];
						}
					}
					return (
						<GameCard
							key={g.id}
							game={g}
							picked={myPick?.team}
							onPick={(team) => choose(g, team)}
							lineText={league.mode === "spread" ? lineText(g) : g.spreadText}
							others={others}
							footer={
								isConfidence && (
									<label className="flex items-center justify-between border-t px-4 py-2 text-sm">
										<span className="text-muted-foreground">Confidence</span>
										<select
											value={myPick?.confidence ?? ""}
											disabled={!myPick || locked}
											onChange={(e) => rank(g, Number(e.target.value))}
											className="rounded-md border bg-background px-2 py-1 font-display text-lg font-semibold tabular-nums disabled:opacity-50"
										>
											{!myPick && <option value="">–</option>}
											{Array.from(
												{ length: games.length },
												(_, i) => games.length - i,
											)
												.filter(
													(v) =>
														!lockedValues.has(v) || v === myPick?.confidence,
												)
												.map((v) => (
													<option key={v} value={v}>
														{v}
													</option>
												))}
										</select>
									</label>
								)
							}
						/>
					);
				})}
			</div>
		</section>
	);
}

function Standings({ leagueId }: { leagueId: string }) {
	const { data: week } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const { data, isLoading } = useQuery(standingsQuery(leagueId));
	const rows = useMemo(
		() =>
			data
				? computeStandings(
						week.members.map((m) => m.user_id),
						data.picks,
						data.games,
						{
							mode: week.league.mode,
							pushValue: week.league.settings.pushValue,
						},
					)
				: [],
		[data, week],
	);
	const names = new Map(week.members.map((m) => [m.user_id, m.display_name]));
	const lastWeek =
		data?.games.reduce((max, g) => Math.max(max, g.week), 0) ?? 0;

	if (isLoading)
		return <p className="mt-6 text-muted-foreground">Loading standings…</p>;
	return (
		<section className="mt-6">
			{lastWeek === 0 && (
				<p className="mb-4 text-sm text-muted-foreground">
					No finished games yet. Standings fill in as games go final.
				</p>
			)}
			<ol className="grid gap-2">
				{rows.map((r, i) => (
					<motion.li
						key={r.userId}
						layout
						transition={{ type: "spring", stiffness: 300, damping: 30 }}
						className={cn(
							"flex items-center gap-4 rounded-lg border bg-card px-4 py-3",
							r.userId === week.userId && "border-primary",
						)}
					>
						<span className="w-6 font-display text-xl font-bold text-muted-foreground">
							{i + 1}
						</span>
						<span className="flex-1 font-semibold">{names.get(r.userId)}</span>
						{lastWeek > 0 && (
							<span className="text-sm text-muted-foreground">
								Wk {lastWeek}: {r.byWeek[lastWeek] ?? 0}
							</span>
						)}
						<span className="w-12 text-right font-display text-2xl font-bold tabular-nums">
							{r.total}
						</span>
					</motion.li>
				))}
			</ol>
		</section>
	);
}
