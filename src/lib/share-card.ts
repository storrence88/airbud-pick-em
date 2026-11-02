// What goes on a week's share card and the text that rides along with it:
// your own week ("10-2, 79 pts, 2nd of 6") or the whole league's.
//
// Sharing works from the first kickoff, not just once the week is final, so
// people can post on Sunday night. The one rule: a pick for a game that hasn't
// kicked off is never shared. It shows up only as "1 pick hidden until kickoff",
// the same rule as the app and the Discord bot.

import { teamByAbbr } from "./nfl/teams";
import type { ScoringMode } from "./scoring";
import { weekWinners } from "./tiebreaker";
import type { WeekPick, WeekResultRow } from "./week-results";

/** live: the game is on. hidden: it hasn't kicked off, so the pick stays secret. */
export type CardOutcome =
	| "win"
	| "loss"
	| "push"
	| "missed"
	| "live"
	| "hidden";

export interface CardPick {
	team: string;
	outcome: CardOutcome;
	isLock: boolean;
	confidence: number | null;
}

export interface ShareStatus {
	kind: "live" | "through" | "final";
	/** "Live", "Through Sunday", "Final". */
	label: string;
}

export interface ShareCard {
	week: number;
	league: string;
	status: ShareStatus;
	/** "11-3", or "10-3-1" with a push. */
	record: string;
	/** Shown in confidence leagues, where points aren't just wins. */
	points: number | null;
	lock: { team: string; hit: boolean | null; live: boolean } | null;
	/** "Won the week", "Co-winner", "2nd of 6". Null when only you played. */
	place: string | null;
	/** Only once the week is final. */
	winner: boolean;
	missed: number;
	live: number;
	hidden: number;
	/** One per game, in schedule order. */
	picks: CardPick[];
}

export interface ShareGame {
	id: string;
	kickoff: string;
	state: string;
	home: { abbr: string };
	away: { abbr: string };
}

export function ordinal(n: number) {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** A game has kicked off once ESPN says so or its kickoff time has passed. */
export function kickedOff(g: { state: string; kickoff: string }, now: number) {
	return g.state !== "pre" || Date.parse(g.kickoff) <= now;
}

/** Only the picks that are safe to share: their game has kicked off. */
export function shareablePicks<P extends WeekPick>(
	picks: P[],
	games: { id: string; state: string; kickoff: string }[],
	now: number,
): P[] {
	const started = new Set(
		games.filter((g) => kickedOff(g, now)).map((g) => g.id),
	);
	return picks.filter((p) => started.has(p.game_id));
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
	weekday: "long",
	timeZone: "America/New_York",
});

/**
 * Where the week stands: Live while a game is on, "Through Sunday" when the
 * games left haven't started yet, Final when they're all done. Null before
 * the first kickoff, when there's nothing to share.
 */
export function weekStatus(
	games: { state: string; kickoff: string }[],
	now: number,
): ShareStatus | null {
	if (!games.length || !games.some((g) => kickedOff(g, now))) return null;
	if (games.every((g) => g.state === "post"))
		return { kind: "final", label: "Final" };
	if (games.some((g) => g.state !== "post" && kickedOff(g, now)))
		return { kind: "live", label: "Live" };
	const last = games
		.filter((g) => g.state === "post")
		.reduce((a, b) => (Date.parse(b.kickoff) > Date.parse(a.kickoff) ? b : a));
	return {
		kind: "through",
		label: `Through ${WEEKDAY.format(new Date(last.kickoff))}`,
	};
}

/** Members who have at least one pick showing; they count toward "2nd of 6". */
function playedRows(rows: WeekResultRow[]) {
	return rows.filter((r) => Object.keys(r.cells).length > 0);
}

function placeText(
	userId: string,
	row: WeekResultRow,
	rows: WeekResultRow[],
	final: boolean,
) {
	const played = playedRows(rows);
	if (played.length < 2) return { place: null, winner: false };
	const winners = final ? weekWinners(played) : [];
	if (winners.includes(userId))
		return {
			place: winners.length > 1 ? "Co-winner" : "Won the week",
			winner: true,
		};
	return { place: `${ordinal(row.place)} of ${played.length}`, winner: false };
}

/**
 * The card for one player, from the week's ranked results and the games in
 * schedule order. `rows` must come from shareablePicks(), so no pick for a
 * game that hasn't kicked off is in them. Null before the first kickoff or
 * when the player has no pick showing yet.
 */
export function shareCard({
	userId,
	rows,
	games,
	week,
	league,
	mode,
	now,
}: {
	userId: string;
	rows: WeekResultRow[];
	games: ShareGame[];
	week: number;
	league: string;
	mode: ScoringMode;
	now: number;
}): ShareCard | null {
	const status = weekStatus(games, now);
	if (!status) return null;
	const me = rows.find((r) => r.userId === userId);
	if (!me || !Object.keys(me.cells).length) return null;

	const picks: CardPick[] = games.map((g) => {
		const c = me.cells[g.id];
		if (!kickedOff(g, now))
			return { team: "", outcome: "hidden", isLock: false, confidence: null };
		if (!c)
			return { team: "", outcome: "missed", isLock: false, confidence: null };
		return {
			team: c.team,
			outcome:
				c.outcome !== "pending"
					? c.outcome
					: g.state === "post"
						? // A final game never comes back pending; treat it as a push to be safe.
							"push"
						: "live",
			isLock: c.isLock,
			confidence: c.confidence,
		};
	});
	const lockPick = picks.find((p) => p.isLock);
	const count = (o: CardOutcome) => picks.filter((p) => p.outcome === o).length;

	return {
		week,
		league,
		status,
		record: [me.wins, me.losses, ...(me.pushes ? [me.pushes] : [])].join("-"),
		points: mode === "confidence" ? me.points : null,
		lock: lockPick
			? {
					team: lockPick.team,
					hit:
						lockPick.outcome === "win"
							? true
							: lockPick.outcome === "loss"
								? false
								: null,
					live: lockPick.outcome === "live",
				}
			: null,
		...placeText(userId, me, rows, status.kind === "final"),
		missed: count("missed"),
		live: count("live"),
		hidden: count("hidden"),
		picks,
	};
}

/** "Lock hit", "Lock missed", "Lock pushed", "Lock live". */
export function lockText(lock: NonNullable<ShareCard["lock"]>) {
	if (lock.live) return "Lock live";
	return lock.hit === true
		? "Lock hit"
		: lock.hit === false
			? "Lock missed"
			: "Lock pushed";
}

/** The caption under the image: "Week 6: 11-3, Lock hit. Won the week in Sunday Crew." */
export function shareText(card: ShareCard) {
	const parts = [card.record];
	if (card.points != null) parts.push(`${card.points} pts`);
	if (card.lock) parts.push(lockText(card.lock));
	const when = card.status.kind === "final" ? "" : ` (${card.status.label})`;
	let text = `Week ${card.week}${when}: ${parts.join(", ")}.`;
	if (card.place) text += ` ${card.place} in ${card.league}.`;
	return text;
}

const SQUARE: Record<CardOutcome, string> = {
	win: "🟩",
	loss: "🟥",
	push: "🟨",
	live: "🟦",
	missed: "⬜",
	hidden: "⬛",
};

const MARK: Record<CardOutcome, string> = {
	win: "✅",
	loss: "❌",
	push: "➖",
	live: "⏳",
	missed: "",
	hidden: "",
};

/** "Bengals" from "CIN". */
export function nickname(abbr: string) {
	const name = teamByAbbr(abbr)?.name;
	return name ? (name.split(" ").pop() ?? abbr) : abbr;
}

/**
 * The squares, Wordle style. Confidence leagues go from your surest pick to
 * your shakiest, so a red square early hurts; other leagues go in schedule
 * order. Hidden picks always come last.
 */
export function squares(card: ShareCard) {
	const shown = card.picks.filter((p) => p.outcome !== "hidden");
	const hidden = card.picks.filter((p) => p.outcome === "hidden");
	if (card.points != null)
		shown.sort(
			(a, b) =>
				(b.confidence ?? Number.NEGATIVE_INFINITY) -
				(a.confidence ?? Number.NEGATIVE_INFINITY),
		);
	return [...shown, ...hidden].map((p) => SQUARE[p.outcome]).join("");
}

function plural(n: number, one: string, many = `${one}s`) {
	return `${n} ${n === 1 ? one : many}`;
}

/** Your week as text to paste into Discord or a group chat. */
export function personalText(card: ShareCard, name: string) {
	const lines = [`${card.league} · Week ${card.week} · ${card.status.label}`];
	const stats = [
		...(card.points != null ? [`${card.points} pts`] : []),
		card.record,
		...(card.place ? [card.place] : []),
	];
	lines.push(`${card.winner ? "👑 " : ""}${name}: ${stats.join(" · ")}`);
	lines.push(squares(card));
	if (card.lock) {
		const mark = card.lock.live
			? MARK.live
			: card.lock.hit === true
				? MARK.win
				: card.lock.hit === false
					? MARK.loss
					: MARK.push;
		lines.push(`🔒 Lock of the week: ${nickname(card.lock.team)} ${mark}`);
	}
	const notes = [
		card.live && `${card.live} in progress`,
		card.missed && `${card.missed} missed`,
		card.hidden && `${plural(card.hidden, "pick")} hidden until kickoff`,
	].filter(Boolean);
	if (notes.length) lines.push(notes.join(" · "));
	return lines.join("\n");
}

export interface GroupRow {
	userId: string;
	name: string;
	place: number;
	points: number;
	record: string;
	/** The most this player can still reach. Null once the week is final. */
	max: number | null;
	winner: boolean;
}

export interface GroupShare {
	week: number;
	league: string;
	status: ShareStatus;
	mode: ScoringMode;
	rows: GroupRow[];
	/** Members with no pick showing, once the week is final. */
	noPicks: string[];
	/** Games not final yet: "BUF @ KC", flagged when they're on. */
	left: { label: string; live: boolean }[];
}

/**
 * The most a player can still reach this week, without peeking at picks for
 * games that haven't kicked off. Confidence leagues assume the player's best
 * unused values went on those games, which is an upper bound.
 */
export function maxPoints(
	row: WeekResultRow,
	games: ShareGame[],
	mode: ScoringMode,
	now: number,
) {
	let max = row.points;
	let unseen = 0;
	for (const g of games) {
		if (g.state === "post") continue;
		const c = row.cells[g.id];
		if (kickedOff(g, now)) {
			if (c) max += mode === "confidence" ? (c.confidence ?? 0) : 1;
		} else unseen += 1;
	}
	if (!unseen) return max;
	if (mode !== "confidence") return max + unseen;
	const used = new Set(Object.values(row.cells).map((c) => c.confidence ?? 0));
	for (let v = games.length; v > 0 && unseen > 0; v--) {
		if (used.has(v)) continue;
		max += v;
		unseen -= 1;
	}
	return max;
}

/**
 * The whole league's week, simplified: place, name, points, and the most each
 * player can still reach. `rows` must come from shareablePicks().
 */
export function groupShare({
	rows,
	names,
	games,
	week,
	league,
	mode,
	now,
}: {
	rows: WeekResultRow[];
	names: Map<string, string>;
	games: ShareGame[];
	week: number;
	league: string;
	mode: ScoringMode;
	now: number;
}): GroupShare | null {
	const status = weekStatus(games, now);
	if (!status) return null;
	const final = status.kind === "final";
	const played = playedRows(rows);
	const counted = final ? played : rows;
	const winners = new Set(final ? weekWinners(played) : []);
	// Re-number places among the members listed, keeping shared places shared.
	let lastPlace = 0;
	let lastSeen = 0;
	const listed = counted.map((r, i) => {
		if (r.place !== lastSeen) {
			lastSeen = r.place;
			lastPlace = i + 1;
		}
		return {
			userId: r.userId,
			name: names.get(r.userId) ?? "Player",
			place: lastPlace,
			points: r.points,
			record: [r.wins, r.losses, ...(r.pushes ? [r.pushes] : [])].join("-"),
			max: final ? null : maxPoints(r, games, mode, now),
			winner: winners.has(r.userId),
		};
	});
	return {
		week,
		league,
		status,
		mode,
		rows: listed,
		noPicks: final
			? rows
					.filter((r) => !played.includes(r))
					.map((r) => names.get(r.userId) ?? "Player")
			: [],
		left: games
			.filter((g) => g.state !== "post")
			.map((g) => ({
				label: `${g.away.abbr} @ ${g.home.abbr}`,
				live: kickedOff(g, now),
			})),
	};
}

const NAME_WIDTH = 12;

function cell(text: string, width: number, alignRight = false) {
	const t =
		[...text].length > width
			? `${[...text].slice(0, width - 1).join("")}…`
			: text;
	return alignRight ? t.padStart(width) : t.padEnd(width);
}

/** The league's week as a Discord message; the table sits in a code block so the columns line up. */
export function groupText(group: GroupShare) {
	const lines = [
		`🏈 ${group.league} · Week ${group.week} · ${group.status.label}`,
	];
	const winners = group.rows.filter((r) => r.winner).map((r) => r.name);
	if (winners.length)
		lines.push(
			winners.length > 1
				? `👑 Co-winners: ${winners.join(", ")}`
				: `👑 ${winners[0]} wins the week`,
		);
	const confidence = group.mode === "confidence";
	const score = (r: GroupRow) => (confidence ? String(r.points) : r.record);
	const scoreWidth = Math.max(...group.rows.map((r) => score(r).length), 1);
	const placeWidth = String(group.rows.length).length;
	lines.push("```");
	for (const r of group.rows) {
		const parts = [
			String(r.place).padStart(placeWidth),
			cell(r.name, NAME_WIDTH),
			cell(score(r), scoreWidth, true),
		];
		if (r.max != null) parts.push(`max ${r.max}`);
		lines.push(parts.join("  ").trimEnd());
	}
	lines.push("```");
	if (group.left.length) {
		const live = group.left.filter((g) => g.live).length;
		if (group.left.length <= 3)
			lines.push(
				`Still to play: ${group.left.map((g) => `${g.label}${g.live ? " (live)" : ""}`).join(", ")}`,
			);
		else
			lines.push(
				`${plural(group.left.length, "game")} left${live ? `, ${live} in progress` : ""}`,
			);
	}
	if (group.noPicks.length) lines.push(`No picks: ${group.noPicks.join(", ")}`);
	return lines.join("\n");
}
