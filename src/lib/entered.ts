interface EnteredPick {
	user_id: string;
	entered_by: string | null;
}

/** "a", "a and b", "a, b and c" */
function list(items: string[]) {
	return items.length < 2
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * The note on a game card saying which picks the commissioner entered, e.g.
 * "Steven entered your pick." Pass only the picks you can see on that card.
 */
export function enteredNote(
	picks: EnteredPick[],
	userId: string,
	names: Map<string, string>,
): string | null {
	const byEnterer = new Map<string, string[]>();
	for (const p of picks) {
		if (!p.entered_by) continue;
		const whose = byEnterer.get(p.entered_by) ?? [];
		// Yours reads first.
		if (p.user_id === userId) whose.unshift("your");
		else whose.push(`${names.get(p.user_id) ?? "Player"}'s`);
		byEnterer.set(p.entered_by, whose);
	}
	if (!byEnterer.size) return null;
	return [...byEnterer]
		.map(([by, whose]) => {
			const who = by === userId ? "You" : (names.get(by) ?? "The commissioner");
			return `${who} entered ${list(whose)} ${whose.length > 1 ? "picks" : "pick"}.`;
		})
		.join(" ");
}
