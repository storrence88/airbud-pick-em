import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Check, ImageUp, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";
import { Avatar } from "#/components/Avatar";
import {
	cardEffect,
	type EffectKind,
	PickEffect,
} from "#/components/PickEffect";
import { NFL_TEAMS, teamByAbbr, teamLogo } from "#/lib/nfl/teams";
import {
	LOSS_EFFECTS,
	type LossEffect,
	MAX_NAME,
	MAX_TITLE,
	type MyProfile,
	WIN_EFFECTS,
	type WinEffect,
} from "#/lib/profile";
import { supabase } from "#/lib/supabase";
import { accentColors } from "#/lib/team-colors";
import { cn } from "#/lib/utils";
import { myProfileQuery, updateProfile } from "#/server/profile";

export const Route = createFileRoute("/profile")({
	beforeLoad: ({ context, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
	},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(myProfileQuery()),
	component: ProfilePage,
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-2xl px-4 py-16 text-muted-foreground">
			{(error as Error).message}
		</main>
	),
});

const TITLE_IDEAS = [
	"Lions truther",
	"Never picks the Jets",
	"Fades the public",
	"Home dog enjoyer",
];

function ProfilePage() {
	const { data } = useSuspenseQuery(myProfileQuery());
	const qc = useQueryClient();
	const router = useRouter();
	const [form, setForm] = useState<MyProfile>(data.profile);
	const [saved, setSaved] = useState(false);
	const set = <K extends keyof MyProfile>(key: K, value: MyProfile[K]) => {
		setSaved(false);
		setForm((f) => ({ ...f, [key]: value }));
	};
	const changes = Object.fromEntries(
		Object.entries(form).filter(
			([k, v]) => v !== data.profile[k as keyof MyProfile],
		),
	) as Partial<MyProfile>;
	const dirty = Object.keys(changes).length > 0;

	const save = useMutation({
		mutationFn: () => updateProfile({ data: changes }),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["profile"] });
			// Header avatar, team theme, and league rosters read the profile too.
			qc.invalidateQueries({ queryKey: ["league"] });
			await router.invalidate();
			setSaved(true);
		},
	});

	const team = teamByAbbr(form.favorite_team);

	return (
		<main className="mx-auto max-w-2xl px-4 pt-8 pb-32 sm:pt-10">
			<h1 className="font-display text-3xl font-bold uppercase sm:text-4xl">
				Your profile
			</h1>

			{/* Live preview of how you show up in standings. */}
			<motion.div
				layout
				className="relative mt-6 flex items-center gap-4 overflow-hidden rounded-lg border bg-card p-4"
			>
				{team && (
					<img
						src={teamLogo(team.abbr)}
						alt=""
						className="pointer-events-none absolute -right-6 -bottom-8 size-36 opacity-10"
					/>
				)}
				<Avatar profile={form} size={64} />
				<div className="min-w-0">
					<div className="truncate font-display text-2xl font-semibold">
						{form.display_name || "Player"}
					</div>
					<div className="truncate text-sm text-muted-foreground italic">
						{form.title || "No title yet"}
					</div>
				</div>
			</motion.div>

			<Section title="Name and title">
				<Field label="Display name" htmlFor="name">
					<input
						id="name"
						value={form.display_name}
						maxLength={MAX_NAME}
						onChange={(e) => set("display_name", e.target.value)}
						className={inputClass}
					/>
				</Field>
				<Field
					label="Title"
					hint="A short tagline under your name in the standings."
					htmlFor="title"
				>
					<input
						id="title"
						value={form.title ?? ""}
						maxLength={MAX_TITLE}
						placeholder={TITLE_IDEAS[0]}
						onChange={(e) => set("title", e.target.value || null)}
						className={inputClass}
					/>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{TITLE_IDEAS.map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => set("title", t)}
								className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
							>
								{t}
							</button>
						))}
					</div>
				</Field>
			</Section>

			<Section title="Avatar">
				<AvatarPicker
					userId={data.userId}
					form={form}
					discordAvatar={data.discordAvatar}
					onChange={(url, kind) => {
						set("avatar_kind", kind);
						if (url !== undefined) set("avatar_url", url);
					}}
				/>
			</Section>

			<Section
				title="Favorite team"
				hint="Your avatar ring and monogram take its colors."
			>
				<TeamPicker
					value={form.favorite_team}
					onChange={(abbr) => set("favorite_team", abbr)}
				/>
				<Toggle
					label="Tint the app in your team's colors"
					checked={form.team_theme}
					disabled={!team}
					onChange={(v) => set("team_theme", v)}
				/>
			</Section>

			<Section
				title="Pick reactions"
				hint="Plays on your game card when one of your picks goes final. Only you see it."
			>
				<EffectPicker
					label="When you're right"
					options={WIN_EFFECTS}
					value={form.win_effect}
					onChange={(v) => set("win_effect", v as WinEffect)}
					teamColor={team ? accentColors(team).accent : undefined}
				/>
				<EffectPicker
					label="When you're wrong"
					options={LOSS_EFFECTS}
					value={form.loss_effect}
					onChange={(v) => set("loss_effect", v as LossEffect)}
				/>
			</Section>

			<Section
				title="Discord bot"
				hint="How the league's Discord bot treats you in pick reminders."
			>
				<Toggle
					label="@mention me when I haven't picked"
					checked={form.bot_mentions}
					onChange={(v) => set("bot_mentions", v)}
				/>
				<Segmented
					label="Reminder style"
					value={form.reminder_style}
					options={{ gentle: "Gentle nudge", roast: "Roast me" }}
					onChange={(v) => set("reminder_style", v as "gentle" | "roast")}
				/>
			</Section>

			{/* Save bar slides up once something changes. */}
			<AnimatePresence>
				{(dirty || saved) && (
					<motion.div
						initial={{ y: 80, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 80, opacity: 0 }}
						transition={{ type: "spring", stiffness: 400, damping: 34 }}
						className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
					>
						<div className="mx-auto flex max-w-2xl items-center gap-3 rounded-full border bg-card/90 p-2 pl-5 shadow-2xl backdrop-blur-xl">
							<span
								className={cn(
									"min-w-0 flex-1 truncate text-sm",
									save.error ? "text-loss" : "text-muted-foreground",
								)}
							>
								{save.error
									? (save.error as Error).message
									: dirty
										? "Unsaved changes"
										: "Saved"}
							</span>
							{dirty && (
								<button
									type="button"
									onClick={() => {
										setForm(data.profile);
										save.reset();
									}}
									className="h-10 rounded-full px-4 text-sm font-semibold text-muted-foreground"
								>
									Reset
								</button>
							)}
							<button
								type="button"
								disabled={!dirty || save.isPending || !form.display_name.trim()}
								onClick={() => save.mutate()}
								className="flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
							>
								{!dirty && <Check className="size-4" />}
								{save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
							</button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</main>
	);
}

const inputClass =
	"w-full rounded-md border bg-card px-4 py-3 text-base outline-none ring-ring/40 focus:ring-4";

function Section({
	title,
	hint,
	children,
}: {
	title: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<section className="mt-10">
			<h2 className="font-display text-xl font-semibold uppercase">{title}</h2>
			{hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
			<div className="mt-4 grid gap-5">{children}</div>
		</section>
	);
}

function Field({
	label,
	hint,
	htmlFor,
	children,
}: {
	label: string;
	hint?: string;
	htmlFor: string;
	children: ReactNode;
}) {
	return (
		<div>
			<label htmlFor={htmlFor} className="block text-sm font-medium">
				{label}
			</label>
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			<div className="mt-2">{children}</div>
		</div>
	);
}

function Toggle({
	label,
	checked,
	disabled,
	onChange,
}: {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className="flex items-center justify-between gap-4 text-left text-sm font-medium disabled:opacity-40"
		>
			{label}
			<span
				className={cn(
					"relative h-7 w-12 shrink-0 rounded-full transition-colors",
					checked && !disabled ? "bg-primary" : "bg-muted",
				)}
			>
				<motion.span
					layout
					transition={{ type: "spring", stiffness: 600, damping: 34 }}
					className={cn(
						"absolute top-1 size-5 rounded-full bg-white shadow",
						checked && !disabled ? "right-1" : "left-1",
					)}
				/>
			</span>
		</button>
	);
}

function Segmented({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: Record<string, string>;
	onChange: (v: string) => void;
}) {
	return (
		<fieldset>
			<legend className="text-sm font-medium">{label}</legend>
			<div className="mt-2 flex flex-wrap gap-1 rounded-2xl border bg-card p-1 text-sm font-semibold sm:rounded-full">
				{Object.entries(options).map(([v, text]) => (
					<button
						key={v}
						type="button"
						aria-pressed={value === v}
						onClick={() => onChange(v)}
						className={cn(
							"relative h-9 flex-1 rounded-full px-3 whitespace-nowrap transition-colors",
							value === v ? "text-primary-foreground" : "text-muted-foreground",
						)}
					>
						{value === v && (
							<motion.span
								layoutId={`seg-${label}`}
								className="absolute inset-0 rounded-full bg-primary"
								transition={{ type: "spring", stiffness: 400, damping: 32 }}
							/>
						)}
						<span className="relative">{text}</span>
					</button>
				))}
			</div>
		</fieldset>
	);
}

/** Center-crops an image to a small square WebP so uploads stay tiny. */
async function squareWebp(file: File, size = 256): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Couldn't read that image.");
	ctx.drawImage(
		bitmap,
		(bitmap.width - side) / 2,
		(bitmap.height - side) / 2,
		side,
		side,
		0,
		0,
		size,
		size,
	);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))),
			"image/webp",
			0.85,
		),
	);
}

function AvatarPicker({
	userId,
	form,
	discordAvatar,
	onChange,
}: {
	userId: string;
	form: MyProfile;
	discordAvatar: string | null;
	/** url undefined keeps the current photo. */
	onChange: (
		url: string | null | undefined,
		kind: "photo" | "monogram",
	) => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const usingDiscord =
		form.avatar_kind === "photo" && form.avatar_url === discordAvatar;
	const uploaded =
		form.avatar_url && form.avatar_url !== discordAvatar
			? form.avatar_url
			: null;

	async function upload(file: File) {
		if (!supabase) return setError("Uploads aren't set up here.");
		setBusy(true);
		setError("");
		try {
			const blob = await squareWebp(file);
			const path = `${userId}/${Date.now()}.webp`;
			const { error: err } = await supabase.storage
				.from("avatars")
				.upload(path, blob, { contentType: "image/webp" });
			if (err) throw err;
			const { data } = supabase.storage.from("avatars").getPublicUrl(path);
			onChange(data.publicUrl, "photo");
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	const choice = (
		key: string,
		active: boolean,
		onClick: () => void,
		preview: ReactNode,
		label: string,
	) => (
		<motion.button
			key={key}
			type="button"
			whileTap={{ scale: 0.96 }}
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex flex-col items-center gap-2 rounded-lg border-2 bg-card p-3 text-sm font-medium transition-colors",
				active
					? "border-primary"
					: "border-border hover:border-muted-foreground/40",
			)}
		>
			{preview}
			{label}
		</motion.button>
	);

	return (
		<div>
			<div className="grid grid-cols-3 gap-2 sm:gap-3">
				{discordAvatar &&
					choice(
						"discord",
						usingDiscord,
						() => onChange(discordAvatar, "photo"),
						<Avatar
							profile={{
								...form,
								avatar_kind: "photo",
								avatar_url: discordAvatar,
							}}
							size={48}
						/>,
						"Discord",
					)}
				{choice(
					"upload",
					form.avatar_kind === "photo" && !!uploaded,
					() =>
						uploaded ? onChange(uploaded, "photo") : fileRef.current?.click(),
					uploaded ? (
						<Avatar
							profile={{ ...form, avatar_kind: "photo", avatar_url: uploaded }}
							size={48}
						/>
					) : (
						<span className="grid size-12 place-items-center rounded-full border border-dashed text-muted-foreground">
							<ImageUp className="size-5" />
						</span>
					),
					busy ? "Uploading…" : "Photo",
				)}
				{choice(
					"monogram",
					form.avatar_kind === "monogram" || !form.avatar_url,
					() => onChange(undefined, "monogram"),
					<Avatar profile={{ ...form, avatar_kind: "monogram" }} size={48} />,
					"Monogram",
				)}
			</div>
			<button
				type="button"
				onClick={() => fileRef.current?.click()}
				className="mt-3 text-sm font-semibold text-primary"
			>
				{uploaded ? "Upload a different photo" : "Upload a photo"}
			</button>
			<input
				ref={fileRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) upload(file);
					e.target.value = "";
				}}
			/>
			{error && <p className="mt-2 text-sm text-loss">{error}</p>}
		</div>
	);
}

function TeamPicker({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (abbr: string | null) => void;
}) {
	return (
		<div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 sm:gap-2">
			{NFL_TEAMS.map((t) => {
				const active = value === t.abbr;
				return (
					<motion.button
						key={t.abbr}
						type="button"
						whileTap={{ scale: 0.9 }}
						onClick={() => onChange(active ? null : t.abbr)}
						aria-pressed={active}
						title={t.name}
						aria-label={t.name}
						className={cn(
							"relative grid aspect-square place-items-center rounded-md border-2 transition-colors",
							active
								? "border-transparent"
								: "border-border hover:border-muted-foreground/40",
						)}
					>
						{active && (
							<motion.span
								layoutId="team-pick"
								className="absolute inset-0 rounded-[inherit]"
								style={{
									background: `linear-gradient(135deg, ${t.color}, color-mix(in oklab, ${t.color} 55%, black))`,
									boxShadow: `0 0 0 2px ${accentColors(t).accent}`,
								}}
								transition={{ type: "spring", stiffness: 400, damping: 32 }}
							/>
						)}
						<img
							src={teamLogo(t.abbr)}
							alt=""
							className="relative size-[70%] drop-shadow"
							loading="lazy"
						/>
					</motion.button>
				);
			})}
		</div>
	);
}

function EffectPicker({
	label,
	options,
	value,
	onChange,
	teamColor,
}: {
	label: string;
	options: Record<string, string>;
	value: string;
	onChange: (v: string) => void;
	teamColor?: string;
}) {
	const [playing, setPlaying] = useState<{
		kind: EffectKind;
		n: number;
	} | null>(null);
	const play = (kind: string) =>
		kind !== "none" &&
		setPlaying((p) => ({ kind: kind as EffectKind, n: (p?.n ?? 0) + 1 }));
	const color = teamColor ?? "#4ade80";
	const fx = cardEffect(playing?.kind, color);
	return (
		<div>
			<Segmented
				label={label}
				value={value}
				options={options}
				onChange={(v) => {
					onChange(v);
					play(v);
				}}
			/>
			<motion.div
				animate={{ x: 0, scale: 1, ...fx }}
				transition={fx?.transition}
				className="relative mt-2 flex h-20 items-center justify-between overflow-hidden rounded-lg border bg-card px-4"
			>
				<span className="text-sm text-muted-foreground">
					{value === "none" ? "No reaction" : `Preview: ${options[value]}`}
				</span>
				<button
					type="button"
					disabled={value === "none"}
					onClick={() => play(value)}
					className="relative z-20 flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-40"
				>
					<Play className="size-3.5" />
					Play
				</button>
				{playing && (
					<PickEffect
						key={playing.n}
						kind={playing.kind}
						colors={[color, "#ffffff"]}
						onDone={() => setPlaying(null)}
					/>
				)}
			</motion.div>
		</div>
	);
}
