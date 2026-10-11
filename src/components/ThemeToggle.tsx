import { Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
	setThemePref,
	THEME_PREFS,
	type ThemePref,
	useResolvedTheme,
	useThemePref,
} from "#/lib/theme";
import { cn } from "#/lib/utils";

const ICONS = { system: Monitor, light: Sun, dark: Moon };

/** Header button that opens a small System / Light / Dark menu. */
export function ThemeToggle({ className }: { className?: string }) {
	const pref = useThemePref();
	const resolved = useResolvedTheme();
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const close = (e: Event) => {
			if (
				e instanceof KeyboardEvent
					? e.key === "Escape"
					: !root.current?.contains(e.target as Node)
			)
				setOpen(false);
		};
		document.addEventListener("pointerdown", close);
		document.addEventListener("keydown", close);
		return () => {
			document.removeEventListener("pointerdown", close);
			document.removeEventListener("keydown", close);
		};
	}, [open]);

	const Icon = resolved === "dark" ? Moon : Sun;
	return (
		<div ref={root} className={cn("relative", className)}>
			<button
				type="button"
				aria-label="Theme"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={resolved}
						initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
						animate={{ rotate: 0, scale: 1, opacity: 1 }}
						exit={{ rotate: 90, scale: 0.6, opacity: 0 }}
						transition={{ duration: 0.2 }}
					>
						<Icon className="size-[18px]" aria-hidden />
					</motion.span>
				</AnimatePresence>
			</button>
			<AnimatePresence>
				{open && (
					<motion.div
						role="menu"
						initial={{ opacity: 0, y: -4, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -4, scale: 0.96 }}
						transition={{ duration: 0.15 }}
						className="absolute top-12 right-0 z-40 w-36 origin-top-right rounded-lg border bg-card p-1 text-sm shadow-lg"
					>
						{(Object.keys(THEME_PREFS) as ThemePref[]).map((p) => {
							const ItemIcon = ICONS[p];
							return (
								<button
									key={p}
									type="button"
									role="menuitemradio"
									aria-checked={pref === p}
									onClick={() => {
										setThemePref(p);
										setOpen(false);
									}}
									className={cn(
										"flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 transition-colors hover:bg-muted",
										pref === p
											? "font-semibold text-foreground"
											: "text-muted-foreground",
									)}
								>
									<ItemIcon className="size-4" aria-hidden />
									{THEME_PREFS[p]}
									{pref === p && (
										<span className="ml-auto size-1.5 rounded-full bg-primary" />
									)}
								</button>
							);
						})}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
