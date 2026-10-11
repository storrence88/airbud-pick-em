import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, PencilLine } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Game, Team } from "#/lib/nfl/types";
import type { ScoringMode } from "#/lib/scoring";
import { cn } from "#/lib/utils";
import { weekGamesQuery } from "#/server/games";
import { enterPickFor, type Member } from "#/server/leagues";
import { MemberChoice } from "./MemberChoice";

/** Commissioner-only panel for entering a pick a member sent in before kickoff. */
export function EnterPick({
	leagueId,
	mode,
	members,
	userId,
}: {
	leagueId: string;
	mode: ScoringMode;
	members: Member[];
	userId: string;
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
				<PencilLine className="size-5 text-muted-foreground" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Enter a pick for someone</span>
					<span className="block text-sm text-muted-foreground">
						Add a pick a member sent you before kickoff.
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
						<Entry
							leagueId={leagueId}
							mode={mode}
							others={members.filter((m) => m.user_id !== userId)}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

function formatKickoff(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});
}

function Entry({
	leagueId,
	mode,
	others,
}: {
	leagueId: string;
	mode: ScoringMode;
	others: Member[];
}) {
	const qc = useQueryClient();
	const games = useQuery(weekGamesQuery());
	const [member, setMember] = useState<string | null>(null);
	const [choice, setChoice] = useState<{ game: string; team: string } | null>(
		null,
	);
	const [points, setPoints] = useState<number | null>(null);
	const [entered, setEntered] = useState<string | null>(null);
	const target = others.find((m) => m.user_id === member);
	const all = games.data ?? [];
	const open = all.filter(
		(g) => g.state === "pre" && new Date(g.kickoff).getTime() > Date.now(),
	);
	const chosenGame = open.find((g) => g.id === choice?.game);
	const chosenTeam =
		chosenGame &&
		[chosenGame.away, chosenGame.home].find((t) => t.abbr === choice?.team);

	const enter = useMutation({
		mutationFn: () => {
			if (!member || !choice) throw new Error("Choose a member and a team.");
			return enterPickFor({
				data: {
					leagueId,
					userId: member,
					gameId: choice.game,
					team: choice.team,
					confidence: mode === "confidence" ? points : null,
				},
			});
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["league", leagueId] });
			setEntered(
				`Entered ${chosenTeam?.shortName} for ${target?.display_name}.`,
			);
			setChoice(null);
			setPoints(null);
		},
	});

	const reset = () => {
		setEntered(null);
		enter.reset();
	};

	if (!others.length)
		return (
			<p className="border-t px-4 py-4 text-sm text-muted-foreground">
				There's no one else in the league.
			</p>
		);

	return (
		<div className="border-t px-4 py-4 text-sm">
			<p className="text-muted-foreground">
				It replaces any pick they already have on that game. You won't see their
				other picks, and they'll see that you entered this one.
			</p>
			<MemberChoice
				name="enter-pick-member"
				legend="Member the pick is for"
				members={others}
				value={member}
				onChange={(id) => {
					setMember(id);
					reset();
				}}
			/>
			<div className="mt-4 font-semibold">
				{all[0] ? `Week ${all[0].week}` : "This week"}
			</div>
			{games.isPending ? (
				<p className="mt-2 text-muted-foreground">Loading games…</p>
			) : games.error ? (
				<p className="mt-2 text-loss">{(games.error as Error).message}</p>
			) : !open.length ? (
				<p className="mt-2 text-muted-foreground">
					Every game this week has kicked off.
				</p>
			) : (
				<fieldset className="mt-2 grid gap-2">
					<legend className="sr-only">Their pick</legend>
					{open.map((g) => (
						<GameRow
							key={g.id}
							game={g}
							picked={choice?.game === g.id ? choice.team : null}
							onPick={(team) => {
								setChoice({ game: g.id, team });
								reset();
							}}
						/>
					))}
				</fieldset>
			)}
			{mode === "confidence" && open.length > 0 && (
				<label className="mt-4 flex flex-wrap items-center justify-between gap-3">
					<span className="min-w-0">
						<span className="block font-semibold">Points</span>
						<span className="block text-xs text-muted-foreground">
							If another of their open games has that value, the two swap.
						</span>
					</span>
					<select
						value={points ?? ""}
						onChange={(e) => {
							setPoints(e.target.value ? Number(e.target.value) : null);
							reset();
						}}
						className="h-10 rounded-md border bg-background px-3 outline-none ring-ring/40 focus:ring-4"
					>
						<option value="">Next open value</option>
						{Array.from({ length: all.length }, (_, i) => all.length - i).map(
							(v) => (
								<option key={v} value={v}>
									{v}
								</option>
							),
						)}
					</select>
				</label>
			)}
			<div className="mt-4 flex flex-wrap items-center justify-end gap-3">
				<AnimatePresence>
					{entered && (
						<motion.p
							initial={{ opacity: 0, x: 6 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0 }}
							className="mr-auto flex items-center gap-1.5 font-semibold text-primary"
						>
							<Check className="size-4 shrink-0" aria-hidden /> {entered}
						</motion.p>
					)}
				</AnimatePresence>
				<button
					type="button"
					onClick={() => enter.mutate()}
					disabled={!target || !chosenTeam || enter.isPending}
					className="h-10 rounded-full bg-primary px-5 font-semibold text-primary-foreground transition-[transform,opacity] active:scale-95 disabled:opacity-50"
				>
					{enter.isPending
						? "Entering…"
						: target && chosenTeam
							? `Enter ${chosenTeam.abbr} for ${target.display_name}`
							: "Enter pick"}
				</button>
			</div>
			{enter.error && (
				<p className="mt-2 text-loss">{(enter.error as Error).message}</p>
			)}
		</div>
	);
}

function GameRow({
	game,
	picked,
	onPick,
}: {
	game: Game;
	picked: string | null;
	onPick: (team: string) => void;
}) {
	return (
		<div className="rounded-md border px-3 py-2">
			<div className="text-xs text-muted-foreground">
				{formatKickoff(game.kickoff)}
			</div>
			<div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
				<TeamChoice
					team={game.away}
					selected={picked === game.away.abbr}
					onClick={() => onPick(game.away.abbr)}
				/>
				<span className="text-xs text-muted-foreground">@</span>
				<TeamChoice
					team={game.home}
					selected={picked === game.home.abbr}
					onClick={() => onPick(game.home.abbr)}
				/>
			</div>
		</div>
	);
}

function TeamChoice({
	team,
	selected,
	onClick,
}: {
	team: Team;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"flex h-10 min-w-0 items-center gap-2 rounded-full border px-3 font-semibold transition-colors",
				selected
					? "border-primary bg-primary/10 text-foreground"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<img src={team.logo} alt="" className="size-6 shrink-0" />
			<span className="truncate">{team.abbr}</span>
			{selected && (
				<Check className="ml-auto size-4 shrink-0 text-primary" aria-hidden />
			)}
		</button>
	);
}
