import { onlineManager } from "@tanstack/react-query";

/**
 * True for a request that never reached the server (no signal, Wi-Fi dropped),
 * as opposed to the server answering with an error. Each browser words it differently.
 */
export function isNetworkError(err: unknown) {
	return (
		err instanceof TypeError &&
		/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(
			err.message,
		)
	);
}

let probing = false;

/** Asks the server for a tiny response until one comes back, then marks us online. */
async function probe() {
	if (probing) return;
	probing = true;
	let wait = 1000;
	while (!onlineManager.isOnline()) {
		await new Promise((r) => setTimeout(r, wait));
		wait = Math.min(wait * 2, 15000);
		// The browser knows it has no connection; its "online" event will wake us.
		if (!navigator.onLine) continue;
		try {
			await fetch("/api/ping", { method: "HEAD", cache: "no-store" });
			onlineManager.setOnline(true);
		} catch {}
	}
	probing = false;
}

/**
 * The phone can say it's online while requests still fail (weak signal,
 * captive Wi-Fi), so a failed request also counts as being offline.
 */
export function reportError(err: unknown) {
	if (typeof window === "undefined" || !isNetworkError(err)) return;
	onlineManager.setOnline(false);
	probe();
}

/** Starts from what the browser knows; React Query tracks online/offline events after that. */
export function syncWithBrowser() {
	if (!navigator.onLine) onlineManager.setOnline(false);
}
