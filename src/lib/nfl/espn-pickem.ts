import type { Game, PublicPicks } from "./types";

// ESPN NFL Pick'em's public challenge feed (unofficial, can change). Each
// proposition is one game; each outcome carries how many players picked it.
const CHALLENGE = "https://gambit-api.fantasy.espn.com/apis/v1/challenges";

interface Mapping {
	type?: string;
	value?: string;
}

interface Outcome {
	abbrev?: string;
	name?: string;
	mappings?: Mapping[];
	choiceCounters?: {
		scoringFormatId?: number;
		count?: number;
		percentage?: number;
	}[];
}

export interface PickemChallenge {
	propositions?: {
		mappings?: Mapping[];
		possibleOutcomes?: Outcome[];
	}[];
}

// Counters come per scoring format, in no fixed order. Format 1 (standard)
// has the most entries; without it, sum every format.
const STANDARD_FORMAT = 1;

function share(o: Outcome) {
	const counters = o.choiceCounters ?? [];
	const c =
		counters.find((x) => x.scoringFormatId === STANDARD_FORMAT) ??
		(counters.length > 1
			? {
					count: counters.reduce((n, x) => n + (x.count ?? 0), 0),
					percentage: undefined,
				}
			: counters[0]);
	return { count: c?.count, pct: c?.percentage };
}

/**
 * Turns the challenge into each game's home/away pick share, keyed by ESPN
 * game id. Games are matched by the proposition's event mapping, falling back
 * to the two team abbreviations. Shares are normalized so they add to 100.
 */
export function parsePublicPicks(
	data: PickemChallenge,
	games: Game[],
): Map<string, PublicPicks> {
	const out = new Map<string, PublicPicks>();
	for (const prop of data.propositions ?? []) {
		const outcomes = prop.possibleOutcomes ?? [];
		const ids = new Set(
			(prop.mappings ?? []).map((m) => m.value).filter(Boolean),
		);
		const abbrs = new Set(outcomes.map((o) => o.abbrev?.toUpperCase()));
		const game = games.find(
			(g) =>
				ids.has(g.id) || (abbrs.has(g.home.abbr) && abbrs.has(g.away.abbr)),
		);
		if (!game) continue;

		const byTeam = (abbr: string) =>
			outcomes.find((o) => o.abbrev?.toUpperCase() === abbr);
		const home = byTeam(game.home.abbr);
		const away = byTeam(game.away.abbr);
		if (!home || !away) continue;

		// Prefer raw counts; fall back to ESPN's percentage (0-1 or 0-100).
		const h = share(home);
		const a = share(away);
		const [hv, av] =
			h.count != null && a.count != null
				? [h.count, a.count]
				: [h.pct ?? 0, a.pct ?? 0];
		const total = hv + av;
		if (!(total > 0)) continue;
		const homePct = Math.round((hv / total) * 100);
		out.set(game.id, { home: homePct, away: 100 - homePct });
	}
	return out;
}

const cache = new Map<string, { at: number; data: PickemChallenge }>();
const CACHE_MS = 10 * 60_000;

async function fetchChallenge(season: number, week: number) {
	const key = `${season}-${week}`;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
	// ESPN renamed the game for 2026 ("NFL Pick'em"); older seasons used the
	// Pigskin key.
	let res: Response | undefined;
	for (const slug of [`nfl-pickem-${season}`, `nfl-pigskin-pickem-${season}`]) {
		const url = new URL(`${CHALLENGE}/${slug}`);
		url.searchParams.set("scoringPeriodId", String(week));
		url.searchParams.set("platform", "chui");
		url.searchParams.set("view", "chui_default");
		res = await fetch(url, { signal: AbortSignal.timeout(4000) });
		if (res.ok) break;
	}
	if (!res?.ok) throw new Error(`ESPN pick'em ${res?.status}`);
	const data = (await res.json()) as PickemChallenge;
	cache.set(key, { at: Date.now(), data });
	return data;
}

/**
 * Adds ESPN's public pick share to each game. This is a nice-to-have, so any
 * failure leaves the games unchanged rather than breaking the page.
 */
export async function withPublicPicks<T extends Game>(
	games: T[],
): Promise<T[]> {
	const first = games[0];
	if (!first?.season || !first.week) return games;
	try {
		const splits = parsePublicPicks(
			await fetchChallenge(first.season, first.week),
			games,
		);
		return games.map((g) => ({ ...g, publicPicks: splits.get(g.id) ?? null }));
	} catch (err) {
		console.warn("public picks unavailable", err);
		return games;
	}
}
