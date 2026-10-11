// What goes on a player's week share card ("11-3, Lock hit") and the text
// that rides along with it. Only built for a week whose games are all final,
// so sharing it never gives away a pick before kickoff.

import type { ScoringMode } from "./scoring";
import { weekWinners } from "./tiebreaker";
import type { WeekResultRow } from "./week-results";

export type CardOutcome = "win" | "loss" | "push" | "missed";

export interface CardPick {
	team: string;
	outcome: CardOutcome;
	isLock: boolean;
	confidence: number | null;
}

export interface ShareCard {
	week: number;
	league: string;
	/** "11-3", or "10-3-1" with a push. */
	record: string;
	/** Shown in confidence leagues, where points aren't just wins. */
	points: number | null;
	lock: { team: string; hit: boolean | null } | null;
	/** "Won the week", "Co-winner", "2nd of 6". Null when only you played. */
	place: string | null;
	winner: boolean;
	missed: number;
	/** One per game, in schedule order. */
	picks: CardPick[];
}

export function ordinal(n: number) {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * The card for one player, from the week's ranked results (weekResults) and
 * the games in schedule order. Null until every game is final or when the
 * player made no picks.
 */
export function shareCard({
	userId,
	rows,
	games,
	week,
	league,
	mode,
}: {
	userId: string;
	rows: WeekResultRow[];
	games: { id: string; state: string }[];
	week: number;
	league: string;
	mode: ScoringMode;
}): ShareCard | null {
	if (!games.length || games.some((g) => g.state !== "post")) return null;
	const me = rows.find((r) => r.userId === userId);
	if (!me || !Object.keys(me.cells).length) return null;

	const picks: CardPick[] = games.map((g) => {
		const c = me.cells[g.id];
		if (!c)
			return { team: "", outcome: "missed", isLock: false, confidence: null };
		return {
			team: c.team,
			// A final game never comes back pending; treat it as a push to be safe.
			outcome: c.outcome === "pending" ? "push" : c.outcome,
			isLock: c.isLock,
			confidence: c.confidence,
		};
	});
	const lockPick = picks.find((p) => p.isLock);

	// Members who skipped the week don't count toward "2nd of 6".
	const played = rows.filter((r) => Object.keys(r.cells).length > 0);
	const winners = weekWinners(played);
	const winner = winners.includes(userId);
	const place =
		played.length < 2
			? null
			: winner
				? winners.length > 1
					? "Co-winner"
					: "Won the week"
				: `${ordinal(me.place)} of ${played.length}`;

	return {
		week,
		league,
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
				}
			: null,
		place,
		winner,
		missed: picks.filter((p) => p.outcome === "missed").length,
		picks,
	};
}

/** "Lock hit", "Lock missed", "Lock pushed". */
export function lockText(lock: NonNullable<ShareCard["lock"]>) {
	return lock.hit === true
		? "Lock hit"
		: lock.hit === false
			? "Lock missed"
			: "Lock pushed";
}

/** The message that goes with the image: "Week 6: 11-3, Lock hit. Won the week in Sunday Crew." */
export function shareText(card: ShareCard) {
	const parts = [card.record];
	if (card.points != null) parts.push(`${card.points} pts`);
	if (card.lock) parts.push(lockText(card.lock));
	let text = `Week ${card.week}: ${parts.join(", ")}.`;
	if (card.place) text += ` ${card.place} in ${card.league}.`;
	return text;
}
