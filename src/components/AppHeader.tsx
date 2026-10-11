import { Link, useRouteContext, useRouter } from "@tanstack/react-router";
import { signOut } from "#/server/auth";
import { Avatar } from "./Avatar";
import { NewDot, useNewDot } from "./NewDot";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader() {
	const { user } = useRouteContext({ from: "__root__" });
	const router = useRouter();
	// Reminders live on the profile page, so the dot points there.
	const reminders = useNewDot("reminders", !!user);

	return (
		<header className="sticky top-0 z-30 border-b bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
			<nav className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-4">
				<Link
					to="/"
					className="shrink-0 py-2 font-display text-xl font-bold tracking-wide text-foreground"
				>
					PICK<span className="text-primary">'EM</span>
				</Link>
				<div className="flex gap-1 text-sm font-medium">
					<Link
						to={user ? "/leagues" : "/picks"}
						className="flex h-10 items-center rounded-full px-3 text-muted-foreground transition-colors hover:text-foreground"
						activeProps={{ className: "bg-muted !text-foreground" }}
					>
						{user ? "My leagues" : "This week"}
					</Link>
				</div>
				{user ? (
					<div className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
						{/* Phones are short on room here; the profile page has the setting too. */}
						<ThemeToggle className="hidden sm:block" />
						<Link
							to="/profile"
							aria-label="Your profile"
							className="flex h-10 items-center gap-2 rounded-full pr-1 pl-1 text-muted-foreground transition-colors hover:text-foreground sm:pr-3"
							activeProps={{ className: "bg-muted !text-foreground" }}
						>
							<span className="relative">
								<Avatar profile={user.profile} size={28} />
								<NewDot show={reminders.show} className="-top-0.5 -right-0.5" />
							</span>
							<span className="hidden max-w-40 truncate sm:inline">
								{user.displayName}
							</span>
						</Link>
						<button
							type="button"
							onClick={async () => {
								await signOut();
								await router.invalidate();
								router.navigate({ to: "/" });
							}}
							className="h-10 rounded-full border px-4 font-medium transition-colors hover:bg-muted"
						>
							Sign out
						</button>
					</div>
				) : (
					<div className="ml-auto flex items-center gap-1 sm:gap-2">
						<ThemeToggle />
						<Link
							to="/login"
							className="flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95"
						>
							Sign in
						</Link>
					</div>
				)}
			</nav>
		</header>
	);
}
