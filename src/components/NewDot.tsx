import { useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import {
	type DotId,
	dismissDot,
	dotVisible,
	isVeteran,
	startDots,
	useOnboarding,
} from "#/lib/onboarding";
import { cn } from "#/lib/utils";

/**
 * A "new" dot for one control, for players who were around before it shipped.
 * It goes away once tapped, or on its own after a couple of weeks.
 */
export function useNewDot(id: DotId, enabled = true) {
	const { user } = useRouteContext({ from: "__root__" });
	const state = useOnboarding();
	const show = enabled && isVeteran(user) && dotVisible(state, id);
	useEffect(() => {
		if (show) startDots();
	}, [show]);
	return {
		show,
		dismiss: () => {
			if (show) dismissDot(id);
		},
	};
}

/** The pulsing dot itself; place it inside a relatively positioned control. */
export function NewDot({
	show,
	className,
}: {
	show: boolean;
	className?: string;
}) {
	if (!show) return null;
	return (
		<span
			className={cn(
				"pointer-events-none absolute -top-0.5 -right-0.5 flex size-2.5",
				className,
			)}
		>
			<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
			<span className="relative inline-flex size-2.5 rounded-full bg-primary ring-2 ring-background" />
			<span className="sr-only">New</span>
		</span>
	);
}
