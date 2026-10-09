import { Check, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Game, Team } from "#/lib/nfl/types";
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
			layout
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
				"relative flex items-center gap-3 overflow-hidden rounded-md border-2 p-3 text-left transition-colors",
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
			{team.logo && (
				<img
					src={team.logo}
					alt=""
					className="relative size-10 shrink-0 drop-shadow"
				/>
			)}
			<span className="relative min-w-0 flex-1">
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
			{showScore && (
				<span className="relative font-display text-2xl font-bold tabular-nums">
					{score}
				</span>
			)}
			<AnimatePresence>
				{selected && (
					<motion.span
						initial={{ scale: 0, rotate: -45 }}
						animate={{ scale: 1, rotate: 0 }}
						exit={{ scale: 0 }}
						className="relative grid size-6 place-items-center rounded-full bg-white/90 text-black"
					>
						<Check className="size-4" strokeWidth={3} />
					</motion.span>
				)}
			</AnimatePresence>
		</motion.button>
	);
}
