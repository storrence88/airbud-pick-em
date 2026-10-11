// What a player has already seen of the onboarding: the What's new cards,
// the practice week, the "new" dots and the Rookie checklist. Saved on their
// profile (profiles.onboarding), so it follows them across devices and can be
// reset from the SQL editor.

import { useSyncExternalStore } from "react";
import { saveOnboarding } from "#/server/profile";

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
	/** Overrides the account-age rule, for testing: "new" gets the practice week. */
	player?: "new" | "veteran";
	/** Release whose What's new cards were seen. */
	whatsNew?: string;
	/** The practice week was offered, finished or skipped. */
	practice?: boolean;
	/** Dots for one release: when they first showed and which were tapped. */
	dots?: { release: string; since: number; seen: DotId[] };
	/** The Rookie checklist was finished or hidden. */
	rookie?: "done" | "dismissed";
	/** Opened from the home screen at least once. */
	installed?: boolean;
}

const EMPTY: OnboardingState = {};
// The signed-in player's state, seeded from their profile on load and saved
// back to it on every change. Browser only: the server never keeps it.
let cache: OnboardingState = EMPTY;
let owner: string | null = null;
const listeners = new Set<() => void>();

/** Loads the player's saved state; a no-op on the server or for the same player. */
export function seedOnboarding(
	user: { id: string; onboarding?: OnboardingState } | null,
) {
	if (typeof window === "undefined") return;
	const id = user?.id ?? null;
	if (id === owner) return;
	owner = id;
	cache = user?.onboarding ?? EMPTY;
}

/** The saved state right now, for effects and handlers. */
export function readOnboarding(): OnboardingState {
	return typeof window === "undefined" ? EMPTY : cache;
}

export function updateOnboarding(fn: (s: OnboardingState) => OnboardingState) {
	const next = fn(cache);
	if (next === cache) return;
	cache = next;
	for (const l of listeners) l();
	if (owner)
		saveOnboarding({ data: next }).catch(() => {
			// Worst case it shows again next time; not worth bothering anyone.
		});
}

function subscribe(l: () => void) {
	listeners.add(l);
	return () => {
		listeners.delete(l);
	};
}

/** The saved state; empty during server render and hydration. */
export function useOnboarding(): OnboardingState {
	return useSyncExternalStore(subscribe, readOnboarding, () => EMPTY);
}

/**
 * True for players who were around before the practice week existed, by
 * account age unless their profile says otherwise.
 */
export function isVeteran(
	user: { createdAt?: string } | null | undefined,
	state: OnboardingState = readOnboarding(),
) {
	if (!user) return false;
	if (state.player) return state.player === "veteran";
	return (
		!!user.createdAt &&
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
