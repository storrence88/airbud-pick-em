/** One of the user's picks as the confidence ranking sees it. */
export interface RankedPick {
	gameId: string;
	confidence: number | null;
	/** Kicked off: its value is spent and can't move. */
	locked: boolean;
}

export interface ConfidenceChange {
	gameId: string;
	confidence: number;
}

/** Lowest value in 1..gameCount that isn't already taken. */
export function nextFreeValue(
	used: Iterable<number | null | undefined>,
	gameCount: number,
): number | null {
	const taken = new Set(used);
	for (let v = 1; v <= gameCount; v++) if (!taken.has(v)) return v;
	return null;
}

/** Open picks, most confident first. */
export function rankOrder(picks: RankedPick[]): string[] {
	return picks
		.filter((p) => !p.locked && p.confidence != null)
		.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
		.map((p) => p.gameId);
}

/**
 * Applies a new ranking (most confident first) to the open picks. They trade
 * the values they already hold among themselves, so no value is ever doubled
 * up and locked games keep theirs. Returns only the picks whose value moved.
 */
export function reassign(
	order: string[],
	picks: RankedPick[],
): ConfidenceChange[] {
	const byId = new Map(picks.map((p) => [p.gameId, p]));
	const open = order
		.map((id) => byId.get(id))
		.filter((p): p is RankedPick => !!p && !p.locked && p.confidence != null);
	const values = open.map((p) => p.confidence as number).sort((a, b) => b - a);
	return open.flatMap((p, i) =>
		p.confidence === values[i]
			? []
			: [{ gameId: p.gameId, confidence: values[i] }],
	);
}

/** Moves one game up (-1) or down (+1) in the ranking. */
export function move(order: string[], gameId: string, delta: -1 | 1) {
	const i = order.indexOf(gameId);
	const j = i + delta;
	if (i < 0 || j < 0 || j >= order.length) return order;
	const next = [...order];
	[next[i], next[j]] = [next[j], next[i]];
	return next;
}

/**
 * Fixes picks saved before values were unique: doubled-up, out-of-range or
 * missing values on open picks get the lowest free value. The first holder of
 * a value (highest-ranked) keeps it; locked picks are never touched.
 */
export function repair(
	picks: RankedPick[],
	gameCount: number,
): ConfidenceChange[] {
	const used = new Set(picks.filter((p) => p.locked).map((p) => p.confidence));
	const open = picks
		.filter((p) => !p.locked)
		.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
	const conflicts: RankedPick[] = [];
	for (const p of open) {
		const v = p.confidence;
		if (v != null && v >= 1 && v <= gameCount && !used.has(v)) used.add(v);
		else conflicts.push(p);
	}
	return conflicts.flatMap((p) => {
		const v = nextFreeValue(used, gameCount);
		if (v == null) return [];
		used.add(v);
		return [{ gameId: p.gameId, confidence: v }];
	});
}
