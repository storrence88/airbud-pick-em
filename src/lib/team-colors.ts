// Picks readable, distinct bar colors for two teams on the dark game card.
// Works from each team's primary and alternate colors, so nothing needs to
// know the schedule ahead of time.

/** Roughly the card background (oklch(0.2 0.018 260)). */
const CARD_BG = "#181b22";
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

const readable = (c: string) => contrast(c, CARD_BG) >= MIN_CONTRAST;

function mix(hex: string, t: number) {
	const rgb = toRgb(hex);
	return rgb ? toHex(rgb.map((v) => v + (255 - v) * t) as Rgb) : "#9ca3af";
}

/** Mixes toward white until the color stands out on the card. */
function lighten(hex: string) {
	for (let t = 0.1; t < 1; t += 0.1) {
		const mixed = mix(hex, t);
		if (readable(mixed)) return mixed;
	}
	return "#ffffff";
}

/** The team's colors that show up on the card, primary first. */
function options(primary: string, alt: string) {
	const usable = [primary, alt].filter((c) => toRgb(c) && readable(c));
	return usable.length ? usable : [lighten(primary)];
}

export interface TeamColors {
	color: string;
	altColor: string;
}

/**
 * Chooses one bar color per team: primary when it's readable, otherwise the
 * alternate, otherwise a lightened primary. If both picks look alike, tries
 * the home team's other color, then the away team's.
 */
export function splitColors(away: TeamColors, home: TeamColors) {
	const a = options(away.color, away.altColor);
	const h = options(home.color, home.altColor);
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
	return { away: a[0], home: mix(h[0], 0.5) };
}
