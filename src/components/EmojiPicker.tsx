import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Search, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	customEmoji,
	customEmojiName,
	EMOJI_NAME,
	emojiNameFromFile,
	MAX_EMOJI_BYTES,
	REACTIONS,
} from "#/lib/comments";
import { supabase } from "#/lib/supabase";
import { cn } from "#/lib/utils";
import {
	addLeagueEmoji,
	type LeagueEmoji,
	leagueEmojiQuery,
	removeLeagueEmoji,
} from "#/server/emoji";

/** A reaction as it shows: the emoji itself, or a league's custom image. */
export function EmojiGlyph({
	emoji,
	custom,
	size = 18,
	className,
}: {
	emoji: string;
	custom: LeagueEmoji[];
	size?: number;
	className?: string;
}) {
	const name = customEmojiName(emoji);
	if (!name)
		return (
			<span aria-hidden className={className} style={{ fontSize: size }}>
				{emoji}
			</span>
		);
	const found = custom.find((e) => e.name === name);
	// Removed since someone reacted with it: fall back to its name.
	if (!found)
		return <span className="text-xs text-muted-foreground">{emoji}</span>;
	return (
		<img
			src={found.image_url}
			alt={emoji}
			width={size}
			height={size}
			draggable={false}
			className={cn("object-contain", className)}
			style={{ width: size, height: size }}
		/>
	);
}

/**
 * The full reaction picker, Slack style: search, the quick reactions, the
 * league's custom emoji, and "Add emoji" to upload a new one.
 */
export function EmojiPicker({
	open,
	onClose,
	onPick,
	leagueId,
	userId,
	canModerate,
	custom,
	mine,
}: {
	open: boolean;
	onClose: () => void;
	onPick: (emoji: string) => void;
	leagueId: string;
	userId: string;
	canModerate: boolean;
	custom: LeagueEmoji[];
	/** Reactions you've already put on this comment. */
	mine: string[];
}) {
	const [view, setView] = useState<"pick" | "add">("pick");
	const titleId = useId();
	const closeLatest = useRef(onClose);
	closeLatest.current = onClose;

	useEffect(() => {
		if (!open) return;
		setView("pick");
		// Capture first so the game sheet underneath doesn't close too.
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.stopPropagation();
			closeLatest.current();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [open]);

	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>
			{open && (
				<div className="fixed inset-0 z-[60] grid items-end sm:place-items-center">
					<motion.div
						className="absolute inset-0 bg-black/40"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						initial={{ opacity: 0, y: 40, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 40, scale: 0.96 }}
						transition={{ type: "spring", stiffness: 420, damping: 34 }}
						className="relative flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-2xl border bg-card text-card-foreground shadow-2xl sm:w-[380px] sm:rounded-2xl"
					>
						{view === "pick" ? (
							<PickView
								titleId={titleId}
								custom={custom}
								mine={mine}
								userId={userId}
								leagueId={leagueId}
								canModerate={canModerate}
								onPick={(e) => {
									onPick(e);
									onClose();
								}}
								onAdd={() => setView("add")}
								onClose={onClose}
							/>
						) : (
							<AddView
								titleId={titleId}
								leagueId={leagueId}
								taken={custom.map((e) => e.name)}
								onBack={() => setView("pick")}
								onAdded={(name) => {
									onPick(customEmoji(name));
									onClose();
								}}
							/>
						)}
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
}

function PickView({
	titleId,
	custom,
	mine,
	userId,
	leagueId,
	canModerate,
	onPick,
	onAdd,
	onClose,
}: {
	titleId: string;
	custom: LeagueEmoji[];
	mine: string[];
	userId: string;
	leagueId: string;
	canModerate: boolean;
	onPick: (emoji: string) => void;
	onAdd: () => void;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [q, setQ] = useState("");
	const [editing, setEditing] = useState(false);
	const needle = q.trim().toLowerCase().replace(/:/g, "");
	const shown = useMemo(
		() => custom.filter((e) => e.name.includes(needle)),
		[custom, needle],
	);
	const removable = (e: LeagueEmoji) => canModerate || e.created_by === userId;
	const remove = async (e: LeagueEmoji) => {
		if (!window.confirm(`Remove :${e.name}: for everyone?`)) return;
		const key = leagueEmojiQuery(leagueId).queryKey;
		qc.setQueryData<LeagueEmoji[]>(key, (old) =>
			old?.filter((x) => x.name !== e.name),
		);
		await removeLeagueEmoji({ data: { leagueId, name: e.name } }).catch((err) =>
			window.alert((err as Error).message),
		);
		qc.invalidateQueries({ queryKey: key });
	};

	return (
		<>
			<div className="flex items-center gap-2 border-b px-4 py-3">
				<h2 id={titleId} className="sr-only">
					Pick a reaction
				</h2>
				<label className="flex h-10 flex-1 items-center gap-2 rounded-full bg-muted px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
					<Search className="size-4 text-muted-foreground" aria-hidden />
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Search emoji"
						aria-label="Search emoji"
						className="w-full bg-transparent text-base outline-none sm:text-sm"
					/>
				</label>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close"
					className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<X className="size-5" />
				</button>
			</div>
			<div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
				{!needle && (
					<>
						<SectionTitle>Quick</SectionTitle>
						<div className="mb-4 grid grid-cols-6 gap-1">
							{REACTIONS.map((e) => (
								<Tile
									key={e}
									label={`React ${e}`}
									on={mine.includes(e)}
									onClick={() => onPick(e)}
								>
									<span className="text-2xl">{e}</span>
								</Tile>
							))}
						</div>
					</>
				)}
				<div className="flex items-center justify-between">
					<SectionTitle>League emoji</SectionTitle>
					{custom.some(removable) && (
						<button
							type="button"
							onClick={() => setEditing(!editing)}
							className="mb-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
						>
							{editing ? "Done" : "Edit"}
						</button>
					)}
				</div>
				{shown.length && needle && !editing ? (
					// Searching: names next to the images, so you can tell them apart.
					<ul className="-mx-2">
						{shown.map((e) => {
							const value = customEmoji(e.name);
							return (
								<li key={e.name}>
									<button
										type="button"
										onClick={() => onPick(value)}
										className={cn(
											"flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
											mine.includes(value) && "bg-primary/15",
										)}
									>
										<img
											src={e.image_url}
											alt=""
											draggable={false}
											className="size-7 object-contain"
										/>
										<span>:{e.name}:</span>
									</button>
								</li>
							);
						})}
					</ul>
				) : shown.length ? (
					<div className="grid grid-cols-6 gap-1">
						{shown.map((e) => {
							const value = customEmoji(e.name);
							const canRemove = editing && removable(e);
							return (
								<Tile
									key={e.name}
									label={canRemove ? `Remove :${e.name}:` : `React :${e.name}:`}
									title={`:${e.name}:`}
									on={!editing && mine.includes(value)}
									onClick={() =>
										canRemove ? remove(e) : !editing && onPick(value)
									}
									className={cn(editing && !canRemove && "opacity-40")}
								>
									<img
										src={e.image_url}
										alt=""
										draggable={false}
										className="size-8 object-contain"
									/>
									{canRemove && (
										<span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-loss text-white">
											<Trash2 className="size-2.5" />
										</span>
									)}
								</Tile>
							);
						})}
					</div>
				) : (
					<p className="py-4 text-center text-sm text-muted-foreground">
						{needle
							? `No emoji named :${needle}: yet.`
							: "No custom emoji yet. Add the first one."}
					</p>
				)}
			</div>
			<div className="border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
				<button
					type="button"
					onClick={onAdd}
					className="flex h-10 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-colors hover:bg-muted"
				>
					<ImagePlus className="size-4" />
					Add emoji
				</button>
			</div>
		</>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
			{children}
		</h3>
	);
}

function Tile({
	label,
	title,
	on,
	onClick,
	className,
	children,
}: {
	label: string;
	title?: string;
	on: boolean;
	onClick: () => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<motion.button
			type="button"
			whileHover={{ scale: 1.15 }}
			whileTap={{ scale: 0.85 }}
			onClick={onClick}
			aria-label={label}
			title={title}
			aria-pressed={on}
			className={cn(
				"relative grid aspect-square place-items-center rounded-xl transition-colors hover:bg-muted",
				on && "bg-primary/15",
				className,
			)}
		>
			{children}
		</motion.button>
	);
}

/** Fits an image inside a transparent square, small enough for a reaction. */
async function fitWebp(file: File, size = 128): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = Math.max(w, h);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Couldn't read that image.");
	ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))),
			"image/webp",
			0.9,
		),
	);
}

function AddView({
	titleId,
	leagueId,
	taken,
	onBack,
	onAdded,
}: {
	titleId: string;
	leagueId: string;
	taken: string[];
	onBack: () => void;
	onAdded: (name: string) => void;
}) {
	const qc = useQueryClient();
	const fileRef = useRef<HTMLInputElement>(null);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [dragging, setDragging] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!file) return;
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	const choose = (f: File | undefined) => {
		if (!f) return;
		if (!f.type.startsWith("image/"))
			return setError("That isn't an image. Try a PNG, GIF, JPG or WebP.");
		// GIFs go up as-is to keep the animation, so they have to be small.
		if (f.type === "image/gif" && f.size > MAX_EMOJI_BYTES)
			return setError("That GIF is over 512 KB. Try a smaller one.");
		setError("");
		setFile(f);
		if (!name) setName(emojiNameFromFile(f.name));
	};

	const nameError = !name
		? ""
		: !EMOJI_NAME.test(name)
			? "Use 2 to 24 lowercase letters, numbers, - or _."
			: taken.includes(name)
				? `:${name}: is taken. Try another name.`
				: "";

	const save = async () => {
		if (!file || !name || nameError || busy) return;
		if (!supabase) return setError("Uploads aren't set up here.");
		setBusy(true);
		setError("");
		const gif = file.type === "image/gif";
		const path = `${leagueId}/${name}-${Date.now()}.${gif ? "gif" : "webp"}`;
		try {
			const body = gif ? file : await fitWebp(file);
			const { error: upErr } = await supabase.storage
				.from("emoji")
				.upload(path, body, { contentType: gif ? "image/gif" : "image/webp" });
			if (upErr) throw upErr;
			const { data } = supabase.storage.from("emoji").getPublicUrl(path);
			try {
				await addLeagueEmoji({
					data: { leagueId, name, imageUrl: data.publicUrl },
				});
			} catch (err) {
				await supabase.storage.from("emoji").remove([path]);
				throw err;
			}
			await qc.invalidateQueries({
				queryKey: leagueEmojiQuery(leagueId).queryKey,
			});
			onAdded(name);
		} catch (err) {
			setError((err as Error).message);
			setBusy(false);
		}
	};

	return (
		<>
			<div className="flex items-center gap-2 border-b px-4 py-3">
				<button
					type="button"
					onClick={onBack}
					aria-label="Back to emoji"
					className="-ml-1.5 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<ArrowLeft className="size-5" />
				</button>
				<h2
					id={titleId}
					className="font-display text-lg font-semibold uppercase"
				>
					Add emoji
				</h2>
			</div>
			<div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(e) => {
						e.preventDefault();
						setDragging(false);
						choose(e.dataTransfer.files[0]);
					}}
					className={cn(
						"flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-colors",
						dragging
							? "border-primary bg-primary/10"
							: "hover:border-muted-foreground/50 hover:bg-muted/50",
					)}
				>
					{preview ? (
						<div className="flex items-end gap-5">
							<motion.img
								key={preview}
								initial={{ scale: 0.4, rotate: -12 }}
								animate={{ scale: 1, rotate: 0 }}
								transition={{ type: "spring", stiffness: 400, damping: 14 }}
								src={preview}
								alt="Your emoji, big"
								className="size-16 object-contain"
							/>
							<span className="flex h-7 items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2">
								<img
									src={preview}
									alt=""
									className="size-[18px] object-contain"
								/>
								<span className="text-xs font-semibold">3</span>
							</span>
						</div>
					) : (
						<ImagePlus className="size-8 text-muted-foreground" aria-hidden />
					)}
					<span className="text-muted-foreground">
						{preview
							? "Tap to choose a different image"
							: "Choose an image or drop one here"}
					</span>
					<span className="text-xs text-muted-foreground">
						Square works best. PNG, GIF, JPG or WebP.
					</span>
				</button>
				<input
					ref={fileRef}
					type="file"
					accept="image/png,image/gif,image/jpeg,image/webp"
					className="hidden"
					onChange={(e) => choose(e.target.files?.[0])}
				/>
				<label className="block">
					<span className="text-sm font-semibold">Name</span>
					<span className="mt-1.5 flex h-10 items-center rounded-full border bg-background px-3.5 focus-within:border-primary">
						<span className="text-muted-foreground">:</span>
						<input
							value={name}
							onChange={(e) =>
								setName(e.target.value.toLowerCase().replace(/\s/g, "_"))
							}
							maxLength={24}
							placeholder="bills_mafia"
							className="w-full bg-transparent px-0.5 text-base outline-none sm:text-sm"
						/>
						<span className="text-muted-foreground">:</span>
					</span>
					<span
						className={cn(
							"mt-1 block text-xs",
							nameError ? "text-loss" : "text-muted-foreground",
						)}
					>
						{nameError || "This is what you'll search for."}
					</span>
				</label>
				{error && <p className="text-sm text-loss">{error}</p>}
			</div>
			<div className="border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
				<button
					type="button"
					onClick={save}
					disabled={!file || !name || !!nameError || busy}
					className="h-10 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
				>
					{busy ? "Adding…" : "Add and react"}
				</button>
			</div>
		</>
	);
}
