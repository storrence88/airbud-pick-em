import { describe, expect, it } from "vitest";
import {
	forfeited,
	move,
	nextFreeValue,
	type RankedPick,
	rankOrder,
	reassign,
	repair,
	settle,
} from "./confidence";

const p = (gameId: string, confidence: number | null, locked = false) =>
	({ gameId, confidence, locked }) satisfies RankedPick;

describe("nextFreeValue", () => {
	it("returns the lowest unused value", () => {
		expect(nextFreeValue([1, 2, 4], 5)).toBe(3);
		expect(nextFreeValue([null, 2], 3)).toBe(1);
	});
	it("returns null when every value is taken", () => {
		expect(nextFreeValue([1, 2], 2)).toBeNull();
	});
});

describe("reassign", () => {
	const picks = [p("a", 5), p("b", 3), p("c", 1), p("locked", 4, true)];

	it("ranks open picks by value and skips locked ones", () => {
		expect(rankOrder(picks)).toEqual(["a", "b", "c"]);
	});

	it("trades the existing values when the order changes", () => {
		expect(reassign(["c", "a", "b"], picks)).toEqual([
			{ gameId: "c", confidence: 5 },
			{ gameId: "a", confidence: 3 },
			{ gameId: "b", confidence: 1 },
		]);
	});

	it("never touches the value a locked game holds", () => {
		const changes = reassign(["b", "a", "c"], picks);
		expect(changes.map((c) => c.confidence)).not.toContain(4);
		expect(changes).toEqual([
			{ gameId: "b", confidence: 5 },
			{ gameId: "a", confidence: 3 },
		]);
	});

	it("returns nothing for an unchanged order", () => {
		expect(reassign(["a", "b", "c"], picks)).toEqual([]);
	});
});

describe("move", () => {
	it("swaps a game with its neighbour", () => {
		expect(move(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
		expect(move(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
	});
	it("stays put at the ends", () => {
		expect(move(["a", "b"], "a", -1)).toEqual(["a", "b"]);
		expect(move(["a", "b"], "b", 1)).toEqual(["a", "b"]);
	});
});

describe("repair", () => {
	it("gives doubled-up and missing values the lowest free value", () => {
		expect(repair([p("a", 3), p("b", 3), p("c", null)], 3)).toEqual([
			{ gameId: "b", confidence: 1 },
			{ gameId: "c", confidence: 2 },
		]);
	});

	it("moves an open pick off a value a locked game holds", () => {
		expect(repair([p("a", 2, true), p("b", 2)], 2)).toEqual([
			{ gameId: "b", confidence: 1 },
		]);
	});

	it("leaves clean picks alone", () => {
		expect(repair([p("a", 2), p("b", 1)], 2)).toEqual([]);
	});
});

describe("missed games", () => {
	// 15 games, Thursday ("thu") kicked off with no pick, 14 Sunday picks at 1..14.
	const sunday = Array.from({ length: 14 }, (_, i) => p(`g${i + 1}`, i + 1));

	it("gives up the lowest value the locked picks don't hold", () => {
		expect(forfeited(sunday, 15, 1)).toEqual([1]);
		expect(forfeited([p("a", 1, true), p("b", 3, true)], 5, 2)).toEqual([2, 4]);
		expect(forfeited(sunday, 15, 0)).toEqual([]);
	});

	it("slides every pick up one so the top value is usable again", () => {
		const changes = settle(sunday, 15, 1);
		expect(changes).toHaveLength(14);
		expect(changes.find((c) => c.gameId === "g14")?.confidence).toBe(15);
		expect(changes.find((c) => c.gameId === "g1")?.confidence).toBe(2);
	});

	it("only shifts up to the first gap", () => {
		expect(settle([p("a", 1), p("b", 2), p("c", 4)], 5, 1)).toEqual([
			{ gameId: "a", confidence: 2 },
			{ gameId: "b", confidence: 3 },
		]);
	});

	it("steps over values locked picks hold", () => {
		expect(settle([p("a", 1), p("b", 2, true), p("c", 3)], 4, 1)).toEqual([
			{ gameId: "a", confidence: 3 },
			{ gameId: "c", confidence: 4 },
		]);
	});

	it("never hands a forfeited value to a repaired pick", () => {
		expect(settle([p("a", 3), p("b", 3)], 3, 1)).toEqual([
			{ gameId: "b", confidence: 2 },
		]);
	});

	it("leaves settled picks alone", () => {
		expect(settle([p("a", 2), p("b", 3)], 3, 1)).toEqual([]);
		expect(settle([p("a", 2), p("b", 1)], 2)).toEqual([]);
	});
});
