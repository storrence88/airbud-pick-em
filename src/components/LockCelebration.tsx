import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playLockSound, SLAM_AT } from "#/lib/lock-sound";
import type { Team } from "#/lib/nfl/types";

/** Full run, from the chains swinging in to the overlay clearing. */
const DURATION = 2.6;
const REDUCED_DURATION = 1.2;

/**
 * Lock of the Week moment: call `celebrate(team)` from the click that sets the
 * lock and render `node`. Plays the chain-and-padlock sound with it.
 */
export function useLockCelebration() {
	const reduce = useReducedMotion();
	const [shown, setShown] = useState<{ team: Team; n: number } | null>(null);
	return {
		celebrate(team: Team) {
			playLockSound(reduce ? 0 : SLAM_AT);
			setShown((s) => ({ team, n: (s?.n ?? 0) + 1 }));
		},
		node: shown && (
			<LockCelebration
				key={shown.n}
				team={shown.team}
				onDone={() => setShown(null)}
			/>
		),
	};
}

/**
 * Chains whip in from both sides, a giant gold padlock with your team's logo
 * slams down between them, the shackle snaps shut, and the screen shakes.
 * A tap or Escape clears it early.
 */
export function LockCelebration({
	team,
	onDone,
}: {
	team: Team;
	onDone: () => void;
}) {
	const reduce = useReducedMotion();
	const total = reduce ? REDUCED_DURATION : DURATION;
	// Parents re-render mid-show (a refetch after the save); keep the timer steady.
	const done = useRef(onDone);
	done.current = onDone;

	useEffect(() => {
		const timer = window.setTimeout(() => done.current(), total * 1000);
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && done.current();
		window.addEventListener("keydown", onKey);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("keydown", onKey);
		};
	}, [total]);

	const slam = reduce ? 0 : SLAM_AT;

	return createPortal(
		<motion.div
			role="status"
			aria-live="polite"
			onClick={onDone}
			initial={{ opacity: 0 }}
			animate={{ opacity: [0, 1, 1, 0] }}
			transition={{
				duration: total,
				times: [0, 0.04, reduce ? 0.8 : 0.86, 1],
			}}
			className="fixed inset-0 z-[100] grid cursor-pointer place-items-center overflow-hidden"
		>
			<span className="sr-only">{team.shortName} is your Lock of the Week</span>
			{/* Backdrop with a gold glow that blooms when the lock lands. */}
			<div className="absolute inset-0 bg-black/70" />
			<motion.div
				aria-hidden
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(circle at 50% 45%, rgb(251 191 36 / 0.45), rgb(251 191 36 / 0.08) 35%, transparent 65%)",
				}}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: slam, duration: 0.3 }}
			/>

			{!reduce && <Rays slam={slam} />}

			<div className="relative flex flex-col items-center gap-10 sm:gap-12">
				<motion.div
					aria-hidden
					className="relative grid place-items-center"
					animate={
						reduce
							? undefined
							: {
									x: [0, -16, 14, -10, 8, -4, 2, 0],
									y: [0, 10, -8, 6, -4, 2, 0, 0],
								}
					}
					transition={{ delay: slam, duration: 0.45 }}
				>
					{!reduce && (
						<>
							<Chain angle={28} from={-1} />
							<Chain angle={-28} from={1} />
							<Rings slam={slam} />
							<Sparks slam={slam} />
						</>
					)}
					<Padlock team={team} slam={slam} reduce={!!reduce} />
				</motion.div>

				<div
					aria-hidden
					className="pointer-events-none relative flex flex-col items-center px-4 text-center"
				>
					<motion.div
						initial={{
							opacity: 0,
							scale: reduce ? 1 : 2.6,
							rotate: reduce ? 0 : -6,
						}}
						animate={{ opacity: 1, scale: 1, rotate: 0 }}
						transition={
							reduce
								? { duration: 0.2 }
								: {
										delay: slam + 0.12,
										type: "spring",
										stiffness: 420,
										damping: 16,
									}
						}
						className="font-display text-5xl leading-none font-bold tracking-tight uppercase sm:text-7xl"
					>
						<motion.span
							className="bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgb(251_191_36/0.55)]"
							style={{
								backgroundImage:
									"linear-gradient(100deg, #b45309 0%, #fbbf24 30%, #fff7d6 45%, #fbbf24 60%, #b45309 100%)",
								backgroundSize: "250% 100%",
							}}
							initial={{ backgroundPositionX: "100%" }}
							animate={{ backgroundPositionX: "-50%" }}
							transition={{
								delay: slam + 0.3,
								duration: 1.1,
								ease: "easeInOut",
							}}
						>
							Lock of the week
						</motion.span>
					</motion.div>
					<motion.p
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: slam + (reduce ? 0.1 : 0.4) }}
						className="mt-3 text-sm font-semibold tracking-[0.3em] text-amber-100/90 uppercase sm:text-base"
					>
						{team.shortName} · locked in
					</motion.p>
				</div>
			</div>

			{/* White-hot flash on impact. */}
			{!reduce && (
				<motion.div
					aria-hidden
					className="pointer-events-none absolute inset-0 bg-amber-50"
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 0.75, 0] }}
					transition={{ delay: slam, duration: 0.35, times: [0, 0.15, 1] }}
				/>
			)}
		</motion.div>,
		document.body,
	);
}

function Padlock({
	team,
	slam,
	reduce,
}: {
	team: Team;
	slam: number;
	reduce: boolean;
}) {
	return (
		<motion.div
			className="relative z-10 w-40 sm:w-52"
			style={{ transformOrigin: "50% 100%" }}
			initial={
				reduce
					? { opacity: 0, scale: 0.9 }
					: { y: "-70vh", scale: 1.8, rotate: -14 }
			}
			animate={
				reduce
					? { opacity: 1, scale: 1 }
					: {
							y: ["-70vh", "0vh", "0vh", "0vh", "0vh"],
							scale: [1.8, 1, 1, 1, 1],
							scaleY: [1, 1, 0.82, 1.06, 1],
							scaleX: [1, 1, 1.12, 0.97, 1],
							rotate: [-14, 0, 0, 0, 0],
						}
			}
			transition={
				reduce
					? { duration: 0.25 }
					: {
							delay: 0.2,
							duration: slam - 0.2 + 0.35,
							times: [0, 0.5, 0.62, 0.82, 1],
							ease: ["easeIn", "easeOut", "easeOut", "easeOut"],
						}
			}
		>
			<svg
				role="img"
				aria-label="Padlock"
				viewBox="0 0 200 230"
				className="w-full overflow-visible drop-shadow-[0_18px_40px_rgb(0_0_0/0.6)]"
			>
				<defs>
					<linearGradient id="lotw-gold" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" stopColor="#fff3c4" />
						<stop offset="0.35" stopColor="#fbbf24" />
						<stop offset="0.75" stopColor="#d97706" />
						<stop offset="1" stopColor="#92400e" />
					</linearGradient>
					<linearGradient id="lotw-steel" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0" stopColor="#64748b" />
						<stop offset="0.3" stopColor="#f1f5f9" />
						<stop offset="0.6" stopColor="#94a3b8" />
						<stop offset="1" stopColor="#475569" />
					</linearGradient>
					<clipPath id="lotw-body">
						<rect x="18" y="104" width="164" height="120" rx="24" />
					</clipPath>
				</defs>
				{/* Shackle: held open, then it snaps home on impact. */}
				<motion.path
					d="M52 116 V72 a48 48 0 0 1 96 0 V116"
					fill="none"
					stroke="url(#lotw-steel)"
					strokeWidth="22"
					initial={{ y: reduce ? 0 : -38 }}
					animate={{ y: 0 }}
					transition={
						reduce
							? { duration: 0 }
							: {
									delay: slam + 0.04,
									type: "spring",
									stiffness: 900,
									damping: 14,
								}
					}
				/>
				<rect
					x="18"
					y="104"
					width="164"
					height="120"
					rx="24"
					fill="url(#lotw-gold)"
					stroke="#78350f"
					strokeWidth="3"
				/>
				<rect
					x="26"
					y="112"
					width="148"
					height="104"
					rx="18"
					fill="none"
					stroke="rgb(255 255 255 / 0.4)"
					strokeWidth="2"
				/>
				{team.logo ? (
					<image
						href={team.logo}
						x="66"
						y="114"
						width="68"
						height="68"
						preserveAspectRatio="xMidYMid meet"
					/>
				) : (
					<text
						x="100"
						y="160"
						textAnchor="middle"
						fontSize="40"
						fontWeight="700"
						fill="#78350f"
					>
						{team.abbr}
					</text>
				)}
				{/* Keyhole. */}
				<circle cx="100" cy="192" r="7" fill="#451a03" />
				<path d="M96 194 L94 210 H106 L104 194 Z" fill="#451a03" />
				{/* Glint sweeping across the body after it lands. */}
				{!reduce && (
					<g clipPath="url(#lotw-body)">
						<motion.rect
							x="-60"
							y="90"
							width="36"
							height="160"
							fill="rgb(255 255 255 / 0.55)"
							transform="skewX(-20)"
							initial={{ x: 0 }}
							animate={{ x: 320 }}
							transition={{
								delay: slam + 0.35,
								duration: 0.6,
								ease: "easeInOut",
							}}
						/>
					</g>
				)}
			</svg>
		</motion.div>
	);
}

/** A strip of steel chain, rendered as a repeating SVG tile. */
const CHAIN_TILE = `url("data:image/svg+xml,${encodeURIComponent(
	`<svg xmlns='http://www.w3.org/2000/svg' width='48' height='28' viewBox='0 0 48 28'>
		<ellipse cx='14' cy='14' rx='12' ry='9' fill='none' stroke='#334155' stroke-width='7'/>
		<ellipse cx='14' cy='14' rx='12' ry='9' fill='none' stroke='#cbd5e1' stroke-width='3.5'/>
		<rect x='22' y='10.5' width='26' height='7' rx='3.5' fill='#475569'/>
		<rect x='22' y='11.5' width='26' height='3' rx='1.5' fill='#e2e8f0'/>
	</svg>`,
)}")`;

function Chain({ angle, from }: { angle: number; from: -1 | 1 }) {
	return (
		<motion.div
			className="pointer-events-none absolute h-9 w-[220vmax]"
			style={{
				backgroundImage: CHAIN_TILE,
				backgroundSize: "auto 100%",
				backgroundRepeat: "repeat-x",
				rotate: angle,
				filter: "drop-shadow(0 6px 8px rgb(0 0 0 / 0.6))",
			}}
			initial={{ x: `${from * 140}vmax` }}
			animate={{
				x: [`${from * 140}vmax`, "0vmax", `${-from * 1.5}vmax`, "0vmax"],
			}}
			transition={{
				duration: 0.75,
				times: [0, 0.55, 0.75, 1],
				ease: "easeOut",
			}}
		/>
	);
}

function Rings({ slam }: { slam: number }) {
	return (
		<>
			{[0, 0.08, 0.18].map((d) => (
				<motion.span
					key={d}
					className="pointer-events-none absolute size-40 rounded-full border-4 border-amber-300"
					style={{ boxShadow: "0 0 30px rgb(251 191 36 / 0.8)" }}
					initial={{ scale: 0.3, opacity: 0 }}
					animate={{ scale: 4, opacity: [0, 0.95, 0] }}
					transition={{ delay: slam + d, duration: 0.75, ease: "easeOut" }}
				/>
			))}
		</>
	);
}

function Sparks({ slam }: { slam: number }) {
	const sparks = useMemo(
		() =>
			Array.from({ length: 36 }, (_, i) => {
				const angle = (i / 36) * Math.PI * 2 + Math.random() * 0.3;
				const dist = 140 + Math.random() * 260;
				return {
					x: Math.cos(angle) * dist,
					y: Math.sin(angle) * dist,
					rotate: (angle * 180) / Math.PI,
					color: i % 3 === 0 ? "#fff7d6" : i % 3 === 1 ? "#fbbf24" : "#f59e0b",
					len: 10 + Math.random() * 16,
				};
			}),
		[],
	);
	return (
		<>
			{sparks.map((s, i) => (
				<motion.span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative list
					key={i}
					className="pointer-events-none absolute h-1 rounded-full"
					style={{
						width: s.len,
						background: s.color,
						rotate: s.rotate,
						boxShadow: `0 0 8px ${s.color}`,
					}}
					initial={{ x: 0, y: 0, opacity: 0 }}
					animate={{
						x: [0, s.x],
						y: [0, s.y + 60],
						opacity: [0, 1, 0],
						scaleX: [1.4, 0.3],
					}}
					transition={{ delay: slam, duration: 0.9, ease: "easeOut" }}
				/>
			))}
		</>
	);
}

/** Slowly turning god rays behind the padlock. */
function Rays({ slam }: { slam: number }) {
	return (
		<motion.div
			aria-hidden
			className="pointer-events-none absolute size-[160vmax]"
			style={{
				background:
					"repeating-conic-gradient(from 0deg, rgb(251 191 36 / 0.18) 0deg 8deg, transparent 8deg 20deg)",
				maskImage: "radial-gradient(circle, black 0%, transparent 45%)",
				WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 45%)",
			}}
			initial={{ opacity: 0, rotate: 0 }}
			animate={{ opacity: 1, rotate: 50 }}
			transition={{
				opacity: { delay: slam, duration: 0.3 },
				rotate: { delay: slam, duration: 2.2, ease: "linear" },
			}}
		/>
	);
}
