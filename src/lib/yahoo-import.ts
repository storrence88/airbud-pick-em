// Reads past weeks' picks pasted from Yahoo Pick'em so a league can bring its
// history over. Yahoo has no API, so the commissioner copies a week's group
// picks table (or types one player per line) and this turns it into picks.
//
// A team plays once a week, so a team name alone identifies the game. Each
// line is one player: their name first (before a tab or colon), then the teams
// they picked, each followed by its confidence points.

import { NFL_TEAMS } from "./nfl/teams";
import type { ScoringMode } from "./scoring";
import { MAX_TIEBREAKER, tiebreakerGameId } from "./tiebreaker";

export interface ImportGame {
	id: string;
	home: string;
	away: string;
	kickoff: string;
}

export interface ImportPick {
	gameId: string;
	team: string;
	confidence: number | null;
}

export interface ImportRow {
	/** The name as it appears on Yahoo. */
	name: string;
	picks: ImportPick[];
	/** Monday night total points guess, when the line has one. */
	tiebreaker: number | null;
	/** Anything that keeps this row from importing as is. */
	problems: string[];
}

// Older and Yahoo-style abbreviations that differ from ESPN's.
const ALIASES: Record<string, string> = {
	ARZ: "ARI",
	GNB: "GB",
	JAC: "JAX",
	KAN: "KC",
	LA: "LAR",
	LVR: "LV",
	NWE: "NE",
	NOR: "NO",
	OAK: "LV",
	SD: "LAC",
	SFO: "SF",
	STL: "LAR",
	TAM: "TB",
	WAS: "WSH",
	NINERS: "SF",
};

const TEAM_WORDS = new Map<string, string>();
for (const t of NFL_TEAMS) {
	TEAM_WORDS.set(t.abbr, t.abbr);
	// The nickname: "Kansas City Chiefs" -> CHIEFS, "San Francisco 49ers" -> 49ERS.
	TEAM_WORDS.set(t.name.split(" ").at(-1)?.toUpperCase() ?? t.abbr, t.abbr);
}
for (const [alias, abbr] of Object.entries(ALIASES))
	TEAM_WORDS.set(alias, abbr);

/** The ESPN abbreviation a word names, if it names a team. */
export function teamFromWord(word: string): string | undefined {
	return TEAM_WORDS.get(word.toUpperCase());
}

const TIEBREAKER_WORDS = new Set([
	"TIEBREAKER",
	"TIEBREAK",
	"TIE-BREAKER",
	"TIE",
	"MNF",
]);

type Token =
	| { kind: "team"; abbr: string }
	| { kind: "number"; value: number }
	| { kind: "tiebreaker" };

function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	for (const raw of text.split(/[\s,;:()[\]@|/*#=-]+/)) {
		if (!raw) continue;
		const num = /^(\d+)(?:pts?|points?)?$/i.exec(raw);
		if (num) {
			tokens.push({ kind: "number", value: Number(num[1]) });
			continue;
		}
		if (TIEBREAKER_WORDS.has(raw.toUpperCase())) {
			tokens.push({ kind: "tiebreaker" });
			continue;
		}
		const abbr = teamFromWord(raw);
		if (abbr) tokens.push({ kind: "team", abbr });
	}
	return tokens;
}

/** Splits the player's name off the front of a line. */
function splitName(line: string): [string, string] {
	const tab = line.indexOf("\t");
	if (tab >= 0) return [line.slice(0, tab), line.slice(tab + 1)];
	const colon = line.indexOf(":");
	if (colon >= 0) return [line.slice(0, colon), line.slice(colon + 1)];
	// No separator: the name runs up to the first team or number.
	const words = line.trim().split(/\s+/);
	const at = words.findIndex(isPickWord);
	if (at < 0) return [line, ""];
	if (at === 0) return ["", line];
	return [words.slice(0, at).join(" "), words.slice(at).join(" ")];
}

/** A team or a points value ("16", "(16)", "3.5"), as opposed to part of a name. */
function isPickWord(word: string) {
	return (
		/^\(?\d+(\.\d+)?\)?$/.test(word) ||
		teamFromWord(word.replace(/[^\w]/g, "")) !== undefined
	);
}

/** True when a line carries on the row before it instead of starting a player. */
function continuesRow(line: string) {
	const name = splitName(line)[0].trim();
	return !name || isPickWord(name);
}

// Row labels in Yahoo's group picks table that aren't players.
const TABLE_LABELS = new Set(["favored", "underdog", "spread", "team name"]);

/**
 * The pasted lines, one per player. Yahoo shows each pick as the team over its
 * points ("Sea" then "(10)"), so a copy can break a row across lines. A line
 * that doesn't start with a name belongs to the line before it.
 */
function joinCells(text: string): string[] {
	const lines: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		if (lines.length && continuesRow(line))
			lines[lines.length - 1] += ` ${line.trim()}`;
		else lines.push(line);
	}
	return lines;
}

/**
 * Reads pasted text into one row per player for a week's games. Lines naming
 * both teams of a game (Yahoo's header row of matchups) are skipped, as are
 * lines with no teams at all.
 */
export function parseWeekPaste(
	text: string,
	games: ImportGame[],
	mode: ScoringMode,
): ImportRow[] {
	const gameOf = new Map<string, ImportGame>();
	for (const g of games) {
		gameOf.set(g.home, g);
		gameOf.set(g.away, g);
	}
	const tbGame = tiebreakerGameId(games);
	const rows: ImportRow[] = [];

	for (const line of joinCells(text)) {
		const [rawName, rest] = splitName(line);
		if (TABLE_LABELS.has(rawName.trim().toLowerCase())) continue;
		const tokens = tokenize(rest);

		const picks: ImportPick[] = [];
		const used = new Set<number>();
		let tiebreaker: number | null = null;
		let header = false;
		// Points follow each team ("KC 16") unless the line leads with a number ("16 KC").
		const first = tokens.find((t) => t.kind !== "tiebreaker");
		const pointsFirst = first?.kind === "number";
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			if (t.kind === "tiebreaker") {
				const next = tokens[i + 1];
				if (next?.kind === "number") {
					tiebreaker = next.value;
					used.add(i + 1);
					i++;
				}
				continue;
			}
			if (t.kind !== "team") continue;
			const game = gameOf.get(t.abbr);
			// A team that isn't playing this week is most likely a stray word.
			if (!game) continue;
			if (picks.some((p) => p.gameId === game.id)) {
				header = true;
				break;
			}
			let confidence: number | null = null;
			const next = tokens[i + 1];
			const prev = tokens[i - 1];
			if (pointsFirst) {
				if (prev?.kind === "number" && !used.has(i - 1)) {
					confidence = prev.value;
					used.add(i - 1);
				}
			} else if (next?.kind === "number") {
				confidence = next.value;
				used.add(i + 1);
				i++;
			}
			picks.push({ gameId: game.id, team: t.abbr, confidence });
		}
		if (header || !picks.length) continue;

		const name = rawName.trim().replace(/\s+/g, " ");
		const problems: string[] = [];
		if (!name)
			problems.push("Couldn't find a name. Put it first, followed by a colon.");

		if (mode === "confidence") {
			const seen = new Map<number, string>();
			for (const p of picks) {
				if (p.confidence == null) {
					problems.push(`${p.team} has no points.`);
				} else if (p.confidence < 1 || p.confidence > games.length) {
					problems.push(
						`${p.team} has ${p.confidence} points; this week goes 1 to ${games.length}.`,
					);
				} else if (seen.has(p.confidence)) {
					problems.push(
						`${p.confidence} points is on both ${seen.get(p.confidence)} and ${p.team}.`,
					);
				} else {
					seen.set(p.confidence, p.team);
				}
			}
		} else {
			for (const p of picks) p.confidence = null;
		}

		if (tiebreaker != null) {
			if (tiebreaker > MAX_TIEBREAKER) {
				problems.push(`A tiebreaker of ${tiebreaker} is out of range.`);
			} else if (!picks.some((p) => p.gameId === tbGame)) {
				// The guess rides on the Monday night pick, so it needs one.
				tiebreaker = null;
			}
		}

		rows.push({ name, picks, tiebreaker, problems });
	}
	return rows;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The member a Yahoo name most likely is: the same name ignoring case and
 * punctuation, or the only member whose name starts with it or it starts with.
 */
export function guessMember(
	name: string,
	members: { user_id: string; display_name: string }[],
): string | null {
	const n = normalize(name);
	if (!n) return null;
	const exact = members.filter((m) => normalize(m.display_name) === n);
	if (exact.length === 1) return exact[0].user_id;
	const loose = members.filter((m) => {
		const d = normalize(m.display_name);
		return d.length > 0 && (d.startsWith(n) || n.startsWith(d));
	});
	return loose.length === 1 ? loose[0].user_id : null;
}
