import { Link } from "@tanstack/react-router";

const links = [
	{ to: "/picks", label: "Picks" },
	{ to: "/league/new", label: "New league" },
] as const;

export function AppHeader() {
	return (
		<header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
			<nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
				<Link
					to="/"
					className="font-display text-xl font-bold tracking-wide text-foreground"
				>
					PICK<span className="text-primary">'EM</span>
				</Link>
				<div className="flex gap-1 text-sm font-medium">
					{links.map((l) => (
						<Link
							key={l.to}
							to={l.to}
							className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
							activeProps={{ className: "bg-muted !text-foreground" }}
						>
							{l.label}
						</Link>
					))}
				</div>
				<Link
					to="/login"
					className="ml-auto rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95"
				>
					Sign in
				</Link>
			</nav>
		</header>
	);
}
