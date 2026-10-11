import { describe, expect, it } from "vitest";
import { enteredNote } from "./entered";

const names = new Map([
	["comm", "Steven"],
	["me", "Me"],
	["dave", "Dave"],
	["mike", "Mike"],
]);

describe("enteredNote", () => {
	it("is empty when every pick was made by its owner", () => {
		expect(
			enteredNote([{ user_id: "dave", entered_by: null }], "me", names),
		).toBeNull();
	});

	it("tells you the commissioner entered your pick", () => {
		expect(
			enteredNote([{ user_id: "me", entered_by: "comm" }], "me", names),
		).toBe("Steven entered your pick.");
	});

	it("lists yours first, then others", () => {
		expect(
			enteredNote(
				[
					{ user_id: "dave", entered_by: "comm" },
					{ user_id: "mike", entered_by: "comm" },
					{ user_id: "me", entered_by: "comm" },
				],
				"me",
				names,
			),
		).toBe("Steven entered your, Dave's and Mike's picks.");
	});

	it("speaks to the commissioner as you", () => {
		expect(
			enteredNote([{ user_id: "dave", entered_by: "comm" }], "comm", names),
		).toBe("You entered Dave's pick.");
	});

	it("falls back when the commissioner has left", () => {
		expect(
			enteredNote([{ user_id: "dave", entered_by: "gone" }], "me", names),
		).toBe("The commissioner entered Dave's pick.");
	});
});
