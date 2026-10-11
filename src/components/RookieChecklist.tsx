import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { Check, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { isVeteran, updateOnboarding, useOnboarding } from "#/lib/onboarding";
import { rookieTasks } from "#/lib/rookie";
import { cn } from "#/lib/utils";
import { myProfileQuery } from "#/server/profile";
import { AirBudFace } from "./AirBud";
import { PickEffect } from "./PickEffect";

/**
 * A short list of real first steps for new players, ticked off as they do
 * them. Finishing it gets a little celebration, then it's gone for good.
 */
export function RookieChecklist({
	picks,
	hasLock,
	hasTiebreaker,
}: {
	picks: number;
	hasLock: boolean;
	hasTiebreaker: boolean;
}) {
	const { user } = useRouteContext({ from: "__root__" });
	const state = useOnboarding();
	const { data: me } = useQuery({ ...myProfileQuery(), enabled: !!user });
	const [phone, setPhone] = useState(false);
	const [howTo, setHowTo] = useState(false);
	useEffect(() => {
		setPhone(window.matchMedia("(pointer: coarse)").matches);
	}, []);

	if (!user || !me || isVeteran(user) || state.rookie?.[user.id]) return null;
	const tasks = rookieTasks({
		picks,
		hasLock,
		hasTiebreaker,
		favoriteTeam: me.profile.favorite_team,
		installed: !!state.installed,
		phone,
	});
	const done = tasks.filter((t) => t.done).length;
	const complete = done === tasks.length;
	const close = (how: "done" | "dismissed") =>
		updateOnboarding((s) => ({
			...s,
			rookie: { ...s.rookie, [user.id]: how },
		}));
	const C = 2 * Math.PI * 20;

	return (
		<motion.section
			layout
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			className={cn(
				"relative mt-6 rounded-lg border bg-card p-4",
				complete && "border-primary",
			)}
		>
			<div className="flex items-center gap-4">
				<svg
					viewBox="0 0 48 48"
					className="size-12 shrink-0 -rotate-90"
					aria-hidden="true"
				>
					<circle
						cx="24"
						cy="24"
						r="20"
						fill="none"
						strokeWidth="5"
						className="stroke-muted"
					/>
					<motion.circle
						cx="24"
						cy="24"
						r="20"
						fill="none"
						strokeWidth="5"
						strokeLinecap="round"
						strokeDasharray={C}
						className="stroke-primary"
						initial={false}
						animate={{ strokeDashoffset: C * (1 - done / tasks.length) }}
						transition={{ type: "spring", stiffness: 80, damping: 18 }}
					/>
					<text
						x="24"
						y="24"
						dy="0.35em"
						textAnchor="middle"
						className="rotate-90 fill-foreground font-display text-[13px] font-semibold"
						style={{ transformOrigin: "24px 24px" }}
					>
						{done}/{tasks.length}
					</text>
				</svg>
				<div className="min-w-0 flex-1">
					<span className="sr-only">
						{done} of {tasks.length} done.
					</span>
					<h2 className="font-display text-lg font-semibold uppercase leading-tight">
						{complete ? "Rookie camp complete" : "Rookie checklist"}
					</h2>
					<p className="text-sm text-muted-foreground">
						{complete
							? "You're all set up. Welcome to the crew."
							: "A few first steps to get you set up."}
					</p>
				</div>
				{complete ? (
					<AirBudFace size={40} />
				) : (
					<button
						type="button"
						onClick={() => close("dismissed")}
						aria-label="Hide the checklist"
						className="-mt-6 -mr-2 grid size-8 place-items-center self-start rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="size-4" aria-hidden />
					</button>
				)}
			</div>
			<ul className="mt-4 grid gap-1">
				{tasks.map((t) => {
					const row = (
						<>
							<span
								className={cn(
									"grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
									t.done
										? "border-primary bg-primary text-primary-foreground"
										: "border-border",
								)}
							>
								<AnimatePresence>
									{t.done && (
										<motion.span
											initial={{ scale: 0, rotate: -45 }}
											animate={{ scale: 1, rotate: 0 }}
											transition={{
												type: "spring",
												stiffness: 500,
												damping: 15,
											}}
										>
											<Check className="size-3.5" strokeWidth={3} />
										</motion.span>
									)}
								</AnimatePresence>
							</span>
							<span
								className={cn(
									"min-w-0 flex-1 text-sm transition-colors",
									t.done && "text-muted-foreground line-through",
								)}
							>
								{t.label}
							</span>
						</>
					);
					const cls =
						"flex min-h-10 w-full items-center gap-3 rounded-md px-2 text-left";
					if (t.done)
						return (
							<li key={t.id} className={cls}>
								{row}
							</li>
						);
					if (t.id === "team")
						return (
							<li key={t.id}>
								<Link
									to="/profile"
									className={cn(cls, "transition-colors hover:bg-muted")}
								>
									{row}
									<ChevronRight
										className="size-4 text-muted-foreground"
										aria-hidden
									/>
								</Link>
							</li>
						);
					if (t.id === "install")
						return (
							<li key={t.id}>
								<button
									type="button"
									onClick={() => setHowTo((v) => !v)}
									aria-expanded={howTo}
									className={cn(cls, "transition-colors hover:bg-muted")}
								>
									{row}
									<ChevronRight
										className={cn(
											"size-4 text-muted-foreground transition-transform",
											howTo && "rotate-90",
										)}
										aria-hidden
									/>
								</button>
								<AnimatePresence initial={false}>
									{howTo && (
										<motion.p
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											className="overflow-hidden pl-10 text-sm text-muted-foreground"
										>
											<span className="block pb-2">
												iPhone: in Safari, tap Share, then Add to Home Screen.
												Android: in Chrome, tap ⋮, then Add to Home screen. Then
												open Pick'em from the new icon.
											</span>
										</motion.p>
									)}
								</AnimatePresence>
							</li>
						);
					return (
						<li key={t.id} className={cls}>
							{row}
						</li>
					);
				})}
			</ul>
			{complete && (
				<>
					<button
						type="button"
						onClick={() => close("done")}
						className="mt-3 h-10 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
					>
						Let's play
					</button>
					<PickEffect kind="confetti" colors={["#f5b800"]} onDone={() => {}} />
				</>
			)}
		</motion.section>
	);
}
