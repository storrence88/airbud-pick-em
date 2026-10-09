import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
	it("explains expired links", () => {
		const params = new URLSearchParams(
			"error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
		);
		expect(authErrorMessage(params)).toMatch(/expired or was already used/);
	});
	it("passes through other errors and ignores clean URLs", () => {
		expect(
			authErrorMessage(new URLSearchParams("error_description=Nope")),
		).toBe("Nope");
		expect(authErrorMessage(new URLSearchParams("code=abc"))).toBeNull();
	});
});
