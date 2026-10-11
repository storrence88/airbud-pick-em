// What this device has already seen of the onboarding: the What's new cards,
// the practice week, the "new" dots and the Rookie checklist. Kept on the
// device only (no migration); clearing site data just shows things again.

import { useSyncExternalStore } from "react";

/** Bump when there's a new set of What's new cards. */
export const RELEASE = "2026-10-11";
/**
 * Accounts made after this get the practice week; older ones already know the
 * app and get the What's new cards instead.
 */
export const NEW_PLAYERS_SINCE = "2026-10-11T06:00:00Z";
/** New dots fade out on their own this long after they first show. */
export const NEW_DOT_DAYS = 14;

export type DotId =
	| "survivor"
	| "share"
	| "game-details"
	| "tiebreaker"
	| "reminders";

export interface OnboardingState {
	/** Release whose What's new cards were seen. */
	whatsNew?: string;
	/** Finished or skipped the practice week. */
	practice?: boolean;
	/** Dots for one release: when they first showed and which were tapped. */
	dots?: { release: string; since: number; seen: DotId[] };
	/** Rookie checklist by user id. */
	rookie?: Record<string, "done" | "dismissed">;
	/** Opened from the home screen at least once. */
	installed?: boolean;
}

const KEY = "pickem:onboarding";
const EMPTY: OnboardingState = {};
let cache: OnboardingState | null = null;
const listeners = new Set<() => void>();

/** The saved state right now, for effects and handlers. */
export function readOnboarding(): OnboardingState {
	if (cache) return cache;
	try {
		cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
	} catch {
		cache = {};
	}
	return cache as OnboardingState;
}

export function updateOnboarding(fn: (s: OnboardingState) => OnboardingState) {
	cache = fn(readOnboarding());
	try {
		localStorage.setItem(KEY, JSON.stringify(cache));
	} catch {}
	for (const l of listeners) l();
}

function subscribe(l: () => void) {
	listeners.add(l);
	const onStorage = (e: StorageEvent) => {
		if (e.key !== KEY) return;
		cache = null;
		l();
	};
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(l);
		window.removeEventListener("storage", onStorage);
	};
}

/** The saved state; empty during server render and hydration. */
export function useOnboarding(): OnboardingState {
	return useSyncExternalStore(subscribe, readOnboarding, () => EMPTY);
}

/** True for accounts made before the practice week existed. */
export function isVeteran(user: { createdAt?: string } | null | undefined) {
	return (
		!!user?.createdAt &&
		Date.parse(user.createdAt) < Date.parse(NEW_PLAYERS_SINCE)
	);
}

/** Whether a dot should still show, given when the dots first appeared. */
export function dotVisible(
	state: OnboardingState,
	id: DotId,
	now = Date.now(),
): boolean {
	const dots = state.dots;
	if (!dots || dots.release !== RELEASE) return true;
	if (now - dots.since > NEW_DOT_DAYS * 86_400_000) return false;
	return !dots.seen.includes(id);
}

/** Starts the dots' clock the first time any of them shows. */
export function startDots(now = Date.now()) {
	updateOnboarding((s) =>
		s.dots?.release === RELEASE
			? s
			: { ...s, dots: { release: RELEASE, since: now, seen: [] } },
	);
}

export function dismissDot(id: DotId) {
	updateOnboarding((s) => {
		const dots =
			s.dots?.release === RELEASE
				? s.dots
				: { release: RELEASE, since: Date.now(), seen: [] };
		return dots.seen.includes(id)
			? s
			: { ...s, dots: { ...dots, seen: [...dots.seen, id] } };
	});
}

// Reopening What's new from the profile page isn't saved, just broadcast.
const reopeners = new Set<() => void>();
export function onReopenWhatsNew(fn: () => void) {
	reopeners.add(fn);
	return () => {
		reopeners.delete(fn);
	};
}
export function reopenWhatsNew() {
	for (const fn of reopeners) fn();
}

/** Running as an installed home-screen app right now. */
export function isStandalone() {
	if (typeof window === "undefined") return false;
	return (
		window.matchMedia?.("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}
