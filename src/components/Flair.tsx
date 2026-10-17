import {
	BadgeCheck,
	Crown,
	Flame,
	LockKeyhole,
	type LucideIcon,
	Rocket,
	Skull,
	Zap,
} from "lucide-react";
import { motion } from "motion/react";
import type { BadgeId } from "#/lib/flair";

export const BADGE_STYLE: Record<
	BadgeId,
	{ icon: LucideIcon; className: string }
> = {
	"week-winner": {
		icon: Crown,
		className: "text-amber-600 dark:text-amber-300",
	},
	perfect: { icon: BadgeCheck, className: "text-primary" },
	upset: { icon: Zap, className: "text-sky-600 dark:text-sky-300" },
	locks: { icon: LockKeyhole, className: "text-amber-600 dark:text-amber-300" },
	"longest-streak": {
		icon: Rocket,
		className: "text-violet-600 dark:text-violet-300",
	},
	"worst-week": { icon: Skull, className: "text-muted-foreground" },
};

export function StreakFlame({ streak }: { streak: number }) {
	return (
		<span
			title={`${streak} right in a row`}
			className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold text-orange-600 dark:text-orange-400 tabular-nums"
		>
			<motion.span
				className="inline-flex origin-bottom"
				animate={{
					scaleY: [1, 1.12, 0.96, 1.06, 1],
					rotate: [0, -3, 2, -1, 0],
				}}
				transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}
			>
				<Flame className="size-4 fill-orange-500/40" aria-hidden />
			</motion.span>
			{streak}
			<span className="sr-only"> right in a row</span>
		</span>
	);
}
