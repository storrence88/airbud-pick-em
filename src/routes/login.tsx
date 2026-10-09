import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { supabase } from "#/lib/supabase";

export const Route = createFileRoute("/login")({
	validateSearch: (
		s: Record<string, unknown>,
	): { next?: string; error?: string } => ({
		next: typeof s.next === "string" ? s.next : undefined,
		error: typeof s.error === "string" ? s.error : undefined,
	}),
	component: Login,
});

function Login() {
	const search = Route.useSearch();
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
		search.error ? "error" : "idle",
	);
	const [error, setError] = useState(search.error ?? "");

	async function send(e: React.FormEvent) {
		e.preventDefault();
		if (!supabase) {
			setStatus("error");
			setError("Sign-in is not configured yet.");
			return;
		}
		setStatus("sending");
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(search.next ?? "/leagues")}`,
			},
		});
		if (error) {
			setStatus("error");
			setError(error.message);
		} else setStatus("sent");
	}

	return (
		<main className="mx-auto max-w-sm px-4 py-12 sm:py-20">
			<h1 className="font-display text-4xl font-bold uppercase">Sign in</h1>
			<p className="mt-2 text-muted-foreground">
				We'll email you a link. No password needed.
			</p>
			<AnimatePresence mode="wait">
				{status === "sent" ? (
					<motion.p
						key="sent"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						className="mt-8 rounded-lg border bg-card p-4"
					>
						Check <strong>{email}</strong> for your sign-in link.
					</motion.p>
				) : (
					<motion.form
						key="form"
						exit={{ opacity: 0, y: -8 }}
						onSubmit={send}
						className="mt-8 space-y-3"
					>
						<input
							type="email"
							inputMode="email"
							autoComplete="email"
							autoCapitalize="none"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							className="w-full rounded-md border bg-card px-4 py-3 outline-none ring-ring/40 focus:ring-4"
						/>
						<button
							type="submit"
							disabled={status === "sending"}
							className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
						>
							{status === "sending" ? "Sending…" : "Email me a link"}
						</button>
						{status === "error" && <p className="text-sm text-loss">{error}</p>}
					</motion.form>
				)}
			</AnimatePresence>
		</main>
	);
}
