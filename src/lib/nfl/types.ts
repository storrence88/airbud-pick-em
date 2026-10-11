export type GameState = "pre" | "in" | "post";

export interface Team {
	id: string;
	abbr: string;
	name: string;
	shortName: string;
	color: string;
	altColor: string;
	logo: string;
	record?: string;
	homeRecord?: string;
	roadRecord?: string;
}

export interface Game {
	id: string;
	season: number;
	week: number;
	kickoff: string;
	state: GameState;
	statusText: string;
	home: Team;
	away: Team;
	homeScore: number;
	awayScore: number;
	/** Home team's line: negative when home is favored. Null when no line. */
	spread: number | null;
	spreadText: string | null;
	/** Share of ESPN NFL Pick'em players picking each side, when known. */
	publicPicks?: PublicPicks | null;
}

/** Whole percentages that add to 100. */
export interface PublicPicks {
	home: number;
	away: number;
}

export interface NflProvider {
	getWeek(opts?: { season?: number; week?: number }): Promise<Game[]>;
}
