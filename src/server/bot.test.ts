import { describe, expect, it } from "vitest";
import { generateKey, hashKey, KEY_PREFIX, visiblePicks } from "./bot";

describe("visiblePicks", () => {
	const now = new Date("2026-10-11T18:00:00Z");
	const games = [
		{ id: "early", kickoff: "2026-10-11T17:00:00Z" },
		{ id: "late", kickoff: "2026-10-11T20:25:00Z" },
	];
	const picks = [
		{ user_id: "me", game_id: "early", team: "KC", confidence: 2 },
		{ user_id: "me", game_id: "late", team: "DAL", confidence: 1 },
		{ user_id: "pal", game_id: "early", team: "BUF", confidence: 1 },
		{ user_id: "pal", game_id: "late", team: "PHI", confidence: 2 },
	];

	it("hides every pick until its game kicks off", () => {
		expect(visiblePicks(picks, games, now).map((p) => p.game_id)).toEqual([
			"early",
			"early",
		]);
	});
});

describe("keys", () => {
	it("makes distinct prefixed keys whose hash matches", async () => {
		const a = await generateKey();
		const b = await generateKey();
		expect(a.key.startsWith(KEY_PREFIX)).toBe(true);
		expect(a.key).not.toBe(b.key);
		expect(a.key.startsWith(a.prefix)).toBe(true);
		expect(a.hash).toBe(await hashKey(a.key));
		expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
	});
});
