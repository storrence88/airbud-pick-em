// ESPN's public game summary feed (unofficial, can change). One call per game
// carries injuries, the venue and weather, sportsbook lines and recent form.
const SUMMARY =
	"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

interface EspnInjury {
	status?: string;
	athlete?: { displayName?: string; position?: { abbreviation?: string } };
	details?: { type?: string; detail?: string; side?: string };
}

interface EspnLine {
	line?: string;
	odds?: string;
}

interface EspnPickCenter {
	provider?: { name?: string };
	details?: string;
	overUnder?: number;
	spread?: number;
	pointSpread?: {
		home?: { open?: EspnLine; close?: EspnLine };
		away?: { open?: EspnLine; close?: EspnLine };
	};
	total?: { over?: { open?: EspnLine; close?: EspnLine } };
}

interface EspnLastFive {
	team?: { id?: string; abbreviation?: string };
	events?: {
		gameDate?: string;
		gameResult?: string;
		score?: string;
		atVs?: string;
		opponent?: { abbreviation?: string };
	}[];
}

export interface EspnSummary {
	injuries?: {
		team?: { id?: string; abbreviation?: string };
		injuries?: EspnInjury[];
	}[];
	gameInfo?: {
		venue?: {
			fullName?: string;
			address?: { city?: string; state?: string };
		};
		weather?: {
			displayValue?: string;
			conditionId?: string;
			temperature?: number;
			precipitation?: number;
			gust?: number;
		};
	};
	pickcenter?: EspnPickCenter[];
	lastFiveGames?: EspnLastFive[];
}

export interface Injury {
	name: string;
	position: string;
	status: string;
	/** What's hurt, e.g. "Hamstring". Null when ESPN doesn't say. */
	detail: string | null;
}

export interface FormGame {
	result: "W" | "L" | "T";
	/** "vs BAL" or "@ MIN". */
	opponent: string;
	score: string;
}

export interface LineMove {
	/** Home team's line, negative when home is favored. */
	open: number | null;
	current: number | null;
	totalOpen: number | null;
	totalCurrent: number | null;
	provider: string | null;
}

export interface GameDetails {
	injuries: { home: Injury[]; away: Injury[] };
	venue: { name: string; place: string | null } | null;
	weather: {
		temp: number | null;
		condition: string | null;
		precip: number | null;
		wind: number | null;
	} | null;
	line: LineMove | null;
	form: { home: FormGame[]; away: FormGame[] };
}

/** Out first, then the day-to-day designations, then long-term lists. */
const STATUS_ORDER = [
	"out",
	"doubtful",
	"questionable",
	"suspension",
	"injured reserve",
	"physically unable to perform",
];

function statusRank(status: string) {
	const i = STATUS_ORDER.indexOf(status.toLowerCase());
	return i === -1 ? STATUS_ORDER.length : i;
}

const vague = /^(not specified|undisclosed|other)$/i;

function toInjuries(list: EspnInjury[] | undefined): Injury[] {
	return (list ?? [])
		.flatMap((i) => {
			const name = i.athlete?.displayName;
			if (!name || !i.status) return [];
			const type = i.details?.type;
			return [
				{
					name,
					position: i.athlete?.position?.abbreviation ?? "",
					status: i.status,
					detail: type && !vague.test(type) ? type : null,
				},
			];
		})
		.sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

function num(s: string | undefined) {
	if (!s) return null;
	if (/^(even|pk)$/i.test(s.trim())) return 0;
	const n = Number(s.replace(/^[ou]/i, ""));
	return Number.isFinite(n) ? n : null;
}

function toLine(pc: EspnPickCenter | undefined): LineMove | null {
	if (!pc) return null;
	const home = pc.pointSpread?.home;
	const over = pc.total?.over;
	const line: LineMove = {
		open: num(home?.open?.line),
		current: num(home?.close?.line) ?? pc.spread ?? null,
		totalOpen: num(over?.open?.line),
		totalCurrent: num(over?.close?.line) ?? pc.overUnder ?? null,
		provider: pc.provider?.name ?? null,
	};
	return line.current == null && line.totalCurrent == null ? null : line;
}

/**
 * ESPN's "last five" reaches back into last season early in the year. Only
 * games from this season count, which starts no earlier than August.
 */
function toForm(entry: EspnLastFive | undefined, season: number): FormGame[] {
	const start = Date.UTC(season, 7, 1);
	return (entry?.events ?? []).flatMap((e) => {
		const r = e.gameResult;
		if (r !== "W" && r !== "L" && r !== "T") return [];
		if (!e.gameDate || Date.parse(e.gameDate) < start) return [];
		const opp = e.opponent?.abbreviation ?? "";
		return [
			{
				result: r,
				opponent: `${e.atVs === "@" ? "@" : "vs"} ${opp}`.trim(),
				score: e.score ?? "",
			},
		];
	});
}

type TeamKey = { id: string; abbr: string };

/** Pulls the parts of a summary the details sheet shows, matching teams by ESPN id or abbreviation. */
export function parseSummary(
	data: EspnSummary,
	teams: { home: TeamKey; away: TeamKey; season: number },
): GameDetails {
	const byTeam = <T extends { team?: { id?: string; abbreviation?: string } }>(
		list: T[] | undefined,
		key: TeamKey,
	) =>
		list?.find(
			(x) => x.team?.id === key.id || x.team?.abbreviation === key.abbr,
		);
	const venue = data.gameInfo?.venue;
	const w = data.gameInfo?.weather;
	// conditionId is usually a numeric code, but some feeds put the words there.
	const condition =
		w?.displayValue ??
		(w?.conditionId && !/^\d+$/.test(w.conditionId) ? w.conditionId : null);
	return {
		injuries: {
			home: toInjuries(byTeam(data.injuries, teams.home)?.injuries),
			away: toInjuries(byTeam(data.injuries, teams.away)?.injuries),
		},
		venue: venue?.fullName
			? {
					name: venue.fullName,
					place:
						[venue.address?.city, venue.address?.state]
							.filter(Boolean)
							.join(", ") || null,
				}
			: null,
		weather:
			w && (w.temperature != null || condition)
				? {
						temp: w.temperature ?? null,
						condition,
						precip: w.precipitation ?? null,
						wind: w.gust ?? null,
					}
				: null,
		line: toLine(data.pickcenter?.[0]),
		form: {
			home: toForm(byTeam(data.lastFiveGames, teams.home), teams.season),
			away: toForm(byTeam(data.lastFiveGames, teams.away), teams.season),
		},
	};
}

export async function fetchSummary(eventId: string): Promise<EspnSummary> {
	const url = new URL(SUMMARY);
	url.searchParams.set("event", eventId);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`ESPN summary ${res.status}`);
	return (await res.json()) as EspnSummary;
}
