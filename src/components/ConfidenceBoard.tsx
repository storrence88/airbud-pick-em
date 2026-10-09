import { ChevronDown, ChevronUp, GripVertical, Lock } from "lucide-react";
import {
	AnimatePresence,
	motion,
	Reorder,
	useDragControls,
} from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	type ConfidenceChange,
	move,
	type RankedPick,
	rankOrder,
	reassign,
} from "#/lib/confidence";
import type { Game } from "#/lib/nfl/types";
import { cn } from "#/lib/utils";

interface Props {
	games: Game[];
	/** The user's picks this week, by game id. */
	picks: Map<string, { team: string; confidence: number | null }>;
	onRerank: (changes: ConfidenceChange[]) => void;
	className?: string;
}

const spring = { type: "spring", stiffness: 500, damping: 40 } as const;

/**
 * The user's picks ranked by confidence, most sure on top. Dragging (or the
 * arrows) reorders the games while the point values stay in their slots, so a
 * value can never be given to two games.
 */
export function ConfidenceBoard({ games, picks, onRerank, className }: Props) {
	const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
	const ranked: RankedPick[] = useMemo(
		() =>
			games.flatMap((g) => {
				const p = picks.get(g.id);
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
		[games, picks],
	);
	const savedOrder = useMemo(() => rankOrder(ranked), [ranked]);
	const [order, setOrder] = useState(savedOrder);
	const dragging = useRef(false);
	const latest = useRef(order);
	latest.current = order;

	// Follow saved changes (a new pick, a refetch) unless a drag is in flight.
	useEffect(() => {
		if (!dragging.current) setOrder(savedOrder);
	}, [savedOrder]);

	const slotValues = useMemo(
		() =>
			ranked
				.filter((p) => !p.locked && p.confidence != null)
				.map((p) => p.confidence as number)
				.sort((a, b) => b - a),
		[ranked],
	);
	const locked = ranked
		.filter((p) => p.locked && p.confidence != null)
		.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
	const used = new Set(ranked.map((p) => p.confidence));
	const unpicked = games.filter((g) => g.state === "pre" && !picks.has(g.id));

	function commit(next: string[]) {
		setOrder(next);
		const changes = reassign(next, ranked);
		if (changes.length) onRerank(changes);
	}

	return (
		<section
			className={cn(
				"rounded-lg border bg-card p-3 shadow-sm sm:p-4",
				className,
			)}
			aria-labelledby="confidence-heading"
		>
			<h3
				id="confidence-heading"
				className="font-display text-xl font-semibold uppercase"
			>
				Confidence ranking
			</h3>
			<p className="mt-1 text-sm text-muted-foreground">
				Drag your surest pick to the top. Each point value is used once.
			</p>

			<ValueStrip count={games.length} used={used} />

			{order.length === 0 && locked.length === 0 && (
				<p className="mt-6 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
					Pick a winner and it lands here, ready to rank.
				</p>
			)}

			<Reorder.Group
				axis="y"
				values={order}
				onReorder={setOrder}
				className="mt-4 grid gap-2"
			>
				{order.map((id, i) => {
					const game = byId.get(id);
					const pick = picks.get(id);
					if (!game || !pick) return null;
					return (
						<Row
							key={id}
							id={id}
							game={game}
							team={pick.team}
							value={slotValues[i]}
							max={games.length}
							first={i === 0}
							last={i === order.length - 1}
							onDragStart={() => {
								dragging.current = true;
							}}
							onDragEnd={() => {
								dragging.current = false;
								commit(latest.current);
							}}
							onMove={(delta) => commit(move(order, id, delta))}
						/>
					);
				})}
			</Reorder.Group>

			<AnimatePresence>
				{unpicked.length > 0 && order.length > 0 && (
					<motion.p
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						className="mt-3 text-xs text-muted-foreground"
					>
						{unpicked.length === 1
							? "1 game still needs a pick."
							: `${unpicked.length} games still need a pick.`}{" "}
						New picks start at the lowest open value.
					</motion.p>
				)}
			</AnimatePresence>

			{locked.length > 0 && (
				<div className="mt-5">
					<div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						<Lock className="size-3" /> Locked in
					</div>
					<ul className="mt-2 grid gap-1.5">
						{locked.map((p) => {
							const game = byId.get(p.gameId);
							const team = picks.get(p.gameId)?.team;
							if (!game || !team) return null;
							return (
								<li
									key={p.gameId}
									className="flex items-center gap-3 rounded-md bg-muted/60 px-3 py-1.5 text-sm text-muted-foreground"
								>
									<span className="w-7 text-center font-display text-lg font-bold tabular-nums">
										{p.confidence}
									</span>
									<Matchup game={game} team={team} />
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</section>
	);
}

function Row({
	id,
	game,
	team,
	value,
	max,
	first,
	last,
	onDragStart,
	onDragEnd,
	onMove,
}: {
	id: string;
	game: Game;
	team: string;
	value: number;
	max: number;
	first: boolean;
	last: boolean;
	onDragStart: () => void;
	onDragEnd: () => void;
	onMove: (delta: -1 | 1) => void;
}) {
	const controls = useDragControls();
	const picked = team === game.home.abbr ? game.home : game.away;
	// Higher values glow brighter.
	const strength = max > 1 ? (value - 1) / (max - 1) : 1;
	return (
		<Reorder.Item
			value={id}
			dragListener={false}
			dragControls={controls}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			layout="position"
			transition={spring}
			whileDrag={{
				scale: 1.03,
				boxShadow: "0 12px 32px -8px rgb(0 0 0 / 0.35)",
				zIndex: 10,
			}}
			className="relative flex items-center gap-2 rounded-md border bg-background py-1.5 pr-1.5 pl-1"
		>
			<button
				type="button"
				aria-label={`Drag ${picked.shortName} to rerank`}
				onPointerDown={(e) => controls.start(e)}
				className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
			>
				<GripVertical className="size-4" />
			</button>
			<motion.span
				key={value}
				initial={{ scale: 0.6, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				transition={spring}
				className="grid size-10 shrink-0 place-items-center rounded-md font-display text-xl font-bold tabular-nums text-primary-foreground"
				style={{
					background: `color-mix(in oklab, var(--primary) ${35 + strength * 65}%, var(--muted-foreground))`,
				}}
				aria-label={`${value} points`}
			>
				{value}
			</motion.span>
			{picked.logo && (
				<img src={picked.logo} alt="" className="size-8 shrink-0" />
			)}
			<Matchup game={game} team={team} />
			{/* Side by side and thumb-sized on phones, stacked and compact on wider screens. */}
			<div className="ml-auto flex shrink-0 sm:flex-col">
				<button
					type="button"
					aria-label={`Move ${picked.shortName} up`}
					disabled={first}
					onClick={() => onMove(-1)}
					className="grid size-9 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted disabled:opacity-25 sm:h-5 sm:w-7"
				>
					<ChevronUp className="size-4" />
				</button>
				<button
					type="button"
					aria-label={`Move ${picked.shortName} down`}
					disabled={last}
					onClick={() => onMove(1)}
					className="grid size-9 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted disabled:opacity-25 sm:h-5 sm:w-7"
				>
					<ChevronDown className="size-4" />
				</button>
			</div>
		</Reorder.Item>
	);
}

function Matchup({ game, team }: { game: Game; team: string }) {
	const opponent = team === game.home.abbr ? game.away : game.home;
	const picked = team === game.home.abbr ? game.home : game.away;
	return (
		<span className="min-w-0 leading-tight">
			<span className="block truncate font-semibold">{picked.shortName}</span>
			<span className="block truncate text-xs text-muted-foreground">
				{team === game.home.abbr ? "vs" : "at"} {opponent.shortName}
			</span>
		</span>
	);
}

/** 1..N pills, filled once a value is spoken for. */
function ValueStrip({
	count,
	used,
}: {
	count: number;
	used: Set<number | null>;
}) {
	return (
		<div className="mt-3 flex flex-wrap gap-1" aria-hidden>
			{Array.from({ length: count }, (_, i) => count - i).map((v) => (
				<motion.span
					key={v}
					animate={{
						backgroundColor: used.has(v) ? "var(--primary)" : "var(--muted)",
						color: used.has(v)
							? "var(--primary-foreground)"
							: "var(--muted-foreground)",
					}}
					transition={{ duration: 0.2 }}
					className="grid h-6 min-w-6 place-items-center rounded px-1 text-[11px] font-semibold tabular-nums"
				>
					{v}
				</motion.span>
			))}
		</div>
	);
}
