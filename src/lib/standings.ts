import { type ScoringSettings, scorePick } from "./scoring";

export interface FinishedGame {
	id: string;
	week: number;
	home_team: string;
	away_team: string;
	home_score: number;
	away_score: number;
	locked_spread: number | null;
}

export interface StandingRow {
	userId: string;
	total: number;
	correct: number;
	byWeek: Record<number, number>;
}

/** Season and per-week totals for each member, best first. */
export function computeStandings(
	memberIds: string[],
	picks: {
		user_id: string;
		game_id: string;
		team: string;
		confidence: number | null;
	}[],
	games: FinishedGame[],
	settings: ScoringSettings,
): StandingRow[] {
	const byId = new Map(games.map((g) => [g.id, g]));
	const rows = new Map<string, StandingRow>(
		memberIds.map((id) => [
			id,
			{ userId: id, total: 0, correct: 0, byWeek: {} },
		]),
	);
	for (const p of picks) {
		const g = byId.get(p.game_id);
		const row = rows.get(p.user_id);
		if (!g || !row) continue;
		const pts = scorePick(
			{ gameId: p.game_id, team: p.team, confidence: p.confidence },
			{
				id: g.id,
				homeTeam: g.home_team,
				awayTeam: g.away_team,
				homeScore: g.home_score,
				awayScore: g.away_score,
				final: true,
				lockedSpread: g.locked_spread,
			},
			settings,
		);
		row.total += pts;
		if (pts > 0) row.correct += 1;
		row.byWeek[g.week] = (row.byWeek[g.week] ?? 0) + pts;
	}
	return [...rows.values()].sort(
		(a, b) => b.total - a.total || b.correct - a.correct,
	);
}
