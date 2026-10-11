// Profile customization shared by the server and the UI.

export const WIN_EFFECTS = {
	confetti: "Confetti",
	fireworks: "Fireworks",
	pulse: "Team pulse",
	none: "Nothing",
} as const;

export const LOSS_EFFECTS = {
	deflate: "Deflate",
	shake: "Shake it off",
	rain: "Rain cloud",
	none: "Nothing",
} as const;

export type WinEffect = keyof typeof WIN_EFFECTS;
export type LossEffect = keyof typeof LOSS_EFFECTS;
export type AvatarKind = "photo" | "monogram";
export type ReminderStyle = "gentle" | "roast";

/** What other members see about you. */
export interface PublicProfile {
	display_name: string;
	avatar_url: string | null;
	avatar_kind: AvatarKind;
	favorite_team: string | null;
	title: string | null;
}

export const PUBLIC_PROFILE_COLUMNS =
	"display_name, avatar_url, avatar_kind, favorite_team, title";

export interface MyProfile extends PublicProfile {
	team_theme: boolean;
	win_effect: WinEffect;
	loss_effect: LossEffect;
	bot_mentions: boolean;
	reminder_style: ReminderStyle;
	reminder_channel: "email" | "discord" | "off";
}

export const MY_PROFILE_COLUMNS = `${PUBLIC_PROFILE_COLUMNS}, team_theme, win_effect, loss_effect, bot_mentions, reminder_style, reminder_channel`;

export const MAX_NAME = 40;
export const MAX_TITLE = 40;
export const MAX_TRASH_TALK = 140;

/** Up to two letters from a display name, for monogram avatars. */
export function initials(name: string) {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return "?";
	const letters =
		words.length === 1
			? [...words[0]].slice(0, 2)
			: [[...words[0]][0], [...words[words.length - 1]][0]];
	return letters.join("").toUpperCase();
}

/** Avatars may only come from Discord's CDN or your own folder in our bucket. */
export function isAllowedAvatarUrl(
	url: string,
	supabaseUrl: string | undefined,
	userId: string,
) {
	if (url.startsWith("https://cdn.discordapp.com/")) return true;
	return Boolean(
		supabaseUrl &&
			url.startsWith(
				`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/avatars/${userId}/`,
			),
	);
}
