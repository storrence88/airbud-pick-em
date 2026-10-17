// The profile's extras: head to head, signature moves, the season line and
// how each badge was earned. Finished games only, like the rest of the
// profile, so nothing here hints at a pick before kickoff.

import {
	type BadgeId,
	type FlairGame,
	type FlairPick,
	UPSET_LINE,
	type WeekStatus,
} from "./flair";
import type { Tally } from "./player-stats";
import {
	type PickOutcome,
	pickOutcome,
	type ScoringSettings,
	scorePick,
} from "./scoring";
import type { StandingRow } from "./standings";
import { rankWeek, weekWinners } from "./weekly";

interface Scored {
	pick: FlairPick;
	game: FlairGame;
	outcome: PickOutcome;
	points: number;
}

const doneWeeks = (weeks: WeekStatus) =>
	Object.entries(weeks)
		.filter(([, w]) => w.total > 0 && w.final === w.total)
		.map(([wk]) => Number(wk))
		.sort((a, b) => a - b);

/** Each of a player's finished picks with its outcome, in kickoff order. */
function scored(
	userId: string,
	picks: FlairPick[],
	games: FlairGame[],
	settings: ScoringSettings,
): Scored[] {
	const byId = new Map(games.map((g) => [g.id, g]));
	const out: Scored[] = [];
	for (const pick of picks) {
		if (pick.user_id !== userId) continue;
		const game = byId.get(pick.game_id);
		if (!game) continue;
		const p = { gameId: game.id, team: pick.team, confidence: pick.confidence };
		const result = {
			id: game.id,
			homeTeam: game.home_team,
			awayTeam: game.away_team,
			homeScore: game.home_score,
			awayScore: game.away_score,
			final: true,
			lockedSpread: game.locked_spread,
		};
		out.push({
			pick,
			game,
			outcome: pickOutcome(p, result, settings.mode),
			points: scorePick(p, result, settings),
		});
	}
	return out.sort(
		(a, b) =>
			a.game.kickoff.localeCompare(b.game.kickoff) ||
			a.game.id.localeCompare(b.game.id),
	);
}

/** Points the picked team was getting: positive for an underdog. */
function linePicked(s: Scored) {
	const spread = s.game.locked_spread;
	if (spread == null) return null;
	return s.pick.team === s.game.home_team ? spread : -spread;
}

const opponent = (s: Scored) =>
	s.pick.team === s.game.home_team ? s.game.away_team : s.game.home_team;

const add = (t: Tally, o: PickOutcome) => {
	if (o === "win") t.w += 1;
	else if (o === "loss") t.l += 1;
	else if (o === "push") t.p += 1;
};

export interface HeadToHead {
	/** Finished games where they picked different sides. */
	games: number;
	/** Each side's record on just those games. */
	a: Tally;
	b: Tally;
	/** Finished weeks both played: who scored more. */
	weeks: { a: number; b: number; tied: number };
}

export function headToHead(
	a: string,
	b: string,
	picks: FlairPick[],
	games: FlairGame[],
	weeks: WeekStatus,
	settings: ScoringSettings,
): HeadToHead {
	const theirs = new Map(
		scored(b, picks, games, settings).map((s) => [s.game.id, s]),
	);
	const out: HeadToHead = {
		games: 0,
		a: { w: 0, l: 0, p: 0 },
		b: { w: 0, l: 0, p: 0 },
		weeks: { a: 0, b: 0, tied: 0 },
	};
	for (const mine of scored(a, picks, games, settings)) {
		const other = theirs.get(mine.game.id);
		if (!other || other.pick.team === mine.pick.team) continue;
		out.games += 1;
		add(out.a, mine.outcome);
		add(out.b, other.outcome);
	}
	for (const wk of doneWeeks(weeks)) {
		const rows = rankWeek([a, b], picks, games, wk, settings);
		const ra = rows.find((r) => r.userId === a);
		const rb = rows.find((r) => r.userId === b);
		if (!ra?.picked || !rb?.picked) continue;
		if (ra.points > rb.points) out.weeks.a += 1;
		else if (rb.points > ra.points) out.weeks.b += 1;
		else out.weeks.tied += 1;
	}
	return out;
}

export interface SignaturePick {
	week: number;
	team: string;
	opponent: string;
	/** Points the team was getting (positive) or giving (negative). */
	line: number | null;
	confidence: number | null;
	lock: boolean;
}

export interface Signature {
	/** The team they picked most, and how it went. */
	team: (Tally & { team: string; count: number }) | null;
	/** Their biggest underdog that won outright. */
	boldest: SignaturePick | null;
	/** The loss that hurt most: top confidence, else a lock, else the biggest favorite. */
	worstBeat: SignaturePick | null;
}

const toSignature = (s: Scored): SignaturePick => ({
	week: s.game.week,
	team: s.pick.team,
	opponent: opponent(s),
	line: linePicked(s),
	confidence: s.pick.confidence,
	lock: !!s.pick.is_lock,
});

export function signatureMoves(
	userId: string,
	picks: FlairPick[],
	games: FlairGame[],
	settings: ScoringSettings,
): Signature {
	const mine = scored(userId, picks, games, settings);

	const teams = new Map<string, Tally & { team: string; count: number }>();
	for (const s of mine) {
		const t = teams.get(s.pick.team) ?? {
			team: s.pick.team,
			count: 0,
			w: 0,
			l: 0,
			p: 0,
		};
		t.count += 1;
		add(t, s.outcome);
		teams.set(s.pick.team, t);
	}
	const team =
		[...teams.values()].sort((x, y) => y.count - x.count || y.w - x.w)[0] ??
		null;

	// Won outright, whatever the scoring mode, as the bigger underdog the better.
	const wonOutright = (s: Scored) =>
		s.pick.team === s.game.home_team
			? s.game.home_score > s.game.away_score
			: s.game.away_score > s.game.home_score;
	const boldest =
		mine
			.filter((s) => (linePicked(s) ?? 0) > 0 && wonOutright(s))
			.sort((x, y) => (linePicked(y) ?? 0) - (linePicked(x) ?? 0))[0] ?? null;

	const losses = mine.filter((s) => s.outcome === "loss");
	const favored = (s: Scored) => -(linePicked(s) ?? 0);
	const worst =
		settings.mode === "confidence"
			? losses.sort(
					(x, y) => (y.pick.confidence ?? 0) - (x.pick.confidence ?? 0),
				)[0]
			: losses.sort(
					(x, y) =>
						Number(!!y.pick.is_lock) - Number(!!x.pick.is_lock) ||
						favored(y) - favored(x),
				)[0];

	return {
		team: team && team.count > 1 ? team : null,
		boldest: boldest ? toSignature(boldest) : null,
		worstBeat: worst ? toSignature(worst) : null,
	};
}

export interface Rival {
	userId: string;
	/** Points between them; 0 when tied. */
	gap: number;
	/** True when the player is ahead of the rival. */
	ahead: boolean;
}

/** The closest member in the standings: the one just above, or just below for the leader. */
export function rivalFor(userId: string, rows: StandingRow[]): Rival | null {
	const at = rows.findIndex((r) => r.userId === userId);
	if (at < 0 || rows.length < 2) return null;
	const me = rows[at];
	const above = rows[at - 1];
	const below = rows[at + 1];
	const other =
		above && below
			? me.total - below.total < above.total - me.total
				? below
				: above
			: (above ?? below);
	return {
		userId: other.userId,
		gap: Math.abs(other.total - me.total),
		ahead: me.total > other.total,
	};
}

export interface SeasonPoint {
	week: number;
	/** Running total through this week. */
	you: number;
	/** League average running total through this week. */
	avg: number;
}

/** Running points by finished week for the player and the league average. */
export function seasonLine(
	userId: string,
	memberIds: string[],
	picks: FlairPick[],
	games: FlairGame[],
	weeks: WeekStatus,
	settings: ScoringSettings,
): SeasonPoint[] {
	const totals = new Map(memberIds.map((id) => [id, 0]));
	return doneWeeks(weeks).map((week) => {
		for (const r of rankWeek(memberIds, picks, games, week, settings))
			totals.set(r.userId, (totals.get(r.userId) ?? 0) + r.points);
		const all = [...totals.values()];
		return {
			week,
			you: totals.get(userId) ?? 0,
			avg: all.reduce((s, n) => s + n, 0) / Math.max(all.length, 1),
		};
	});
}

const line = (n: number | null) =>
	n == null || n === 0 ? "" : n > 0 ? ` +${n}` : ` ${n}`;

/** When and how each badge was earned, a line per time, oldest first. */
export function badgeHistory(
	userId: string,
	memberIds: string[],
	picks: FlairPick[],
	games: FlairGame[],
	weeks: WeekStatus,
	settings: ScoringSettings,
): Partial<Record<BadgeId, string[]>> {
	const mine = scored(userId, picks, games, settings);
	const out: Partial<Record<BadgeId, string[]>> = {};
	const push = (id: BadgeId, text: string) => {
		out[id] = [...(out[id] ?? []), text];
	};

	let worst: { score: number; week: number } | null = null;
	for (const wk of doneWeeks(weeks)) {
		const rows = rankWeek(memberIds, picks, games, wk, settings);
		const row = rows.find((r) => r.userId === userId);
		if (!row?.picked) continue;
		if (weekWinners(rows).some((w) => w.userId === userId))
			push("week-winner", `Week ${wk}: ${row.points} pts`);
		const week = mine.filter((s) => s.game.week === wk);
		if (
			week.length === weeks[wk].total &&
			week.every((s) => s.outcome !== "loss")
		)
			push("perfect", `Week ${wk}: ${week.length} for ${week.length}`);
		if (!worst || row.points <= worst.score)
			worst = { score: row.points, week: wk };
	}
	if (worst) push("worst-week", `Week ${worst.week}: ${worst.score} pts`);

	for (const s of mine) {
		const getting = linePicked(s) ?? 0;
		const won =
			s.pick.team === s.game.home_team
				? s.game.home_score > s.game.away_score
				: s.game.away_score > s.game.home_score;
		if (getting >= UPSET_LINE && won)
			push(
				"upset",
				`Week ${s.game.week}: ${s.pick.team}${line(getting)} beat ${opponent(s)}`,
			);
		if (s.pick.is_lock && s.outcome !== "push")
			push(
				"locks",
				`Week ${s.game.week}: ${s.pick.team} ${s.outcome === "win" ? "won" : "lost"}`,
			);
	}

	// The longest run of right picks; pushes don't break it.
	let run: Scored[] = [];
	let best: Scored[] = [];
	for (const s of mine) {
		if (s.outcome === "win") {
			run = [...run, s];
			if (run.length > best.length) best = run;
		} else if (s.outcome === "loss") run = [];
	}
	if (best.length)
		push(
			"longest-streak",
			best[0].game.week === best.at(-1)?.game.week
				? `${best.length} right in Week ${best[0].game.week}`
				: `${best.length} right, Week ${best[0].game.week} to Week ${best.at(-1)?.game.week}`,
		);
	return out;
}
