// "Faded the public": a winning pick on the side at most 20% of ESPN NFL
// Pick'em players took. Only finished games count, so it never hints at a
// pick before kickoff.

import type { PublicPicks } from "./nfl/types";
import { pickOutcome, type ScoringMode } from "./scoring";

/** The crowd share on the other side that makes a pick a fade. */
export const FADE_AT = 80;

export interface FadeGame {
	id: string;
	state: "pre" | "in" | "post";
	home: { abbr: string };
	away: { abbr: string };
	homeScore: number;
	awayScore: number;
	lockedSpread?: number | null;
}

export interface Fade {
	/** The team the fader picked. */
	team: string;
	/** Share of ESPN players on the other side, e.g. 86. */
	crowd: number;
	/** Players whose pick on `team` won in this league. */
	userIds: string[];
}

/**
 * Who faded the public in one game. "Won" follows the league's scoring, so
 * against the spread it means the pick covered. Null when nobody did.
 */
export function fadedThePublic(
	game: FadeGame,
	split: PublicPicks | null | undefined,
	picks: { user_id: string; game_id: string; team: string }[],
	mode: ScoringMode,
): Fade | null {
	if (game.state !== "post" || !split) return null;
	const team =
		split.away >= FADE_AT
			? game.home.abbr
			: split.home >= FADE_AT
				? game.away.abbr
				: null;
	if (!team) return null;
	const result = {
		id: game.id,
		homeTeam: game.home.abbr,
		awayTeam: game.away.abbr,
		homeScore: game.homeScore,
		awayScore: game.awayScore,
		final: true,
		lockedSpread: game.lockedSpread,
	};
	const userIds = picks
		.filter(
			(p) =>
				p.game_id === game.id &&
				p.team === team &&
				pickOutcome({ gameId: game.id, team }, result, mode) === "win",
		)
		.map((p) => p.user_id);
	if (!userIds.length) return null;
	return {
		team,
		crowd: team === game.home.abbr ? split.away : split.home,
		userIds,
	};
}
