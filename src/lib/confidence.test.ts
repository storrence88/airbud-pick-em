import { describe, expect, it } from "vitest";
import {
	move,
	nextFreeValue,
	type RankedPick,
	rankOrder,
	reassign,
	repair,
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
