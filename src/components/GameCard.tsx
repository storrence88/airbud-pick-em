import { Check, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Game, PublicPicks, Team } from "#/lib/nfl/types";
import { cn } from "#/lib/utils";

interface Props {
	game: Game;
	picked?: string;
	onPick: (abbr: string) => void;
	/** Line text to show, e.g. the frozen ATS spread. Defaults to the feed's line. */
	lineText?: string | null;
	/** Names of other members who picked each team (shown once the game locks). */
	others?: Record<string, string[]>;
	footer?: ReactNode;
}

function formatKickoff(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function GameCard({
	game,
	picked,
	onPick,
	lineText,
	others,
	footer,
}: Props) {
	const line = lineText === undefined ? game.spreadText : lineText;
	const locked = game.state !== "pre";
	return (
		<motion.article
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 260, damping: 26 }}
			className="overflow-hidden rounded-lg border bg-card shadow-sm"
		>
			<div className="flex items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
				<span>{locked ? game.statusText : formatKickoff(game.kickoff)}</span>
				<span className="flex items-center gap-1">
					{line && <span>{line}</span>}
					{locked && <Lock className="size-3" aria-label="Locked" />}
				</span>
			</div>
			<div className="grid grid-cols-2 gap-2 p-3">
				<TeamButton
					team={game.away}
					score={game.awayScore}
					showScore={game.state !== "pre"}
					selected={picked === game.away.abbr}
					disabled={locked}
					onClick={() => onPick(game.away.abbr)}
					label="Away"
				/>
				<TeamButton
					team={game.home}
					score={game.homeScore}
					showScore={game.state !== "pre"}
					selected={picked === game.home.abbr}
					disabled={locked}
					onClick={() => onPick(game.home.abbr)}
					label="Home"
				/>
			</div>
			{game.publicPicks && (
				<PublicSplit
					away={game.away}
					home={game.home}
					split={game.publicPicks}
				/>
			)}
			{others &&
			(others[game.away.abbr]?.length || others[game.home.abbr]?.length) ? (
				<div className="grid grid-cols-2 gap-2 px-3 pb-3 text-xs text-muted-foreground">
					<span className="truncate">{others[game.away.abbr]?.join(", ")}</span>
					<span className="truncate">{others[game.home.abbr]?.join(", ")}</span>
				</div>
			) : null}
			{footer}
		</motion.article>
	);
}

/** Share of ESPN's public players picking each side, away on the left. */
function PublicSplit({
	away,
	home,
	split,
}: {
	away: Team;
	home: Team;
	split: PublicPicks;
}) {
	return (
		<div
			className="px-3 pb-3"
			title="Share of ESPN NFL Pick'em players picking each team"
		>
			<div className="mb-1 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
				<span>
					<span className="font-semibold text-foreground">{split.away}%</span>{" "}
					{away.abbr}
				</span>
				<span className="text-[10px] uppercase tracking-wider">Public</span>
				<span>
					{home.abbr}{" "}
					<span className="font-semibold text-foreground">{split.home}%</span>
				</span>
			</div>
			<div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
				<motion.span
					className="h-full rounded-l-full"
					style={{ background: away.color }}
					initial={{ width: 0 }}
					animate={{ width: `${split.away}%` }}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
				<motion.span
					className="ml-auto h-full rounded-r-full"
					style={{ background: home.color }}
					initial={{ width: 0 }}
					animate={{ width: `${split.home}%` }}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
			</div>
		</div>
	);
}

/** Says where the public pick split comes from; renders nothing without data. */
export function PublicPicksNote({ games }: { games: Game[] }) {
	if (!games.some((g) => g.publicPicks)) return null;
	return (
		<p className="mt-6 text-center text-xs text-muted-foreground">
			Public pick percentages are from ESPN NFL Pick&apos;em, not Yahoo.
		</p>
	);
}

function TeamButton({
	team,
	score,
	showScore,
	selected,
	disabled,
	onClick,
	label,
}: {
	team: Team;
	score: number;
	showScore: boolean;
	selected: boolean;
	disabled: boolean;
	onClick: () => void;
	label: string;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			disabled={disabled}
			whileHover={disabled ? undefined : { y: -2 }}
			whileTap={disabled ? undefined : { scale: 0.96 }}
			aria-pressed={selected}
			className={cn(
				"relative flex flex-col items-start gap-2 overflow-hidden rounded-md border-2 p-3 text-left transition-colors sm:flex-row sm:items-center sm:gap-3",
				selected
					? "border-transparent text-white"
					: "border-border hover:border-muted-foreground/40",
				disabled && !selected && "opacity-60",
			)}
		>
			<AnimatePresence>
				{selected && (
					<motion.span
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ type: "spring", stiffness: 300, damping: 24 }}
						className="absolute inset-0 origin-center"
						style={{
							background: `linear-gradient(135deg, ${team.color}, color-mix(in oklab, ${team.color} 60%, black))`,
						}}
					/>
				)}
			</AnimatePresence>
			{/* Phones stack each team (logo and score on top, name below) so two fit side by side. */}
			<span className="relative flex w-full items-center justify-between gap-2 sm:contents">
				{team.logo && (
					<span className="relative shrink-0">
						<img
							src={team.logo}
							alt=""
							className="size-9 drop-shadow sm:size-10"
						/>
						<CheckBadge
							show={selected}
							className="absolute -right-2 -bottom-1.5 size-5 sm:hidden"
						/>
					</span>
				)}
				{showScore && (
					<span className="relative font-display text-2xl font-bold tabular-nums sm:order-last">
						{score}
					</span>
				)}
			</span>
			<span className="relative w-full min-w-0 flex-1 sm:w-auto">
				<span className="block text-[10px] uppercase tracking-wider opacity-70">
					{label}
				</span>
				<span className="block truncate font-display text-lg font-semibold leading-tight">
					{team.shortName}
				</span>
				{team.record && (
					<span className="block text-xs opacity-70">{team.record}</span>
				)}
			</span>
			<CheckBadge
				show={selected}
				className={cn(
					"size-6 sm:order-last",
					team.logo ? "hidden sm:grid" : "absolute top-2 right-2 sm:static",
				)}
			/>
		</motion.button>
	);
}

function CheckBadge({
	show,
	className,
}: {
	show: boolean;
	className?: string;
}) {
	return (
		<AnimatePresence>
			{show && (
				<motion.span
					initial={{ scale: 0, rotate: -45 }}
					animate={{ scale: 1, rotate: 0 }}
					exit={{ scale: 0 }}
					className={cn(
						"relative grid place-items-center rounded-full bg-white/90 text-black shadow",
						className,
					)}
				>
					<Check className="size-[70%]" strokeWidth={3} />
				</motion.span>
			)}
		</AnimatePresence>
	);
}
