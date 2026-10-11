/**
 * Survivor rules: pick one team to win each week, each team once. A loss, a
 * tie or a week with no pick knocks you out. If everyone still alive goes out
 * in the same week, they all stay alive instead.
 */

export const SURVIVOR_LAST_WEEK = 18;

export interface SurvivorGame {
	state: "pre" | "in" | "post";
	home_team: string;
	away_team: string;
	home_score: number;
	away_score: number;
}

export interface SurvivorPick {
	user_id: string;
	week: number;
	team: string;
	game: SurvivorGame | null;
}

export type WeekResult = "win" | "loss" | "tie" | "missed" | "pending";

export interface PlayerStatus {
	userId: string;
	alive: boolean;
	/** The week that knocked them out, and how. */
	outWeek: number | null;
	outReason: "loss" | "tie" | "missed" | null;
	/**
	 * Out this week, but nobody left has won yet: if everyone else goes out
	 * too, they're all back in.
	 */
	provisional: boolean;
	/** Each week's result while they were in it. */
	weeks: Record<number, WeekResult>;
}

export interface SurvivorState {
	players: PlayerStatus[];
	/** Weeks where everyone left went out together and all stayed alive. */
	reprieves: number[];
	/** Set once one player is left (or several survive the last week). */
	winners: string[];
}

export function pickResult(team: string, game: SurvivorGame | null) {
	if (!game || game.state !== "post") return "pending";
	const mine = team === game.home_team ? game.home_score : game.away_score;
	const theirs = team === game.home_team ? game.away_score : game.home_score;
	return mine > theirs ? "win" : mine < theirs ? "loss" : "tie";
}

/**
 * Works out who's alive. `currentWeek` is the NFL week in progress, and
 * `currentWeekClosed` says every game of it has kicked off, so a missing pick
 * that week counts as missed rather than not made yet.
 */
export function survivorState(opts: {
	entrants: string[];
	picks: SurvivorPick[];
	startWeek: number;
	currentWeek: number;
	currentWeekClosed: boolean;
}): SurvivorState {
	const { entrants, startWeek, currentWeek, currentWeekClosed } = opts;
	const byUserWeek = new Map(
		opts.picks.map((p) => [`${p.user_id}:${p.week}`, p]),
	);
	const players = new Map<string, PlayerStatus>(
		entrants.map((id) => [
			id,
			{
				userId: id,
				alive: true,
				outWeek: null,
				outReason: null,
				provisional: false,
				weeks: {},
			},
		]),
	);
	const reprieves: number[] = [];
	let winners: string[] = [];
	const last = Math.min(currentWeek, SURVIVOR_LAST_WEEK);

	for (let week = startWeek; week <= last; week++) {
		const alive = [...players.values()].filter((p) => p.alive);
		if (alive.length === 0) break;
		const closed = week < currentWeek || currentWeekClosed;
		const out: PlayerStatus[] = [];
		let pending = false;
		let anyWin = false;
		for (const p of alive) {
			const pick = byUserWeek.get(`${p.userId}:${week}`);
			const result: WeekResult = pick
				? pickResult(pick.team, pick.game)
				: closed
					? "missed"
					: "pending";
			p.weeks[week] = result;
			if (result === "pending") pending = true;
			else if (result === "win") anyWin = true;
			else out.push(p);
		}

		if (!pending && out.length === alive.length) {
			reprieves.push(week);
			continue;
		}
		for (const p of out) {
			p.alive = false;
			p.outWeek = week;
			p.outReason = p.weeks[week] as PlayerStatus["outReason"];
			p.provisional = pending && !anyWin;
		}
		if (pending) break;

		const left = alive.filter((p) => p.alive);
		if (
			(left.length === 1 && entrants.length > 1) ||
			week === SURVIVOR_LAST_WEEK
		) {
			winners = left.map((p) => p.userId);
			break;
		}
	}

	return { players: [...players.values()], reprieves, winners };
}

/** Teams a player has used, by team, with the week each was used. */
export function usedTeams(picks: SurvivorPick[], userId: string) {
	return new Map(
		picks.filter((p) => p.user_id === userId).map((p) => [p.team, p.week]),
	);
}
