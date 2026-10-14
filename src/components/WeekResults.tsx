import { Crown, LockKeyhole } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { Game, Team } from "#/lib/nfl/types";
import type { PublicProfile } from "#/lib/profile";
import type { ScoringSettings } from "#/lib/scoring";
import { weekWinners } from "#/lib/tiebreaker";
import { cn } from "#/lib/utils";
import { type WeekCell, type WeekPick, weekResults } from "#/lib/week-results";
import { Avatar } from "./Avatar";

type Player = PublicProfile & { user_id: string };
type WeekGame = Game & { lockedSpread: number | null };

const OUTCOME_LABEL = {
	win: "Win",
	loss: "Loss",
	push: "Push",
	pending: "Not final",
} as const;

/**
 * Everyone's picks for a week in one grid: a row per player, a column per
 * game, each pick tinted by how it went. Former members sit underneath,
 * muted, like they do in the standings.
 */
export function WeekResults({
	games,
	members,
	formers,
	picks,
	formerPicks,
	settings,
	userId,
}: {
	games: WeekGame[];
	members: Player[];
	formers: Player[];
	picks: WeekPick[];
	formerPicks: WeekPick[];
	settings: ScoringSettings;
	userId: string;
}) {
	const rows = useMemo(
		() =>
			weekResults(
				members.map((m) => m.user_id),
				picks,
				games,
				settings,
			),
		[members, picks, games, settings],
	);
	const formerRows = useMemo(
		() =>
			weekResults(
				formers.map((f) => f.user_id),
				formerPicks,
				games,
				settings,
			),
		[formers, formerPicks, games, settings],
	);
	const players = new Map([...members, ...formers].map((p) => [p.user_id, p]));
	const done = games.length > 0 && games.every((g) => g.state === "post");
	// Same rule as the weekly winner everywhere else: points, then the tiebreaker.
	const winners = new Set(done ? weekWinners(rows) : []);
	const showConfidence = settings.mode === "confidence";

	return (
		<div className="mt-6 overflow-hidden rounded-lg border bg-card">
			<div className="overflow-x-auto overscroll-x-contain">
				<table className="w-full border-separate border-spacing-0 text-sm">
					<thead>
						<tr className="text-xs text-muted-foreground">
							<th
								scope="col"
								className="sticky left-0 z-10 min-w-36 border-b bg-card px-3 py-2 text-left font-semibold uppercase tracking-wider sm:min-w-44"
							>
								Player
							</th>
							{games.map((g) => (
								<GameHeader key={g.id} game={g} />
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((r, i) => {
							const p = players.get(r.userId);
							if (!p) return null;
							return (
								<PlayerRow
									key={r.userId}
									index={i}
									player={p}
									games={games}
									cells={r.cells}
									points={r.points}
									me={r.userId === userId}
									crown={winners.has(r.userId)}
									showConfidence={showConfidence}
								/>
							);
						})}
						{formerRows.length > 0 && (
							<tr>
								<th
									scope="rowgroup"
									colSpan={games.length + 1}
									className="border-b bg-muted/30 px-3 pt-3 pb-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
								>
									<span className="sticky left-3">Former members</span>
								</th>
							</tr>
						)}
						{formerRows.map((r, i) => {
							const p = players.get(r.userId);
							if (!p) return null;
							return (
								<PlayerRow
									key={r.userId}
									index={rows.length + i}
									player={p}
									games={games}
									cells={r.cells}
									points={r.points}
									former
									showConfidence={showConfidence}
								/>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

/** Away over home, the winner bright and the loser faded. */
function GameHeader({ game }: { game: WeekGame }) {
	const final = game.state === "post";
	const side = (team: Team, score: number, other: number) => (
		<span
			className={cn(
				"flex items-center justify-between gap-1.5",
				final && score < other && "opacity-45",
			)}
		>
			<span className="font-semibold text-foreground">{team.abbr}</span>
			{game.state !== "pre" && <span className="tabular-nums">{score}</span>}
		</span>
	);
	return (
		<th
			scope="col"
			className="min-w-16 border-b border-l px-2 py-2 text-left font-normal"
			title={`${game.away.name} at ${game.home.name}`}
		>
			{side(game.away, game.awayScore, game.homeScore)}
			{side(game.home, game.homeScore, game.awayScore)}
		</th>
	);
}

function PlayerRow({
	index,
	player,
	games,
	cells,
	points,
	me = false,
	crown = false,
	former = false,
	showConfidence,
}: {
	index: number;
	player: Player;
	games: WeekGame[];
	cells: Record<string, WeekCell>;
	points: number;
	me?: boolean;
	crown?: boolean;
	former?: boolean;
	showConfidence: boolean;
}) {
	return (
		<motion.tr
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: Math.min(index, 12) * 0.03, duration: 0.2 }}
			className={cn(former && "text-muted-foreground")}
		>
			<th
				scope="row"
				className={cn(
					"sticky left-0 z-10 border-b px-3 py-2 text-left font-normal",
					me
						? "bg-[color-mix(in_oklab,var(--primary)_8%,var(--card))]"
						: "bg-card",
				)}
			>
				<span className="flex items-center gap-2">
					<Avatar
						profile={player}
						size={24}
						className={cn("shrink-0", former && "opacity-60 grayscale")}
					/>
					<span className="min-w-0 flex-1 truncate">{player.display_name}</span>
					{crown && (
						<Crown
							className="size-3.5 shrink-0 text-amber-600 dark:text-amber-300"
							aria-label="Won the week"
						/>
					)}
					<span className="font-display text-base font-bold tabular-nums">
						{points}
					</span>
				</span>
			</th>
			{games.map((g) => (
				<PickCell
					key={g.id}
					game={g}
					cell={cells[g.id]}
					name={player.display_name}
					me={me}
					muted={former}
					showConfidence={showConfidence}
				/>
			))}
		</motion.tr>
	);
}

function PickCell({
	game,
	cell,
	name,
	me,
	muted,
	showConfidence,
}: {
	game: WeekGame;
	cell?: WeekCell;
	name: string;
	me: boolean;
	muted: boolean;
	showConfidence: boolean;
}) {
	const base = cn(
		"border-b border-l px-1.5 py-1.5",
		me && "bg-[color-mix(in_oklab,var(--primary)_5%,transparent)]",
	);
	if (!cell)
		return (
			<td className={cn(base, "text-center text-muted-foreground/60")}>
				<span title={`${name} didn't pick this game`}>–</span>
			</td>
		);
	const team = cell.team === game.home.abbr ? game.home : game.away;
	return (
		<td className={base}>
			<span
				title={`${name}: ${team.abbr}${cell.isLock ? " (lock)" : ""} · ${OUTCOME_LABEL[cell.outcome]}`}
				className={cn(
					"relative flex h-9 items-center justify-center gap-1 rounded-md px-1.5 font-display text-sm font-semibold",
					cell.outcome === "win" && "bg-win/15 text-win",
					cell.outcome === "loss" && "bg-loss/10 text-loss",
					cell.outcome === "push" && "bg-muted text-muted-foreground",
					muted && "opacity-60 saturate-50",
				)}
			>
				{team.logo ? (
					<img src={team.logo} alt={team.abbr} className="size-5" />
				) : (
					team.abbr
				)}
				{showConfidence && cell.confidence != null && (
					<span className="tabular-nums">{cell.confidence}</span>
				)}
				{cell.isLock && (
					<LockKeyhole
						className="absolute -top-1 -right-1 size-3 fill-amber-300 dark:fill-amber-300/40 text-amber-600 dark:text-amber-300"
						aria-label="Lock of the week"
					/>
				)}
			</span>
		</td>
	);
}
