// Pick reminders, shared by the email job and the bot API. Pure functions
// only, so the timing and wording are easy to test.

import type { ReminderStyle } from "./profile";

export const REMINDER_CHANNELS = {
	email: "Email",
	discord: "Discord DM",
	off: "Off",
} as const;

export type ReminderChannel = keyof typeof REMINDER_CHANNELS;

/** Reminders go out within this many hours of a game day's first kickoff. */
export const REMIND_HOURS = 3;

const ET = "America/New_York";

/** The game day a kickoff belongs to: its US Eastern date, like 2026-10-11. */
export function slateOf(kickoff: string) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: ET,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(kickoff));
}

export interface Slate<G> {
	/** The game day, like 2026-10-11. */
	id: string;
	firstKickoff: string;
	/** That day's games that haven't kicked off yet. */
	games: G[];
}

/**
 * The game day whose first kickoff is still ahead but within `hours`, if
 * any. Thursday, Sunday and Monday each get their own reminder.
 */
export function dueSlate<G extends { kickoff: string }>(
	games: G[],
	now: Date,
	hours = REMIND_HOURS,
): Slate<G> | null {
	const days = new Map<string, G[]>();
	for (const g of games) {
		const id = slateOf(g.kickoff);
		days.set(id, [...(days.get(id) ?? []), g]);
	}
	for (const [id, day] of days) {
		const first = Math.min(...day.map((g) => Date.parse(g.kickoff)));
		const ahead = first - now.getTime();
		if (ahead > 0 && ahead <= hours * 3_600_000)
			return {
				id,
				firstKickoff: new Date(first).toISOString(),
				games: day
					.filter((g) => Date.parse(g.kickoff) > now.getTime())
					.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
			};
	}
	return null;
}

/** "1:00 PM ET", for emails. */
export function easternTime(iso: string) {
	return `${new Intl.DateTimeFormat("en-US", {
		timeZone: ET,
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(iso))} ET`;
}

/** Discord renders this in each reader's own time zone, like "in 3 hours". */
export const discordTime = (iso: string) =>
	`<t:${Math.floor(Date.parse(iso) / 1000)}:R>`;

export interface ReminderLeague {
	name: string;
	games: { away: string; home: string }[];
}

const GENTLE = [
	(n: number, when: string) =>
		`Quick heads up: you have ${n} open ${plural(n)} today. First kickoff is ${when}.`,
	(n: number, when: string) =>
		`Games start ${when} and you still have ${n} ${plural(n)} to make.`,
];

const ROAST = [
	(n: number, when: string) =>
		`Kickoff is ${when} and you've left ${n} ${plural(n)} blank. Bold strategy.`,
	(n: number, when: string) =>
		`${n} open ${plural(n)}, first game ${when}. Even a coin flip beats a zero.`,
	(n: number, when: string) =>
		`Your picks are emptier than the Jets' trophy case. ${n} to go, first kickoff ${when}.`,
];

const plural = (n: number) => (n === 1 ? "pick" : "picks");

/** Same day and person, same line; different days get some variety. */
function choose<T>(lines: T[], seed: string) {
	let h = 0;
	for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return lines[h % lines.length];
}

/**
 * The reminder's wording. Only lists the reader's own open games, never
 * anything about anyone else's picks.
 */
export function reminderMessage({
	name,
	style,
	when,
	leagues,
	seed,
}: {
	name: string;
	style: ReminderStyle;
	/** The first kickoff, already formatted for where it's shown. */
	when: string;
	leagues: ReminderLeague[];
	seed: string;
}) {
	const count = leagues.reduce((n, l) => n + l.games.length, 0);
	const line = choose(style === "roast" ? ROAST : GENTLE, seed)(count, when);
	const games = leagues.map(
		(l) =>
			`${leagues.length > 1 ? `${l.name}: ` : ""}${l.games.map((g) => `${g.away} @ ${g.home}`).join(", ")}`,
	);
	return {
		subject:
			style === "roast"
				? `${name}, your picks are still blank`
				: `${count} open ${plural(count)} today`,
		intro: `${name}, ${line[0].toLowerCase()}${line.slice(1)}`,
		games,
	};
}
