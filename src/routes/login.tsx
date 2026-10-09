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
	const [discordPending, setDiscordPending] = useState(false);
	const callbackUrl = () =>
		`${window.location.origin}/auth/callback?next=${encodeURIComponent(search.next ?? "/leagues")}`;

	async function signInWithDiscord() {
		if (!supabase) {
			setStatus("error");
			setError("Sign-in is not configured yet.");
			return;
		}
		setDiscordPending(true);
		const { error } = await supabase.auth.signInWithOAuth({
			provider: "discord",
			options: { redirectTo: callbackUrl() },
		});
		// On success the browser is already navigating to Discord.
		if (error) {
			setDiscordPending(false);
			setStatus("error");
			setError(error.message);
		}
	}

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
				emailRedirectTo: callbackUrl(),
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
				Use Discord, or we'll email you a link. No password needed.
			</p>
			<button
				type="button"
				onClick={signInWithDiscord}
				disabled={discordPending}
				className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-full bg-[#5865F2] py-3 font-semibold text-white transition-[transform,background-color] hover:bg-[#4752C4] active:scale-95 disabled:opacity-60"
			>
				<DiscordLogo className="size-5" />
				{discordPending ? "Opening Discord…" : "Continue with Discord"}
			</button>
			<div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
				<span className="h-px flex-1 bg-border" />
				or
				<span className="h-px flex-1 bg-border" />
			</div>
			<AnimatePresence mode="wait">
				{status === "sent" ? (
					<motion.p
						key="sent"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						className="mt-6 rounded-lg border bg-card p-4"
					>
						Check <strong>{email}</strong> for your sign-in link.
					</motion.p>
				) : (
					<motion.form
						key="form"
						exit={{ opacity: 0, y: -8 }}
						onSubmit={send}
						className="mt-6 space-y-3"
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

function DiscordLogo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
			className={className}
		>
			<path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
		</svg>
	);
}
