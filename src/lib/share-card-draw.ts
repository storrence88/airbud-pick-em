// Paints a share card onto a canvas. Runs in the browser, so the image is
// made on your phone from data already on the page; nothing new is fetched
// except your avatar photo.

import { teamByAbbr } from "./nfl/teams";
import { initials } from "./profile";
import { type CardPick, lockText, type ShareCard } from "./share-card";
import { accentColors } from "./team-colors";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface CardPlayer {
	display_name: string;
	title: string | null;
	favorite_team: string | null;
	/** A loaded, CORS-clean photo; null draws the monogram. */
	photo: CanvasImageSource | null;
}

const BG = "#0f1218";
const FG = "#f1f2f5";
const MUTED = "#9aa1ad";
const WIN = "#3fbf6e";
const LOSS = "#f05a4f";
/** The app's green, used when there's no favorite team. */
const PRIMARY = "#4fd27a";

const DISPLAY = "Oswald, Inter, sans-serif";
const SANS = "Inter, ui-sans-serif, system-ui, sans-serif";
const PAD = 80;

/** Makes sure the card's fonts are ready before drawing with them. */
export async function loadCardFonts() {
	if (typeof document === "undefined" || !document.fonts) return;
	await Promise.all(
		[
			`700 100px ${DISPLAY}`,
			`600 100px ${DISPLAY}`,
			`600 40px ${SANS}`,
			`500 40px ${SANS}`,
		].map((f) => document.fonts.load(f).catch(() => [])),
	);
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

/** Draws text shrunk to fit maxWidth, returning the width used. */
function fitText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maxWidth: number,
	weight: number,
	size: number,
	family: string,
) {
	let s = size;
	ctx.font = `${weight} ${s}px ${family}`;
	while (s > 12 && ctx.measureText(text).width > maxWidth) {
		s -= 2;
		ctx.font = `${weight} ${s}px ${family}`;
	}
	ctx.fillText(text, x, y);
	return ctx.measureText(text).width;
}

/** A rounded label; returns its width so pills can sit in a row. */
function pill(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	color: string,
	/** Text color for a filled pill; outlined when null. */
	fill: string | null,
) {
	ctx.font = `600 34px ${SANS}`;
	const w = ctx.measureText(text).width + 56;
	const h = 68;
	roundRect(ctx, x, y, w, h, h / 2);
	ctx.fillStyle = fill ? color : `${color}26`;
	ctx.fill();
	if (!fill) {
		ctx.strokeStyle = `${color}66`;
		ctx.lineWidth = 2;
		ctx.stroke();
	}
	ctx.fillStyle = fill ?? color;
	ctx.textBaseline = "middle";
	ctx.fillText(text, x + 28, y + h / 2 + 1);
	ctx.textBaseline = "alphabetic";
	return w;
}

function drawAvatar(
	ctx: CanvasRenderingContext2D,
	player: CardPlayer,
	x: number,
	y: number,
	size: number,
	ring: string | null,
) {
	const r = size / 2;
	if (ring) {
		ctx.beginPath();
		ctx.arc(x + r, y + r, r + 9, 0, Math.PI * 2);
		ctx.strokeStyle = ring;
		ctx.lineWidth = 5;
		ctx.stroke();
	}
	ctx.save();
	ctx.beginPath();
	ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
	ctx.clip();
	if (player.photo) {
		ctx.drawImage(player.photo, x, y, size, size);
	} else {
		const team = teamByAbbr(player.favorite_team);
		const g = ctx.createLinearGradient(x, y, x + size, y + size);
		g.addColorStop(0, team?.color ?? "#5a5f6b");
		g.addColorStop(1, team ? mixBlack(team.color, 0.45) : "#363a44");
		ctx.fillStyle = g;
		ctx.fillRect(x, y, size, size);
		ctx.fillStyle = "#ffffff";
		ctx.font = `600 ${size * 0.4}px ${DISPLAY}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(initials(player.display_name), x + r, y + r + 2);
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
	}
	ctx.restore();
}

function mixBlack(hex: string, t: number) {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
		Math.round(v * (1 - t)),
	);
	return `rgb(${c.join(",")})`;
}

/** One game's tile: the team you took, in its color, tinted by how it went. */
function drawPick(
	ctx: CanvasRenderingContext2D,
	p: CardPick,
	x: number,
	y: number,
	w: number,
	h: number,
	showConfidence: boolean,
) {
	roundRect(ctx, x, y, w, h, 18);
	if (p.outcome === "missed") {
		ctx.setLineDash([10, 8]);
		ctx.strokeStyle = "#ffffff26";
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.fillStyle = "#ffffff40";
		ctx.font = `500 26px ${SANS}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("Missed", x + w / 2, y + h / 2 + 1);
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		return;
	}
	const tint =
		p.outcome === "win" ? WIN : p.outcome === "loss" ? LOSS : "#ffffff";
	ctx.fillStyle = `${tint}${p.outcome === "push" ? "14" : "1f"}`;
	ctx.fill();
	ctx.strokeStyle = `${tint}${p.isLock ? "b3" : "33"}`;
	ctx.lineWidth = p.isLock ? 3 : 2;
	ctx.stroke();

	// Team color stripe down the left edge.
	const team = teamByAbbr(p.team);
	ctx.save();
	roundRect(ctx, x, y, w, h, 18);
	ctx.clip();
	ctx.fillStyle = team?.color ?? MUTED;
	ctx.globalAlpha = p.outcome === "loss" ? 0.45 : 1;
	ctx.fillRect(x, y, 10, h);
	ctx.restore();

	ctx.globalAlpha = p.outcome === "loss" ? 0.6 : 1;
	ctx.fillStyle =
		p.outcome === "win" ? FG : p.outcome === "loss" ? LOSS : MUTED;
	ctx.font = `600 40px ${DISPLAY}`;
	ctx.textBaseline = "middle";
	ctx.fillText(p.team, x + 30, y + h / 2 + 2);
	if (p.outcome === "loss") {
		const tw = ctx.measureText(p.team).width;
		ctx.fillRect(x + 28, y + h / 2 + 1, tw + 4, 3);
	}
	ctx.textAlign = "right";
	if (p.isLock) {
		ctx.fillStyle = "#f5c451";
		ctx.font = `700 30px ${SANS}`;
		ctx.fillText("★", x + w - 22, y + h / 2 + 1);
	} else if (showConfidence && p.confidence != null) {
		ctx.fillStyle = MUTED;
		ctx.font = `600 30px ${DISPLAY}`;
		ctx.fillText(String(p.confidence), x + w - 22, y + h / 2 + 2);
	}
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.globalAlpha = 1;
}

export function drawShareCard(
	ctx: CanvasRenderingContext2D,
	card: ShareCard,
	player: CardPlayer,
) {
	const W = CARD_WIDTH;
	const H = CARD_HEIGHT;
	const fav = teamByAbbr(player.favorite_team);
	const { accent, foreground } = fav
		? accentColors(fav)
		: { accent: PRIMARY, foreground: BG };

	// Background: dark, with a soft glow in your team's color up top.
	ctx.fillStyle = BG;
	ctx.fillRect(0, 0, W, H);
	const glow = ctx.createRadialGradient(W / 2, -160, 40, W / 2, -160, 1000);
	glow.addColorStop(0, `${accent}55`);
	glow.addColorStop(1, `${accent}00`);
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, H);

	// Header: wordmark and the week.
	let y = PAD + 44;
	ctx.font = `700 44px ${DISPLAY}`;
	ctx.fillStyle = FG;
	ctx.fillText("PICK", PAD, y);
	const pw = ctx.measureText("PICK").width;
	ctx.fillStyle = PRIMARY;
	ctx.fillText("'EM", PAD + pw, y);
	ctx.textAlign = "right";
	ctx.fillStyle = FG;
	ctx.font = `600 44px ${DISPLAY}`;
	ctx.fillText(`WEEK ${card.week}`, W - PAD, y);
	ctx.textAlign = "left";
	y += 50;
	ctx.fillStyle = MUTED;
	fitText(ctx, card.league, PAD, y, W - PAD * 2, 500, 32, SANS);

	// Player.
	y += 70;
	const avatar = 132;
	drawAvatar(ctx, player, PAD + 9, y, avatar, fav ? accent : null);
	const nx = PAD + avatar + 50;
	ctx.fillStyle = FG;
	const hasTitle = Boolean(player.title);
	fitText(
		ctx,
		player.display_name,
		nx,
		y + (hasTitle ? 62 : 86),
		W - PAD - nx,
		600,
		58,
		SANS,
	);
	if (player.title) {
		ctx.fillStyle = accent;
		fitText(ctx, player.title, nx, y + 116, W - PAD - nx, 500, 34, SANS);
	}

	// The record, big.
	y += avatar + 290;
	ctx.fillStyle = FG;
	const rw = fitText(
		ctx,
		card.record,
		PAD - 6,
		y,
		W - PAD * 2,
		700,
		270,
		DISPLAY,
	);
	if (card.points != null) {
		ctx.fillStyle = MUTED;
		ctx.font = `600 60px ${DISPLAY}`;
		const pts = `${card.points} PTS`;
		if (PAD + rw + 40 + ctx.measureText(pts).width <= W - PAD)
			ctx.fillText(pts, PAD + rw + 40, y - 8);
	}

	// Pills: lock, place, missed.
	y += 50;
	let x = PAD;
	const gap = 18;
	if (card.lock) {
		const color =
			card.lock.hit === true ? WIN : card.lock.hit === false ? LOSS : MUTED;
		x +=
			pill(
				ctx,
				`★ ${lockText(card.lock)} · ${card.lock.team}`,
				x,
				y,
				color,
				null,
			) + gap;
	}
	if (card.place) {
		const label = card.winner ? `♛ ${card.place}` : card.place;
		x +=
			pill(
				ctx,
				label,
				x,
				y,
				card.winner ? accent : FG,
				card.winner ? foreground : null,
			) + gap;
	}
	if (card.missed > 0 && x + 200 < W - PAD)
		pill(ctx, `${card.missed} missed`, x, y, MUTED, null);

	// Every pick, in schedule order.
	const top = y + 68 + 64;
	const bottom = H - PAD - 60;
	const cols = 4;
	const g = 16;
	const n = card.picks.length;
	const rows = Math.max(1, Math.ceil(n / cols));
	const tw = (W - PAD * 2 - g * (cols - 1)) / cols;
	const th = Math.min(84, (bottom - top - g * (rows - 1)) / rows);
	const showConfidence = card.points != null;
	card.picks.forEach((p, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		drawPick(
			ctx,
			p,
			PAD + col * (tw + g),
			top + row * (th + g),
			tw,
			th,
			showConfidence,
		);
	});

	// Footer: a key for the marks on the tiles, when there are any.
	const key = [
		card.lock && "★ Lock of the Week",
		showConfidence && "numbers are confidence",
	].filter(Boolean);
	if (key.length) {
		ctx.fillStyle = "#ffffff30";
		ctx.fillRect(PAD, H - PAD - 20, W - PAD * 2, 1);
		ctx.fillStyle = MUTED;
		ctx.font = `500 26px ${SANS}`;
		ctx.fillText(key.join(" · "), PAD, H - PAD + 26);
	}
}

/** Loads an avatar photo for the canvas; null if it can't be used. */
export function loadPhoto(
	url: string | null,
): Promise<HTMLImageElement | null> {
	if (!url) return Promise.resolve(null);
	return new Promise((resolve) => {
		const img = new Image();
		// Without CORS the canvas would be tainted and couldn't be exported.
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img.naturalWidth ? img : null);
		img.onerror = () => resolve(null);
		img.src = url;
		setTimeout(() => resolve(null), 4000);
	});
}
