// The "you have N open picks" nudge. Pure functions, so counting and the
// countdown wording are easy to test.

export interface OpenPicksSummary {
	/** Open picks across all your leagues, survivor picks included. */
	total: number;
	/** Open picks per league id, only leagues with at least one. */
	byLeague: Record<string, number>;
	/** The soonest kickoff among games you still need to pick. */
	nextKickoff: string | null;
	/** Where the nudge links: the league whose open pick locks first. */
	firstLeagueId: string | null;
}

interface Kickoff {
	kickoff: string;
}

/**
 * Adds up open picks. `leagues` is each league's unpicked games that haven't
 * kicked off; `survivor` is each league where you're still alive in survivor
 * with no pick this week, and the games you could still take.
 */
export function summarizeOpenPicks(
	leagues: { leagueId: string; games: Kickoff[] }[],
	survivor: { leagueId: string; games: Kickoff[] }[] = [],
): OpenPicksSummary {
	const byLeague: Record<string, number> = {};
	let first: { at: number; leagueId: string } | null = null;
	const add = (leagueId: string, count: number, games: Kickoff[]) => {
		if (!count) return;
		byLeague[leagueId] = (byLeague[leagueId] ?? 0) + count;
		for (const g of games) {
			const at = Date.parse(g.kickoff);
			if (!first || at < first.at) first = { at, leagueId };
		}
	};
	for (const l of leagues) add(l.leagueId, l.games.length, l.games);
	// A survivor pick is one pick, open until the last game you could take kicks off.
	for (const s of survivor) if (s.games.length) add(s.leagueId, 1, s.games);
	const soonest = first as { at: number; leagueId: string } | null;
	return {
		total: Object.values(byLeague).reduce((n, c) => n + c, 0),
		byLeague,
		nextKickoff: soonest ? new Date(soonest.at).toISOString() : null,
		firstLeagueId: soonest?.leagueId ?? null,
	};
}

/**
 * Time until kickoff, short: "2d 4h", "3h 12m", "12m 05s". Seconds only show
 * in the last hour, where they're worth watching.
 */
export function countdown(ms: number) {
	if (ms <= 0) return "now";
	const s = Math.floor(ms / 1000);
	const d = Math.floor(s / 86_400);
	const h = Math.floor((s % 86_400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (d) return `${d}d ${h}h`;
	if (h) return `${h}h ${m}m`;
	return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export const openPicksLabel = (n: number) =>
	`${n} open ${n === 1 ? "pick" : "picks"}`;
