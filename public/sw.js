// Pick'em service worker.
//
// Caches only the app shell: hashed build assets, icons and the offline page.
// Everything else (pages, server functions, Supabase, ESPN) always goes to the
// network, so picks and scores are never stale.

const CACHE = "pickem-shell-v3";
const PRECACHE = [
	"/offline.html",
	"/icons/icon-192.png",
	"/icons/icon-512.png",
	"/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// Build assets are content-hashed, so a cached copy is always correct.
	if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
		event.respondWith(
			caches.match(request).then(
				(hit) =>
					hit ||
					fetch(request).then((res) => {
						if (res.ok) {
							const copy = res.clone();
							caches.open(CACHE).then((cache) => cache.put(request, copy));
						}
						return res;
					}),
			),
		);
		return;
	}

	// Pages are always fetched live; the offline page is only a fallback.
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request).catch(() => caches.match("/offline.html")),
		);
	}
});

// Groundwork for push reminders: the server sends a JSON payload like
// { "title": "...", "body": "...", "url": "/league/123", "tag": "reminder-2026-10-12" }.
self.addEventListener("push", (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : "" };
	}
	event.waitUntil(
		self.registration.showNotification(data.title || "Pick'em", {
			body: data.body || "",
			icon: "/icons/icon-192.png",
			badge: "/icons/icon-192.png",
			tag: data.tag,
			data: { url: data.url || "/" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(
		event.notification.data?.url || "/",
		self.location.origin,
	).href;
	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((windows) => {
				const open = windows.find((w) => w.url.startsWith(self.location.origin));
				if (open) {
					return open
						.navigate(target)
						.then((w) => (w ?? open).focus())
						.catch(() => self.clients.openWindow(target));
				}
				return self.clients.openWindow(target);
			}),
	);
});
