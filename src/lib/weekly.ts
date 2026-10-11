// One week's leaderboard and who won it. The banner, the weekly tab and the
// week-winner badge all rank weeks through rankWeek, so they always agree.
// Ties on points go to the Monday night tiebreaker (see ./tiebreaker).

import { pickOutcome, type ScoringSettings, scorePick } from "./scoring";
import type { FinishedGame } from "./standings";
import { rankWeek as rankByTiebreaker, tiebreakerMisses } from "./tiebreaker";

export interface WeekPick {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
	tiebreaker?: number | null;
}

export type WeekGame = FinishedGame & { kickoff: string };

export interface WeekRow {
	userId: string;
	points: number;
	correct: number;
	/** Finished games this member picked this week. */
	picked: number;
	/** How far off their tiebreaker guess was; null without a guess. */
	miss: number | null;
	/** Shared when still tied (1, 1, 3); null for members who didn't pick. */
	rank: number | null;
	/** The tiebreaker settled this member's place against someone on the same points. */
	tiebroken: boolean;
}

/**
 * Ranks members by points on the week's finished games, then the closest
 * tiebreaker guess. Members who picked nothing that week sit unranked at the
 * bottom, so a late joiner or a missed week never counts as a result.
 */
export function rankWeek(
	memberIds: string[],
	picks: WeekPick[],
	games: WeekGame[],
	week: number,
	settings: ScoringSettings,
): WeekRow[] {
	const weekGames = games.filter((g) => g.week === week);
	const byId = new Map(weekGames.map((g) => [g.id, g]));
	const misses = tiebreakerMisses(picks, weekGames);
	const rows = new Map<string, WeekRow>(
		memberIds.map((id) => [
			id,
			{
				userId: id,
				points: 0,
				correct: 0,
				picked: 0,
				miss: misses.get(id) ?? null,
				rank: null,
				tiebroken: false,
			},
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

	const played = [...rows.values()].filter((r) => r.picked > 0);
	const ranked = rankByTiebreaker(played).map((e) => {
		const row = rows.get(e.userId) as WeekRow;
		return { ...row, rank: e.place, tiebroken: e.tiebroken };
	});
	// Correct picks only order a shared place; they don't split it.
	ranked.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || b.correct - a.correct);
	const idle = [...rows.values()].filter((r) => r.picked === 0);
	return [...ranked, ...idle];
}

/** Everyone in first place, if anyone scored. More than one means co-winners. */
export function weekWinners(rows: WeekRow[]): WeekRow[] {
	return rows.filter((r) => r.rank === 1 && r.points > 0);
}
