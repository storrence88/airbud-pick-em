import { onlineManager } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { syncWithBrowser } from "#/lib/connection";

/** Whether the app can reach the server right now. Always true on the server. */
export function useOnline() {
	return useSyncExternalStore(
		(cb) => onlineManager.subscribe(cb),
		() => onlineManager.isOnline(),
		() => true,
	);
}

/**
 * A small pill along the bottom while the connection is down, and a quick
 * "back online" once it returns, when the page reloads its data.
 */
export function ConnectionBanner() {
	const online = useOnline();
	const router = useRouter();
	const [back, setBack] = useState(false);
	const wasOnline = useRef(true);

	useEffect(() => syncWithBrowser(), []);

	useEffect(() => {
		if (online === wasOnline.current) return;
		wasOnline.current = online;
		if (!online) return setBack(false);
		// React Query refetches what's on screen; this reruns the route loaders
		// (and the signed-in check) so nothing stale is left behind.
		router.invalidate();
		setBack(true);
		const t = setTimeout(() => setBack(false), 2500);
		return () => clearTimeout(t);
	}, [online, router]);

	const show = !online ? "offline" : back ? "back" : null;
	return (
		<output
			aria-live="polite"
			className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
		>
			<AnimatePresence mode="wait">
				{show && (
					<motion.div
						key={show}
						initial={{ opacity: 0, y: 16, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 8 }}
						transition={{ type: "spring", stiffness: 380, damping: 30 }}
						className="flex items-center gap-2.5 rounded-full border bg-card/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl"
					>
						{show === "offline" ? (
							<>
								<WifiOff
									className="size-4 shrink-0 text-amber-400"
									aria-hidden
								/>
								<span>
									<span className="font-semibold">You're offline.</span>{" "}
									<span className="text-muted-foreground">
										Picks are paused
										<span className="hidden sm:inline">
											{" "}
											until you reconnect
										</span>
										.
									</span>
								</span>
							</>
						) : (
							<>
								<Check className="size-4 shrink-0 text-primary" aria-hidden />
								<span className="font-semibold">Back online</span>
							</>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</output>
	);
}
