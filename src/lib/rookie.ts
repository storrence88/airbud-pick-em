// The Rookie checklist: a few real first steps for a new player, each one
// ticked off by what they've actually done.

export type RookieTaskId = "pick" | "lock" | "tiebreaker" | "team" | "install";

export interface RookieTask {
	id: RookieTaskId;
	label: string;
	done: boolean;
}

export function rookieTasks(s: {
	picks: number;
	hasLock: boolean;
	hasTiebreaker: boolean;
	favoriteTeam: string | null;
	installed: boolean;
	/** Phones only: adding to the home screen makes no sense on a laptop. */
	phone: boolean;
}): RookieTask[] {
	const tasks: RookieTask[] = [
		{ id: "pick", label: "Make your first pick", done: s.picks > 0 },
		{ id: "lock", label: "Pick a Lock of the Week", done: s.hasLock },
		{
			id: "tiebreaker",
			label: "Guess the Monday night total",
			done: s.hasTiebreaker,
		},
		{ id: "team", label: "Choose your favorite team", done: !!s.favoriteTeam },
	];
	if (s.phone || s.installed)
		tasks.push({
			id: "install",
			label: "Add Pick'em to your home screen",
			done: s.installed,
		});
	return tasks;
}
