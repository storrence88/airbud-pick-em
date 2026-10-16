import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useRouteContext,
} from "@tanstack/react-router";
import { Crown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { AirBudFace, AirBudSays } from "#/components/AirBud";
import { Avatar } from "#/components/Avatar";
import { ConfidenceBoard } from "#/components/ConfidenceBoard";
import { GameCard } from "#/components/GameCard";
import type { EffectKind } from "#/components/PickEffect";
import { PickEffect } from "#/components/PickEffect";
import type { Picker } from "#/components/PickerAvatars";
import { Tiebreaker } from "#/components/Tiebreaker";
import type { ConfidenceChange } from "#/lib/confidence";
import { nextFreeValue } from "#/lib/confidence";
import type { Game } from "#/lib/nfl/types";
import { RELEASE, updateOnboarding } from "#/lib/onboarding";
import {
	clockText,
	friendPicks,
	keyGame,
	missGame,
	PRACTICE_TOTAL,
	PRACTICE_USER,
	practiceFinals,
	practiceGames,
	RIVAL_GUESS,
	scoreAt,
} from "#/lib/practice";
import type { PublicProfile } from "#/lib/profile";
import {
	pickOutcome,
	SCORING_MODES,
	type ScoringMode,
	scorePick,
} from "#/lib/scoring";
import { cn } from "#/lib/utils";
import { toResult, type WeekPick, weekResults } from "#/lib/week-results";
import { leagueWeekQuery } from "#/server/leagues";
import { myProfileQuery } from "#/server/profile";

const MODES = ["straight", "spread", "confidence"] as const;

/**
 * The practice week: a guided, made-up week for new players. Nothing here is
 * saved except that you've done it (on this device).
 */
export const Route = createFileRoute("/practice")({
	validateSearch: (
		search: Record<string, unknown>,
	): { league?: string; mode?: ScoringMode } => ({
		...(typeof search.league === "string" ? { league: search.league } : {}),
		...(MODES.includes(search.mode as ScoringMode)
			? { mode: search.mode as ScoringMode }
			: {}),
	}),
	head: () => ({ meta: [{ title: "Practice week · Pick'em" }] }),
	component: Practice,
});

type Step =
	| "intro"
	| "pick"
	| "rank"
	| "lock"
	| "tiebreaker"
	| "ready"
	| "live"
	| "results";

type Mine = Record<string, { team: string; confidence: number | null }>;

/** How long the sped-up game day runs. */
const LIVE_MS = 7000;
/** When each game kicks off and goes final, as a share of the game day. */
const SCHEDULE = [
	{ start: 0, end: 0.55 },
	{ start: 0.06, end: 0.75 },
	{ start: 0.12, end: 0.95 },
];

interface Friend {
	id: string;
	profile: Pick<
		PublicProfile,
		"display_name" | "avatar_url" | "avatar_kind" | "favorite_team"
	>;
}

const STAND_INS = ["Air Bud", "Buddy", "Coach"];

function Practice() {
	const { league, mode = "straight" } = Route.useSearch();
	const navigate = useNavigate();
	const { user } = useRouteContext({ from: "__root__" });
	const reduce = useReducedMotion();
	const { data: leagueData } = useQuery({
		...leagueWeekQuery(league ?? ""),
		enabled: !!league && !!user,
	});
	const { data: me } = useQuery({ ...myProfileQuery(), enabled: !!user });

	const steps: Step[] = [
		"intro",
		"pick",
		...(mode === "confidence" ? (["rank"] as const) : []),
		"lock",
		"tiebreaker",
		"ready",
		"live",
		"results",
	];
	const [step, setStep] = useState<Step>("intro");
	const next = () => setStep(steps[steps.indexOf(step) + 1] ?? "results");
	const [games] = useState(() => practiceGames());
	const [mine, setMine] = useState<Mine>({});
	const [lock, setLock] = useState<string | null>(null);
	const [guess, setGuess] = useState<number | null>(null);
	const [clock, setClock] = useState(0);
	const [effects, setEffects] = useState<Record<string, EffectKind>>({});
	const picked = Object.keys(mine).length;
	const mnf = games[games.length - 1];

	// Your league's real members play along when there are any.
	const friends: Friend[] = useMemo(() => {
		const real = (leagueData?.members ?? [])
			.filter((m) => m.user_id !== leagueData?.userId)
			.slice(0, 3)
			.map((m) => ({ id: m.user_id, profile: m }));
		const fill = STAND_INS.slice(0, 3 - real.length).map((name) => ({
			id: `practice-${name}`,
			profile: {
				display_name: name,
				avatar_url: name === "Air Bud" ? "/icons/icon-192.png" : null,
				avatar_kind:
					name === "Air Bud" ? ("photo" as const) : ("monogram" as const),
				favorite_team: null,
			},
		}));
		return [...fill.slice(0, 1), ...real, ...fill.slice(1)].slice(0, 3);
	}, [leagueData]);
	const rival = friends[0];

	const plan = useMemo(() => {
		if (picked < games.length) return null;
		const key = keyGame(games, mine, lock, mode);
		const miss = missGame(games, mine, key, mode);
		return {
			finals: practiceFinals(games, mine, miss),
			friends: friendPicks(games, mine, key, miss, [
				friends[0].id,
				friends[1].id,
				friends[2].id,
			]),
		};
	}, [games, mine, lock, mode, picked, friends]);

	// The sped-up game day.
	useEffect(() => {
		if (step !== "live") return;
		if (reduce) {
			setClock(1);
			return;
		}
		const start = performance.now();
		const id = setInterval(() => {
			const t = Math.min(1, (performance.now() - start) / LIVE_MS);
			setClock(t);
			if (t >= 1) clearInterval(id);
		}, 100);
		return () => clearInterval(id);
	}, [step, reduce]);

	const shown: Game[] = games.map((g, i) => {
		if (step !== "live" && step !== "results") return g;
		const final = plan?.finals[g.id];
		if (!final) return g;
		const { start, end } = SCHEDULE[i];
		const p = step === "results" ? 1 : (clock - start) / (end - start);
		if (p <= 0) return g;
		return {
			...g,
			state: p >= 1 ? "post" : "in",
			statusText: clockText(p),
			homeScore: scoreAt(final.home, p),
			awayScore: scoreAt(final.away, Math.min(1, p * 1.08)),
		};
	});
	const finalIds = shown
		.filter((g) => g.state === "post")
		.map((g) => g.id)
		.join();

	// Each game plays your win or loss reaction as it goes final.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs only when another game goes final
	useEffect(() => {
		if (step !== "live" || !finalIds) return;
		const newest = finalIds.split(",").at(-1);
		const g = shown.find((x) => x.id === newest);
		const pick = newest ? mine[newest] : null;
		if (!g || !pick || !newest) return;
		const won =
			pickOutcome(
				{ gameId: g.id, team: pick.team },
				{
					id: g.id,
					homeTeam: g.home.abbr,
					awayTeam: g.away.abbr,
					homeScore: g.homeScore,
					awayScore: g.awayScore,
					final: true,
					lockedSpread: g.spread,
				},
				mode,
			) === "win";
		const kind = won
			? (me?.profile.win_effect ?? "confetti")
			: (me?.profile.loss_effect ?? "shake");
		if (kind !== "none") setEffects((e) => ({ ...e, [newest]: kind }));
	}, [finalIds]);

	useEffect(() => {
		if (step !== "live" || clock < 1) return;
		const t = setTimeout(() => setStep("results"), reduce ? 0 : 1600);
		return () => clearTimeout(t);
	}, [step, clock, reduce]);

	useEffect(() => {
		if (step === "live" || step === "intro") return;
		window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
	}, [step, reduce]);

	const finish = () => {
		updateOnboarding((s) => ({ ...s, practice: true, whatsNew: RELEASE }));
		if (league)
			navigate({ to: "/league/$leagueId", params: { leagueId: league } });
		else navigate({ to: user ? "/leagues" : "/" });
	};

	const choose = (g: Game, team: string) => {
		if (!["pick", "rank", "lock", "tiebreaker", "ready"].includes(step)) return;
		setMine((m) => {
			let confidence = m[g.id]?.confidence ?? null;
			if (mode === "confidence" && confidence == null)
				confidence = nextFreeValue(
					Object.values(m).map((p) => p.confidence),
					games.length,
				);
			return { ...m, [g.id]: { team, confidence } };
		});
	};
	const rerank = (changes: ConfidenceChange[]) =>
		setMine((m) => {
			const copy = { ...m };
			for (const c of changes)
				if (copy[c.gameId])
					copy[c.gameId] = { ...copy[c.gameId], confidence: c.confidence };
			return copy;
		});

	if (step === "intro")
		return <Intro mode={mode} onStart={next} onSkip={finish} />;

	const allPicks: WeekPick[] = [
		...games.flatMap((g) =>
			mine[g.id]
				? [
						{
							user_id: PRACTICE_USER,
							game_id: g.id,
							team: mine[g.id].team,
							confidence: mine[g.id].confidence,
							is_lock: lock === g.id,
							tiebreaker: g.id === mnf.id ? guess : null,
						},
					]
				: [],
		),
		...(plan?.friends ?? []),
	];
	const rows =
		step === "results" && plan
			? weekResults(
					[PRACTICE_USER, ...friends.map((f) => f.id)],
					allPicks,
					shown.map((g) => ({ ...g, lockedSpread: g.spread })),
					{ mode },
				)
			: [];
	const outcome = weekOutcome(rows, rival.id);

	const say =
		step === "results"
			? {
					key: `results-${outcome}`,
					text:
						outcome === "won"
							? "You won the week on the tiebreaker! In your real league, that puts a crown on the league page."
							: outcome === "shared"
								? "Same guess, same points, so you share the week. It happens!"
								: `${rival.profile.display_name} edges you on the tiebreaker. Now you know why that Monday night guess matters.`,
				}
			: sayFor(step, mode, picked, games.length, clock);
	const position = steps.indexOf(step);

	return (
		<main className="mx-auto max-w-xl px-4 pt-4 pb-36">
			<div className="flex items-center gap-3">
				<div className="flex flex-1 gap-1" aria-hidden>
					{steps.slice(1).map((s, i) => (
						<span
							key={s}
							className={cn(
								"h-1 flex-1 rounded-full transition-colors duration-500",
								i < position ? "bg-primary" : "bg-muted",
							)}
						/>
					))}
				</div>
				<button
					type="button"
					onClick={finish}
					className="-mr-2 h-9 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					{step === "results" ? "Done" : "Skip"}
				</button>
			</div>

			<div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mt-2 bg-background/90 px-4 py-3 backdrop-blur-xl">
				<AirBudSays say={say.key}>{say.text}</AirBudSays>
			</div>

			<div className="mt-3 grid gap-3">
				<AnimatePresence mode="popLayout">
					{step === "results" && plan && (
						<Results
							key="results"
							rows={rows}
							outcome={outcome}
							me={
								me?.profile ??
								user?.profile ?? {
									display_name: "You",
									avatar_url: null,
									avatar_kind: "monogram",
									favorite_team: null,
								}
							}
							friends={friends}
							rival={rival}
							guess={guess}
							colors={(() => {
								const g = games[0];
								const t = mine[g.id]?.team === g.home.abbr ? g.home : g.away;
								return [t.color, t.altColor];
							})()}
						/>
					)}
					{step === "tiebreaker" && (
						<motion.div
							key="tb"
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
							className="-mt-6"
						>
							<Tiebreaker
								game={mnf}
								picked={!!mine[mnf.id]}
								guess={guess}
								others={[]}
								saving={false}
								onSave={setGuess}
							/>
						</motion.div>
					)}
					{step === "rank" && (
						<motion.div
							key="rank"
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
						>
							<ConfidenceBoard
								games={games}
								picks={new Map(Object.entries(mine))}
								missed={0}
								onRerank={rerank}
								onLock={(id, on) => setLock(on ? id : null)}
							/>
						</motion.div>
					)}
				</AnimatePresence>

				{step !== "rank" &&
					shown.map((g) => {
						const locked = g.state !== "pre";
						const others: Record<string, Picker[]> = {};
						if (locked)
							for (const p of plan?.friends ?? []) {
								if (p.game_id !== g.id) continue;
								const friend = friends.find((f) => f.id === p.user_id);
								if (!friend) continue;
								others[p.team] = [
									...(others[p.team] ?? []),
									{ id: friend.id, profile: friend.profile, lock: p.is_lock },
								];
							}
						const pick = mine[g.id];
						const result = pick && {
							pick: { gameId: g.id, ...pick },
							game: { ...toResult(g), lockedSpread: g.spread },
						};
						return (
							<GameCard
								key={g.id}
								game={g}
								details={false}
								outcome={result && pickOutcome(result.pick, result.game, mode)}
								points={result && scorePick(result.pick, result.game, { mode })}
								picked={pick?.team}
								onPick={(team) => choose(g, team)}
								lineText={g.spreadText}
								others={others}
								lock={
									pick && (step === "lock" || lock === g.id)
										? {
												on: lock === g.id,
												onToggle: () =>
													setLock((l) => (l === g.id ? null : g.id)),
											}
										: null
								}
								effect={effects[g.id]}
								onEffectDone={() =>
									setEffects(({ [g.id]: _, ...rest }) => rest)
								}
								footer={
									mode === "confidence" &&
									pick?.confidence != null && (
										<div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
											<span>Confidence</span>
											<span className="grid h-8 min-w-10 place-items-center rounded-md bg-muted px-2 font-display text-lg font-semibold text-foreground tabular-nums">
												{pick.confidence}
											</span>
										</div>
									)
								}
							/>
						);
					})}
			</div>

			<ActionBar
				step={step}
				ready={{
					pick: picked === games.length,
					rank: true,
					lock: lock != null,
					tiebreaker: guess != null,
					ready: true,
				}}
				onNext={next}
				onFinish={finish}
			/>
		</main>
	);
}

function sayFor(
	step: Step,
	mode: ScoringMode,
	picked: number,
	total: number,
	clock: number,
): { key: string; text: string } {
	switch (step) {
		case "pick":
			if (picked === total)
				return {
					key: "pick-done",
					text: "All picked. You can still change any of them before kickoff.",
				};
			if (picked > 0)
				return {
					key: `pick-${picked}`,
					text:
						total - picked === 1
							? "One more. The Monday night game is always last."
							: `Nice. ${total - picked} to go.`,
				};
			return {
				key: "pick-0",
				text:
					mode === "spread"
						? "Your league picks against the spread. Tap the team you think beats the line shown on each card."
						: mode === "confidence"
							? "First, tap the team you think wins each game."
							: "Each week you pick the winner of every game. Tap a team to pick it.",
			};
		case "rank":
			return {
				key: "rank",
				text: `Now rank them. Drag your surest pick to the top, where it's worth ${total} points. Your shakiest is worth 1.`,
			};
		case "lock":
			return {
				key: "lock",
				text: "Tap the lock on one pick to make it your Lock of the Week. It's for bragging rights: your Lock record shows next to your name in the standings.",
			};
		case "tiebreaker":
			return {
				key: "tiebreaker",
				text: "Guess the total points in the Monday night game and tap Save. If you tie someone for the week, the closer guess wins.",
			};
		case "ready":
			return {
				key: "ready",
				text: "You're set. Each game locks at kickoff, and that's when you see what your friends picked. Let's fast forward to Sunday.",
			};
		case "live":
			return clock < 1
				? {
						key: "live",
						text: "Kickoff! Scores update on their own, and everyone's picks show up under each game.",
					}
				: { key: "live-done", text: "That's a wrap. Let's see the standings." };
		default:
			return { key: "results", text: "" };
	}
}

function Intro({
	mode,
	onStart,
	onSkip,
}: {
	mode: ScoringMode;
	onStart: () => void;
	onSkip: () => void;
}) {
	return (
		<main className="mx-auto grid min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] max-w-md place-content-center gap-6 px-4 py-10 text-center">
			<motion.div
				initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
				animate={{ scale: 1, rotate: 0, opacity: 1 }}
				transition={{ type: "spring", stiffness: 260, damping: 14 }}
				className="mx-auto"
			>
				<AirBudFace size={112} className="border-4" />
			</motion.div>
			<motion.div
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.15 }}
			>
				<div className="text-xs font-semibold uppercase tracking-widest text-primary">
					Welcome to the league
				</div>
				<h1 className="mt-2 font-display text-5xl font-bold uppercase leading-none">
					Practice week
				</h1>
				<p className="mx-auto mt-4 max-w-sm text-muted-foreground">
					Air Bud here. Let's play three made-up games so you know how a week
					works. Nothing counts, and it takes about a minute.
				</p>
			</motion.div>
			<motion.div
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.3 }}
				className="rounded-lg border bg-card p-4 text-left"
			>
				<div className="text-xs font-semibold uppercase tracking-wider text-primary">
					Your league plays {SCORING_MODES[mode].label}
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{SCORING_MODES[mode].explanation}
				</p>
			</motion.div>
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.45 }}
				className="grid gap-2"
			>
				<button
					type="button"
					onClick={onStart}
					className="h-12 rounded-full bg-primary font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-95"
				>
					Let's go
				</button>
				<button
					type="button"
					onClick={onSkip}
					className="h-10 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					Skip, I know how it works
				</button>
			</motion.div>
		</main>
	);
}

function ActionBar({
	step,
	ready,
	onNext,
	onFinish,
}: {
	step: Step;
	ready: Partial<Record<Step, boolean>>;
	onNext: () => void;
	onFinish: () => void;
}) {
	if (step === "live") return null;
	const label =
		step === "results"
			? "Make my real picks"
			: step === "ready"
				? "Kick off"
				: "Next";
	const enabled = step === "results" || !!ready[step];
	return (
		<div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
			<motion.button
				type="button"
				layout
				disabled={!enabled}
				onClick={step === "results" ? onFinish : onNext}
				whileTap={enabled ? { scale: 0.97 } : undefined}
				className="mx-auto flex h-12 w-full max-w-xl items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground shadow-lg transition-opacity disabled:opacity-40"
			>
				{label}
			</motion.button>
		</div>
	);
}

type WeekOutcome = "won" | "shared" | "lost";

/** How the tiebreaker went between you and the friend who tied you. */
function weekOutcome(
	rows: ReturnType<typeof weekResults>,
	rivalId: string,
): WeekOutcome {
	const you = rows.find((r) => r.userId === PRACTICE_USER);
	const rival = rows.find((r) => r.userId === rivalId);
	if (you?.place !== 1) return "lost";
	return rival?.place === 1 ? "shared" : "won";
}

function Results({
	rows,
	outcome,
	me,
	friends,
	rival,
	guess,
	colors,
}: {
	rows: ReturnType<typeof weekResults>;
	outcome: WeekOutcome;
	me: Friend["profile"];
	friends: Friend[];
	rival: Friend;
	guess: number | null;
	colors: string[];
}) {
	const [revealed, setRevealed] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setRevealed(true), 500);
		return () => clearTimeout(t);
	}, []);
	const profiles = new Map<string, Friend["profile"]>([
		[PRACTICE_USER, me],
		...friends.map((f) => [f.id, f.profile] as const),
	]);
	const you = rows.find((r) => r.userId === PRACTICE_USER);
	// Before the reveal everyone sits at zero, you at the bottom.
	const order = revealed
		? [...rows].sort((a, b) => a.place - b.place || b.points - a.points)
		: [...rows].sort(
				(a, b) =>
					Number(a.userId === PRACTICE_USER) -
					Number(b.userId === PRACTICE_USER),
			);
	const fmt = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));
	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			className="relative rounded-lg border bg-card p-4"
		>
			<div className="flex items-baseline justify-between">
				<h2 className="font-display text-xl font-semibold uppercase">
					Practice week standings
				</h2>
				<span className="text-xs text-muted-foreground">Week 0</span>
			</div>
			<ol className="mt-3 grid gap-2">
				{order.map((r) => {
					const p = profiles.get(r.userId);
					const mine = r.userId === PRACTICE_USER;
					return (
						<motion.li
							key={r.userId}
							layout
							transition={{ type: "spring", stiffness: 220, damping: 22 }}
							className={cn(
								"flex h-12 items-center gap-3 rounded-md px-3",
								mine ? "bg-accent ring-1 ring-primary" : "bg-muted/60",
							)}
						>
							<span className="w-4 font-display text-muted-foreground tabular-nums">
								{revealed ? r.place : "–"}
							</span>
							{p && <Avatar profile={p} size={28} />}
							<span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-semibold">
								{mine ? "You" : p?.display_name}
								{revealed && r.place === 1 && (
									<motion.span
										initial={{ y: -14, rotate: -30, opacity: 0 }}
										animate={{ y: 0, rotate: 0, opacity: 1 }}
										transition={{
											delay: 0.6,
											type: "spring",
											stiffness: 400,
											damping: 14,
										}}
									>
										<Crown
											className="size-4 fill-current text-amber-500 dark:text-amber-300"
											aria-label="Week winner"
										/>
									</motion.span>
								)}
							</span>
							<span className="text-xs text-muted-foreground tabular-nums">
								{revealed ? `${r.wins}-${r.losses}` : ""}
							</span>
							<span className="w-10 text-right font-display text-xl font-semibold tabular-nums">
								{revealed ? fmt(r.points) : 0}
							</span>
						</motion.li>
					);
				})}
			</ol>
			{revealed && (
				<motion.p
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.9 }}
					className="mt-3 text-sm text-muted-foreground"
				>
					You and {rival.profile.display_name} both scored{" "}
					{fmt(you?.points ?? 0)}. The Monday night total was {PRACTICE_TOTAL}:
					you guessed {guess ?? "nothing"}, {rival.profile.display_name} guessed{" "}
					{RIVAL_GUESS}.{" "}
					<span className="font-semibold text-foreground">
						{outcome === "won"
							? "Closer guess wins, so the week is yours."
							: outcome === "shared"
								? "Still tied, so you share the week."
								: `${rival.profile.display_name} was closer and takes the week.`}
					</span>
				</motion.p>
			)}
			{revealed && outcome !== "lost" && (
				<PickEffect kind="confetti" colors={colors} onDone={() => {}} />
			)}
		</motion.section>
	);
}
