import { describe, expect, it } from "vitest";
import {
	groupReactions,
	mentionedIds,
	mentionQuery,
	parseMentions,
	timeAgo,
} from "./comments";

const members = [
	{ user_id: "s", display_name: "Steven" },
	{ user_id: "n", display_name: "Nate" },
	{ user_id: "nb", display_name: "Nate B" },
];

describe("parseMentions", () => {
	it("finds members by name, case-insensitively", () => {
		expect(parseMentions("hey @nate, Bills by 20", members)).toEqual([
			{ kind: "text", text: "hey " },
			{ kind: "mention", text: "@nate", userId: "n" },
			{ kind: "text", text: ", Bills by 20" },
		]);
	});

	it("prefers the longest name", () => {
		expect(parseMentions("@Nate B lol", members)[0]).toEqual({
			kind: "mention",
			text: "@Nate B",
			userId: "nb",
		});
	});

	it("ignores partial names and emails", () => {
		expect(parseMentions("@Natedog me@steven.com", members)).toEqual([
			{ kind: "text", text: "@Natedog me@steven.com" },
		]);
	});
});

describe("mentionedIds", () => {
	it("lists each person once and leaves out the author", () => {
		expect(mentionedIds("@Nate @Steven @Nate", members, "s")).toEqual(["n"]);
	});
});

describe("mentionQuery", () => {
	it("is the @word at the cursor", () => {
		expect(mentionQuery("yo @Na", 6)).toEqual({ start: 3, query: "Na" });
		expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
	});

	it("is null outside a mention", () => {
		expect(mentionQuery("yo Nate", 7)).toBeNull();
		expect(mentionQuery("me@x", 4)).toBeNull();
	});
});

describe("groupReactions", () => {
	it("counts each emoji in the quick-reaction order and marks yours", () => {
		const groups = groupReactions(
			[
				{ user_id: "n", emoji: "🤡" },
				{ user_id: "s", emoji: "🔥" },
				{ user_id: "n", emoji: "🔥" },
			],
			"s",
		);
		expect(groups.map((g) => [g.emoji, g.count, g.mine])).toEqual([
			["🔥", 2, true],
			["🤡", 1, false],
		]);
	});
});

describe("timeAgo", () => {
	const now = new Date("2026-10-18T12:00:00Z");
	it("is short", () => {
		expect(timeAgo("2026-10-18T11:59:30Z", now)).toBe("now");
		expect(timeAgo("2026-10-18T11:55:00Z", now)).toBe("5m");
		expect(timeAgo("2026-10-18T09:00:00Z", now)).toBe("3h");
		expect(timeAgo("2026-10-16T12:00:00Z", now)).toBe("2d");
	});
});
