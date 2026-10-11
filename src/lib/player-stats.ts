// One player's season splits. Built only from finished games, so it never
// reveals a pick before kickoff.

import type { WeekStatus } from "./flair";
import {
	type PickOutcome,
	pickOutcome,
	type ScoringSettings,
	scorePick,
} from "./scoring";
import type { FinishedGame } from "./standings";

export interface StatsGame extends FinishedGame {
	/** Share of ESPN Pick'em players on the home team when picks locked. */
	crowd_home_pct?: number | null;
}

export interface StatsPick {
	game_id: string;
	team: string;
	confidence: number | null;
}

export interface Tally {
	w: number;
	l: number;
	p: number;
}

export interface TeamRecord extends Tally {
	team: string;
}

export interface WeekLine extends Tally {
	week: number;
	points: number;
}

export interface PlayerStats {
	overall: Tally;
	byTeam: TeamRecord[];
	home: Tally;
	away: Tally;
	favorite: Tally;
	underdog: Tally;
	/** Finished weeks only, so a half-played week can't be the "worst". */
	weeks: WeekLine[];
	best: WeekLine | null;
	worst: WeekLine | null;
	crowd: {
		/** Games with a clear ESPN crowd favorite at kickoff. */
		games: number;
		you: Tally;
		crowd: Tally;
		/** Games where the player sided against the crowd. */
		against: Tally;
	};
}

const empty = (): Tally => ({ w: 0, l: 0, p: 0 });

function add(r: Tally, o: PickOutcome) {
	if (o === "win") r.w += 1;
	else if (o === "loss") r.l += 1;
	else if (o === "push") r.p += 1;
}

/** Wins over decisions, or null with nothing decided. */
export function winPct(r: Tally) {
	const n = r.w + r.l;
	return n ? r.w / n : null;
}

export function formatRecord(r: Tally) {
	return r.p ? `${r.w}-${r.l}-${r.p}` : `${r.w}-${r.l}`;
}

export function computePlayerStats(
	picks: StatsPick[],
	games: StatsGame[],
	weekStatus: WeekStatus,
	settings: ScoringSettings,
): PlayerStats {
	const byId = new Map(games.map((g) => [g.id, g]));
	const stats: PlayerStats = {
		overall: empty(),
		byTeam: [],
		home: empty(),
		away: empty(),
		favorite: empty(),
		underdog: empty(),
		weeks: [],
		best: null,
		worst: null,
		crowd: { games: 0, you: empty(), crowd: empty(), against: empty() },
	};
	const teams = new Map<string, TeamRecord>();
	const weeks = new Map<number, WeekLine>();

	for (const pick of picks) {
		const g = byId.get(pick.game_id);
		if (!g) continue;
		const game = {
			id: g.id,
			homeTeam: g.home_team,
			awayTeam: g.away_team,
			homeScore: g.home_score,
			awayScore: g.away_score,
			final: true,
			lockedSpread: g.locked_spread,
		};
		const p = { gameId: g.id, team: pick.team, confidence: pick.confidence };
		const outcome = pickOutcome(p, game, settings.mode);
		const pickedHome = pick.team === g.home_team;

		add(stats.overall, outcome);
		add(pickedHome ? stats.home : stats.away, outcome);

		const team = teams.get(pick.team) ?? { team: pick.team, ...empty() };
		add(team, outcome);
		teams.set(pick.team, team);

		// The home line is negative when home is favored; a pick'em has neither.
		const spread = g.locked_spread ?? 0;
		if (spread !== 0) {
			const pickedFavorite = spread < 0 === pickedHome;
			add(pickedFavorite ? stats.favorite : stats.underdog, outcome);
		}

		const week = weeks.get(g.week) ?? { week: g.week, points: 0, ...empty() };
		add(week, outcome);
		week.points += scorePick(p, game, settings);
		weeks.set(g.week, week);

		const crowdHome = g.crowd_home_pct;
		if (crowdHome != null && crowdHome !== 50) {
			const crowdTeam = crowdHome > 50 ? g.home_team : g.away_team;
			stats.crowd.games += 1;
			add(stats.crowd.you, outcome);
			add(
				stats.crowd.crowd,
				pickOutcome({ ...p, team: crowdTeam }, game, settings.mode),
			);
			if (crowdTeam !== pick.team) add(stats.crowd.against, outcome);
		}
	}

	stats.byTeam = [...teams.values()].sort(
		(a, b) =>
			b.w + b.l + b.p - (a.w + a.l + a.p) ||
			(winPct(b) ?? 0) - (winPct(a) ?? 0) ||
			a.team.localeCompare(b.team),
	);
	stats.weeks = [...weeks.values()]
		.filter((w) => {
			const s = weekStatus[w.week];
			return s && s.total > 0 && s.final === s.total;
		})
		.sort((a, b) => a.week - b.week);
	for (const w of stats.weeks) {
		if (!stats.best || w.points > stats.best.points) stats.best = w;
		if (!stats.worst || w.points < stats.worst.points) stats.worst = w;
	}
	// One finished week is both best and worst; only show it once.
	if (stats.weeks.length < 2) stats.worst = null;
	return stats;
}
