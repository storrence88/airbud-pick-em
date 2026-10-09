import { useState } from "react";
import { teamByAbbr } from "#/lib/nfl/teams";
import { initials, type PublicProfile } from "#/lib/profile";
import { accentColors } from "#/lib/team-colors";
import { cn } from "#/lib/utils";

type AvatarProfile = Pick<
	PublicProfile,
	"display_name" | "avatar_url" | "avatar_kind" | "favorite_team"
>;

/**
 * A member's photo or monogram. A favorite team adds a ring in its color and
 * tints the monogram.
 */
export function Avatar({
	profile,
	size = 36,
	className,
}: {
	profile: AvatarProfile;
	size?: number;
	className?: string;
}) {
	const [broken, setBroken] = useState<string | null>(null);
	const team = teamByAbbr(profile.favorite_team);
	const ring = team ? accentColors(team).accent : null;
	const src =
		profile.avatar_kind === "photo" && profile.avatar_url !== broken
			? profile.avatar_url
			: null;
	return (
		<span
			className={cn(
				"relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full",
				ring && "ring-2 ring-offset-2 ring-offset-background",
				className,
			)}
			style={{
				width: size,
				height: size,
				// Tailwind's ring color can't be set from data, so set its variable.
				["--tw-ring-color" as string]: ring ?? undefined,
			}}
		>
			{src ? (
				<img
					src={src}
					alt=""
					className="size-full object-cover"
					onError={() => setBroken(src)}
				/>
			) : (
				<span
					aria-hidden
					className="grid size-full place-items-center font-display font-semibold text-white"
					style={{
						fontSize: size * 0.4,
						background: team
							? `linear-gradient(135deg, ${team.color}, color-mix(in oklab, ${team.color} 55%, black))`
							: "linear-gradient(135deg, oklch(0.45 0.02 260), oklch(0.3 0.02 260))",
					}}
				>
					{initials(profile.display_name)}
				</span>
			)}
		</span>
	);
}
