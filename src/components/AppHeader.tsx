import { Link, useRouteContext, useRouter } from "@tanstack/react-router";
import { signOut } from "#/server/auth";

export function AppHeader() {
	const { user } = useRouteContext({ from: "__root__" });
	const router = useRouter();

	return (
		<header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
			<nav className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
				<Link
					to="/"
					className="font-display text-xl font-bold tracking-wide text-foreground"
				>
					PICK<span className="text-primary">'EM</span>
				</Link>
				<div className="flex gap-1 text-sm font-medium">
					<Link
						to={user ? "/leagues" : "/picks"}
						className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
						activeProps={{ className: "bg-muted !text-foreground" }}
					>
						{user ? "My leagues" : "This week"}
					</Link>
				</div>
				{user ? (
					<div className="ml-auto flex items-center gap-3 text-sm">
						<span className="hidden text-muted-foreground sm:inline">
							{user.displayName}
						</span>
						<button
							type="button"
							onClick={async () => {
								await signOut();
								await router.invalidate();
								router.navigate({ to: "/" });
							}}
							className="rounded-full border px-3 py-1.5 font-medium transition-colors hover:bg-muted"
						>
							Sign out
						</button>
					</div>
				) : (
					<Link
						to="/login"
						className="ml-auto rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95"
					>
						Sign in
					</Link>
				)}
			</nav>
		</header>
	);
}
