// Earned flair for the standings: badges, the streak flame, and the
// last-place trophy. Everything here comes from finished games only, so it
// never reveals a pick before kickoff.

import { pickOutcome, type ScoringSettings, scorePick } from "./scoring";
import type { FinishedGame } from "./standings";
import { tiebreakerMisses, weekWinners } from "./tiebreaker";

export interface FlairPick {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
	is_lock?: boolean;
	tiebreaker?: number | null;
}

export type FlairGame = FinishedGame & { kickoff: string };

/** Games per week and how many of them are final. */
export type WeekStatus = Record<number, { total: number; final: number }>;

export type BadgeId =
	| "week-winner"
	| "perfect"
	| "upset"
	| "locks"
	| "longest-streak"
	| "worst-week";

export interface Badge {
	id: BadgeId;
	label: string;
	detail: string;
}

export interface Flair {
	/** Correct picks in a row, most recent first; pushes don't break it. */
	streak: number;
	longestStreak: number;
	/** Lowest score in the most recent finished week. */
	lastPlace: boolean;
	badges: Badge[];
}

/** A pick on a team getting at least this many points counts as an upset call. */
export const UPSET_LINE = 6.5;
/** The flame shows from this many in a row. */
export const FLAME_AT = 3;
/** The longest-streak badge needs at least this many. */
const LONGEST_AT = 5;

const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

export function computeFlair(
	memberIds: string[],
	picks: FlairPick[],
	games: FlairGame[],
	weeks: WeekStatus,
	settings: ScoringSettings,
): Record<string, Flair> {
	const byId = new Map(games.map((g) => [g.id, g]));
	const done = Object.entries(weeks)
		.filter(([, w]) => w.total > 0 && w.final === w.total)
		.map(([wk]) => Number(wk))
		.sort((a, b) => a - b);

	interface Tally {
		decided: { kickoff: string; id: string; outcome: string }[];
		weekPoints: Map<number, number>;
		weekRecord: Map<number, { picked: number; lost: number }>;
		upsets: number;
		locks: { won: number; lost: number };
	}
	const tallies = new Map<string, Tally>(
		memberIds.map((id) => [
			id,
			{
				decided: [],
				weekPoints: new Map(),
				weekRecord: new Map(),
				upsets: 0,
				locks: { won: 0, lost: 0 },
			},
		]),
	);

	for (const p of picks) {
		const g = byId.get(p.game_id);
		const t = tallies.get(p.user_id);
		if (!g || !t) continue;
		const result = {
			id: g.id,
			homeTeam: g.home_team,
			awayTeam: g.away_team,
			homeScore: g.home_score,
			awayScore: g.away_score,
			final: true,
			lockedSpread: g.locked_spread,
		};
		const pick = { gameId: p.game_id, team: p.team, confidence: p.confidence };
		const outcome = pickOutcome(pick, result, settings.mode);
		t.decided.push({ kickoff: g.kickoff, id: g.id, outcome });
		t.weekPoints.set(
			g.week,
			(t.weekPoints.get(g.week) ?? 0) + scorePick(pick, result, settings),
		);
		const rec = t.weekRecord.get(g.week) ?? { picked: 0, lost: 0 };
		rec.picked += 1;
		if (outcome === "loss") rec.lost += 1;
		t.weekRecord.set(g.week, rec);
		const s = g.locked_spread;
		const underdog =
			s != null &&
			(p.team === g.home_team ? s >= UPSET_LINE : -s >= UPSET_LINE);
		// Straight-up winner as a big underdog, whatever the scoring mode.
		const wonOutright =
			p.team === g.home_team
				? g.home_score > g.away_score
				: g.away_score > g.home_score;
		if (underdog && wonOutright) t.upsets += 1;
		if (p.is_lock) {
			if (outcome === "win") t.locks.won += 1;
			if (outcome === "loss") t.locks.lost += 1;
		}
	}

	const streaks = new Map<string, { current: number; longest: number }>();
	for (const [id, t] of tallies) {
		t.decided.sort(
			(a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id),
		);
		let current = 0;
		let longest = 0;
		for (const d of t.decided) {
			if (d.outcome === "win") longest = Math.max(longest, ++current);
			else if (d.outcome === "loss") current = 0;
		}
		streaks.set(id, { current, longest });
	}

	// Week results only count members who picked that week, so someone who
	// joined late isn't the worst week of the season by default.
	const played = (wk: number) =>
		memberIds.filter((id) => tallies.get(id)?.weekRecord.has(wk));
	const points = (id: string, wk: number) =>
		tallies.get(id)?.weekPoints.get(wk) ?? 0;

	const weeksWon = new Map<string, number>();
	const perfect = new Map<string, number>();
	let worst: { score: number; ids: Set<string> } | null = null;
	for (const wk of done) {
		const ids = played(wk);
		if (!ids.length) continue;
		// Ties on points go to the closest Monday night tiebreaker guess.
		const misses = tiebreakerMisses(
			picks,
			games.filter((g) => g.week === wk),
		);
		for (const id of weekWinners(
			ids.map((id) => ({
				userId: id,
				points: points(id, wk),
				miss: misses.get(id) ?? null,
			})),
		))
			weeksWon.set(id, (weeksWon.get(id) ?? 0) + 1);
		for (const id of ids) {
			const pts = points(id, wk);
			const rec = tallies.get(id)?.weekRecord.get(wk);
			if (rec && rec.picked === weeks[wk].total && rec.lost === 0)
				perfect.set(id, (perfect.get(id) ?? 0) + 1);
			if (!worst || pts < worst.score) worst = { score: pts, ids: new Set() };
			if (pts === worst.score) worst.ids.add(id);
		}
	}

	const lastWeek = done.at(-1);
	const lastPlace = new Set<string>();
	if (lastWeek != null) {
		const ids = played(lastWeek);
		const scores = ids.map((id) => points(id, lastWeek));
		const low = Math.min(...scores);
		if (ids.length > 1 && scores.some((s) => s !== low))
			for (const id of ids) if (points(id, lastWeek) === low) lastPlace.add(id);
	}

	const longestAll = Math.max(
		0,
		...[...streaks.values()].map((s) => s.longest),
	);

	const out: Record<string, Flair> = {};
	for (const id of memberIds) {
		const t = tallies.get(id);
		const s = streaks.get(id) ?? { current: 0, longest: 0 };
		const badges: Badge[] = [];
		const won = weeksWon.get(id) ?? 0;
		if (won)
			badges.push({
				id: "week-winner",
				label: won > 1 ? `×${won}` : "",
				detail: `Won ${plural(won, "week")}`,
			});
		const perf = perfect.get(id) ?? 0;
		if (perf)
			badges.push({
				id: "perfect",
				label: perf > 1 ? `×${perf}` : "",
				detail: `${plural(perf, "perfect week")}`,
			});
		if (t?.upsets)
			badges.push({
				id: "upset",
				label: t.upsets > 1 ? `×${t.upsets}` : "",
				detail: `Called ${plural(t.upsets, "upset")} (a ${UPSET_LINE}+ point underdog winning outright)`,
			});
		if (t && t.locks.won + t.locks.lost > 0)
			badges.push({
				id: "locks",
				label: `${t.locks.won}-${t.locks.lost}`,
				detail: `Lock of the Week record: ${t.locks.won}-${t.locks.lost}`,
			});
		if (s.longest >= LONGEST_AT && s.longest === longestAll)
			badges.push({
				id: "longest-streak",
				label: String(s.longest),
				detail: `Longest streak in the league: ${s.longest} right in a row`,
			});
		if (worst && done.length > 1 && worst.ids.has(id))
			badges.push({
				id: "worst-week",
				label: "",
				detail: `Worst week of the season: ${plural(worst.score, "point")}`,
			});
		out[id] = {
			streak: s.current,
			longestStreak: s.longest,
			lastPlace: lastPlace.has(id),
			badges,
		};
	}
	return out;
}
