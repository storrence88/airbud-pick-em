import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

/** Air Bud's face, the app icon, with a gentle idle bob. */
export function AirBudFace({
	size = 44,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<motion.img
			src="/icons/icon-192.png"
			alt="Air Bud"
			width={size}
			height={size}
			animate={{ y: [0, -3, 0], rotate: [0, -4, 0] }}
			transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY }}
			className={cn(
				"shrink-0 rounded-full border-2 border-primary bg-card shadow-md",
				className,
			)}
			style={{ width: size, height: size }}
		/>
	);
}

/**
 * Air Bud talking: his face and a speech bubble. Pass a new `say` key to pop
 * in the next line.
 */
export function AirBudSays({
	say,
	children,
	className,
}: {
	say: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-end gap-3", className)}>
			<AirBudFace />
			<div className="relative min-w-0 flex-1" aria-live="polite">
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div
						key={say}
						initial={{ opacity: 0, y: 8, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ type: "spring", stiffness: 420, damping: 28 }}
						className="origin-bottom-left rounded-2xl rounded-bl-sm border bg-card px-4 py-3 text-sm leading-relaxed shadow-sm"
					>
						{children}
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
}
