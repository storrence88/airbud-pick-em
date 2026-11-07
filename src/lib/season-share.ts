// What goes on the season standings share: the same table as the Standings
// tab (place, name, season total, last week's points) plus who moved up or
// down since the week before. Standings only count final games, so nothing
// here can give away a pick early.

import type { ShareStatus } from "./share-card";
import type { StandingRow } from "./standings";

export interface SeasonRow {
	userId: string;
	name: string;
	/** Same order and numbers as the Standings tab. */
	place: number;
	total: number;
	/** Points in the latest week with a final game. */
	week: number;
	/** Places gained (+) or lost (−) since the week before; 0 when unchanged or unknown. */
	moved: number;
	/** Points behind the leader; 0 for the leader. */
	behind: number;
}

export interface SeasonShare {
	league: string;
	/** The latest week with a final game. */
	week: number;
	status: ShareStatus;
	rows: SeasonRow[];
}

/** Standard competition ranks (1, 1, 3) for a list of scores, best first. */
function ranks(scores: number[]) {
	const sorted = [...scores].sort((a, b) => b - a);
	return scores.map((s) => sorted.indexOf(s) + 1);
}

/**
 * The season standings as shared. `rows` come from computeStandings(), best
 * first, members only. `weeks` says how many games each week has and how
 * many are final, so a week still being played reads "Week 9 so far".
 * Null until a game has gone final.
 */
export function seasonShare({
	rows,
	names,
	weeks,
	league,
}: {
	rows: StandingRow[];
	names: Map<string, string>;
	weeks: Record<number, { total: number; final: number }>;
	league: string;
}): SeasonShare | null {
	const week = Math.max(
		0,
		...Object.entries(weeks)
			.filter(([, w]) => w.final > 0)
			.map(([n]) => Number(n)),
	);
	if (!week || !rows.length) return null;
	const done = weeks[week] && weeks[week].final >= weeks[week].total;
	const status: ShareStatus = done
		? { kind: "final", label: `After Week ${week}` }
		: { kind: "through", label: `Week ${week} so far` };

	// Where everyone stood before this week's points, to show who moved.
	const before = ranks(rows.map((r) => r.total - (r.byWeek[week] ?? 0)));
	const now = ranks(rows.map((r) => r.total));
	const firstWeek = rows.every((r) => r.total === (r.byWeek[week] ?? 0));
	const top = rows[0].total;
	return {
		league,
		week,
		status,
		rows: rows.map((r, i) => ({
			userId: r.userId,
			name: names.get(r.userId) ?? "Player",
			place: i + 1,
			total: r.total,
			week: r.byWeek[week] ?? 0,
			moved: firstWeek ? 0 : before[i] - now[i],
			behind: top - r.total,
		})),
	};
}

const NAME_WIDTH = 14;

function cell(text: string, width: number, alignRight = false) {
	const t =
		[...text].length > width
			? `${[...text].slice(0, width - 1).join("")}…`
			: text;
	return alignRight ? t.padStart(width) : t.padEnd(width);
}

export function movedText(moved: number) {
	if (moved > 0) return `▲${moved}`;
	if (moved < 0) return `▼${-moved}`;
	return "";
}

/** The standings as a Discord message; the table sits in a code block so the columns line up. */
export function seasonText(share: SeasonShare) {
	const lines = [
		`🏆 ${share.league} · Season standings · ${share.status.label}`,
	];
	const placeWidth = String(share.rows.length).length;
	const totalWidth = Math.max(
		5,
		...share.rows.map((r) => String(r.total).length),
	);
	const wk = `Wk ${share.week}`;
	const weekWidth = Math.max(
		wk.length,
		...share.rows.map((r) => String(r.week).length + 1),
	);
	lines.push("```");
	lines.push(
		[
			" ".repeat(placeWidth),
			cell("", NAME_WIDTH),
			cell("Total", totalWidth, true),
			cell(wk, weekWidth, true),
		]
			.join("  ")
			.trimEnd(),
	);
	for (const r of share.rows) {
		lines.push(
			[
				String(r.place).padStart(placeWidth),
				cell(r.name, NAME_WIDTH),
				cell(String(r.total), totalWidth, true),
				cell(`+${r.week}`, weekWidth, true),
				movedText(r.moved),
			]
				.join("  ")
				.trimEnd(),
		);
	}
	lines.push("```");
	return lines.join("\n");
}
