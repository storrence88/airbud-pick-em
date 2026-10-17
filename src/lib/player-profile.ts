// What a player's profile shows: their place, season tiles, how they finished
// each week, and their trophies. Built from finished games only, so it never
// reveals a pick before kickoff.

import { FADE_AT } from "./faded";
import type { WeekStatus } from "./flair";
import {
	type Badge,
	computeFlair,
	type FlairGame,
	type FlairPick,
} from "./flair";
import type { StatsGame, StatsPick, Tally } from "./player-stats";
import { pickOutcome, type ScoringSettings } from "./scoring";
import { computeStandings } from "./standings";
import { rankWeek, weekWinners } from "./weekly";

export interface WeekFinish {
	week: number;
	/** Shared place that week; null if they didn't pick. */
	rank: number | null;
	/** How many members picked that week. */
	of: number;
	points: number;
	won: boolean;
}

export interface ProfileSummary {
	/** Place in the season standings, as the standings list numbers it. */
	place: number;
	of: number;
	points: number;
	record: Tally;
	streak: number;
	longestStreak: number;
	lastPlace: boolean;
	badges: Badge[];
	/** Every fully finished week, oldest first. */
	weeks: WeekFinish[];
	weeksWon: number;
	/** Lock of the Week results. */
	locks: Tally;
}

const doneWeeks = (weeks: WeekStatus) =>
	Object.entries(weeks)
		.filter(([, w]) => w.total > 0 && w.final === w.total)
		.map(([wk]) => Number(wk))
		.sort((a, b) => a - b);

export function profileSummary(
	userId: string,
	memberIds: string[],
	picks: FlairPick[],
	games: FlairGame[],
	weeks: WeekStatus,
	settings: ScoringSettings,
): ProfileSummary {
	const standings = computeStandings(memberIds, picks, games, settings);
	const at = standings.findIndex((r) => r.userId === userId);
	const flair = computeFlair(memberIds, picks, games, weeks, settings)[userId];

	const byId = new Map(games.map((g) => [g.id, g]));
	const record: Tally = { w: 0, l: 0, p: 0 };
	const locks: Tally = { w: 0, l: 0, p: 0 };
	for (const p of picks) {
		if (p.user_id !== userId) continue;
		const g = byId.get(p.game_id);
		if (!g) continue;
		const outcome = pickOutcome(
			{ gameId: g.id, team: p.team, confidence: p.confidence },
			{
				id: g.id,
				homeTeam: g.home_team,
				awayTeam: g.away_team,
				homeScore: g.home_score,
				awayScore: g.away_score,
				final: true,
				lockedSpread: g.locked_spread,
			},
			settings.mode,
		);
		const tallies = p.is_lock ? [record, locks] : [record];
		for (const t of tallies) {
			if (outcome === "win") t.w += 1;
			else if (outcome === "loss") t.l += 1;
			else if (outcome === "push") t.p += 1;
		}
	}

	const finishes: WeekFinish[] = doneWeeks(weeks).map((week) => {
		const rows = rankWeek(memberIds, picks, games, week, settings);
		const row = rows.find((r) => r.userId === userId);
		const winners = weekWinners(rows);
		return {
			week,
			rank: row?.rank ?? null,
			of: rows.filter((r) => r.rank != null).length,
			points: row?.points ?? 0,
			won: winners.some((w) => w.userId === userId),
		};
	});

	return {
		place: at + 1,
		of: standings.length,
		points: standings[at]?.total ?? 0,
		record,
		streak: flair?.streak ?? 0,
		longestStreak: flair?.longestStreak ?? 0,
		lastPlace: flair?.lastPlace ?? false,
		badges: flair?.badges ?? [],
		weeks: finishes,
		weeksWon: finishes.filter((w) => w.won).length,
		locks,
	};
}

/**
 * Winning picks on the side at most 20% of ESPN players took, by the split
 * saved when picks locked. Same rule as the "faded the public" callout.
 */
export function fadeWins(
	picks: StatsPick[],
	games: StatsGame[],
	settings: ScoringSettings,
): number {
	const byId = new Map(games.map((g) => [g.id, g]));
	let n = 0;
	for (const p of picks) {
		const g = byId.get(p.game_id);
		const home = g?.crowd_home_pct;
		if (!g || home == null) continue;
		const faded =
			100 - home >= FADE_AT
				? g.home_team
				: home >= FADE_AT
					? g.away_team
					: null;
		if (p.team !== faded) continue;
		const outcome = pickOutcome(
			{ gameId: g.id, team: p.team, confidence: p.confidence },
			{
				id: g.id,
				homeTeam: g.home_team,
				awayTeam: g.away_team,
				homeScore: g.home_score,
				awayScore: g.away_score,
				final: true,
				lockedSpread: g.locked_spread,
			},
			settings.mode,
		);
		if (outcome === "win") n += 1;
	}
	return n;
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number) {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
