import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { Bell, Crown, Share2, Shield, Smartphone, X } from "lucide-react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { teamLogo } from "#/lib/nfl/teams";
import {
	isStandalone,
	isVeteran,
	onReopenWhatsNew,
	RELEASE,
	readOnboarding,
	updateOnboarding,
	useOnboarding,
} from "#/lib/onboarding";
import { cn } from "#/lib/utils";

const loop = (duration: number, times: number[], delay = 0) => ({
	duration,
	times,
	delay,
	repeat: Number.POSITIVE_INFINITY,
	ease: "easeInOut" as const,
});

interface Slide {
	id: string;
	icon: typeof Bell;
	title: string;
	body: string;
	art: ReactNode;
	extra?: ReactNode;
	cta?: { label: string; to: "/profile"; hash?: string };
}

const SLIDES: Slide[] = [
	{
		id: "survivor",
		icon: Shield,
		title: "Survivor",
		body: "A side game that runs all season. Pick one team to win each week, never the same team twice. One loss and you're out. Your commissioner turns it on in league settings.",
		art: <SurvivorArt />,
	},
	{
		id: "winner",
		icon: Crown,
		title: "Weekly winner",
		body: "Every week crowns a winner on the league page. Tied on points? The closest guess at the Monday night total takes it.",
		art: <WinnerArt />,
	},
	{
		id: "share",
		icon: Share2,
		title: "Share your week",
		body: "Once the week is final, tap Share for a card with your record and your Lock. Drop it straight in the group chat.",
		art: <ShareArt />,
	},
	{
		id: "reminders",
		icon: Bell,
		title: "Pick reminders",
		body: "An email or a Discord DM a few hours before kickoff, only if you still have open picks. Pick how, or turn them off, on your profile.",
		art: <ReminderArt />,
		cta: { label: "Reminder settings", to: "/profile", hash: "reminders" },
	},
	{
		id: "install",
		icon: Smartphone,
		title: "On your home screen",
		body: "Add Pick'em to your home screen and it opens full screen like an app, with Air Bud as the icon.",
		art: <HomeScreenArt />,
		extra: <InstallSteps />,
	},
];

/**
 * The What's new cards: slides up once per release for players who were
 * already here, and again whenever they reopen it from their profile.
 */
export function WhatsNew() {
	const { user } = useRouteContext({ from: "__root__" });
	const path = useRouterState({ select: (s) => s.location.pathname });
	const [open, setOpen] = useState(false);
	const state = useOnboarding();
	const veteran = isVeteran(user, state);
	const quietPage = path === "/practice" || path.startsWith("/login");

	useEffect(() => onReopenWhatsNew(() => setOpen(true)), []);
	useEffect(() => {
		if (isStandalone() && !readOnboarding().installed)
			updateOnboarding((s) => ({ ...s, installed: true }));
	}, []);
	useEffect(() => {
		if (!veteran || quietPage || readOnboarding().whatsNew === RELEASE) return;
		// Let the page settle first so the sheet arrives as its own moment.
		const t = setTimeout(() => setOpen(true), 900);
		return () => clearTimeout(t);
	}, [veteran, quietPage]);

	const close = () => {
		updateOnboarding((s) => ({ ...s, whatsNew: RELEASE }));
		setOpen(false);
	};
	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>{open && <Sheet onClose={close} />}</AnimatePresence>,
		document.body,
	);
}

function Sheet({ onClose }: { onClose: () => void }) {
	const [[index, dir], setPage] = useState<[number, number]>([0, 0]);
	const titleId = useId();
	const nextRef = useRef<HTMLButtonElement>(null);
	const closeLatest = useRef(onClose);
	closeLatest.current = onClose;
	const last = index === SLIDES.length - 1;
	const go = (to: number) => {
		if (to < 0 || to >= SLIDES.length) return;
		setPage([to, to > index ? 1 : -1]);
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") closeLatest.current();
		};
		document.addEventListener("keydown", onKey);
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		nextRef.current?.focus();
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
		};
	}, []);

	const slide = SLIDES[index];
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
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
				initial={{ y: "100%" }}
				animate={{ y: 0 }}
				exit={{ y: "100%", opacity: 0 }}
				transition={{ type: "spring", stiffness: 340, damping: 34 }}
				className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border bg-card text-card-foreground shadow-2xl sm:max-w-md sm:rounded-2xl"
			>
				<div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
					<span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
				</div>
				<div className="flex shrink-0 items-center justify-between px-5 pt-2 sm:pt-4">
					<span
						id={titleId}
						className="text-xs font-semibold uppercase tracking-widest text-primary"
					>
						New in Pick'em
					</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="-mr-2 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="size-4" aria-hidden />
					</button>
				</div>
				<div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
					<AnimatePresence initial={false} custom={dir} mode="popLayout">
						<motion.div
							key={slide.id}
							custom={dir}
							variants={{
								enter: (d: number) => ({
									x: d >= 0 ? "60%" : "-60%",
									opacity: 0,
								}),
								center: { x: 0, opacity: 1 },
								exit: (d: number) => ({
									x: d >= 0 ? "-60%" : "60%",
									opacity: 0,
								}),
							}}
							initial="enter"
							animate="center"
							exit="exit"
							transition={{ type: "spring", stiffness: 380, damping: 36 }}
							drag="x"
							dragConstraints={{ left: 0, right: 0 }}
							dragElastic={0.5}
							onDragEnd={(_: unknown, info: PanInfo) => {
								if (info.offset.x < -60 || info.velocity.x < -400)
									go(index + 1);
								else if (info.offset.x > 60 || info.velocity.x > 400)
									go(index - 1);
							}}
							className="grid touch-pan-y gap-4 px-5 pt-3 pb-2"
						>
							<div
								aria-hidden
								className="relative grid h-44 place-items-center overflow-hidden rounded-xl bg-muted"
							>
								{slide.art}
							</div>
							<div>
								<h2 className="flex items-center gap-2 font-display text-2xl font-semibold uppercase">
									<slide.icon className="size-5 text-primary" aria-hidden />
									{slide.title}
								</h2>
								<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
									{slide.body}
								</p>
							</div>
							{slide.extra}
							{slide.cta && (
								<Link
									to={slide.cta.to}
									hash={slide.cta.hash}
									onClick={onClose}
									className="inline-flex h-9 w-fit items-center rounded-full border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
								>
									{slide.cta.label}
								</Link>
							)}
						</motion.div>
					</AnimatePresence>
				</div>
				<div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
					<div className="flex gap-1.5">
						{SLIDES.map((s, i) => (
							<button
								key={s.id}
								type="button"
								onClick={() => go(i)}
								aria-label={`${s.title} (${i + 1} of ${SLIDES.length})`}
								aria-current={i === index}
								className="grid h-6 place-items-center"
							>
								<motion.span
									animate={{ width: i === index ? 20 : 7 }}
									className={cn(
										"block h-[7px] rounded-full transition-colors",
										i === index ? "bg-primary" : "bg-border",
									)}
								/>
							</button>
						))}
					</div>
					<div className="flex gap-2">
						{index > 0 && (
							<button
								type="button"
								onClick={() => go(index - 1)}
								className="h-10 rounded-full bg-muted px-4 text-sm font-semibold"
							>
								Back
							</button>
						)}
						<button
							ref={nextRef}
							type="button"
							onClick={() => (last ? onClose() : go(index + 1))}
							className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
						>
							{last ? "Done" : "Next"}
						</button>
					</div>
				</div>
			</motion.div>
		</div>
	);
}

/** Phone-specific "how to add it" lines, shown on the home screen card. */
function InstallSteps() {
	const [installed, setInstalled] = useState(false);
	useEffect(() => setInstalled(isStandalone()), []);
	if (installed)
		return (
			<p className="text-sm font-semibold text-primary">
				You're already using the home screen app.
			</p>
		);
	return (
		<ul className="grid gap-1.5 rounded-lg border px-3.5 py-3 text-sm">
			<li>
				<span className="font-semibold">iPhone:</span> in Safari, tap Share,
				then Add to Home Screen.
			</li>
			<li>
				<span className="font-semibold">Android:</span> in Chrome, tap ⋮, then
				Add to Home screen.
			</li>
		</ul>
	);
}

function SurvivorArt() {
	const teams = ["KC", "DET", "BAL", "GB", "PHI", "SF", "BUF", "MIA"];
	return (
		<>
			<div className="-mt-6 grid grid-cols-4 gap-x-5 gap-y-3">
				{teams.map((t, i) => {
					const used = i < 4;
					const at = 0.12 + i * 0.1;
					return (
						<span key={t} className="relative grid size-11 place-items-center">
							<motion.img
								src={teamLogo(t)}
								alt=""
								className="size-10"
								animate={used ? { opacity: [1, 1, 0.3, 0.3] } : undefined}
								transition={loop(5, [0, at, at + 0.06, 1])}
							/>
							{used && (
								// Tilted around its middle so it crosses the logo's center,
								// then drawn from the left end.
								<span className="absolute top-1/2 -right-1 -left-1 h-[3px] -translate-y-1/2 -rotate-[30deg]">
									<motion.span
										className="block size-full origin-left rounded-full bg-loss"
										initial={{ scaleX: 0 }}
										animate={{ scaleX: [0, 0, 1, 1] }}
										transition={loop(5, [0, at, at + 0.06, 1])}
									/>
								</span>
							)}
						</span>
					);
				})}
			</div>
			<motion.span
				className="absolute bottom-4 rounded-full bg-win/15 px-3 py-1 text-xs font-bold text-win"
				animate={{ scale: [1, 1.06, 1] }}
				transition={loop(2, [0, 0.5, 1])}
			>
				Still alive · Week 5
			</motion.span>
		</>
	);
}

function WinnerArt() {
	const row =
		"flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold";
	return (
		<div className="grid w-4/5 gap-2">
			<div className={cn(row, "relative bg-accent ring-1 ring-primary")}>
				<span className="font-display text-muted-foreground">1</span>
				<span className="flex-1">You</span>
				<span className="font-display tabular-nums">44</span>
				<motion.span
					className="absolute -top-4 left-11 text-amber-500 dark:text-amber-300"
					animate={{
						y: [-18, -18, 0, 0, -18],
						rotate: [-25, -25, 0, 0, -25],
						opacity: [0, 0, 1, 1, 0],
					}}
					transition={loop(4, [0, 0.2, 0.38, 0.85, 1])}
				>
					<Crown className="size-5 fill-current" />
				</motion.span>
			</div>
			<div className={cn(row, "bg-card")}>
				<span className="font-display text-muted-foreground">2</span>
				<span className="flex-1">Jess</span>
				<span className="font-display tabular-nums">51</span>
			</div>
			<p className="text-center text-xs text-muted-foreground">
				Monday night total: 43
			</p>
		</div>
	);
}

function ShareArt() {
	return (
		<div className="absolute inset-0 overflow-hidden">
			<motion.div
				className="absolute bottom-10 left-1/2 grid h-28 w-52 -translate-x-1/2 content-between rounded-xl p-3 text-primary-foreground shadow-lg"
				style={{
					background:
						"linear-gradient(150deg, var(--primary), color-mix(in oklab, var(--primary) 45%, black))",
				}}
				animate={{ y: [130, 0, 0, 0], opacity: [1, 1, 1, 0] }}
				transition={loop(4, [0, 0.32, 0.85, 1])}
			>
				<span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
					Sunday Crew · Week 5
				</span>
				<span className="font-display text-3xl font-bold">11-3</span>
				<span className="text-[11px] opacity-90">🔒 Lock hit · 1st place</span>
			</motion.div>
			<div className="absolute right-0 bottom-0 left-0 h-10 bg-muted" />
			<div className="absolute bottom-9 left-1/2 h-1.5 w-60 -translate-x-1/2 rounded-full bg-foreground/70" />
		</div>
	);
}

function ReminderArt() {
	return (
		<>
			<span className="font-display text-5xl font-semibold text-muted-foreground/50">
				9:41
			</span>
			<motion.div
				className="absolute top-3 right-3 left-3 flex items-center gap-3 rounded-xl bg-card p-2.5 shadow-lg"
				animate={{ y: ["-140%", "0%", "0%", "-140%"] }}
				transition={loop(4.5, [0, 0.2, 0.8, 1])}
			>
				<img src="/icons/icon-192.png" alt="" className="size-8 rounded-lg" />
				<div className="min-w-0 text-xs">
					<div className="font-semibold">3 open picks</div>
					<div className="text-muted-foreground">First kickoff in 2h 14m</div>
				</div>
			</motion.div>
		</>
	);
}

function HomeScreenArt() {
	return (
		<div className="grid grid-cols-4 gap-x-4 gap-y-5">
			{["a", "b", "c", "d", "e", "f", "app", "h"].map((slot) =>
				slot === "app" ? (
					<span key="app" className="relative size-11">
						<motion.img
							src="/icons/icon-192.png"
							alt=""
							className="size-11 rounded-xl shadow-md"
							animate={{
								y: [-120, -120, 0, 0, 0],
								scale: [1.3, 1.3, 1, 1, 1],
								opacity: [0, 0, 1, 1, 0],
							}}
							transition={loop(4, [0, 0.1, 0.35, 0.9, 1])}
						/>
						<motion.span
							className="absolute top-12 -right-3 -left-3 text-center text-[10px] font-semibold"
							animate={{ opacity: [0, 0, 1, 1, 0] }}
							transition={loop(4, [0, 0.38, 0.45, 0.9, 1])}
						>
							Pick'em
						</motion.span>
					</span>
				) : (
					<span key={slot} className="size-11 rounded-xl bg-foreground/10" />
				),
			)}
		</div>
	);
}
