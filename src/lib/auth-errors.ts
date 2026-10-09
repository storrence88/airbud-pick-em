/** Turns Supabase's auth error params into a message people can act on. */
export function authErrorMessage(params: URLSearchParams): string | null {
	const code = params.get("error_code");
	const description = params.get("error_description");
	if (!code && !description && !params.get("error")) return null;
	if (code === "otp_expired")
		return "That sign-in link has expired or was already used. Send yourself a new one.";
	return description ?? "Sign-in failed. Send yourself a new link.";
}
