import { useEffect } from "react";

/** Registers the app-shell service worker (production only, so dev stays uncached). */
export function ServiceWorker() {
	useEffect(() => {
		if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
		navigator.serviceWorker.register("/sw.js").catch(() => {
			// Installing is a nice-to-have; the site works fine without it.
		});
	}, []);
	return null;
}
