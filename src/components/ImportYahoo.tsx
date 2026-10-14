import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Check, ChevronDown, History } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { pickOutcome, type ScoringMode, scoreWeek } from "#/lib/scoring";
import { cn } from "#/lib/utils";
import { toResult } from "#/lib/week-results";
import { guessMember, matchupCheck, parseWeekPaste } from "#/lib/yahoo-import";
import { weekGamesQuery } from "#/server/games";
import {
	importWeekPicks,
	type League,
	leagueWeekQuery,
	type Member,
} from "#/server/leagues";

/** Commissioner-only panel for bringing finished weeks over from Yahoo Pick'em. */
export function ImportYahoo({
	league,
	members,
}: {
	league: League;
	members: Member[];
}) {
	const [open, setOpen] = useState(false);
	return (
		<section className="mt-4 rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left"
			>
				<History className="size-5 text-muted-foreground" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Import weeks from Yahoo</span>
					<span className="block text-sm text-muted-foreground">
						Bring over picks from weeks you already played on Yahoo Pick'em.
					</span>
				</span>
				<ChevronDown
					className={cn(
						"size-5 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden
				/>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<Importer league={league} members={members} />
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

const SKIP = "skip";
const normalizeName = (s: string) => s.trim().toLowerCase();

// Which member each Yahoo name was imported as, so the next week matches itself.
function savedNames(leagueId: string): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(`yahoo-names:${leagueId}`) ?? "{}");
	} catch {
		return {};
	}
}

function saveNames(leagueId: string, names: Record<string, string>) {
	try {
		localStorage.setItem(
			`yahoo-names:${leagueId}`,
			JSON.stringify({ ...savedNames(leagueId), ...names }),
		);
	} catch {
		// Private windows can refuse storage; the names just won't be remembered.
	}
}

function Importer({ league, members }: { league: League; members: Member[] }) {
	const qc = useQueryClient();
	const current = useQuery(weekGamesQuery());
	const lastWeek = Math.min(current.data?.[0]?.week ?? 1, 18);
	const [week, setWeek] = useState(1);
	const [text, setText] = useState("");
	const [chosen, setChosen] = useState<Record<string, string>>({});
	const [done, setDone] = useState<string | null>(null);
	const weekData = useQuery(leagueWeekQuery(league.id, week));
	const games = weekData.data?.games ?? [];
	const finished = games.length > 0 && games.every((g) => g.state === "post");

	const rows = useMemo(
		() =>
			parseWeekPaste(
				text,
				games.map((g) => ({
					id: g.id,
					home: g.home.abbr,
					away: g.away.abbr,
					kickoff: g.kickoff,
				})),
				league.mode,
			),
		[text, games, league.mode],
	);
	// A table copied from another week lists matchups this week doesn't have.
	const wrongWeek = useMemo(() => {
		const check = matchupCheck(
			text,
			games.map((g) => ({ home: g.home.abbr, away: g.away.abbr })),
		);
		return check != null && check.unmatched > 0;
	}, [text, games]);
	const otherWeeks = useQueries({
		queries: Array.from({ length: lastWeek }, (_, i) => ({
			...weekGamesQuery(i + 1),
			refetchInterval: false as const,
			staleTime: 5 * 60_000,
			enabled: wrongWeek,
		})),
	});
	const matchingWeek = wrongWeek
		? otherWeeks.find(
				(q) =>
					q.data?.length &&
					matchupCheck(
						text,
						q.data.map((g) => ({ home: g.home.abbr, away: g.away.abbr })),
					)?.unmatched === 0,
			)?.data?.[0]?.week
		: undefined;
	const remembered = useMemo(() => savedNames(league.id), [league.id]);
	const results = useMemo(() => games.map(toResult), [games]);
	const settings = {
		mode: league.mode as ScoringMode,
		pushValue: league.settings.pushValue,
	};

	const memberFor = (name: string) => {
		const key = normalizeName(name);
		const pick = chosen[key] ?? remembered[key];
		if (pick === SKIP) return null;
		if (pick && members.some((m) => m.user_id === pick)) return pick;
		return guessMember(name, members);
	};
	const assigned = rows.map((r) => memberFor(r.name));
	const taken = new Map<string, number>();
	for (const id of assigned) if (id) taken.set(id, (taken.get(id) ?? 0) + 1);
	const ready = wrongWeek
		? []
		: rows.filter(
				(r, i) =>
					assigned[i] &&
					!r.problems.length &&
					taken.get(assigned[i] ?? "") === 1,
			);

	const existing = (userId: string) =>
		(weekData.data?.picks ?? []).filter(
			(p) => p.user_id === userId && !p.imported,
		).length;

	const save = useMutation({
		mutationFn: () =>
			importWeekPicks({
				data: {
					leagueId: league.id,
					week,
					rows: rows.flatMap((r, i) => {
						const userId = assigned[i];
						if (!userId || !ready.includes(r)) return [];
						return [{ userId, picks: r.picks, tiebreaker: r.tiebreaker }];
					}),
				},
			}),
		onSuccess: async () => {
			saveNames(
				league.id,
				Object.fromEntries(
					rows.map((r, i) => [normalizeName(r.name), assigned[i] ?? SKIP]),
				),
			);
			await qc.invalidateQueries({ queryKey: ["league", league.id] });
			setDone(
				`Imported Week ${week} for ${ready.length} ${ready.length === 1 ? "player" : "players"}.`,
			);
			setText("");
			setChosen({});
		},
	});

	return (
		<div className="border-t px-4 py-4 text-sm">
			<p className="text-muted-foreground">
				On Yahoo, open Group Picks for a week, drag to select the whole table
				(from "Favored" down to the last player's points), copy it and paste it
				here. Typing one player per line works too:
			</p>
			<pre className="mt-2 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
				Steven: KC 16, BUF 15, DAL 14, … tiebreaker 45
			</pre>
			<p className="mt-2 text-muted-foreground">
				It replaces anything those players already have that week. Imported
				weeks have no Lock of the Week. Friends who haven't joined yet can be
				imported once they do.
			</p>

			<label className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<span className="font-semibold">Week</span>
				<select
					value={week}
					onChange={(e) => {
						setWeek(Number(e.target.value));
						setDone(null);
						save.reset();
					}}
					className="h-10 rounded-md border bg-background px-3 outline-none ring-ring/40 focus:ring-4"
				>
					{Array.from({ length: lastWeek }, (_, i) => i + 1).map((w) => (
						<option key={w} value={w}>
							Week {w}
						</option>
					))}
				</select>
			</label>
			<textarea
				aria-label={`Week ${week} picks from Yahoo`}
				value={text}
				onChange={(e) => {
					setText(e.target.value);
					setDone(null);
					save.reset();
				}}
				rows={6}
				placeholder={`Paste Week ${week} picks here`}
				className="mt-3 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none ring-ring/40 focus:ring-4"
			/>

			{weekData.isPending ? (
				<p className="mt-2 text-muted-foreground">Loading Week {week}…</p>
			) : weekData.error ? (
				<p className="mt-2 text-loss">{(weekData.error as Error).message}</p>
			) : !finished ? (
				<p className="mt-2 text-muted-foreground">
					Week {week} isn't over yet. Only finished weeks can be imported.
				</p>
			) : wrongWeek ? (
				<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-loss">
					<span>
						This table is from a different week than Week {week}.
						{matchingWeek == null &&
							otherWeeks.some((q) => q.isPending) &&
							" Finding the right one…"}
						{matchingWeek == null &&
							!otherWeeks.some((q) => q.isPending) &&
							" Pick the week that's open on Yahoo."}
					</span>
					{matchingWeek != null && (
						<button
							type="button"
							onClick={() => {
								setWeek(matchingWeek);
								setDone(null);
								save.reset();
							}}
							className="h-9 rounded-full border px-4 font-semibold text-foreground hover:bg-muted"
						>
							Switch to Week {matchingWeek}
						</button>
					)}
				</div>
			) : text.trim() && !rows.length ? (
				<p className="mt-2 text-muted-foreground">
					No Week {week} picks found in that. Check the week, or try one player
					per line.
				</p>
			) : null}

			{finished && rows.length > 0 && (
				<ul className="mt-4 grid gap-2">
					{rows.map((r, i) => {
						const userId = assigned[i];
						const dupe = userId && (taken.get(userId) ?? 0) > 1;
						const had = userId ? existing(userId) : 0;
						const points = scoreWeek(r.picks, results, settings);
						return (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: rows are re-read from the pasted text, one per line
								key={`${r.name}-${i}`}
								className={cn(
									"rounded-md border px-3 py-2",
									(!userId || r.problems.length || dupe) && "opacity-80",
								)}
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="min-w-0 font-semibold">
										{r.name || "No name"}
									</span>
									<select
										aria-label={`Who ${r.name || "this line"} is`}
										value={userId ?? SKIP}
										onChange={(e) =>
											setChosen((c) => ({
												...c,
												[normalizeName(r.name)]: e.target.value,
											}))
										}
										className="h-9 max-w-full rounded-md border bg-background px-2 outline-none ring-ring/40 focus:ring-4"
									>
										<option value={SKIP}>Skip</option>
										{members.map((m) => (
											<option key={m.user_id} value={m.user_id}>
												{m.display_name}
											</option>
										))}
									</select>
								</div>
								<div className="mt-1.5 flex flex-wrap gap-1">
									{r.picks.map((p) => {
										const game = results.find((g) => g.id === p.gameId);
										const outcome = game
											? pickOutcome(p, game, league.mode)
											: "pending";
										return (
											<span
												key={p.gameId}
												className={cn(
													"rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
													outcome === "win" && "bg-win/15 text-win",
													outcome === "loss" &&
														"bg-loss/10 text-muted-foreground line-through",
													outcome !== "win" &&
														outcome !== "loss" &&
														"bg-muted text-muted-foreground",
												)}
											>
												{p.team}
												{p.confidence != null && ` ${p.confidence}`}
											</span>
										);
									})}
								</div>
								<p className="mt-1.5 text-xs text-muted-foreground">
									{r.picks.length} of {games.length} picked ·{" "}
									<span className="font-semibold text-foreground">
										{points} pts
									</span>
									{r.tiebreaker != null && ` · tiebreaker ${r.tiebreaker}`}
								</p>
								{had > 0 && userId && (
									<p className="mt-1 text-xs font-semibold text-foreground">
										Replaces the {had} {had === 1 ? "pick" : "picks"} they made
										here for Week {week}, Lock of the Week included. Set them to
										Skip to keep those instead.
									</p>
								)}
								{r.problems.map((msg) => (
									<p key={msg} className="mt-1 text-xs text-loss">
										{msg}
									</p>
								))}
								{dupe && (
									<p className="mt-1 text-xs text-loss">
										Two lines are set to the same player.
									</p>
								)}
								{!userId && (
									<p className="mt-1 text-xs text-muted-foreground">
										Skipped. Pick who this is, or import them after they join.
									</p>
								)}
							</li>
						);
					})}
				</ul>
			)}

			<div className="mt-4 flex flex-wrap items-center justify-end gap-3">
				<AnimatePresence>
					{done && (
						<motion.p
							initial={{ opacity: 0, x: 6 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0 }}
							className="mr-auto flex items-center gap-1.5 font-semibold text-primary"
						>
							<Check className="size-4 shrink-0" aria-hidden /> {done}
						</motion.p>
					)}
				</AnimatePresence>
				<button
					type="button"
					onClick={() => save.mutate()}
					disabled={!finished || !ready.length || save.isPending}
					className="h-10 rounded-full bg-primary px-5 font-semibold text-primary-foreground transition-[transform,opacity] active:scale-95 disabled:opacity-50"
				>
					{save.isPending
						? "Importing…"
						: ready.length
							? `Import Week ${week} for ${ready.length} ${ready.length === 1 ? "player" : "players"}`
							: "Import"}
				</button>
			</div>
			{save.error && (
				<p className="mt-2 text-loss">{(save.error as Error).message}</p>
			)}
		</div>
	);
}
