import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playLockSound, preloadLockSound, SLAM_AT } from "#/lib/lock-sound";
import type { Team } from "#/lib/nfl/types";

/** Full run, from the chains swinging in to the overlay clearing. */
const DURATION = SLAM_AT + 2.2;
/** When each pair of chains crashes into place during the buildup. */
const CHAIN_HITS = [0.45, 0.8];
const REDUCED_DURATION = 1.2;

/**
 * Lock of the Week moment: call `celebrate(team)` from the click that sets the
 * lock and render `node`. Plays the chain-and-padlock sound with it.
 */
export function useLockCelebration() {
	const reduce = useReducedMotion();
	const [shown, setShown] = useState<{ team: Team; n: number } | null>(null);
	useEffect(preloadLockSound, []);
	return {
		celebrate(team: Team) {
			playLockSound(!!reduce);
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
 * Two pairs of chains crash in, the screen rumbles harder and harder while a
 * giant gold padlock with your team's logo hangs overhead, then it slams down
 * like a bomb: shackle snaps shut, fireball, flash, shockwaves, sparks and a
 * big screen shake.
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
				animate={reduce ? { opacity: 1 } : { opacity: [0, 0.35, 1] }}
				transition={
					reduce
						? { duration: 0.3 }
						: { delay: 0.6, duration: slam - 0.6, times: [0, 0.9, 1] }
				}
			/>

			{!reduce && <Rays slam={slam} />}

			<motion.div
				className="relative flex flex-col items-center gap-10 sm:gap-12"
				animate={reduce ? undefined : rumble}
				transition={{
					delay: CHAIN_HITS[1],
					duration: slam - CHAIN_HITS[1],
					ease: "linear",
				}}
			>
				<motion.div
					aria-hidden
					className="relative grid place-items-center"
					animate={
						reduce
							? undefined
							: {
									x: [0, -34, 30, -24, 18, -12, 8, -4, 0],
									y: [0, 26, -20, 14, -10, 6, -3, 1, 0],
								}
					}
					transition={{ delay: slam, duration: 0.75 }}
				>
					{!reduce && (
						<>
							<Chain angle={28} from={-1} at={CHAIN_HITS[0]} />
							<Chain angle={-28} from={1} at={CHAIN_HITS[0]} />
							<Chain angle={64} from={1} at={CHAIN_HITS[1]} />
							<Chain angle={-64} from={-1} at={CHAIN_HITS[1]} />
							<Fireball slam={slam} />
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
			</motion.div>

			{/* White-hot flash on impact. */}
			{!reduce && (
				<motion.div
					aria-hidden
					className="pointer-events-none absolute inset-0 bg-amber-50"
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 0.95, 0.5, 0] }}
					transition={{
						delay: slam,
						duration: 0.6,
						times: [0, 0.08, 0.3, 1],
					}}
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
					: { y: "-95vh", scale: 1.8, rotate: -14 }
			}
			animate={
				reduce
					? { opacity: 1, scale: 1 }
					: {
							// Swing into view overhead, hang there swaying while the
							// tension builds, then drop like a bomb.
							y: [
								"-95vh",
								"-12vh",
								"-14vh",
								"-17vh",
								"0vh",
								"0vh",
								"0vh",
								"0vh",
							],
							scale: [1.8, 1.15, 1.22, 1.3, 1, 1, 1, 1],
							scaleY: [1, 1, 1, 1, 1, 0.74, 1.08, 1],
							scaleX: [1, 1, 1, 1, 1, 1.2, 0.96, 1],
							rotate: [-14, -6, 5, -3, 0, 0, 0, 0],
						}
			}
			transition={
				reduce
					? { duration: 0.25 }
					: {
							duration: slam + 0.4,
							times: [
								0,
								0.6 / (slam + 0.4),
								(slam - 0.55) / (slam + 0.4),
								(slam - 0.22) / (slam + 0.4),
								slam / (slam + 0.4),
								(slam + 0.08) / (slam + 0.4),
								(slam + 0.22) / (slam + 0.4),
								1,
							],
							ease: [
								"easeOut",
								"easeInOut",
								"easeInOut",
								"easeIn",
								"easeOut",
								"easeOut",
								"easeOut",
							],
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
		<ellipse cx='14' cy='14' rx='11.5' ry='9.5' fill='none' stroke='#1e293b' stroke-width='9'/>
		<ellipse cx='14' cy='14' rx='11.5' ry='9.5' fill='none' stroke='#94a3b8' stroke-width='5.5'/>
		<ellipse cx='13' cy='12.5' rx='11' ry='8.5' fill='none' stroke='#f1f5f9' stroke-width='1.8'/>
		<rect x='21' y='9' width='28' height='10' rx='5' fill='#1e293b'/>
		<rect x='21' y='10.5' width='28' height='6' rx='3' fill='#94a3b8'/>
		<rect x='21' y='11' width='28' height='2' rx='1' fill='#f1f5f9'/>
	</svg>`,
)}")`;

/** Screen rumble that grows from a tremor to a violent shake before the slam. */
const rumble = {
	x: Array.from({ length: 24 }, (_, i) => (i % 2 ? 1 : -1) * (1 + i * 0.35)),
	y: Array.from({ length: 24 }, (_, i) => (i % 3 ? 1 : -1) * (0.5 + i * 0.25)),
};

/** A thick steel chain that whips in and crashes into place at `at` seconds. */
function Chain({
	angle,
	from,
	at,
}: {
	angle: number;
	from: -1 | 1;
	at: number;
}) {
	return (
		<motion.div
			className="pointer-events-none absolute h-12 w-[220vmax] sm:h-14"
			style={{
				backgroundImage: CHAIN_TILE,
				backgroundSize: "auto 100%",
				backgroundRepeat: "repeat-x",
				rotate: angle,
				filter: "drop-shadow(0 8px 10px rgb(0 0 0 / 0.7))",
			}}
			initial={{ x: `${from * 140}vmax` }}
			animate={{
				x: [`${from * 140}vmax`, "0vmax", `${-from * 2}vmax`, "0vmax"],
			}}
			transition={{
				delay: at - 0.3,
				duration: 0.55,
				times: [0, 0.55, 0.75, 1],
				ease: ["easeIn", "easeOut", "easeOut"],
			}}
		/>
	);
}

function Rings({ slam }: { slam: number }) {
	return (
		<>
			{[0, 0.06, 0.14, 0.24, 0.36].map((d) => (
				<motion.span
					key={d}
					className="pointer-events-none absolute size-40 rounded-full border-4 border-amber-300"
					style={{ boxShadow: "0 0 30px rgb(251 191 36 / 0.8)" }}
					initial={{ scale: 0.3, opacity: 0 }}
					animate={{ scale: 6, opacity: [0, 0.95, 0] }}
					transition={{ delay: slam + d, duration: 0.9, ease: "easeOut" }}
				/>
			))}
		</>
	);
}

function Sparks({ slam }: { slam: number }) {
	const sparks = useMemo(
		() =>
			Array.from({ length: 72 }, (_, i) => {
				const angle = (i / 72) * Math.PI * 2 + Math.random() * 0.3;
				const dist = 160 + Math.random() * 480;
				return {
					x: Math.cos(angle) * dist,
					y: Math.sin(angle) * dist,
					rotate: (angle * 180) / Math.PI,
					color: i % 3 === 0 ? "#fff7d6" : i % 3 === 1 ? "#fbbf24" : "#f59e0b",
					len: 12 + Math.random() * 26,
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
					transition={{ delay: slam, duration: 1.1, ease: "easeOut" }}
				/>
			))}
		</>
	);
}

/** The blast: a white-hot core blooming into an orange fireball. */
function Fireball({ slam }: { slam: number }) {
	return (
		<motion.span
			aria-hidden
			className="pointer-events-none absolute size-48 rounded-full"
			style={{
				background:
					"radial-gradient(circle, #fffbeb 0%, #fde68a 22%, #f59e0b 45%, rgb(234 88 12 / 0.7) 62%, transparent 72%)",
				filter: "blur(4px)",
			}}
			initial={{ scale: 0, opacity: 0 }}
			animate={{ scale: [0, 3.2, 5], opacity: [0, 1, 0] }}
			transition={{
				delay: slam,
				duration: 0.8,
				times: [0, 0.3, 1],
				ease: "easeOut",
			}}
		/>
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
