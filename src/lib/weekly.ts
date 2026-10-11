// One week's leaderboard and who won it. The banner, the weekly tab and the
// week-winner badge all rank weeks through rankWeek, so they always agree.

import { pickOutcome, type ScoringSettings, scorePick } from "./scoring";
import type { FinishedGame } from "./standings";

export interface WeekPick {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
}

export interface WeekRow {
	userId: string;
	points: number;
	correct: number;
	/** Finished games this member picked this week. */
	picked: number;
	/** Shared by tied members (1, 1, 3); null for members who didn't pick. */
	rank: number | null;
}

export interface RankWeekOptions {
	/**
	 * Orders members tied on points; return 0 to leave them tied. Without
	 * one, equal points share a rank and tied winners are co-winners.
	 */
	tiebreak?: (a: WeekRow, b: WeekRow) => number;
}

/**
 * Ranks members by points on the week's finished games. Members who picked
 * nothing that week sit unranked at the bottom, so a late joiner or a missed
 * week never counts as a result.
 */
export function rankWeek(
	memberIds: string[],
	picks: WeekPick[],
	games: FinishedGame[],
	week: number,
	settings: ScoringSettings,
	{ tiebreak }: RankWeekOptions = {},
): WeekRow[] {
	const byId = new Map(
		games.filter((g) => g.week === week).map((g) => [g.id, g]),
	);
	const rows = new Map<string, WeekRow>(
		memberIds.map((id) => [
			id,
			{ userId: id, points: 0, correct: 0, picked: 0, rank: null },
		]),
	);
	for (const p of picks) {
		const g = byId.get(p.game_id);
		const row = rows.get(p.user_id);
		if (!g || !row) continue;
		const pick = { gameId: p.game_id, team: p.team, confidence: p.confidence };
		const result = {
			id: g.id,
			homeTeam: g.home_team,
			awayTeam: g.away_team,
			homeScore: g.home_score,
			awayScore: g.away_score,
			final: true,
			lockedSpread: g.locked_spread,
		};
		row.points += scorePick(pick, result, settings);
		row.picked += 1;
		if (pickOutcome(pick, result, settings.mode) === "win") row.correct += 1;
	}

	const order = (a: WeekRow, b: WeekRow) =>
		b.points - a.points || (tiebreak?.(a, b) ?? 0);
	const played = [...rows.values()].filter((r) => r.picked > 0);
	// Correct picks only order the list; they don't split a tie.
	played.sort((a, b) => order(a, b) || b.correct - a.correct);
	played.forEach((r, i) => {
		const prev = played[i - 1];
		r.rank = prev && order(prev, r) === 0 ? prev.rank : i + 1;
	});
	const idle = [...rows.values()].filter((r) => r.picked === 0);
	return [...played, ...idle];
}

/** Everyone tied for first, if anyone scored. More than one means co-winners. */
export function weekWinners(rows: WeekRow[]): WeekRow[] {
	return rows.filter((r) => r.rank === 1 && r.points > 0);
}
