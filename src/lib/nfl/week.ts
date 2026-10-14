import type { Game } from "./types";

const ET = "America/New_York";

/** The last regular-season week; the app never rolls past it. */
export const LAST_REGULAR_WEEK = 18;

/** Hour (US Eastern) on Tuesday when a week rolls over even if a game isn't final. */
export const ROLLOVER_HOUR = 6;

/** The instant `hour`:00 US Eastern falls on the given calendar day. */
function easternInstant(y: number, m: number, d: number, hour: number) {
	const guess = Date.UTC(y, m - 1, d, hour + 5); // EST; corrected below for EDT
	const seen = Number(
		new Intl.DateTimeFormat("en-US", {
			timeZone: ET,
			hour: "numeric",
			hourCycle: "h23",
		}).format(guess),
	);
	return guess - (seen - hour) * 3_600_000;
}

/**
 * The Tuesday morning (US Eastern) that ends the NFL week a kickoff belongs
 * to. Weeks run Thursday to Monday, so it's the first Tuesday after it.
 */
export function rolloverAfter(kickoff: string) {
	const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
		timeZone: ET,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	})
		.format(new Date(kickoff))
		.split("-")
		.map(Number);
	const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	const days = (2 - weekday + 7) % 7 || 7;
	return easternInstant(y, m, d + days, ROLLOVER_HOUR);
}

/**
 * Whether the app should move on from this week to the next one: once every
 * game is final (so right after Monday night, or Sunday night in a week with
 * no Monday game), or by Tuesday morning regardless, so a postponed game
 * can't hold the league up. ESPN itself waits until Wednesday. Never past
 * week 18: the playoffs aren't pickable.
 */
export function weekIsOver(
	games: Pick<Game, "week" | "state" | "kickoff">[],
	now: Date,
) {
	if (games.length === 0) return false;
	if (games[0].week >= LAST_REGULAR_WEEK) return false;
	if (games.every((g) => g.state === "post")) return true;
	const opener = Math.min(...games.map((g) => Date.parse(g.kickoff)));
	return now.getTime() >= rolloverAfter(new Date(opener).toISOString());
}
