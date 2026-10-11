import { Check, Copy, Download, Share2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { PublicProfile } from "#/lib/profile";
import { type ShareCard, shareText } from "#/lib/share-card";
import {
	CARD_HEIGHT,
	CARD_WIDTH,
	drawShareCard,
	loadCardFonts,
	loadPhoto,
} from "#/lib/share-card-draw";

async function renderCard(card: ShareCard, player: PublicProfile) {
	const [photo] = await Promise.all([
		player.avatar_kind === "photo" ? loadPhoto(player.avatar_url) : null,
		loadCardFonts(),
	]);
	const canvas = document.createElement("canvas");
	canvas.width = CARD_WIDTH;
	canvas.height = CARD_HEIGHT;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Couldn't draw the card on this browser.");
	drawShareCard(ctx, card, { ...player, photo });
	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))),
			"image/png",
		),
	);
}

/**
 * "Share my week": draws your finished week as an image, previews it, then
 * hands it to the phone's share sheet, or copies/downloads it on desktop.
 * The image is made ahead of the Share tap because iOS only opens the share
 * sheet straight from a tap.
 */
export function ShareWeek({
	card,
	player,
}: {
	card: ShareCard;
	player: PublicProfile;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label={`Share your week ${card.week}`}
				className="flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition-colors hover:bg-muted sm:px-3.5"
			>
				<Share2 className="size-4" aria-hidden />
				<span className="hidden sm:inline">Share</span>
			</button>
			<AnimatePresence>
				{open && (
					<ShareSheet
						card={card}
						player={player}
						onClose={() => setOpen(false)}
					/>
				)}
			</AnimatePresence>
		</>
	);
}

function ShareSheet({
	card,
	player,
	onClose,
}: {
	card: ShareCard;
	player: PublicProfile;
	onClose: () => void;
}) {
	const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let url = "";
		let live = true;
		renderCard(card, player).then(
			(blob) => {
				if (!live) return;
				url = URL.createObjectURL(blob);
				setImage({ blob, url });
			},
			(err) => live && setError((err as Error).message),
		);
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [card, player]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const text = shareText(card);
	const file = image
		? new File([image.blob], `pickem-week-${card.week}.png`, {
				type: "image/png",
			})
		: null;
	const canShare =
		!!file &&
		typeof navigator !== "undefined" &&
		!!navigator.canShare?.({ files: [file] });
	const canCopy =
		typeof window !== "undefined" &&
		"ClipboardItem" in window &&
		!!navigator.clipboard?.write;

	async function share() {
		if (!file) return;
		try {
			await navigator.share({ files: [file], text });
		} catch (err) {
			// Closing the share sheet isn't an error.
			if ((err as Error).name !== "AbortError")
				setError("Sharing didn't work here. Try saving the image instead.");
		}
	}

	async function copy() {
		if (!image) return;
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": image.blob }),
			]);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			setError("Couldn't copy the image. Try saving it instead.");
		}
	}

	const button =
		"flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50";

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
				aria-label={`Share week ${card.week}`}
				className="w-full max-w-sm rounded-lg border bg-card p-4 shadow-2xl"
				initial={{ opacity: 0, y: 16, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 16, scale: 0.98 }}
				transition={{ type: "spring", stiffness: 420, damping: 34 }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between">
					<h2 className="font-display text-xl font-semibold uppercase">
						Share week {card.week}
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
				<div className="mt-3 aspect-[4/5] max-h-[60vh] overflow-hidden rounded-md bg-muted">
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
				<p className="mt-3 text-sm text-muted-foreground">{text}</p>
				{error && <p className="mt-2 text-sm text-loss">{error}</p>}
				<div className="mt-4 flex gap-2">
					{canShare ? (
						<button
							type="button"
							onClick={share}
							className={`${button} bg-primary text-primary-foreground`}
						>
							<Share2 className="size-4" aria-hidden />
							Share
						</button>
					) : (
						canCopy && (
							<button
								type="button"
								onClick={copy}
								disabled={!image}
								className={`${button} bg-primary text-primary-foreground`}
							>
								{copied ? (
									<Check className="size-4" aria-hidden />
								) : (
									<Copy className="size-4" aria-hidden />
								)}
								{copied ? "Copied" : "Copy image"}
							</button>
						)
					)}
					{image ? (
						<a
							href={image.url}
							download={`pickem-week-${card.week}.png`}
							className={`${button} border hover:bg-muted`}
						>
							<Download className="size-4" aria-hidden />
							Save
						</a>
					) : (
						<button type="button" disabled className={`${button} border`}>
							<Download className="size-4" aria-hidden />
							Save
						</button>
					)}
				</div>
			</motion.div>
		</motion.div>
	);
}
