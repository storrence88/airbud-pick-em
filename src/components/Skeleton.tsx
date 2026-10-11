import { cn } from "#/lib/utils";

/** A soft placeholder block that stands in for content while it loads. */
export function Skeleton({ className }: { className?: string }) {
	return (
		<div
			aria-hidden
			className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
		/>
	);
}

/** Shaped like a GameCard: kickoff line on top, two team buttons below. */
export function GameCardSkeleton() {
	return (
		<div className="rounded-lg border bg-card shadow-sm">
			<div className="flex items-center justify-between px-4 pt-3.5">
				<Skeleton className="h-3 w-20" />
				<Skeleton className="h-3 w-12" />
			</div>
			<div className="grid grid-cols-2 gap-2 p-3">
				{[0, 1].map((i) => (
					<div
						key={i}
						className="flex flex-col items-start gap-2 rounded-md border-2 border-border/60 p-3 sm:flex-row sm:items-center sm:gap-3"
					>
						<Skeleton className="size-10 shrink-0 rounded-full" />
						<div className="grid w-full gap-1.5">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function GameGridSkeleton({ count = 6 }: { count?: number }) {
	return (
		<div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-2">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: placeholders never reorder
				<GameCardSkeleton key={i} />
			))}
		</div>
	);
}

/** Rows shaped like the standings list: rank, avatar, name, points. */
export function RowsSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="grid gap-2">
			{Array.from({ length: count }, (_, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: placeholders never reorder
					key={i}
					className="flex items-center gap-3 rounded-lg border bg-card p-4 sm:gap-4"
				>
					<Skeleton className="h-5 w-5 shrink-0" />
					<Skeleton className="size-9 shrink-0 rounded-full" />
					<div className="grid flex-1 gap-1.5">
						<Skeleton className="h-4 w-32 max-w-full" />
						<Skeleton className="h-3 w-20" />
					</div>
					<Skeleton className="h-6 w-10" />
				</div>
			))}
		</div>
	);
}

/** The small colored label and big title most pages open with. */
function HeaderSkeleton({ action }: { action?: boolean }) {
	return (
		<div className="flex items-end justify-between gap-4">
			<div className="grid gap-2">
				<Skeleton className="h-3 w-24" />
				<Skeleton className="h-8 w-56 max-w-[60vw] sm:h-9" />
			</div>
			{action && <Skeleton className="h-10 w-28 rounded-full" />}
		</div>
	);
}

/** While a league's week loads: header, tabs, progress and game cards. */
export function LeaguePageSkeleton() {
	return (
		<main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
			<HeaderSkeleton action />
			<Skeleton className="mt-6 h-11 w-52 rounded-full" />
			<div className="mt-6 flex items-end justify-between">
				<Skeleton className="h-8 w-36 rounded-full" />
				<Skeleton className="h-7 w-14" />
			</div>
			<Skeleton className="mt-2 h-1.5 w-full rounded-full" />
			<GameGridSkeleton />
		</main>
	);
}

/** The leagues list, and a sensible fallback for any other page. */
export function ListPageSkeleton() {
	return (
		<main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
			<HeaderSkeleton action />
			<div className="mt-6 grid gap-3">
				{[0, 1, 2].map((i) => (
					<div key={i} className="grid gap-2 rounded-lg border bg-card p-4">
						<Skeleton className="h-5 w-48 max-w-full" />
						<Skeleton className="h-3.5 w-36" />
					</div>
				))}
			</div>
		</main>
	);
}
