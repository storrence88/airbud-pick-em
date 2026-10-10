import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check, Copy, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BotAccess } from "#/components/BotAccess";
import { ConfidenceBoard } from "#/components/ConfidenceBoard";
import { GameCard, PublicPicksNote } from "#/components/GameCard";
import type { EffectKind } from "#/components/PickEffect";
import { Standings } from "#/components/Standings";
import {
	type ConfidenceChange,
	forfeited,
	nextFreeValue,
	type RankedPick,
	settle,
} from "#/lib/confidence";
import type { Game } from "#/lib/nfl/types";
import { pickOutcome, SCORING_MODES, type ScoringMode } from "#/lib/scoring";
import { cn } from "#/lib/utils";
import {
	leagueWeekQuery,
	type PickRow,
	savePick,
	setConfidence,
	setLock,
} from "#/server/leagues";
import { myProfileQuery } from "#/server/profile";

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
	const isCommissioner = data.members.some(
		(m) => m.user_id === data.userId && m.role === "commissioner",
	);

	return (
		<main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
			<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
				<div className="min-w-0">
					<div className="text-xs font-semibold uppercase tracking-wider text-primary">
						{SCORING_MODES[league.mode].label}
					</div>
					<h1 className="font-display text-3xl font-bold uppercase break-words sm:text-4xl">
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
							"relative h-9 rounded-full px-5 capitalize transition-colors",
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
			{isCommissioner && <BotAccess leagueId={leagueId} />}
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
			className="flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors hover:bg-muted"
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
	const [view, setView] = useState<"pick" | "rank">("pick");

	const updatePicks = (fn: (picks: PickRow[]) => PickRow[]) =>
		qc.setQueryData(query.queryKey, (old) =>
			old ? { ...old, picks: fn(old.picks) } : old,
		);

	const pick = useMutation({
		// confidence here is only the optimistic guess; the server assigns the real one.
		mutationFn: (vars: {
			gameId: string;
			team: string;
			confidence: number | null;
		}) =>
			savePick({
				data: { leagueId, gameId: vars.gameId, team: vars.team },
			}),
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
					is_lock: mine.get(vars.gameId)?.is_lock ?? false,
				},
			]);
			return { prev };
		},
		onSuccess: (value, vars) => {
			if (value !== vars.confidence)
				updatePicks((picks) =>
					picks.map((p) =>
						p.user_id === userId && p.game_id === vars.gameId
							? { ...p, confidence: value }
							: p,
					),
				);
		},
		onError: (err, _vars, ctx) => {
			setError((err as Error).message);
			if (ctx?.prev) qc.setQueryData(query.queryKey, ctx.prev);
		},
	});

	const confidence = useMutation({
		mutationFn: (values: ConfidenceChange[]) =>
			setConfidence({ data: { leagueId, values } }),
		onMutate: (values) => {
			setError("");
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

	const lock = useMutation({
		mutationFn: (vars: { gameId: string; on: boolean }) =>
			setLock({ data: { leagueId, ...vars } }),
		onMutate: async (vars) => {
			setError("");
			await qc.cancelQueries({ queryKey: query.queryKey });
			// One lock a week: turning one on moves it off the others.
			updatePicks((picks) =>
				picks.map((p) =>
					p.user_id !== userId
						? p
						: p.game_id === vars.gameId
							? { ...p, is_lock: vars.on }
							: vars.on
								? { ...p, is_lock: false }
								: p,
				),
			);
		},
		// Refetch rather than restore a snapshot, which could undo a pick made meanwhile.
		onError: (err) => setError((err as Error).message),
		onSettled: () => qc.invalidateQueries({ queryKey: query.queryKey }),
	});
	// Your lock can't move once its game kicks off.
	const lockInPlay = games.some(
		(g) => g.state !== "pre" && mine.get(g.id)?.is_lock,
	);

	const effects = useResultEffects(leagueId, games, mine, league.mode);

	// Games that kicked off without a pick: they score 0 and don't count against you.
	const missed = games.filter((g) => g.state !== "pre" && !mine.has(g.id));
	const ranked: RankedPick[] = useMemo(
		() =>
			games.flatMap((g) => {
				const p = mine.get(g.id);
				return p
					? [
							{
								gameId: g.id,
								confidence: p.confidence,
								locked: g.state !== "pre",
							},
						]
					: [];
			}),
		[games, mine],
	);

	function choose(g: WeekGame, team: string) {
		let value = mine.get(g.id)?.confidence ?? null;
		if (isConfidence && value == null)
			value = nextFreeValue(
				[
					...ranked.map((p) => p.confidence),
					...forfeited(ranked, games.length, missed.length),
				],
				games.length,
			);
		pick.mutate({ gameId: g.id, team, confidence: value });
	}

	// Untangle picks that share a value (saved before values were unique), and
	// once a game is missed, slide the open picks up so the top value is usable.
	// Each set of fixes is sent once, so a rejected one isn't retried forever.
	const settled = useRef("");
	useEffect(() => {
		if (!isConfidence || confidence.isPending) return;
		const changes = settle(ranked, games.length, missed.length);
		const key = JSON.stringify(changes);
		if (!changes.length || key === settled.current) return;
		settled.current = key;
		confidence.mutate(changes);
	}, [isConfidence, ranked, games.length, missed.length, confidence]);

	const made = games.filter((g) => mine.has(g.id)).length;
	const pickable = games.length - missed.length;

	// On phones the two views swap in place; jump back to the top of the list
	// so a switch from deep in the games doesn't land mid-board.
	const viewsTop = useRef<HTMLDivElement>(null);
	function switchView(v: "pick" | "rank") {
		setView(v);
		const el = viewsTop.current;
		if (el && el.getBoundingClientRect().top < 0)
			el.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	return (
		<section className="mt-6">
			<div className="flex items-end justify-between">
				<h2 className="font-display text-2xl font-semibold uppercase">
					Week {games[0]?.week}
				</h2>
				<div className="flex items-baseline gap-2">
					{missed.length > 0 && (
						<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{missed.length} missed
						</span>
					)}
					<span className="font-display text-2xl font-bold tabular-nums">
						{made}
						<span className="text-muted-foreground">/{pickable}</span>
					</span>
				</div>
			</div>
			<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
				<motion.div
					className="h-full rounded-full bg-primary"
					animate={{
						width: `${pickable ? (made / pickable) * 100 : 0}%`,
					}}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
			</div>
			{error && <p className="mt-3 text-sm text-loss">{error}</p>}
			{isConfidence && (
				<div className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-20 mt-6 grid grid-cols-2 rounded-full border bg-card/90 p-1 text-sm font-semibold shadow-lg backdrop-blur-xl lg:hidden">
					{(
						[
							["pick", "Pick winners"],
							["rank", "Rank confidence"],
						] as const
					).map(([v, label]) => (
						<button
							key={v}
							type="button"
							onClick={() => switchView(v)}
							className={cn(
								"relative h-10 rounded-full transition-colors",
								view === v
									? "text-primary-foreground"
									: "text-muted-foreground",
							)}
						>
							{view === v && (
								<motion.span
									layoutId="confidence-view"
									className="absolute inset-0 rounded-full bg-primary"
									transition={{ type: "spring", stiffness: 400, damping: 32 }}
								/>
							)}
							<span className="relative">{label}</span>
						</button>
					))}
				</div>
			)}
			<div
				ref={viewsTop}
				className={cn(
					"scroll-mt-32",
					isConfidence &&
						"lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6",
				)}
			>
				<div
					className={cn(
						"mt-6 grid gap-3 sm:gap-4 md:grid-cols-2",
						isConfidence && "lg:grid-cols-1",
						isConfidence && view === "rank" && "hidden lg:grid",
					)}
				>
					{games.map((g) => {
						const myPick = mine.get(g.id);
						const locked = g.state !== "pre";
						const others: Record<string, string[]> = {};
						if (locked) {
							for (const p of data.picks) {
								if (p.game_id !== g.id || p.user_id === userId) continue;
								const name = names.get(p.user_id) ?? "Player";
								others[p.team] = [
									...(others[p.team] ?? []),
									p.is_lock ? `${name} ★` : name,
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
								lock={
									myPick && (!lockInPlay || myPick.is_lock)
										? {
												on: myPick.is_lock,
												onToggle: () =>
													lock.mutate({ gameId: g.id, on: !myPick.is_lock }),
											}
										: null
								}
								effect={effects.playing[g.id]}
								onEffectDone={() => effects.done(g.id)}
								footer={
									isConfidence && (
										<ConfidenceFooter
											value={myPick?.confidence ?? null}
											picked={!!myPick}
											locked={locked}
											onRank={() => switchView("rank")}
										/>
									)
								}
							/>
						);
					})}
				</div>
				{isConfidence && (
					<ConfidenceBoard
						games={games}
						picks={mine}
						missed={missed.length}
						onRerank={(changes) => confidence.mutate(changes)}
						className={cn(
							"mt-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto",
							view === "pick" && "hidden lg:block",
						)}
					/>
				)}
			</div>
			<PublicPicksNote games={games} />
		</section>
	);
}

function ConfidenceFooter({
	value,
	picked,
	locked,
	onRank,
}: {
	value: number | null;
	picked: boolean;
	locked: boolean;
	onRank: () => void;
}) {
	return (
		<div className="flex items-center justify-between border-t px-4 py-2 text-sm">
			<span className="flex items-center gap-1.5 text-muted-foreground">
				{locked && <Lock className="size-3.5" aria-hidden />}
				{locked
					? picked
						? "Confidence locked in"
						: "Missed · scores 0"
					: picked
						? "Confidence · drag to rerank"
						: "Pick a winner to rank it"}
			</span>
			<span className="flex items-center gap-2">
				{picked && !locked && (
					<button
						type="button"
						onClick={onRank}
						className="-my-1 rounded-full px-3 py-2 text-xs font-semibold text-primary active:bg-muted lg:hidden"
					>
						Rank
					</button>
				)}
				<span className="relative grid h-8 min-w-10 place-items-center overflow-hidden rounded-md bg-muted px-2 font-display text-lg font-semibold tabular-nums">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={value ?? "none"}
							initial={{ y: 16, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: -16, opacity: 0 }}
							transition={{ type: "spring", stiffness: 500, damping: 36 }}
						>
							{value ?? "–"}
						</motion.span>
					</AnimatePresence>
				</span>
			</span>
		</div>
	);
}

/**
 * Plays your chosen win or loss effect when one of your picks goes final,
 * once per game on this device. The first visit only remembers what's
 * already final, so opening a league doesn't replay the whole season.
 */
function useResultEffects(
	leagueId: string,
	games: WeekGame[],
	mine: Map<string, PickRow>,
	mode: ScoringMode,
) {
	const { data: me } = useQuery(myProfileQuery());
	const [playing, setPlaying] = useState<Record<string, EffectKind>>({});
	useEffect(() => {
		if (!me) return;
		const key = `pickem:results:${leagueId}`;
		let seen: string[] | null = null;
		try {
			seen = JSON.parse(localStorage.getItem(key) ?? "null");
		} catch {}
		const finals = games.filter((g) => g.state === "post" && mine.has(g.id));
		const fresh = seen ? finals.filter((g) => !seen.includes(g.id)) : [];
		if (seen && !fresh.length) return;
		try {
			localStorage.setItem(
				key,
				JSON.stringify(
					[...(seen ?? []), ...(seen ? fresh : finals).map((g) => g.id)].slice(
						-400,
					),
				),
			);
		} catch {}
		const next: Record<string, EffectKind> = {};
		for (const g of fresh) {
			const pick = mine.get(g.id);
			if (!pick) continue;
			const outcome = pickOutcome(
				{ gameId: g.id, team: pick.team },
				{
					id: g.id,
					homeTeam: g.home.abbr,
					awayTeam: g.away.abbr,
					homeScore: g.homeScore,
					awayScore: g.awayScore,
					final: true,
					lockedSpread: g.lockedSpread,
				},
				mode,
			);
			const kind =
				outcome === "win"
					? me.profile.win_effect
					: outcome === "loss"
						? me.profile.loss_effect
						: "none";
			if (kind !== "none") next[g.id] = kind;
		}
		if (Object.keys(next).length) setPlaying((p) => ({ ...p, ...next }));
	}, [leagueId, games, mine, mode, me]);
	return {
		playing,
		done: (gameId: string) => setPlaying(({ [gameId]: _, ...rest }) => rest),
	};
}
