import { useQuery } from "@tanstack/react-query";
import {
	ArrowRight,
	CloudSun,
	Droplets,
	MapPin,
	Thermometer,
	Wind,
	X,
} from "lucide-react";
import {
	AnimatePresence,
	motion,
	type PanInfo,
	useDragControls,
} from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
	GameDetails as Details,
	FormGame,
	Injury,
	LineMove,
} from "#/lib/nfl/espn-summary";
import type { Game, Team } from "#/lib/nfl/types";
import { cn } from "#/lib/utils";
import { gameDetailsQuery } from "#/server/games";
import { CommentComposer, CommentList, useComments } from "./GameComments";

export type SheetTab = "details" | "comments";

interface Props {
	game: Game;
	open: boolean;
	onClose: () => void;
	/** Home line frozen at kickoff for ATS leagues. */
	lockedSpread?: number | null;
	/** Which tab to open on, when the league has comments. */
	tab?: SheetTab;
}

/** "GB -3" style text from the home team's line. */
export function homeLineText(line: number, home: Team, away: Team) {
	if (line === 0) return "EVEN";
	return line < 0 ? `${home.abbr} ${line}` : `${away.abbr} -${line}`;
}

function useIsDesktop() {
	const [desktop, setDesktop] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(min-width: 640px)");
		setDesktop(mq.matches);
		const on = () => setDesktop(mq.matches);
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);
	return desktop;
}

/**
 * Injuries, weather, line movement and form for one game, plus the league's
 * comments on it. A bottom sheet on phones (drag the handle down to close) and
 * a side panel on wider screens. Shows only ESPN data and comments, never
 * anyone's picks.
 */
export function GameDetailsSheet({
	game,
	open,
	onClose,
	lockedSpread,
	tab: openTab = "details",
}: Props) {
	const desktop = useIsDesktop();
	const comments = useComments();
	const [tab, setTab] = useState<SheetTab>(openTab);
	useEffect(() => {
		if (open) setTab(openTab);
	}, [open, openTab]);
	const showComments = !!comments && tab === "comments";
	const drag = useDragControls();
	const titleId = useId();
	const closeRef = useRef<HTMLButtonElement>(null);
	// Cards re-render on every live refresh; keep the latest close handler
	// without re-running the open effect (which would steal focus).
	const closeLatest = useRef(onClose);
	closeLatest.current = onClose;

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) =>
			e.key === "Escape" && closeLatest.current();
		document.addEventListener("keydown", onKey);
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		closeRef.current?.focus();
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
		};
	}, [open]);

	if (typeof document === "undefined") return null;
	const hidden = desktop ? { x: "100%" } : { y: "100%" };
	return createPortal(
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-50">
					<motion.div
						className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						initial={hidden}
						animate={{ x: 0, y: 0 }}
						exit={hidden}
						transition={{ type: "spring", stiffness: 380, damping: 38 }}
						drag={desktop ? false : "y"}
						dragControls={drag}
						dragListener={false}
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0, bottom: 0.6 }}
						onDragEnd={(_: unknown, info: PanInfo) => {
							if (info.offset.y > 100 || info.velocity.y > 500) onClose();
						}}
						className={cn(
							"absolute flex flex-col border bg-card text-card-foreground shadow-2xl",
							"inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl",
							"sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-2xl",
						)}
					>
						<div
							className="flex shrink-0 touch-none justify-center pt-2.5 pb-1 sm:hidden"
							onPointerDown={(e) => drag.start(e)}
						>
							<span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
						</div>
						<Header
							game={game}
							titleId={titleId}
							closeRef={closeRef}
							onClose={onClose}
						/>
						{comments && (
							<Tabs
								tab={tab}
								onTab={setTab}
								count={comments.byGame.get(game.id)?.length ?? 0}
							/>
						)}
						<div
							className={cn(
								"flex-1 overflow-y-auto overscroll-contain px-5 pt-1",
								showComments
									? "pt-4"
									: "pb-[calc(env(safe-area-inset-bottom)+1.5rem)]",
							)}
						>
							{showComments ? (
								<CommentList gameId={game.id} />
							) : (
								<Body game={game} lockedSpread={lockedSpread} />
							)}
						</div>
						{showComments && <CommentComposer gameId={game.id} />}
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
}

function Tabs({
	tab,
	onTab,
	count,
}: {
	tab: SheetTab;
	onTab: (t: SheetTab) => void;
	count: number;
}) {
	const tabs: { id: SheetTab; label: string }[] = [
		{ id: "details", label: "Details" },
		{ id: "comments", label: count ? `Comments · ${count}` : "Comments" },
	];
	return (
		<div
			role="tablist"
			aria-label="Game sheet"
			className="mx-5 flex shrink-0 rounded-full bg-muted p-1 text-sm font-semibold"
		>
			{tabs.map((t) => (
				<button
					key={t.id}
					type="button"
					role="tab"
					aria-selected={tab === t.id}
					onClick={() => onTab(t.id)}
					className={cn(
						"relative h-8 flex-1 rounded-full transition-colors",
						tab === t.id
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{tab === t.id && (
						<motion.span
							layoutId="game-sheet-tab"
							className="absolute inset-0 rounded-full bg-background shadow-sm"
							transition={{ type: "spring", stiffness: 500, damping: 38 }}
						/>
					)}
					<span className="relative">{t.label}</span>
				</button>
			))}
		</div>
	);
}

function kickoffText(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function Header({
	game,
	titleId,
	closeRef,
	onClose,
}: {
	game: Game;
	titleId: string;
	closeRef: React.RefObject<HTMLButtonElement | null>;
	onClose: () => void;
}) {
	return (
		<div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-2 pb-4 sm:pt-5">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					{game.away.logo && (
						<img src={game.away.logo} alt="" className="size-8" />
					)}
					<h2
						id={titleId}
						className="font-display text-xl font-semibold uppercase"
					>
						{game.away.abbr} <span className="text-muted-foreground">@</span>{" "}
						{game.home.abbr}
					</h2>
					{game.home.logo && (
						<img src={game.home.logo} alt="" className="size-8" />
					)}
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{game.state === "pre" ? kickoffText(game.kickoff) : game.statusText}
				</p>
			</div>
			<button
				ref={closeRef}
				type="button"
				onClick={onClose}
				aria-label="Close game details"
				className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<X className="size-5" />
			</button>
		</div>
	);
}

function Body({
	game,
	lockedSpread,
}: {
	game: Game;
	lockedSpread?: number | null;
}) {
	const { data, isPending, isError } = useQuery(gameDetailsQuery(game));
	return (
		<div className="space-y-6">
			{isPending ? (
				<Loading />
			) : isError ? (
				<p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
					Couldn&apos;t load details from ESPN right now.
				</p>
			) : (
				<>
					{data.line && (
						<LineSection
							line={data.line}
							game={game}
							lockedSpread={lockedSpread}
						/>
					)}
					{(data.weather || data.venue) && <WeatherSection details={data} />}
				</>
			)}
			<RecordSection game={game} form={data?.form} />
			{data && (data.injuries.away.length || data.injuries.home.length) ? (
				<InjurySection game={game} injuries={data.injuries} />
			) : null}
			{data && (
				<p className="text-center text-[11px] text-muted-foreground">
					From ESPN
					{data.line?.provider ? `, lines from ${data.line.provider}` : ""}.
				</p>
			)}
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 30 }}
		>
			<h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				{title}
			</h3>
			{children}
		</motion.section>
	);
}

function Loading() {
	return (
		<div className="space-y-3">
			<span className="sr-only">Loading game details</span>
			{[0, 1, 2].map((i) => (
				<div key={i} className="h-14 animate-pulse rounded-lg bg-muted/70" />
			))}
		</div>
	);
}

function LineSection({
	line,
	game,
	lockedSpread,
}: {
	line: LineMove;
	game: Game;
	lockedSpread?: number | null;
}) {
	const rows: ReactNode[] = [];
	if (line.current != null) {
		rows.push(
			<LineRow
				key="spread"
				label="Spread"
				open={
					line.open != null
						? homeLineText(line.open, game.home, game.away)
						: null
				}
				now={homeLineText(line.current, game.home, game.away)}
			/>,
		);
	}
	if (line.totalCurrent != null) {
		rows.push(
			<LineRow
				key="total"
				label="Total"
				open={line.totalOpen != null ? `O/U ${line.totalOpen}` : null}
				now={`O/U ${line.totalCurrent}`}
			/>,
		);
	}
	return (
		<Section title="Line movement">
			<div className="divide-y rounded-lg border">{rows}</div>
			{lockedSpread != null && (
				<p className="mt-2 text-xs text-muted-foreground">
					Your league scores this game at{" "}
					<span className="font-semibold text-foreground">
						{homeLineText(lockedSpread, game.home, game.away)}
					</span>
					, the line at kickoff.
				</p>
			)}
		</Section>
	);
}

function LineRow({
	label,
	open,
	now,
}: {
	label: string;
	open: string | null;
	now: string;
}) {
	const moved = open != null && open !== now;
	return (
		<div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="flex items-center gap-2 tabular-nums">
				{moved ? (
					<>
						<span className="text-muted-foreground">{open}</span>
						<ArrowRight
							className="size-3.5 text-muted-foreground"
							aria-label="moved to"
						/>
						<span className="font-semibold">{now}</span>
					</>
				) : (
					<>
						<span className="font-semibold">{now}</span>
						{open != null && (
							<span className="text-xs text-muted-foreground">since open</span>
						)}
					</>
				)}
			</span>
		</div>
	);
}

function WeatherSection({ details }: { details: Details }) {
	const { weather: w, venue } = details;
	return (
		<Section title={w ? "Weather" : "Venue"}>
			{w && (
				<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
					{w.temp != null && (
						<span className="flex items-center gap-1.5">
							<Thermometer className="size-4 text-muted-foreground" />
							<span className="font-display text-2xl font-semibold tabular-nums">
								{w.temp}°
							</span>
						</span>
					)}
					{w.condition && (
						<span className="flex items-center gap-1.5">
							<CloudSun className="size-4 text-muted-foreground" />
							{w.condition}
						</span>
					)}
					{w.wind != null && w.wind > 0 && (
						<span className="flex items-center gap-1.5 text-muted-foreground">
							<Wind className="size-4" />
							{w.wind} mph gusts
						</span>
					)}
					{w.precip != null && w.precip > 0 && (
						<span className="flex items-center gap-1.5 text-muted-foreground">
							<Droplets className="size-4" />
							{w.precip}%
						</span>
					)}
				</div>
			)}
			{venue && (
				<p
					className={cn(
						"flex items-center gap-1.5 text-xs text-muted-foreground",
						w && "mt-2",
					)}
				>
					<MapPin className="size-3.5 shrink-0" />
					{venue.name}
					{venue.place && ` · ${venue.place}`}
				</p>
			)}
		</Section>
	);
}

function RecordSection({ game, form }: { game: Game; form?: Details["form"] }) {
	const sides = [
		{
			team: game.away,
			split: game.away.roadRecord,
			where: "road",
			form: form?.away,
		},
		{
			team: game.home,
			split: game.home.homeRecord,
			where: "home",
			form: form?.home,
		},
	];
	if (!sides.some((s) => s.team.record || s.form?.length)) return null;
	return (
		<Section title="Record">
			<div className="grid grid-cols-2 gap-2">
				{sides.map(({ team, split, where, form }) => (
					<div key={team.abbr} className="rounded-lg border px-3 py-2.5">
						<div className="text-xs text-muted-foreground">
							{team.shortName}
						</div>
						{team.record && (
							<div className="font-display text-2xl font-semibold tabular-nums">
								{team.record}
							</div>
						)}
						{split && (
							<div className="text-xs text-muted-foreground">
								{split} {where}
							</div>
						)}
						{form && form.length > 0 && <FormDots games={form} />}
					</div>
				))}
			</div>
		</Section>
	);
}

/** Most recent game on the right. */
function FormDots({ games }: { games: FormGame[] }) {
	return (
		<ul className="mt-2 flex gap-1" aria-label="Recent results">
			{games.map((g, i) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: results have no id and never reorder
					key={i}
					title={`${g.result} ${g.score} ${g.opponent}`}
					className={cn(
						"grid size-5 place-items-center rounded text-[10px] font-bold",
						g.result === "W"
							? "bg-win/20 text-win"
							: g.result === "L"
								? "bg-loss/15 text-loss"
								: "bg-muted text-muted-foreground",
					)}
				>
					{g.result}
					<span className="sr-only">
						{" "}
						{g.score} {g.opponent}
					</span>
				</li>
			))}
		</ul>
	);
}

const PREVIEW = 5;

function InjurySection({
	game,
	injuries,
}: {
	game: Game;
	injuries: Details["injuries"];
}) {
	return (
		<Section title="Injuries">
			<div className="space-y-4">
				{[
					{ team: game.away, list: injuries.away },
					{ team: game.home, list: injuries.home },
				].map(({ team, list }) =>
					list.length ? (
						<InjuryList key={team.abbr} team={team} list={list} />
					) : null,
				)}
			</div>
		</Section>
	);
}

function InjuryList({ team, list }: { team: Team; list: Injury[] }) {
	const [all, setAll] = useState(false);
	const shown = all ? list : list.slice(0, PREVIEW);
	return (
		<div>
			<div className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
				{team.logo && <img src={team.logo} alt="" className="size-4" />}
				{team.shortName}
			</div>
			<ul className="divide-y text-sm">
				{shown.map((i) => (
					<li
						key={`${i.name}-${i.position}`}
						className="flex items-center justify-between gap-3 py-2"
					>
						<span className="min-w-0">
							<span className="font-medium">{i.name}</span>{" "}
							<span className="text-xs text-muted-foreground">
								{i.position}
								{i.detail && ` · ${i.detail}`}
							</span>
						</span>
						<StatusChip status={i.status} />
					</li>
				))}
			</ul>
			{list.length > PREVIEW && (
				<button
					type="button"
					onClick={() => setAll(!all)}
					className="mt-1 text-xs font-semibold text-primary hover:underline"
				>
					{all ? "Show fewer" : `Show all ${list.length}`}
				</button>
			)}
		</div>
	);
}

function StatusChip({ status }: { status: string }) {
	const s = status.toLowerCase();
	const tone =
		s === "out" || s === "injured reserve"
			? "bg-loss/15 text-loss"
			: s === "doubtful"
				? "bg-amber-400/15 text-amber-600 dark:text-amber-300"
				: "bg-muted text-muted-foreground";
	const short = s === "injured reserve" ? "IR" : status;
	return (
		<span
			title={status}
			className={cn(
				"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
				tone,
			)}
		>
			{short}
		</span>
	);
}
