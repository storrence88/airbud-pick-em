import {
	Check,
	Equal,
	Info,
	Lock,
	PencilLine,
	Sparkles,
	Star,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import type { Game, PublicPicks, Team } from "#/lib/nfl/types";
import type { PickOutcome } from "#/lib/scoring";
import { accentColors, splitColors } from "#/lib/team-colors";
import { useResolvedTheme } from "#/lib/theme";
import { cn } from "#/lib/utils";
import { GameDetailsSheet } from "./GameDetails";
import { NewDot, useNewDot } from "./NewDot";
import { cardEffect, type EffectKind, PickEffect } from "./PickEffect";

interface Props {
	game: Game;
	picked?: string;
	onPick: (abbr: string) => void;
	/** Line text to show, e.g. the frozen ATS spread. Defaults to the feed's line. */
	lineText?: string | null;
	/** Names of other members who picked each team (shown once the game locks). */
	others?: Record<string, string[]>;
	footer?: ReactNode;
	/** Says which picks here the commissioner entered for someone. */
	note?: string | null;
	/** Lock of the Week control for your pick in this game. */
	lock?: { on: boolean; onToggle: () => void } | null;
	/** A result effect to play once; cleared through onEffectDone. */
	effect?: EffectKind | null;
	onEffectDone?: () => void;
	/** Who won by picking against 80%+ of ESPN, once the game is final. */
	faded?: { crowd: number; names: string[] } | null;
	/** Home line frozen at kickoff, shown in the details sheet for ATS leagues. */
	lockedSpread?: number | null;
	/** Off for made-up games (the practice week), which have no ESPN details. */
	details?: boolean;
	/** Point out the details button to players who haven't tried it yet. */
	newDetails?: boolean;
	/** How your pick went under the league's scoring, and what it earned. */
	outcome?: PickOutcome | null;
	points?: number | null;
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
	note,
	lock,
	effect,
	onEffectDone,
	faded,
	lockedSpread,
	details: hasDetails = true,
	newDetails = false,
	outcome,
	points,
}: Props) {
	const [details, setDetails] = useState(false);
	const detailsDot = useNewDot("game-details", hasDetails && newDetails);
	const line = lineText === undefined ? game.spreadText : lineText;
	const locked = game.state !== "pre";
	// Once a game is final the side that lost fades back, unless it's your
	// pick: that one keeps its color and wears its result instead.
	const final = game.state === "post";
	const awayLost = final && game.awayScore < game.homeScore;
	const homeLost = final && game.homeScore < game.awayScore;
	const result = final && outcome && outcome !== "pending" ? outcome : null;
	const pickedTeam =
		picked === game.home.abbr
			? game.home
			: picked === game.away.abbr
				? game.away
				: null;
	const theme = useResolvedTheme();
	const effectColors = pickedTeam
		? [accentColors(pickedTeam, theme).accent, pickedTeam.altColor]
		: [];
	const cardFx = cardEffect(
		effect,
		effectColors[0] ?? (theme === "dark" ? "#ffffff" : "#000000"),
	);
	return (
		<motion.article
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0, x: 0, scale: 1, ...cardFx }}
			transition={{
				type: "spring",
				stiffness: 260,
				damping: 26,
				...cardFx?.transition,
			}}
			className={cn(
				"relative overflow-hidden rounded-lg border",
				locked
					? "bg-card/40 bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklab,var(--foreground)_7%,transparent)_9px_11px)]"
					: "bg-card shadow-sm",
			)}
		>
			<div className="flex items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
				{locked ? (
					<StatusPill live={game.state === "in"} text={game.statusText} />
				) : (
					<span>{formatKickoff(game.kickoff)}</span>
				)}
				<span className="flex items-center gap-2">
					{lock && (
						<LockToggle on={lock.on} locked={locked} onToggle={lock.onToggle} />
					)}
					{line && <span>{line}</span>}
					{hasDetails && (
						<button
							type="button"
							onClick={() => {
								detailsDot.dismiss();
								setDetails(true);
							}}
							aria-label={`${game.away.abbr} at ${game.home.abbr} details`}
							title="Injuries, weather and line movement"
							className="relative -my-1 -mr-1.5 grid size-7 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
						>
							<Info className="size-4" aria-hidden />
							<NewDot show={detailsDot.show} className="top-0 right-0" />
						</button>
					)}
				</span>
			</div>
			<div className="grid grid-cols-2 gap-2 p-3">
				<TeamButton
					team={game.away}
					score={game.awayScore}
					showScore={game.state !== "pre"}
					selected={picked === game.away.abbr}
					disabled={locked}
					lostGame={awayLost}
					result={
						picked !== game.away.abbr
							? null
							: (result ?? (locked ? "pending" : null))
					}
					points={points}
					onClick={() => onPick(game.away.abbr)}
					label="Away"
				/>
				<TeamButton
					team={game.home}
					score={game.homeScore}
					showScore={game.state !== "pre"}
					selected={picked === game.home.abbr}
					disabled={locked}
					lostGame={homeLost}
					result={
						picked !== game.home.abbr
							? null
							: (result ?? (locked ? "pending" : null))
					}
					points={points}
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
			{faded && <FadedCallout crowd={faded.crowd} names={faded.names} />}
			{others &&
			(others[game.away.abbr]?.length || others[game.home.abbr]?.length) ? (
				<div className="grid grid-cols-2 gap-2 px-3 pb-3 text-xs text-muted-foreground">
					<span className="truncate">{others[game.away.abbr]?.join(", ")}</span>
					<span className="truncate">{others[game.home.abbr]?.join(", ")}</span>
				</div>
			) : null}
			{note && (
				<p className="flex items-center gap-1.5 px-4 pb-3 text-xs text-muted-foreground">
					<PencilLine className="size-3.5 shrink-0" aria-hidden />
					{note}
				</p>
			)}
			{footer}
			{hasDetails && (
				<GameDetailsSheet
					game={game}
					open={details}
					onClose={() => setDetails(false)}
					lockedSpread={lockedSpread}
				/>
			)}
			{effect && onEffectDone && (
				<PickEffect
					key={effect}
					kind={effect}
					colors={effectColors}
					onDone={onEffectDone}
				/>
			)}
		</motion.article>
	);
}

/** Marks your pick as your Lock of the Week; read-only once the game starts. */
function LockToggle({
	on,
	locked,
	onToggle,
}: {
	on: boolean;
	locked: boolean;
	onToggle: () => void;
}) {
	if (locked && !on) return null;
	const content = (
		<>
			<motion.span
				key={String(on)}
				initial={on ? { scale: 0.4, rotate: -90 } : false}
				animate={{ scale: 1, rotate: 0 }}
				transition={{ type: "spring", stiffness: 500, damping: 18 }}
				className="inline-flex"
			>
				<Star className={cn("size-3", on && "fill-current")} aria-hidden />
			</motion.span>
			{on ? "Lock of the week" : "Lock"}
		</>
	);
	const style = cn(
		"-my-1 inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-semibold transition-colors",
		on
			? "border-amber-500/50 bg-amber-400/15 text-amber-700 dark:border-amber-400/50 dark:text-amber-300"
			: "border-border text-muted-foreground hover:text-foreground",
	);
	if (locked) return <span className={style}>{content}</span>;
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={on}
			title={on ? "Remove your lock" : "Make this your Lock of the Week"}
			className={style}
		>
			{content}
		</button>
	);
}

/** Replaces the kickoff time once a game starts: a pulsing Live tag, or a quiet locked Final. */
function StatusPill({ live, text }: { live: boolean; text: string }) {
	return (
		<span className="-my-0.5 inline-flex items-center gap-1.5 rounded-full border bg-muted/60 py-0.5 pr-2.5 pl-2 font-semibold text-foreground/80">
			{live ? (
				<span className="relative flex size-2">
					<span className="absolute inline-flex size-full animate-ping rounded-full bg-loss opacity-60" />
					<span className="relative inline-flex size-2 rounded-full bg-loss" />
				</span>
			) : (
				<Lock className="size-3" aria-hidden />
			)}
			{text}
			<span className="sr-only">, picks locked</span>
		</span>
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
	// Both themes' colors go out as variables; CSS shows the right pair, so
	// server-rendered bars match whichever theme the page loads in.
	const light = splitColors(away, home, "light");
	const dark = splitColors(away, home, "dark");
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
			<div
				className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted"
				style={
					{
						"--away-light": light.away,
						"--away-dark": dark.away,
						"--home-light": light.home,
						"--home-dark": dark.home,
					} as React.CSSProperties
				}
			>
				<motion.span
					className="h-full rounded-l-full bg-(--away-light) dark:bg-(--away-dark)"
					initial={{ width: 0 }}
					animate={{ width: `${split.away}%` }}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
				<motion.span
					className="ml-auto h-full rounded-r-full bg-(--home-light) dark:bg-(--home-dark)"
					initial={{ width: 0 }}
					animate={{ width: `${split.home}%` }}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
			</div>
		</div>
	);
}

/** A quiet nod to whoever won against a lopsided ESPN crowd. */
function FadedCallout({ crowd, names }: { crowd: number; names: string[] }) {
	const who =
		names.length > 1
			? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
			: names[0];
	return (
		<motion.p
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 24 }}
			className="mx-3 mb-3 flex items-start gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs text-muted-foreground"
		>
			<Sparkles className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
			<span>
				<span className="font-semibold text-foreground">Faded the public.</span>{" "}
				{who} won against {crowd}% of ESPN.
			</span>
		</motion.p>
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

const RESULT_TEXT: Record<PickOutcome, string> = {
	pending: "Your pick",
	win: "Won",
	loss: "Lost",
	push: "Push",
};

function TeamButton({
	team,
	score,
	showScore,
	selected,
	disabled,
	lostGame,
	result,
	points,
	onClick,
	label,
}: {
	team: Team;
	score: number;
	showScore: boolean;
	selected: boolean;
	disabled: boolean;
	/** This team lost the game outright (final only). */
	lostGame: boolean;
	/** Set on your pick once picks lock: still going, or how it went. */
	result: PickOutcome | null;
	points?: number | null;
	onClick: () => void;
	label: string;
}) {
	const earned =
		(result === "win" || result === "push") && points ? ` · +${points}` : "";
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
					: disabled
						? "border-border/60"
						: "border-border hover:border-muted-foreground/40",
				disabled && "cursor-default",
				// The team you didn't pick that lost steps back; your pick never does.
				!selected && lostGame && "opacity-50 saturate-50",
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
						<ResultBadge
							show={selected}
							result={result}
							className="absolute -right-2 -bottom-1.5 size-5 sm:hidden"
						/>
					</span>
				)}
				{showScore && (
					<span
						className={cn(
							"relative font-display text-2xl font-bold tabular-nums sm:order-last",
							selected && lostGame && "opacity-60",
						)}
					>
						{score}
					</span>
				)}
			</span>
			<span className="relative w-full min-w-0 flex-1 sm:w-auto">
				{selected && result ? (
					<span
						className={cn(
							"block text-[10px] font-semibold uppercase tracking-wider",
							result === "pending" && "opacity-80",
						)}
					>
						{RESULT_TEXT[result]}
						{earned}
					</span>
				) : (
					<span className="block text-[10px] uppercase tracking-wider opacity-70">
						{label}
					</span>
				)}
				<span className="block truncate font-display text-lg font-semibold leading-tight">
					{team.shortName}
				</span>
				{team.record && (
					<span className="block text-xs opacity-70">{team.record}</span>
				)}
			</span>
			<ResultBadge
				show={selected}
				result={result}
				className={cn(
					"size-6 sm:order-last",
					team.logo ? "hidden sm:grid" : "absolute top-2 right-2 sm:static",
				)}
			/>
		</motion.button>
	);
}

/** A white check on your pick; once final, a green check, red X or gray equals. */
function ResultBadge({
	show,
	result,
	className,
}: {
	show: boolean;
	result: PickOutcome | null;
	className?: string;
}) {
	const settled = result && result !== "pending" ? result : null;
	const Icon = settled === "loss" ? X : settled === "push" ? Equal : Check;
	return (
		<AnimatePresence>
			{show && (
				<motion.span
					key={settled ?? "pick"}
					initial={{ scale: 0, rotate: -45 }}
					animate={{ scale: 1, rotate: 0 }}
					exit={{ scale: 0 }}
					className={cn(
						"relative grid place-items-center rounded-full shadow",
						settled === "win"
							? "bg-win text-white ring-2 ring-white"
							: settled === "loss"
								? "bg-loss text-white ring-2 ring-white"
								: settled === "push"
									? "bg-zinc-500 text-white ring-2 ring-white"
									: "bg-white/90 text-black",
						className,
					)}
				>
					<Icon className="size-[70%]" strokeWidth={3} aria-hidden />
					{settled && <span className="sr-only">{RESULT_TEXT[settled]}</span>}
				</motion.span>
			)}
		</AnimatePresence>
	);
}
