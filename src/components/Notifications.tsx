import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AtSign, Bell } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { timeAgo } from "#/lib/comments";
import { cn } from "#/lib/utils";
import {
	type MentionNote,
	markMentionsSeen,
	myMentionsQuery,
} from "#/server/comments";

/**
 * The bell in the header: everyone who @mentioned you in a game's comments.
 * Tapping one opens that game's comments.
 */
export function NotificationsBell() {
	const qc = useQueryClient();
	const { data: notes = [] } = useQuery(myMentionsQuery());
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const unseen = notes.filter((n) => !n.seen);

	useEffect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(false);
		};
		const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		document.addEventListener("pointerdown", away);
		document.addEventListener("keydown", esc);
		return () => {
			document.removeEventListener("pointerdown", away);
			document.removeEventListener("keydown", esc);
		};
	}, [open]);

	const markSeen = async (ids: string[]) => {
		if (!ids.length) return;
		qc.setQueryData<MentionNote[]>(myMentionsQuery().queryKey, (old) =>
			old?.map((n) => (ids.includes(n.comment_id) ? { ...n, seen: true } : n)),
		);
		await markMentionsSeen({ data: { commentIds: ids } }).catch(() => {});
		qc.invalidateQueries({ queryKey: myMentionsQuery().queryKey });
	};

	return (
		<div ref={root} className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-label={
					unseen.length
						? `Notifications, ${unseen.length} new`
						: "Notifications"
				}
				aria-expanded={open}
				className={cn(
					"relative grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
					open && "bg-muted text-foreground",
				)}
			>
				<motion.span
					key={unseen.length}
					animate={unseen.length ? { rotate: [0, -18, 14, -8, 4, 0] } : {}}
					transition={{ duration: 0.7 }}
					className="grid place-items-center"
				>
					<Bell className="size-5" />
				</motion.span>
				<AnimatePresence>
					{unseen.length > 0 && (
						<motion.span
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							exit={{ scale: 0 }}
							className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background"
						>
							{unseen.length > 9 ? "9+" : unseen.length}
						</motion.span>
					)}
				</AnimatePresence>
			</button>
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: -6, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -6, scale: 0.97 }}
						transition={{ type: "spring", stiffness: 500, damping: 34 }}
						className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-40 origin-top overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-96 sm:origin-top-right"
					>
						<div className="flex items-center justify-between border-b px-4 py-2.5">
							<h2 className="text-sm font-semibold">Mentions</h2>
							{unseen.length > 0 && (
								<button
									type="button"
									onClick={() => markSeen(unseen.map((n) => n.comment_id))}
									className="text-xs font-semibold text-primary hover:underline"
								>
									Mark all read
								</button>
							)}
						</div>
						{notes.length === 0 ? (
							<p className="px-4 py-8 text-center text-sm text-muted-foreground">
								Nobody's called you out yet. When someone @mentions you in a
								game's comments, it shows up here.
							</p>
						) : (
							<ul className="max-h-[60dvh] divide-y overflow-y-auto overscroll-contain">
								{notes.map((n) => (
									<li key={n.comment_id}>
										<Link
											to="/league/$leagueId"
											params={{ leagueId: n.league_id }}
											search={{ week: n.week, game: n.game_id }}
											onClick={() => {
												setOpen(false);
												if (!n.seen) markSeen([n.comment_id]);
											}}
											className={cn(
												"flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60",
												!n.seen && "bg-primary/5",
											)}
										>
											<span
												className={cn(
													"mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
													n.seen
														? "bg-muted text-muted-foreground"
														: "bg-primary/15 text-primary",
												)}
											>
												<AtSign className="size-3.5" />
											</span>
											<span className="min-w-0 flex-1">
												<span className="block text-sm">
													<span className="font-semibold">{n.author_name}</span>{" "}
													mentioned you on{" "}
													<span className="font-semibold">{n.matchup}</span>
												</span>
												<span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
													{n.body}
												</span>
												<span className="mt-0.5 block text-[11px] text-muted-foreground">
													{n.league_name} · Week {n.week} ·{" "}
													{timeAgo(n.created_at)}
												</span>
											</span>
											{!n.seen && (
												<span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
											)}
										</Link>
									</li>
								))}
							</ul>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
