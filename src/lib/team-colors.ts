// Picks readable, distinct bar colors for two teams on the game card, in
// either theme. Works from each team's primary and alternate colors, so
// nothing needs to know the schedule ahead of time.

export type Theme = "light" | "dark";

/** Roughly the card background: oklch(0.2 0.018 260) dark, white light. */
const CARD_BG: Record<Theme, string> = { dark: "#181b22", light: "#ffffff" };
/** Below this contrast with the card, a bar fades into the background. */
const MIN_CONTRAST = 1.5;
/** Below this distance (CIE76 ΔE), two bars read as the same color. */
const MIN_DISTANCE = 25;

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb | null {
	const h = hex.replace("#", "").trim();
	const full =
		h.length === 3
			? h
					.split("")
					.map((c) => c + c)
					.join("")
			: h;
	if (!/^[0-9a-f]{6}$/i.test(full)) return null;
	return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb) {
	return `#${[r, g, b]
		.map((v) =>
			Math.round(Math.min(255, Math.max(0, v)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function linear(v: number) {
	const c = v / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb) {
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrast(a: string, b: string) {
	const ra = toRgb(a);
	const rb = toRgb(b);
	if (!ra || !rb) return 1;
	const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

function toLab(rgb: Rgb): Rgb {
	const [r, g, b] = rgb.map(linear);
	const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
	const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
	const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 color difference; about 2 is barely noticeable, 25+ is clearly different. */
export function colorDistance(a: string, b: string) {
	const ra = toRgb(a);
	const rb = toRgb(b);
	if (!ra || !rb) return 0;
	const [la, lb] = [toLab(ra), toLab(rb)];
	return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

const readable = (c: string, theme: Theme) =>
	contrast(c, CARD_BG[theme]) >= MIN_CONTRAST;

/** Mixes toward white, or toward black when `to` is "#000000". */
function mix(hex: string, t: number, to = "#ffffff") {
	const rgb = toRgb(hex);
	const target = toRgb(to) ?? [255, 255, 255];
	return rgb
		? toHex(rgb.map((v, i) => v + (target[i] - v) * t) as Rgb)
		: "#9ca3af";
}

/** Away from the background: white on dark, black on light. */
const away = (theme: Theme) => (theme === "dark" ? "#ffffff" : "#000000");

/** Mixes away from the background until the color stands out on the card. */
function strengthen(hex: string, theme: Theme) {
	for (let t = 0.1; t < 1; t += 0.1) {
		const mixed = mix(hex, t, away(theme));
		if (readable(mixed, theme)) return mixed;
	}
	return away(theme);
}

/** The team's colors that show up on the card, primary first. */
function options(primary: string, alt: string, theme: Theme) {
	const usable = [primary, alt].filter((c) => toRgb(c) && readable(c, theme));
	return usable.length ? usable : [strengthen(primary, theme)];
}

export interface TeamColors {
	color: string;
	altColor: string;
}

/**
 * Chooses one bar color per team: primary when it's readable, otherwise the
 * alternate, otherwise a lightened (or, in light mode, darkened) primary. If
 * both picks look alike, tries the home team's other color, then the away
 * team's.
 */
export function splitColors(
	awayTeam: TeamColors,
	home: TeamColors,
	theme: Theme = "dark",
) {
	const a = options(awayTeam.color, awayTeam.altColor, theme);
	const h = options(home.color, home.altColor, theme);
	const distinct = (x: string, y: string) =>
		colorDistance(x, y) >= MIN_DISTANCE;
	for (const [ac, hc] of [
		[a[0], h[0]],
		[a[0], h[1]],
		[a[1], h[0]],
		[a[1], h[1]],
	]) {
		if (ac && hc && distinct(ac, hc)) return { away: ac, home: hc };
	}
	// Every pairing clashes: keep away's color and wash out home's so the
	// split still shows.
	return { away: a[0], home: mix(h[0], 0.5, away(theme)) };
}

/** Roughly the page background: oklch(0.15 0.015 260) dark, 0.985 light. */
const PAGE_BG: Record<Theme, string> = { dark: "#0f1218", light: "#f9fafb" };
/** Accent text and buttons need more contrast than a thin bar does. */
const MIN_ACCENT_CONTRAST = 3;

/**
 * A team's color as the app accent: primary or alternate, whichever reads
 * on the page, else primary pushed away from the background until it does.
 * Comes with a text color for buttons filled with it.
 */
export function accentColors(team: TeamColors, theme: Theme = "dark") {
	const ok = (c: string) =>
		toRgb(c) && contrast(c, PAGE_BG[theme]) >= MIN_ACCENT_CONTRAST;
	let accent = [team.color, team.altColor].find(ok);
	for (let t = 0.1; !accent && t < 1; t += 0.1) {
		const mixed = mix(team.color, t, away(theme));
		if (ok(mixed)) accent = mixed;
	}
	accent ??= away(theme);
	const foreground =
		contrast(accent, PAGE_BG.dark) >= contrast(accent, "#ffffff")
			? PAGE_BG.dark
			: "#ffffff";
	return { accent, foreground };
}

/**
 * A team's accent in both themes as CSS variables. Pair with the
 * `team-accent` class, which resolves them to `--tc` / `--tc-fg` for
 * whichever theme is showing, so server-rendered markup never has to know.
 */
export function accentVars(team: TeamColors) {
	const light = accentColors(team, "light");
	const dark = accentColors(team, "dark");
	return {
		"--tc-light": light.accent,
		"--tc-dark": dark.accent,
		"--tc-fg-light": light.foreground,
		"--tc-fg-dark": dark.foreground,
	} as React.CSSProperties;
}
