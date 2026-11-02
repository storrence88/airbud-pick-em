import { Check, Copy, Download, Image, Share2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicProfile } from "#/lib/profile";
import {
	type GroupShare,
	groupText,
	personalText,
	type ShareCard,
} from "#/lib/share-card";
import {
	CARD_HEIGHT,
	CARD_WIDTH,
	type CardPlayer,
	drawGroupCard,
	drawShareCard,
	groupCardHeight,
	loadCardFonts,
	loadPhoto,
} from "#/lib/share-card-draw";
import { NewDot, useNewDot } from "./NewDot";

type Member = PublicProfile & { user_id: string };
type Tab = "me" | "league";

const VIEW_KEY = "pickem:share-view";

async function withPhoto(p: PublicProfile): Promise<CardPlayer> {
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

function canvas(width: number, height: number) {
	const c = document.createElement("canvas");
	c.width = width;
	c.height = height;
	const ctx = c.getContext("2d");
	if (!ctx) throw new Error("Couldn't draw the card on this browser.");
	return { c, ctx };
}

async function renderMine(card: ShareCard, player: PublicProfile) {
	const [p] = await Promise.all([withPhoto(player), loadCardFonts()]);
	const { c, ctx } = canvas(CARD_WIDTH, CARD_HEIGHT);
	drawShareCard(ctx, card, p);
	return toBlob(c);
}

async function renderGroup(group: GroupShare, members: Member[]) {
	const listed = members.filter((m) =>
		group.rows.some((r) => r.userId === m.user_id),
	);
	const [players] = await Promise.all([
		Promise.all(
			listed.map(async (m) => [m.user_id, await withPhoto(m)] as const),
		),
		loadCardFonts(),
	]);
	const { c, ctx } = canvas(CARD_WIDTH, groupCardHeight(group.rows.length));
	drawGroupCard(ctx, group, new Map(players));
	return toBlob(c);
}

/**
 * "Share": your week or the whole league's, as text to paste into Discord or
 * as an image. Shows from the first kickoff, so people can post on Sunday
 * night; picks for games that haven't kicked off never make it in.
 */
export function ShareWeek({
	week,
	card,
	group,
	me,
	members,
}: {
	week: number;
	card: ShareCard | null;
	group: GroupShare;
	me: PublicProfile | null;
	members: Member[];
}) {
	const [open, setOpen] = useState(false);
	const dot = useNewDot("share");
	return (
		<>
			<button
				type="button"
				onClick={() => {
					dot.dismiss();
					setOpen(true);
				}}
				aria-label={`Share week ${week}`}
				className="relative flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition-colors hover:bg-muted sm:px-3.5"
			>
				<Share2 className="size-4" aria-hidden />
				<span className="hidden sm:inline">Share</span>
				<NewDot show={dot.show} />
			</button>
			<AnimatePresence>
				{open && (
					<ShareSheet
						week={week}
						card={me ? card : null}
						group={group}
						me={me}
						members={members}
						onClose={() => setOpen(false)}
					/>
				)}
			</AnimatePresence>
		</>
	);
}

function savedTab(): Tab | null {
	try {
		const v = localStorage.getItem(VIEW_KEY);
		return v === "me" || v === "league" ? v : null;
	} catch {
		return null;
	}
}

function ShareSheet({
	week,
	card,
	group,
	me,
	members,
	onClose,
}: {
	week: number;
	card: ShareCard | null;
	group: GroupShare;
	me: PublicProfile | null;
	members: Member[];
	onClose: () => void;
}) {
	// Remember Me vs League per device; without a pick showing yet, only League works.
	const [tab, setTab] = useState<Tab>(() =>
		card ? (savedTab() ?? "me") : "league",
	);
	const [images, setImages] = useState<
		Partial<Record<Tab, { blob: Blob; url: string }>>
	>({});
	const [error, setError] = useState("");
	const [copied, setCopied] = useState<"text" | "image" | null>(null);

	function choose(t: Tab) {
		setTab(t);
		setError("");
		try {
			localStorage.setItem(VIEW_KEY, t);
		} catch {}
	}

	// Draw the image for the tab you're on, once.
	const have = !!images[tab];
	useEffect(() => {
		if (have) return;
		let live = true;
		const job =
			tab === "me" && card && me
				? renderMine(card, me)
				: renderGroup(group, members);
		job.then(
			(blob) => {
				if (!live) return;
				const url = URL.createObjectURL(blob);
				made.current.push(url);
				setImages((prev) => ({ ...prev, [tab]: { blob, url } }));
			},
			(err) => live && setError((err as Error).message),
		);
		return () => {
			live = false;
		};
	}, [tab, have, card, me, group, members]);

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

	const text = useMemo(
		() =>
			tab === "me" && card && me
				? personalText(card, me.display_name)
				: groupText(group),
		[tab, card, me, group],
	);
	const image = images[tab];
	const fileName = `pickem-week-${week}${tab === "league" ? "-league" : ""}.png`;
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
				aria-label={`Share week ${week}`}
				className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col rounded-lg border bg-card p-4 shadow-2xl"
				initial={{ opacity: 0, y: 16, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 16, scale: 0.98 }}
				transition={{ type: "spring", stiffness: 420, damping: 34 }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between">
					<h2 className="font-display text-xl font-semibold uppercase">
						Share week {week}
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

				<div
					role="tablist"
					aria-label="What to share"
					className="mt-3 grid grid-cols-2 rounded-full border bg-muted/40 p-1 text-sm font-semibold"
				>
					{(
						[
							["me", "Me"],
							["league", "League"],
						] as const
					).map(([t, label]) => (
						<button
							key={t}
							type="button"
							role="tab"
							aria-selected={tab === t}
							disabled={t === "me" && !card}
							title={
								t === "me" && !card
									? "None of your picks have kicked off yet"
									: undefined
							}
							onClick={() => choose(t)}
							className="relative h-9 rounded-full transition-colors disabled:opacity-40"
						>
							{tab === t && (
								<motion.span
									layoutId="share-tab"
									className="absolute inset-0 rounded-full bg-foreground/10 shadow-sm ring-1 ring-foreground/15"
									transition={{ type: "spring", stiffness: 500, damping: 40 }}
								/>
							)}
							<span className="relative">{label}</span>
						</button>
					))}
				</div>

				<div className="mt-3 min-h-0 flex-1 overflow-y-auto">
					<div
						className="overflow-hidden rounded-md bg-muted"
						style={{
							aspectRatio: `${CARD_WIDTH} / ${
								tab === "me" ? CARD_HEIGHT : groupCardHeight(group.rows.length)
							}`,
						}}
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
