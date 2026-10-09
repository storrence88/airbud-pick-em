export type ScoringMode = "straight" | "spread" | "confidence";

export const SCORING_MODES: Record<
	ScoringMode,
	{ label: string; tagline: string; explanation: string }
> = {
	straight: {
		label: "Straight Up",
		tagline: "Pick the winner",
		explanation:
			"Just pick who wins each game. Every correct pick is worth one point.",
	},
	spread: {
		label: "Against the Spread",
		tagline: "Beat the line",
		explanation:
			"Pick who covers the point spread, not just who wins. A 7-point favorite has to win by more than 7. The line is locked when picks lock.",
	},
	confidence: {
		label: "Confidence Points",
		tagline: "Rank your hunches",
		explanation:
			"Pick every winner, then rank your picks by how sure you are. With 16 games, your surest pick is worth 16 and your shakiest is worth 1. You earn the points of every pick you get right.",
	},
};

export interface GameResult {
	id: string;
	homeTeam: string;
	awayTeam: string;
	homeScore: number;
	awayScore: number;
	final: boolean;
	/** Home team's line at lock time, e.g. -3.5 when home is favored by 3.5. */
	lockedSpread?: number | null;
}

export interface Pick {
	gameId: string;
	team: string;
	confidence?: number | null;
}

export interface ScoringSettings {
	mode: ScoringMode;
	/** Points for a push against the spread. Default 0. */
	pushValue?: number;
}

export type PickOutcome = "win" | "loss" | "push" | "pending";

/** Decides one pick against one game, ignoring confidence weighting. */
export function pickOutcome(
	pick: Pick,
	game: GameResult,
	mode: ScoringMode,
): PickOutcome {
	if (!game.final) return "pending";
	const pickedHome = pick.team === game.homeTeam;
	let margin = game.homeScore - game.awayScore;
	if (mode === "spread") margin += game.lockedSpread ?? 0;
	if (margin === 0) return "push";
	const homeCovers = margin > 0;
	return homeCovers === pickedHome ? "win" : "loss";
}

/** Points a single pick earns. Straight-up ties count as pushes. */
export function scorePick(
	pick: Pick,
	game: GameResult,
	settings: ScoringSettings,
): number {
	const outcome = pickOutcome(pick, game, settings.mode);
	const weight = settings.mode === "confidence" ? (pick.confidence ?? 0) : 1;
	if (outcome === "win") return weight;
	if (outcome === "push" && settings.mode === "spread")
		return settings.pushValue ?? 0;
	return 0;
}

/** Total points for one player's picks across a set of games. */
export function scoreWeek(
	picks: Pick[],
	games: GameResult[],
	settings: ScoringSettings,
): number {
	const byId = new Map(games.map((g) => [g.id, g]));
	return picks.reduce((sum, pick) => {
		const game = byId.get(pick.gameId);
		return game ? sum + scorePick(pick, game, settings) : sum;
	}, 0);
}

/** Confidence values must be a permutation of 1..gameCount. */
export function validateConfidence(picks: Pick[], gameCount: number): boolean {
	const values = picks.map((p) => p.confidence).filter((c) => c != null);
	if (values.length !== picks.length) return false;
	const seen = new Set(values);
	return (
		seen.size === values.length &&
		values.every((v) => Number.isInteger(v) && v >= 1 && v <= gameCount)
	);
}
