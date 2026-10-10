import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	BadgeCheck,
	Crown,
	Flame,
	type LucideIcon,
	MessageSquareQuote,
	Rocket,
	Skull,
	Star,
	Toilet,
	Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { type Badge, type BadgeId, computeFlair, FLAME_AT } from "#/lib/flair";
import { MAX_TRASH_TALK } from "#/lib/profile";
import { computeStandings } from "#/lib/standings";
import { cn } from "#/lib/utils";
import {
	leagueWeekQuery,
	type Member,
	saveTrashTalk,
	standingsQuery,
} from "#/server/leagues";
import { Avatar } from "./Avatar";

const BADGE_STYLE: Record<BadgeId, { icon: LucideIcon; className: string }> = {
	"week-winner": { icon: Crown, className: "text-amber-300" },
	perfect: { icon: BadgeCheck, className: "text-primary" },
	upset: { icon: Zap, className: "text-sky-300" },
	locks: { icon: Star, className: "text-amber-300" },
	"longest-streak": { icon: Rocket, className: "text-violet-300" },
	"worst-week": { icon: Skull, className: "text-muted-foreground" },
};

export function Standings({ leagueId }: { leagueId: string }) {
	const { data: week } = useSuspenseQuery(leagueWeekQuery(leagueId));
	const { data, isLoading } = useQuery(standingsQuery(leagueId));
	const { rows, flair } = useMemo(() => {
		if (!data)
			return { rows: [], flair: {} as ReturnType<typeof computeFlair> };
		const ids = week.members.map((m) => m.user_id);
		const settings = {
			mode: week.league.mode,
			pushValue: week.league.settings.pushValue,
		};
		return {
			rows: computeStandings(ids, data.picks, data.games, settings),
			flair: computeFlair(ids, data.picks, data.games, data.weeks, settings),
		};
	}, [data, week]);
	const members = new Map(week.members.map((m) => [m.user_id, m]));
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
				{rows.map((r, i) => {
					const m = members.get(r.userId);
					if (!m) return null;
					const f = flair[r.userId];
					return (
						<StandingRow
							key={r.userId}
							rank={i + 1}
							member={m}
							me={r.userId === week.userId}
							streak={f?.streak ?? 0}
							lastPlace={f?.lastPlace ?? false}
							badges={f?.badges ?? []}
							weekLabel={
								lastWeek > 0
									? `Wk ${lastWeek}: ${r.byWeek[lastWeek] ?? 0}`
									: null
							}
							total={r.total}
						/>
					);
				})}
			</ol>
			{/* Keyed by week so a draft doesn't carry into the next one. */}
			<TrashTalkBoard
				key={`${week.trashTalk.season}-${week.trashTalk.week}`}
				leagueId={leagueId}
				members={members}
			/>
		</section>
	);
}

function StandingRow({
	rank,
	member,
	me,
	streak,
	lastPlace,
	badges,
	weekLabel,
	total,
}: {
	rank: number;
	member: Member;
	me: boolean;
	streak: number;
	lastPlace: boolean;
	badges: Badge[];
	weekLabel: string | null;
	total: number;
}) {
	// Tapping a badge explains it, since phones have no hover.
	const [open, setOpen] = useState<BadgeId | null>(null);
	const detail = badges.find((b) => b.id === open)?.detail;
	return (
		<motion.li
			layout
			transition={{ type: "spring", stiffness: 300, damping: 30 }}
			className={cn(
				"rounded-lg border bg-card px-3 py-3 sm:px-4",
				me && "border-primary",
			)}
		>
			<div className="flex items-center gap-3 sm:gap-4">
				<span className="w-5 shrink-0 text-center font-display text-xl font-bold text-muted-foreground">
					{rank}
				</span>
				<Avatar profile={member} size={36} />
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-1.5">
						<span className="truncate font-semibold">
							{member.display_name}
						</span>
						{streak >= FLAME_AT && <StreakFlame streak={streak} />}
						{lastPlace && (
							<span
								title="Last place last week"
								className="inline-flex shrink-0 text-amber-200/80"
							>
								<Toilet className="size-4" aria-hidden />
								<span className="sr-only">Last place last week</span>
							</span>
						)}
					</div>
					{(member.title || badges.length > 0) && (
						<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
							{member.title && (
								<span className="truncate text-xs text-muted-foreground italic">
									{member.title}
								</span>
							)}
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
											"inline-flex h-5 items-center gap-0.5 rounded-full border bg-muted/50 px-1.5 text-[11px] font-semibold tabular-nums",
											className,
											open === b.id && "bg-muted",
										)}
									>
										<Icon className="size-3" aria-hidden />
										{b.label}
									</button>
								);
							})}
						</div>
					)}
				</div>
				{weekLabel && (
					<span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
						{weekLabel}
					</span>
				)}
				<span className="flex w-10 shrink-0 flex-col items-end">
					<span className="font-display text-2xl font-bold tabular-nums">
						{total}
					</span>
					{weekLabel && (
						<span className="text-[10px] whitespace-nowrap text-muted-foreground sm:hidden">
							{weekLabel}
						</span>
					)}
				</span>
			</div>
			<AnimatePresence initial={false}>
				{detail && (
					<motion.p
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						className="overflow-hidden pl-20 text-xs text-muted-foreground sm:pl-[5.5rem]"
					>
						<span className="block pt-1.5">{detail}</span>
					</motion.p>
				)}
			</AnimatePresence>
		</motion.li>
	);
}

function StreakFlame({ streak }: { streak: number }) {
	return (
		<span
			title={`${streak} right in a row`}
			className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold text-orange-400 tabular-nums"
		>
			<motion.span
				className="inline-flex origin-bottom"
				animate={{
					scaleY: [1, 1.12, 0.96, 1.06, 1],
					rotate: [0, -3, 2, -1, 0],
				}}
				transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}
			>
				<Flame className="size-4 fill-orange-500/40" aria-hidden />
			</motion.span>
			{streak}
			<span className="sr-only"> right in a row</span>
		</span>
	);
}

function revealText(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});
}

/** One line of trash talk per member per week, hidden until Sunday's first kickoff. */
function TrashTalkBoard({
	leagueId,
	members,
}: {
	leagueId: string;
	members: Map<string, Member>;
}) {
	const qc = useQueryClient();
	const query = leagueWeekQuery(leagueId);
	const { data } = useSuspenseQuery(query);
	const { trashTalk, userId } = data;
	const revealed =
		trashTalk.revealAt != null && Date.now() >= Date.parse(trashTalk.revealAt);
	const mine = trashTalk.lines.find((l) => l.user_id === userId);
	const [draft, setDraft] = useState(mine?.body ?? "");
	const [error, setError] = useState("");
	const save = useMutation({
		mutationFn: (body: string) =>
			saveTrashTalk({
				data: {
					leagueId,
					season: trashTalk.season,
					week: trashTalk.week,
					body,
				},
			}),
		onMutate: () => setError(""),
		onError: (err) => setError((err as Error).message),
		onSettled: () => qc.invalidateQueries({ queryKey: query.queryKey }),
	});
	if (!trashTalk.week) return null;
	const lines = revealed ? trashTalk.lines : [];
	const dirty = draft.trim() !== (mine?.body ?? "");

	return (
		<div className="mt-8">
			<h2 className="flex items-center gap-2 font-display text-xl font-semibold uppercase">
				<MessageSquareQuote className="size-5 text-primary" aria-hidden />
				Week {trashTalk.week} trash talk
			</h2>
			{revealed ? (
				lines.length === 0 ? (
					<p className="mt-2 text-sm text-muted-foreground">
						Nobody talked any trash this week. Suspicious.
					</p>
				) : (
					<ul className="mt-3 grid gap-2">
						{lines.map((l, i) => {
							const m = members.get(l.user_id);
							return (
								<motion.li
									key={l.user_id}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: i * 0.05 }}
									className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5"
								>
									{m && <Avatar profile={m} size={28} className="mt-0.5" />}
									<div className="min-w-0">
										<div className="text-xs font-semibold text-muted-foreground">
											{m?.display_name ?? "Player"}
										</div>
										<p className="break-words">{l.body}</p>
									</div>
								</motion.li>
							);
						})}
					</ul>
				)
			) : (
				<form
					className="mt-3 rounded-lg border bg-card p-3"
					onSubmit={(e) => {
						e.preventDefault();
						save.mutate(draft.trim());
					}}
				>
					<label htmlFor="trash-talk" className="text-sm text-muted-foreground">
						Everyone's line goes up at{" "}
						{trashTalk.revealAt
							? `the first Sunday kickoff (${revealText(trashTalk.revealAt)})`
							: "the first Sunday kickoff"}
						. Until then only you can see yours.
					</label>
					<div className="mt-2 flex gap-2">
						<input
							id="trash-talk"
							value={draft}
							maxLength={MAX_TRASH_TALK}
							onChange={(e) => setDraft(e.target.value)}
							placeholder="Say something you'll regret by Monday"
							className="h-10 min-w-0 flex-1 rounded-full border bg-background px-4 text-base outline-none focus:border-primary sm:text-sm"
						/>
						<button
							type="submit"
							disabled={!dirty || save.isPending}
							className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
						>
							{save.isPending
								? "Saving…"
								: mine && !draft.trim()
									? "Remove"
									: "Save"}
						</button>
					</div>
					<div className="mt-1.5 flex justify-between px-1 text-xs text-muted-foreground">
						<span className={cn(error && "text-loss")}>
							{error || (mine && !dirty ? "Saved" : "")}
						</span>
						<span className="tabular-nums">
							{draft.length}/{MAX_TRASH_TALK}
						</span>
					</div>
				</form>
			)}
		</div>
	);
}
