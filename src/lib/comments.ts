// Game comments shared by the server and the UI: @mentions, reactions and
// "5m ago" times.

export const MAX_COMMENT = 500;

/** The quick reactions, in the order they show. */
export const REACTIONS = ["🔥", "😂", "💀", "🤡", "🧢", "🐐"] as const;
export type Reaction = (typeof REACTIONS)[number];

export function isReaction(s: string): s is Reaction {
	return (REACTIONS as readonly string[]).includes(s);
}

export interface Mentionable {
	user_id: string;
	display_name: string;
}

export type CommentPart =
	| { kind: "text"; text: string }
	| { kind: "mention"; text: string; userId: string };

/**
 * Splits a comment into plain text and @Name mentions of league members.
 * Longer names win, so "@Nate B" isn't read as "@Nate". A mention has to end
 * at a word boundary, so "@Natedog" isn't Nate.
 */
export function parseMentions(
	body: string,
	members: Mentionable[],
): CommentPart[] {
	const named = members
		.filter((m) => m.display_name.trim())
		.sort((a, b) => b.display_name.length - a.display_name.length);
	const parts: CommentPart[] = [];
	let text = "";
	let i = 0;
	while (i < body.length) {
		const at = body[i] === "@" && (i === 0 || !/\w/.test(body[i - 1]));
		const hit = at
			? named.find((m) => {
					const name = m.display_name;
					const end = i + 1 + name.length;
					return (
						body.slice(i + 1, end).toLowerCase() === name.toLowerCase() &&
						!/\w/.test(body[end] ?? "")
					);
				})
			: undefined;
		if (hit) {
			if (text) parts.push({ kind: "text", text });
			text = "";
			const end = i + 1 + hit.display_name.length;
			parts.push({
				kind: "mention",
				text: body.slice(i, end),
				userId: hit.user_id,
			});
			i = end;
		} else {
			text += body[i];
			i++;
		}
	}
	if (text) parts.push({ kind: "text", text });
	return parts;
}

/** Everyone @mentioned in a comment, once each, leaving out the author. */
export function mentionedIds(
	body: string,
	members: Mentionable[],
	authorId: string,
) {
	const ids = new Set<string>();
	for (const p of parseMentions(body, members))
		if (p.kind === "mention" && p.userId !== authorId) ids.add(p.userId);
	return [...ids];
}

/**
 * The @word being typed at the cursor, for the mention picker: where the @
 * starts and what follows it. Null when the cursor isn't in one.
 */
export function mentionQuery(text: string, cursor: number) {
	const before = text.slice(0, cursor);
	const at = before.lastIndexOf("@");
	if (at < 0 || (at > 0 && /\w/.test(before[at - 1]))) return null;
	const query = before.slice(at + 1);
	// Names can have a space ("Nate B"), but not a line break or a long run.
	if (query.length > 30 || /\n/.test(query) || /\s{2}/.test(query)) return null;
	return { start: at, query };
}

export interface ReactionRow {
	user_id: string;
	emoji: string;
}

export interface ReactionGroup {
	emoji: string;
	count: number;
	mine: boolean;
	userIds: string[];
}

/** Reactions on one comment, grouped by emoji in the quick-reaction order. */
export function groupReactions(rows: ReactionRow[], me: string) {
	const order = (e: string) => {
		const i = (REACTIONS as readonly string[]).indexOf(e);
		return i < 0 ? REACTIONS.length : i;
	};
	const by = new Map<string, string[]>();
	for (const r of rows)
		by.set(r.emoji, [...(by.get(r.emoji) ?? []), r.user_id]);
	return [...by.entries()]
		.map(
			([emoji, userIds]): ReactionGroup => ({
				emoji,
				count: userIds.length,
				mine: userIds.includes(me),
				userIds,
			}),
		)
		.sort((a, b) => order(a.emoji) - order(b.emoji));
}

/** "now", "5m", "3h", "2d", then a date. */
export function timeAgo(iso: string, now = new Date()) {
	const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
	if (s < 60) return "now";
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
