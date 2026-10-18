import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { gifUrl } from "#/lib/comments";
import { type Gif, gifSearchQuery } from "#/server/gifs";

/** A GIF in a comment, sized up front so the list doesn't jump while it loads. */
export function GifImage({
	id,
	width,
	height,
	alt = "GIF",
	className,
}: {
	id: string;
	width: number;
	height: number;
	alt?: string;
	className?: string;
}) {
	return (
		<img
			src={gifUrl(id)}
			alt={alt}
			width={width}
			height={height}
			loading="lazy"
			draggable={false}
			style={{ aspectRatio: `${width} / ${height}` }}
			className={className}
		/>
	);
}

/** GIPHY search that opens above the comment box. Trending until you type. */
export function GifPicker({
	onPick,
	onClose,
}: {
	onPick: (gif: Gif) => void;
	onClose: () => void;
}) {
	const [text, setText] = useState("");
	const [q, setQ] = useState("");
	const input = useRef<HTMLInputElement>(null);

	// Search once typing pauses, not on every key.
	useEffect(() => {
		const t = setTimeout(() => setQ(text.trim()), 300);
		return () => clearTimeout(t);
	}, [text]);
	useEffect(() => input.current?.focus({ preventScroll: true }), []);

	const { data, isPending, isError, refetch } = useQuery(gifSearchQuery(q));
	const gifs = data?.gifs ?? [];

	return (
		<motion.div
			initial={{ opacity: 0, y: 10, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: 10, scale: 0.98 }}
			transition={{ type: "spring", stiffness: 420, damping: 32 }}
			className="mb-2 overflow-hidden rounded-xl border bg-card shadow-lg"
		>
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
				<input
					ref={input}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							// Close just the GIFs, not the whole game sheet.
							e.stopPropagation();
							onClose();
						}
					}}
					maxLength={50}
					placeholder="Search GIPHY"
					aria-label="Search GIFs"
					className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
				/>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close GIFs"
					className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<X className="size-4" />
				</button>
			</div>
			<div className="h-64 overflow-y-auto overscroll-contain p-2">
				{data && !data.enabled ? (
					<Note>GIFs aren't switched on for this app yet.</Note>
				) : isError ? (
					<Note>
						Couldn't reach GIPHY.{" "}
						<button
							type="button"
							onClick={() => refetch()}
							className="font-semibold text-primary hover:underline"
						>
							Try again
						</button>
					</Note>
				) : isPending ? (
					<div className="columns-2 gap-2 sm:columns-3">
						{[96, 140, 112, 128, 100, 150].map((h, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
								key={i}
								style={{ height: h }}
								className="mb-2 animate-pulse rounded-lg bg-muted"
							/>
						))}
					</div>
				) : gifs.length === 0 ? (
					<Note>No GIFs for “{q}”. Try something else.</Note>
				) : (
					<div className="columns-2 gap-2 sm:columns-3">
						{gifs.map((g) => (
							<motion.button
								key={g.id}
								type="button"
								whileTap={{ scale: 0.94 }}
								onClick={() => onPick(g)}
								title={g.title}
								aria-label={g.title || "GIF"}
								className="mb-2 block w-full overflow-hidden rounded-lg bg-muted outline-none ring-primary transition-shadow hover:ring-2 focus-visible:ring-2"
							>
								<GifImage
									id={g.id}
									width={g.width}
									height={g.height}
									alt={g.title}
									className="h-auto w-full"
								/>
							</motion.button>
						))}
					</div>
				)}
			</div>
			<p className="border-t px-3 py-1.5 text-right text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
				Powered by GIPHY
			</p>
		</motion.div>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<p className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
			<span>{children}</span>
		</p>
	);
}
