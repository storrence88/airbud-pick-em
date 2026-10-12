import { createFileRoute } from "@tanstack/react-router";
import { authErrorMessage } from "#/lib/auth-errors";
import { getSupabaseServerClient } from "#/lib/supabase.server";

/**
 * Magic-link and Discord landing: swaps the one-time code for a session cookie.
 * Email links built from the token hash (see the Magic Link template in the
 * README) work in any browser, unlike `code`, which needs the browser that
 * asked for the link.
 */
export const Route = createFileRoute("/auth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const toLogin = (message: string) =>
					new Response(null, {
						status: 302,
						headers: {
							Location: `/login?error=${encodeURIComponent(message)}`,
						},
					});
				const linkError = authErrorMessage(url.searchParams);
				if (linkError) return toLogin(linkError);
				const code = url.searchParams.get("code");
				const next = url.searchParams.get("next");
				// Only allow same-site relative redirects.
				const dest =
					next?.startsWith("/") && !next.startsWith("//") ? next : "/leagues";
				const tokenHash = url.searchParams.get("token_hash");
				if (tokenHash) {
					const { error } = await getSupabaseServerClient().auth.verifyOtp({
						token_hash: tokenHash,
						type:
							url.searchParams.get("type") === "magiclink"
								? "magiclink"
								: "email",
					});
					if (error)
						return toLogin(
							"That sign-in link has expired or was already used. Send a new one.",
						);
				} else if (code) {
					const { error } =
						await getSupabaseServerClient().auth.exchangeCodeForSession(code);
					if (error)
						return toLogin(
							"That sign-in didn't work. Try again from this browser.",
						);
				}
				return new Response(null, { status: 302, headers: { Location: dest } });
			},
		},
	},
});
