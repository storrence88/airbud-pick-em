import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import {
	BarChart3,
	Check,
	ChevronRight,
	GraduationCap,
	ImageUp,
	Play,
	Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar } from "#/components/Avatar";
import { NewDot, useNewDot } from "#/components/NewDot";
import {
	cardEffect,
	type EffectKind,
	PickEffect,
} from "#/components/PickEffect";
import { NFL_TEAMS, teamByAbbr, teamLogo } from "#/lib/nfl/teams";
import { reopenWhatsNew } from "#/lib/onboarding";
import {
	LOSS_EFFECTS,
	type LossEffect,
	MAX_NAME,
	MAX_TITLE,
	type MyProfile,
	WIN_EFFECTS,
	type WinEffect,
} from "#/lib/profile";
import { REMINDER_CHANNELS, type ReminderChannel } from "#/lib/reminders";
import { supabase } from "#/lib/supabase";
import { accentColors, accentVars } from "#/lib/team-colors";
import {
	setThemePref,
	THEME_PREFS,
	type ThemePref,
	useResolvedTheme,
	useThemePref,
} from "#/lib/theme";
import { cn } from "#/lib/utils";
import { myLeaguesQuery } from "#/server/leagues";
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
	const theme = useResolvedTheme();
	// Seen once you've been here; the header dot pointed at this section.
	const remindersDot = useNewDot("reminders");
	const leaveSeen = useRef(remindersDot.dismiss);
	leaveSeen.current = remindersDot.dismiss;
	useEffect(() => () => leaveSeen.current(), []);
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
			// The server trims text, so take its copy back or the form stays "unsaved".
			const fresh = qc.getQueryData(myProfileQuery().queryKey);
			if (fresh) setForm(fresh.profile);
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

			<SeasonStatsLinks />

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
					savedUrl={data.profile.avatar_url}
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

			<Section title="Appearance" hint="Saved on this device.">
				<Appearance />
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
					teamColor={team ? accentColors(team, theme).accent : undefined}
				/>
				<EffectPicker
					label="When you're wrong"
					options={LOSS_EFFECTS}
					value={form.loss_effect}
					onChange={(v) => set("loss_effect", v as LossEffect)}
				/>
			</Section>

			<Section
				id="reminders"
				title="Pick reminders"
				dot={remindersDot.show}
				hint="A few hours before each game day's first kickoff, if you still have open picks."
			>
				<Segmented
					label="Remind me by"
					value={form.reminder_channel}
					options={REMINDER_CHANNELS}
					onChange={(v) => set("reminder_channel", v as ReminderChannel)}
				/>
				{form.reminder_channel === "discord" && !data.hasDiscord && (
					<p className="-mt-2 text-sm text-muted-foreground">
						Sign in with Discord once so the bot can find you. Until then,
						reminders come by email.
					</p>
				)}
				<Toggle
					label="Let the Discord bot @mention me when I haven't picked"
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

			<GettingStarted />

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

/** Your stats live per league, since each league scores its own way. */
function SeasonStatsLinks() {
	const { user } = Route.useRouteContext();
	const { data: leagues } = useQuery(myLeaguesQuery());
	if (!user || !leagues?.length) return null;
	return (
		<Section title="Season stats">
			<ul className="grid gap-2">
				{leagues.map(({ league }) => (
					<li key={league.id}>
						<Link
							to="/league/$leagueId/stats/$userId"
							params={{ leagueId: league.id, userId: user.id }}
							className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted"
						>
							<BarChart3 className="size-4 shrink-0 text-primary" aria-hidden />
							<span className="min-w-0 flex-1 truncate font-semibold">
								{league.name}
							</span>
							<ChevronRight
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden
							/>
						</Link>
					</li>
				))}
			</ul>
		</Section>
	);
}

const inputClass =
	"w-full rounded-md border bg-card px-4 py-3 text-base outline-none ring-ring/40 focus:ring-4";

/** Light or dark, applied right away; not part of the saved profile. */
function Appearance() {
	const pref = useThemePref();
	return (
		<Segmented
			label="Theme"
			value={pref}
			options={THEME_PREFS}
			onChange={(v) => setThemePref(v as ThemePref)}
		/>
	);
}

/** Replays the practice week or the What's new cards. */
function GettingStarted() {
	const { data: leagues } = useQuery(myLeaguesQuery());
	const first = leagues?.[0]?.league;
	const row =
		"flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left font-semibold transition-colors hover:bg-muted";
	return (
		<Section title="Getting started" hint="A refresher on how it all works.">
			<div className="grid gap-2">
				<Link
					to="/practice"
					search={first ? { league: first.id, mode: first.mode } : {}}
					className={row}
				>
					<GraduationCap className="size-4 shrink-0 text-primary" aria-hidden />
					<span className="min-w-0 flex-1">Play the practice week</span>
					<ChevronRight
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden
					/>
				</Link>
				<button type="button" onClick={reopenWhatsNew} className={row}>
					<Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
					<span className="min-w-0 flex-1">See what's new</span>
					<ChevronRight
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden
					/>
				</button>
			</div>
		</Section>
	);
}

function Section({
	id,
	title,
	hint,
	dot = false,
	children,
}: {
	id?: string;
	title: string;
	hint?: string;
	/** A "new" dot beside the title. */
	dot?: boolean;
	children: ReactNode;
}) {
	return (
		<section id={id} className="mt-10 scroll-mt-20">
			<h2 className="relative inline-block pr-3 font-display text-xl font-semibold uppercase">
				{title}
				<NewDot show={dot} className="top-1 right-0" />
			</h2>
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
	savedUrl,
	form,
	discordAvatar,
	onChange,
}: {
	userId: string;
	savedUrl: string | null;
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
	// Remembered separately so picking Discord doesn't drop a new upload.
	const [uploaded, setUploaded] = useState(
		form.avatar_url && form.avatar_url !== discordAvatar
			? form.avatar_url
			: null,
	);

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
			setUploaded(data.publicUrl);
			onChange(data.publicUrl, "photo");
			// Keep only this upload and the saved one; older tries are clutter.
			const saved = savedUrl?.split("/avatars/")[1]?.split("?")[0];
			const { data: files } = await supabase.storage
				.from("avatars")
				.list(userId);
			const stale = (files ?? [])
				.map((f) => `${userId}/${f.name}`)
				.filter((p) => p !== path && p !== saved);
			if (stale.length) await supabase.storage.from("avatars").remove(stale);
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
								className="team-accent absolute inset-0 rounded-[inherit]"
								style={{
									...accentVars(t),
									background: `linear-gradient(135deg, ${t.color}, color-mix(in oklab, ${t.color} 55%, black))`,
									boxShadow: "0 0 0 2px var(--tc)",
								}}
								transition={{ type: "spring", stiffness: 400, damping: 32 }}
							/>
						)}
						<TeamLogo abbr={t.abbr} />
					</motion.button>
				);
			})}
		</div>
	);
}

/** Team logo, or its abbreviation if the image can't load. */
function TeamLogo({ abbr }: { abbr: string }) {
	const [failed, setFailed] = useState(false);
	if (failed)
		return (
			<span className="relative font-display text-sm font-semibold">
				{abbr}
			</span>
		);
	return (
		<img
			src={teamLogo(abbr)}
			alt=""
			className="relative size-[70%] drop-shadow"
			loading="lazy"
			onError={() => setFailed(true)}
		/>
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
	const theme = useResolvedTheme();
	const [playing, setPlaying] = useState<{
		kind: EffectKind;
		n: number;
	} | null>(null);
	const play = (kind: string) =>
		kind !== "none" &&
		setPlaying((p) => ({ kind: kind as EffectKind, n: (p?.n ?? 0) + 1 }));
	const color = teamColor ?? (theme === "dark" ? "#4ade80" : "#16a34a");
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
