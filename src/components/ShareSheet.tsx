import { Check, Copy, Download, Image, Share2, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { PublicProfile } from "#/lib/profile";
import { type CardPlayer, loadPhoto } from "#/lib/share-card-draw";

/** One thing the sheet can share: an image, the text that rides along, and its file name. */
export interface ShareView {
	id: string;
	/** Tab label; tabs only show when there's more than one view. */
	label: string;
	text: string;
	fileName: string;
	width: number;
	height: number;
	render: () => Promise<Blob>;
	/** Why this view can't be picked right now. */
	disabled?: string | null;
}

export async function withPhoto(p: PublicProfile): Promise<CardPlayer> {
	return {
		...p,
		photo: p.avatar_kind === "photo" ? await loadPhoto(p.avatar_url) : null,
	};
}

function toBlob(canvas: HTMLCanvasElement) {
	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))),
			"image/png",
		),
	);
}

/** A canvas to draw on, handed to `draw`, then turned into a PNG. */
export function paint(
	width: number,
	height: number,
	draw: (ctx: CanvasRenderingContext2D) => void,
) {
	const c = document.createElement("canvas");
	c.width = width;
	c.height = height;
	const ctx = c.getContext("2d");
	if (!ctx) throw new Error("Couldn't draw the card on this browser.");
	draw(ctx);
	return toBlob(c);
}

/**
 * The share sheet: a preview of the image, the text under it, and Copy text /
 * Copy image (or Share on phones that can't copy images). Used for the week
 * and for the season standings.
 */
export function ShareSheet({
	title,
	views,
	initial,
	onChoose,
	onClose,
}: {
	title: string;
	views: ShareView[];
	initial: string;
	onChoose?: (id: string) => void;
	onClose: () => void;
}) {
	const [tab, setTab] = useState(initial);
	const view = views.find((v) => v.id === tab) ?? views[0];
	const [images, setImages] = useState<
		Partial<Record<string, { blob: Blob; url: string }>>
	>({});
	const [error, setError] = useState("");
	const [copied, setCopied] = useState<"text" | "image" | null>(null);

	function choose(id: string) {
		setTab(id);
		setError("");
		onChoose?.(id);
	}

	// Draw the image for the view you're on, once.
	const have = !!images[view.id];
	const render = useRef(view.render);
	render.current = view.render;
	useEffect(() => {
		if (have) return;
		let live = true;
		const id = view.id;
		render.current().then(
			(blob) => {
				if (!live) return;
				const url = URL.createObjectURL(blob);
				made.current.push(url);
				setImages((prev) => ({ ...prev, [id]: { blob, url } }));
			},
			(err) => live && setError((err as Error).message),
		);
		return () => {
			live = false;
		};
	}, [view.id, have]);

	// Let go of the images when the sheet closes.
	const made = useRef<string[]>([]);
	useEffect(
		() => () => {
			for (const u of made.current) URL.revokeObjectURL(u);
		},
		[],
	);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const { text, fileName } = view;
	const image = images[view.id];
	const file = image
		? new File([image.blob], fileName, { type: "image/png" })
		: null;
	const canShare =
		!!file &&
		typeof navigator !== "undefined" &&
		!!navigator.canShare?.({ files: [file] });
	const canCopyImage =
		typeof window !== "undefined" &&
		"ClipboardItem" in window &&
		!!navigator.clipboard?.write;

	function flash(what: "text" | "image") {
		setCopied(what);
		setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
	}

	async function copyText() {
		try {
			await navigator.clipboard.writeText(text);
			flash("text");
		} catch {
			setError("Couldn't copy the text here. Select it and copy instead.");
		}
	}

	async function copyImage() {
		if (!image) return;
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": image.blob }),
			]);
			flash("image");
		} catch {
			setError("Couldn't copy the image. Try sharing or saving it instead.");
		}
	}

	async function share() {
		if (!file) return;
		try {
			await navigator.share({ files: [file] });
		} catch (err) {
			// Closing the share sheet isn't an error.
			if ((err as Error).name !== "AbortError")
				setError("Sharing didn't work here. Try saving the image instead.");
		}
	}

	const button =
		"flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50";
	const small =
		"flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

	return (
		<motion.div
			className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			onClick={onClose}
		>
			<motion.div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col rounded-lg border bg-card p-4 shadow-2xl"
				initial={{ opacity: 0, y: 16, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 16, scale: 0.98 }}
				transition={{ type: "spring", stiffness: 420, damping: 34 }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between">
					<h2 className="font-display text-xl font-semibold uppercase">
						{title}
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="size-4" aria-hidden />
					</button>
				</div>

				{views.length > 1 && (
					<div
						role="tablist"
						aria-label="What to share"
						className="mt-3 grid rounded-full border bg-muted/40 p-1 text-sm font-semibold"
						style={{
							gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))`,
						}}
					>
						{views.map((v) => (
							<button
								key={v.id}
								type="button"
								role="tab"
								aria-selected={view.id === v.id}
								disabled={!!v.disabled}
								title={v.disabled ?? undefined}
								onClick={() => choose(v.id)}
								className="relative h-9 rounded-full transition-colors disabled:opacity-40"
							>
								{view.id === v.id && (
									<motion.span
										layoutId="share-tab"
										className="absolute inset-0 rounded-full bg-foreground/10 shadow-sm ring-1 ring-foreground/15"
										transition={{ type: "spring", stiffness: 500, damping: 40 }}
									/>
								)}
								<span className="relative">{v.label}</span>
							</button>
						))}
					</div>
				)}

				<div className="mt-3 min-h-0 flex-1 overflow-y-auto">
					<div
						className="overflow-hidden rounded-md bg-muted"
						style={{ aspectRatio: `${view.width} / ${view.height}` }}
					>
						{image ? (
							<img
								src={image.url}
								alt={text}
								className="size-full object-contain"
							/>
						) : (
							!error && <div className="size-full animate-pulse" />
						)}
					</div>
					<pre className="mt-3 whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
						{text}
					</pre>
				</div>

				{error && <p className="mt-2 text-sm text-loss">{error}</p>}
				<div className="mt-3 flex gap-2">
					<button
						type="button"
						onClick={copyText}
						className={`${button} border hover:bg-muted`}
					>
						{copied === "text" ? (
							<Check className="size-4" aria-hidden />
						) : (
							<Copy className="size-4" aria-hidden />
						)}
						{copied === "text" ? "Copied" : "Copy text"}
					</button>
					{canCopyImage ? (
						<button
							type="button"
							onClick={copyImage}
							disabled={!image}
							className={`${button} bg-primary text-primary-foreground`}
						>
							{copied === "image" ? (
								<Check className="size-4" aria-hidden />
							) : (
								<Image className="size-4" aria-hidden />
							)}
							{copied === "image" ? "Copied" : "Copy image"}
						</button>
					) : (
						<button
							type="button"
							onClick={share}
							disabled={!canShare}
							className={`${button} bg-primary text-primary-foreground`}
						>
							<Share2 className="size-4" aria-hidden />
							Share image
						</button>
					)}
				</div>
				<div className="mt-1 flex justify-center gap-1">
					{canCopyImage && canShare && (
						<button type="button" onClick={share} className={small}>
							<Share2 className="size-4" aria-hidden />
							Share
						</button>
					)}
					{image && (
						<a href={image.url} download={fileName} className={small}>
							<Download className="size-4" aria-hidden />
							Save image
						</a>
					)}
				</div>
			</motion.div>
		</motion.div>
	);
}
