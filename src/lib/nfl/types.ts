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
}

export interface NflProvider {
	getWeek(opts?: { season?: number; week?: number }): Promise<Game[]>;
}
