import { CloudRain } from "lucide-react";
import { motion, type TargetAndTransition } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import type { LossEffect, WinEffect } from "#/lib/profile";

export type EffectKind = WinEffect | LossEffect;

/** How long an effect runs before it cleans itself up. */
const DURATION_MS = 1900;

/** Card-level motion for effects that move the whole card. */
export function cardEffect(
	kind: EffectKind | null | undefined,
	color: string,
): TargetAndTransition | undefined {
	switch (kind) {
		case "shake":
			return {
				x: [0, -8, 8, -6, 6, -3, 0],
				transition: { duration: 0.55, ease: "easeInOut" },
			};
		case "deflate":
			return {
				scale: [1, 0.95, 0.97, 1],
				filter: [
					"saturate(1)",
					"saturate(0.2)",
					"saturate(0.2)",
					"saturate(1)",
				],
				transition: { duration: 1.7, times: [0, 0.15, 0.8, 1] },
			};
		case "pulse":
			return {
				boxShadow: [
					`0 0 0 0px ${color}00`,
					`0 0 0 3px ${color}, 0 0 28px 4px ${color}88`,
					`0 0 0 0px ${color}00`,
					`0 0 0 3px ${color}, 0 0 28px 4px ${color}88`,
					`0 0 0 0px ${color}00`,
				],
				transition: { duration: 1.6, ease: "easeInOut" },
			};
		default:
			return undefined;
	}
}

/**
 * Overlay that plays one pick result effect over its (relative) parent, then
 * calls onDone. Purely decorative: only the person who picked sees it.
 */
export function PickEffect({
	kind,
	colors,
	onDone,
}: {
	kind: EffectKind;
	/** Picked team's colors, used for confetti and bursts. */
	colors: string[];
	onDone: () => void;
}) {
	const done = useRef(onDone);
	done.current = onDone;
	useEffect(() => {
		const t = setTimeout(() => done.current(), DURATION_MS);
		return () => clearTimeout(t);
	}, []);

	if (kind === "confetti") return <Confetti colors={colors} />;
	if (kind === "fireworks") return <Fireworks colors={colors} />;
	if (kind === "rain") return <Rain />;
	if (kind === "shake")
		return (
			<motion.span
				aria-hidden
				className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-loss"
				initial={{ opacity: 0 }}
				animate={{ opacity: [0, 1, 0] }}
				transition={{ duration: 0.9 }}
			/>
		);
	return null;
}

/** Team colors plus the page foreground (white on dark, ink on light) and the accent. */
const palette = (colors: string[]) => [
	...colors,
	"var(--foreground)",
	"var(--primary)",
];

function useParticles<T>(count: number, make: (i: number) => T) {
	// Random once per effect so re-renders don't reshuffle the burst.
	// biome-ignore lint/correctness/useExhaustiveDependencies: generated once per mount
	return useMemo(() => Array.from({ length: count }, (_, i) => make(i)), []);
}

function Confetti({ colors }: { colors: string[] }) {
	const fill = palette(colors);
	const pieces = useParticles(32, (i) => ({
		x: (Math.random() - 0.5) * 360,
		up: 60 + Math.random() * 90,
		fall: 60 + Math.random() * 80,
		rotate: (Math.random() - 0.5) * 720,
		delay: Math.random() * 0.12,
		color: fill[i % fill.length],
		w: 5 + Math.random() * 4,
		round: i % 4 === 0,
	}));
	return (
		<span
			aria-hidden
			className="pointer-events-none absolute inset-0 z-10 overflow-visible"
		>
			{pieces.map((p, i) => (
				<motion.span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed list
					key={i}
					className="absolute top-1/2 left-1/2"
					style={{
						width: p.w,
						height: p.round ? p.w : p.w * 1.8,
						borderRadius: p.round ? "50%" : 1,
						background: p.color,
					}}
					initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
					animate={{
						x: p.x,
						y: [0, -p.up, p.fall],
						rotate: p.rotate,
						opacity: [1, 1, 0],
					}}
					transition={{
						duration: 1.5,
						delay: p.delay,
						ease: "easeOut",
						y: { duration: 1.5, delay: p.delay, times: [0, 0.35, 1] },
						opacity: { duration: 1.5, delay: p.delay, times: [0, 0.7, 1] },
					}}
				/>
			))}
		</span>
	);
}

const BURSTS = [
	{ left: "28%", top: "38%", delay: 0 },
	{ left: "72%", top: "30%", delay: 0.3 },
	{ left: "50%", top: "62%", delay: 0.6 },
];

function Fireworks({ colors }: { colors: string[] }) {
	const fill = palette(colors);
	const rays = 14;
	return (
		<span
			aria-hidden
			className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit]"
		>
			{BURSTS.map((b, bi) =>
				Array.from({ length: rays }, (_, i) => {
					const angle = (i / rays) * Math.PI * 2;
					const dist = 46 + (i % 3) * 8;
					return (
						<motion.span
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed list
							key={`${bi}-${i}`}
							className="absolute size-1.5 rounded-full"
							style={{
								left: b.left,
								top: b.top,
								background: fill[(bi + i) % fill.length],
								boxShadow: `0 0 6px ${fill[(bi + i) % fill.length]}`,
							}}
							initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
							animate={{
								x: Math.cos(angle) * dist,
								y: Math.sin(angle) * dist + 10,
								opacity: [0, 1, 0],
								scale: [0.4, 1, 0.6],
							}}
							transition={{ duration: 1.1, delay: b.delay, ease: "easeOut" }}
						/>
					);
				}),
			)}
		</span>
	);
}

function Rain() {
	const drops = useParticles(18, () => ({
		left: 8 + Math.random() * 84,
		delay: 0.2 + Math.random() * 0.8,
		len: 10 + Math.random() * 8,
	}));
	return (
		<span
			aria-hidden
			className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit]"
		>
			<motion.span
				className="absolute inset-0 bg-background/40"
				initial={{ opacity: 0 }}
				animate={{ opacity: [0, 1, 1, 0] }}
				transition={{ duration: 1.8, times: [0, 0.15, 0.8, 1] }}
			/>
			<motion.span
				className="absolute top-2 left-1/2 -translate-x-1/2 text-muted-foreground"
				initial={{ y: -30, opacity: 0 }}
				animate={{ y: [-30, 0, 0, -10], opacity: [0, 1, 1, 0] }}
				transition={{ duration: 1.8, times: [0, 0.15, 0.8, 1] }}
			>
				<CloudRain className="size-8" />
			</motion.span>
			{drops.map((d, i) => (
				<motion.span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed list
					key={i}
					className="absolute top-10 w-px rounded-full bg-sky-500/70 dark:bg-sky-300/70"
					style={{ left: `${d.left}%`, height: d.len }}
					initial={{ y: 0, opacity: 0 }}
					animate={{ y: 140, opacity: [0, 1, 0] }}
					transition={{ duration: 0.7, delay: d.delay, ease: "easeIn" }}
				/>
			))}
		</span>
	);
}
