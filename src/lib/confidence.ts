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
 * Values a missed game gives up: one per game that kicked off without a pick,
 * taken from the bottom of what the locked picks don't already hold. Missed
 * games score 0, so this keeps the top values open for the games still left.
 */
export function forfeited(
	picks: RankedPick[],
	gameCount: number,
	missed: number,
): number[] {
	const held = new Set(picks.filter((p) => p.locked).map((p) => p.confidence));
	const out: number[] = [];
	for (let v = 1; v <= gameCount && out.length < missed; v++)
		if (!held.has(v)) out.push(v);
	return out;
}

/**
 * Fixes picks saved before values were unique: doubled-up, out-of-range or
 * missing values on open picks get the lowest free value. The first holder of
 * a value (highest-ranked) keeps it; locked picks are never touched. Values in
 * `skip` are never handed out.
 */
export function repair(
	picks: RankedPick[],
	gameCount: number,
	skip: number[] = [],
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
	const taken = new Set([...used, ...skip]);
	return conflicts.flatMap((p) => {
		const v = nextFreeValue(taken, gameCount);
		if (v == null) return [];
		taken.add(v);
		return [{ gameId: p.gameId, confidence: v }];
	});
}

/**
 * Everything the open picks need to be valid: `repair`, then any open pick
 * sitting on a value a missed game gave up slides up, pushing the picks above
 * it up one step until there's a gap. Order is kept, so after missing one game
 * your surest pick still gets the top value.
 */
export function settle(
	picks: RankedPick[],
	gameCount: number,
	missed = 0,
): ConfidenceChange[] {
	const lost = forfeited(picks, gameCount, missed);
	const fixed = new Map(
		repair(picks, gameCount, lost).map((c) => [c.gameId, c.confidence]),
	);
	const open = picks
		.filter((p) => !p.locked)
		.map((p) => ({ ...p, confidence: fixed.get(p.gameId) ?? p.confidence }))
		.filter((p) => p.confidence != null)
		.sort((a, b) => (a.confidence as number) - (b.confidence as number));
	const blocked = new Set([
		...picks.filter((p) => p.locked).map((p) => p.confidence),
		...lost,
	]);
	let prev = 0;
	for (const p of open) {
		let v = p.confidence as number;
		if (blocked.has(v) || v <= prev) {
			v = prev + 1;
			while (v <= gameCount && blocked.has(v)) v++;
			if (v > gameCount) break;
		}
		fixed.set(p.gameId, v);
		prev = v;
	}
	const before = new Map(picks.map((p) => [p.gameId, p.confidence]));
	return [...fixed]
		.filter(([id, v]) => before.get(id) !== v)
		.map(([gameId, confidence]) => ({ gameId, confidence }));
}
