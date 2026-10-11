import type { Game } from "./nfl/types";
import {
	type GameResult,
	type PickOutcome,
	pickOutcome,
	type ScoringSettings,
	scorePick,
} from "./scoring";
import { rankWeek, tiebreakerMisses } from "./tiebreaker";

export interface WeekPick {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
	is_lock: boolean;
	tiebreaker?: number | null;
}

export interface WeekCell {
	team: string;
	outcome: PickOutcome;
	points: number;
	confidence: number | null;
	isLock: boolean;
}

export interface WeekResultRow {
	userId: string;
	/** Picks by game id; a game with no entry was missed (or is still hidden). */
	cells: Record<string, WeekCell>;
	points: number;
	wins: number;
	losses: number;
	pushes: number;
	/** Monday night tiebreaker miss, once that game is final. */
	miss: number | null;
	/** 1 for the week's winner; shared when still tied after the tiebreaker. */
	place: number;
}

export function toResult(
	g: Game & { lockedSpread?: number | null },
): GameResult {
	return {
		id: g.id,
		homeTeam: g.home.abbr,
		awayTeam: g.away.abbr,
		homeScore: g.homeScore,
		awayScore: g.awayScore,
		final: g.state === "post",
		lockedSpread: g.lockedSpread ?? null,
	};
}

/**
 * Every player's picks for one week with how each one went, ranked like the
 * rest of the app: points, then the Monday night tiebreaker.
 */
export function weekResults(
	userIds: string[],
	picks: WeekPick[],
	games: (Game & { lockedSpread?: number | null })[],
	settings: ScoringSettings,
): WeekResultRow[] {
	const results = new Map(games.map((g) => [g.id, toResult(g)]));
	const rows = new Map<string, WeekResultRow>(
		userIds.map((id) => [
			id,
			{
				userId: id,
				cells: {},
				points: 0,
				wins: 0,
				losses: 0,
				pushes: 0,
				miss: null,
				place: 0,
			},
		]),
	);
	for (const p of picks) {
		const game = results.get(p.game_id);
		const row = rows.get(p.user_id);
		if (!game || !row) continue;
		const pick = { gameId: p.game_id, team: p.team, confidence: p.confidence };
		const outcome = pickOutcome(pick, game, settings.mode);
		const points = scorePick(pick, game, settings);
		row.cells[p.game_id] = {
			team: p.team,
			outcome,
			points,
			confidence: p.confidence,
			isLock: p.is_lock,
		};
		row.points += points;
		if (outcome === "win") row.wins += 1;
		else if (outcome === "loss") row.losses += 1;
		else if (outcome === "push") row.pushes += 1;
	}
	const misses = tiebreakerMisses(
		picks,
		games
			.filter((g) => g.state === "post")
			.map((g) => ({
				id: g.id,
				kickoff: g.kickoff,
				home_score: g.homeScore,
				away_score: g.awayScore,
			})),
	);
	return rankWeek(
		[...rows.values()].map((r) => ({
			userId: r.userId,
			points: r.points,
			miss: misses.get(r.userId) ?? null,
		})),
	).flatMap((e) => {
		const row = rows.get(e.userId);
		return row ? [{ ...row, miss: e.miss, place: e.place }] : [];
	});
}
