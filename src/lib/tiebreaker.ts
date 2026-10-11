// Monday night tiebreaker: everyone guesses the total points scored in the
// week's last game. The guess rides on that game's pick row (picks.tiebreaker),
// so it locks and stays hidden from friends until that game kicks off, just
// like the pick itself.

/** The game the tiebreaker is on: the week's latest kickoff (ties go to the higher id). */
export function tiebreakerGameId(
	games: { id: string; kickoff: string }[],
): string | null {
	let last: { id: string; kickoff: string } | null = null;
	for (const g of games) {
		const t = Date.parse(g.kickoff);
		const lt = last ? Date.parse(last.kickoff) : Number.NEGATIVE_INFINITY;
		if (!last || t > lt || (t === lt && g.id > last.id)) last = g;
	}
	return last?.id ?? null;
}

export const MAX_TIEBREAKER = 200;

export interface WeekEntry {
	userId: string;
	points: number;
	/** How far the tiebreaker guess was from the actual total; null if no guess or not final. */
	miss: number | null;
}

export interface RankedEntry extends WeekEntry {
	/** 1 for the week's winner. Shared when still tied after the tiebreaker. */
	place: number;
	/** True when the tiebreaker decided this entry's place against someone on the same points. */
	tiebroken: boolean;
}

/**
 * Ranks one week: most points first, then the closest tiebreaker guess (over
 * or under both count). A guess beats no guess. Still tied shares the place.
 */
export function rankWeek(entries: WeekEntry[]): RankedEntry[] {
	const missKey = (e: WeekEntry) => e.miss ?? Number.POSITIVE_INFINITY;
	const sorted = [...entries].sort(
		(a, b) => b.points - a.points || missKey(a) - missKey(b),
	);
	const samePoints = new Map<number, number>();
	for (const e of sorted)
		samePoints.set(e.points, (samePoints.get(e.points) ?? 0) + 1);
	return sorted.map((e, i) => {
		let place = i + 1;
		for (let j = i - 1; j >= 0; j--) {
			const prev = sorted[j];
			if (prev.points !== e.points || missKey(prev) !== missKey(e)) break;
			place = j + 1;
		}
		const tied = (samePoints.get(e.points) ?? 0) > 1;
		return { ...e, place, tiebroken: tied && e.miss != null };
	});
}

/** Who won the week: everyone in first place, or nobody when nobody scored. */
export function weekWinners(entries: WeekEntry[]): string[] {
	const ranked = rankWeek(entries);
	if (!ranked.length || ranked[0].points <= 0) return [];
	return ranked.filter((e) => e.place === 1).map((e) => e.userId);
}

/**
 * Each member's tiebreaker miss for one week, from their picks' tiebreaker
 * guesses and the final scores. Uses the guess on the latest game they made
 * one on, in case the schedule moved the last game after they guessed.
 */
export function tiebreakerMisses(
	picks: { user_id: string; game_id: string; tiebreaker?: number | null }[],
	games: {
		id: string;
		kickoff: string;
		home_score: number;
		away_score: number;
	}[],
): Map<string, number> {
	const byId = new Map(games.map((g) => [g.id, g]));
	const best = new Map<string, { kickoff: string; miss: number }>();
	for (const p of picks) {
		if (p.tiebreaker == null) continue;
		const g = byId.get(p.game_id);
		if (!g) continue;
		const prev = best.get(p.user_id);
		if (prev && prev.kickoff >= g.kickoff) continue;
		best.set(p.user_id, {
			kickoff: g.kickoff,
			miss: Math.abs(p.tiebreaker - (g.home_score + g.away_score)),
		});
	}
	return new Map([...best].map(([id, b]) => [id, b.miss]));
}
