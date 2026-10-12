import { createFileRoute, redirect } from "@tanstack/react-router";

// The old browser-only demo page. Older reminder emails and Discord messages
// link here, so send those to the real leagues instead.
export const Route = createFileRoute("/picks")({
	beforeLoad: () => {
		throw redirect({ to: "/leagues", replace: true });
	},
});
