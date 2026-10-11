import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useRouteContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { MotionConfig } from "motion/react";

import { AppHeader } from "../components/AppHeader";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { ServiceWorker } from "../components/ServiceWorker";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { teamByAbbr } from "../lib/nfl/teams";
import { accentVars } from "../lib/team-colors";
import { themeScript } from "../lib/theme";
import { getSessionUser, type SessionUser } from "../server/auth";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	beforeLoad: async () => ({ user: await getSessionUser() }),
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{
				title: "Pick'em",
			},
			// Full-screen launch from the home screen (iOS reads these, not the manifest).
			{ name: "apple-mobile-web-app-capable", content: "yes" },
			{ name: "mobile-web-app-capable", content: "yes" },
			{ name: "apple-mobile-web-app-title", content: "Pick'em" },
			// "default" keeps the status bar readable in both light and dark themes.
			{ name: "apple-mobile-web-app-status-bar-style", content: "default" },
		],
		links: [
			{ rel: "manifest", href: "/manifest.webmanifest" },
			{ rel: "icon", type: "image/svg+xml", href: "/icons/icon.svg" },
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/icons/favicon-32.png",
			},
			{ rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

/** Swaps the app accent for your favorite team's color when you've opted in. */
function teamTheme(user: SessionUser | null) {
	const team = user?.teamTheme ? teamByAbbr(user.profile.favorite_team) : null;
	return team ? accentVars(team) : undefined;
}

function RootDocument({ children }: { children: React.ReactNode }) {
	const { user } = useRouteContext({ from: "__root__" });
	const team = teamTheme(user);
	return (
		// The theme script adds the "dark" class before React hydrates.
		<html
			lang="en"
			data-team-theme={team ? "" : undefined}
			style={team}
			suppressHydrationWarning
		>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme script */}
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
				<HeadContent />
			</head>
			<body>
				{/* Respect the phone's "reduce motion" setting. */}
				<MotionConfig reducedMotion="user">
					<AppHeader />
					{children}
					<ConnectionBanner />
				</MotionConfig>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<ServiceWorker />
				<Scripts />
			</body>
		</html>
	);
}
