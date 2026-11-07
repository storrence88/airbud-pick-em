// Paints a share card onto a canvas. Runs in the browser, so the image is
// made on your phone from data already on the page; nothing new is fetched
// except your avatar photo.

import { teamByAbbr } from "./nfl/teams";
import { initials } from "./profile";
import { movedText, type SeasonShare } from "./season-share";
import {
	type CardPick,
	type GroupShare,
	lockText,
	type ShareCard,
	type ShareStatus,
} from "./share-card";
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
const LIVE = "#5aa9f5";
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
	if (p.outcome === "missed" || p.outcome === "hidden") {
		const hidden = p.outcome === "hidden";
		if (hidden) {
			ctx.fillStyle = "#ffffff0d";
			ctx.fill();
		} else {
			ctx.setLineDash([10, 8]);
			ctx.strokeStyle = "#ffffff26";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.setLineDash([]);
		}
		ctx.fillStyle = "#ffffff40";
		ctx.font = `500 26px ${SANS}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(hidden ? "Hidden" : "Missed", x + w / 2, y + h / 2 + 1);
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		return;
	}
	const tint =
		p.outcome === "win"
			? WIN
			: p.outcome === "loss"
				? LOSS
				: p.outcome === "live"
					? LIVE
					: "#ffffff";
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
		p.outcome === "win" || p.outcome === "live"
			? FG
			: p.outcome === "loss"
				? LOSS
				: MUTED;
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

/** Background, wordmark, the week, the league and where the week stands. Returns the baseline of the league line. */
function drawHeader(
	ctx: CanvasRenderingContext2D,
	W: number,
	H: number,
	accent: string,
	card: { week: number; league: string; status: ShareStatus },
	/** The big label on the right; defaults to "WEEK N". */
	heading = `WEEK ${card.week}`,
) {
	// Background: dark, with a soft glow in the accent color up top.
	ctx.fillStyle = BG;
	ctx.fillRect(0, 0, W, H);
	const glow = ctx.createRadialGradient(W / 2, -160, 40, W / 2, -160, 1000);
	glow.addColorStop(0, `${accent}55`);
	glow.addColorStop(1, `${accent}00`);
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, W, H);

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
	ctx.fillText(heading, W - PAD, y);
	y += 50;
	// Where the week stands, under the week: a dot while games are on.
	ctx.font = `600 30px ${DISPLAY}`;
	const label = card.status.label.toUpperCase();
	const lw = ctx.measureText(label).width;
	ctx.fillStyle = card.status.kind === "live" ? LIVE : MUTED;
	ctx.fillText(label, W - PAD, y);
	if (card.status.kind === "live") {
		ctx.beginPath();
		ctx.arc(W - PAD - lw - 20, y - 11, 8, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.textAlign = "left";
	ctx.fillStyle = MUTED;
	fitText(ctx, card.league, PAD, y, W - PAD * 2 - lw - 60, 500, 32, SANS);
	return y;
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

	let y = drawHeader(ctx, W, H, accent, card);

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
		card.hidden > 0 && "hidden until kickoff",
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

export const GROUP_ROW = 116;

/** The group card grows with the league: a header, one row per player, a footer. */
export function groupCardHeight(rows: number) {
	return Math.max(1080, 300 + rows * GROUP_ROW + 170);
}

/**
 * The whole league's week on one image: place, avatar, name, points, and a
 * thin bar toward the most each player can still reach.
 */
export function drawGroupCard(
	ctx: CanvasRenderingContext2D,
	group: GroupShare,
	players: Map<string, CardPlayer>,
) {
	const W = CARD_WIDTH;
	const H = groupCardHeight(group.rows.length);
	const top = drawHeader(ctx, W, H, PRIMARY, group) + 70;
	const confidence = group.mode === "confidence";
	const scale = Math.max(1, ...group.rows.map((r) => r.max ?? r.points));

	group.rows.forEach((r, i) => {
		const y = top + i * GROUP_ROW;
		const mid = y + GROUP_ROW / 2;
		if (i > 0) {
			ctx.fillStyle = "#ffffff14";
			ctx.fillRect(PAD, y, W - PAD * 2, 1);
		}
		const player = players.get(r.userId);
		const fav = teamByAbbr(player?.favorite_team);
		const ring = fav ? accentColors(fav).accent : null;

		// Place, or a crown for the winner.
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = r.winner ? "#f5c451" : MUTED;
		ctx.font = `600 ${r.winner ? 44 : 40}px ${DISPLAY}`;
		ctx.fillText(r.winner ? "♛" : String(r.place), PAD + 22, mid + 2);
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";

		const size = 76;
		const ax = PAD + 70;
		if (player) drawAvatar(ctx, player, ax, mid - size / 2, size, ring);

		// Score on the right: points (or record), and the max under it.
		const right = W - PAD;
		const score = confidence ? String(r.points) : r.record;
		ctx.textAlign = "right";
		ctx.fillStyle = FG;
		ctx.font = `700 54px ${DISPLAY}`;
		ctx.fillText(score, right, r.max != null ? mid + 6 : mid + 20);
		const sw = ctx.measureText(score).width;
		if (r.max != null) {
			ctx.fillStyle = MUTED;
			ctx.font = `500 24px ${SANS}`;
			ctx.fillText(`max ${r.max}`, right, mid + 38);
		}
		ctx.textAlign = "left";

		// Name and the bar under it.
		const nx = ax + size + 34;
		const nw = right - sw - 48 - nx;
		ctx.fillStyle = FG;
		fitText(ctx, r.name, nx, mid - 2, nw, 600, 38, SANS);
		const by = mid + 20;
		roundRect(ctx, nx, by, nw, 10, 5);
		ctx.fillStyle = "#ffffff12";
		ctx.fill();
		if (r.max != null && r.max > r.points) {
			roundRect(ctx, nx, by, (nw * r.max) / scale, 10, 5);
			ctx.fillStyle = `${ring ?? PRIMARY}40`;
			ctx.fill();
		}
		if (r.points > 0) {
			roundRect(ctx, nx, by, Math.max(10, (nw * r.points) / scale), 10, 5);
			ctx.fillStyle = ring ?? PRIMARY;
			ctx.fill();
		}
	});

	// Footer: what's left to play, or who sat the week out.
	const notes: string[] = [];
	if (group.left.length) {
		const live = group.left.filter((g) => g.live).length;
		notes.push(
			group.left.length <= 3
				? `Still to play: ${group.left.map((g) => `${g.label}${g.live ? " (live)" : ""}`).join(", ")}`
				: `${group.left.length} games left${live ? `, ${live} in progress` : ""}`,
		);
	}
	if (group.noPicks.length) notes.push(`No picks: ${group.noPicks.join(", ")}`);
	if (group.rows.some((r) => r.max != null))
		notes.push("max = the most each player can still reach");
	if (!notes.length) return;
	ctx.fillStyle = "#ffffff30";
	ctx.fillRect(PAD, H - PAD - 20 - (notes.length - 1) * 40, W - PAD * 2, 1);
	ctx.fillStyle = MUTED;
	notes.forEach((n, i) => {
		fitText(
			ctx,
			n,
			PAD,
			H - PAD + 26 - (notes.length - 1 - i) * 40,
			W - PAD * 2,
			500,
			26,
			SANS,
		);
	});
}

const SEASON_ROW = 112;

/** Small leagues get roomier rows so the square card doesn't look empty. */
function seasonRow(rows: number) {
	return Math.min(140, Math.max(SEASON_ROW, Math.floor(670 / rows)));
}

/** The season card grows with the league like the group card. */
export function seasonCardHeight(rows: number) {
	return Math.max(1080, 300 + rows * seasonRow(rows) + 110);
}

const GOLD = "#f5c451";

/**
 * The season standings on one image: place, avatar, name, last week's points
 * and who moved, with the season total on the right.
 */
export function drawSeasonCard(
	ctx: CanvasRenderingContext2D,
	share: SeasonShare,
	players: Map<string, CardPlayer>,
) {
	const W = CARD_WIDTH;
	const H = seasonCardHeight(share.rows.length);
	const top = drawHeader(ctx, W, H, GOLD, share, "SEASON") + 70;
	const rowH = seasonRow(share.rows.length);

	share.rows.forEach((r, i) => {
		const y = top + i * rowH;
		const mid = y + rowH / 2;
		const leader = r.behind === 0;
		if (i > 0) {
			ctx.fillStyle = "#ffffff14";
			ctx.fillRect(PAD, y, W - PAD * 2, 1);
		}
		const player = players.get(r.userId);
		const fav = teamByAbbr(player?.favorite_team);
		const ring = fav ? accentColors(fav).accent : null;

		// Place, gold for whoever's on top.
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = leader ? GOLD : MUTED;
		ctx.font = `600 40px ${DISPLAY}`;
		ctx.fillText(String(r.place), PAD + 22, mid + 2);
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";

		const size = 72;
		const ax = PAD + 70;
		if (player) drawAvatar(ctx, player, ax, mid - size / 2, size, ring);

		// Season total on the right, and how far back under it.
		const right = W - PAD;
		ctx.textAlign = "right";
		ctx.fillStyle = FG;
		ctx.font = `700 56px ${DISPLAY}`;
		const total = String(r.total);
		ctx.fillText(total, right, r.behind ? mid + 8 : mid + 20);
		const sw = ctx.measureText(total).width;
		if (r.behind) {
			ctx.fillStyle = MUTED;
			ctx.font = `500 24px ${SANS}`;
			ctx.fillText(`−${r.behind}`, right, mid + 40);
		}
		ctx.textAlign = "left";

		// Name, then last week's points and the move.
		const nx = ax + size + 34;
		const nw = right - sw - 48 - nx;
		ctx.fillStyle = FG;
		fitText(ctx, r.name, nx, mid - 4, nw, 600, 38, SANS);
		ctx.font = `500 26px ${SANS}`;
		ctx.fillStyle = MUTED;
		const wk = `Wk ${share.week}: +${r.week}`;
		ctx.fillText(wk, nx, mid + 34);
		const ww = ctx.measureText(wk).width;
		const move = movedText(r.moved);
		if (move) {
			ctx.font = `600 26px ${SANS}`;
			ctx.fillStyle = r.moved > 0 ? WIN : LOSS;
			ctx.fillText(move, nx + ww + 22, mid + 34);
		}
	});

	// Footer: what the numbers mean.
	ctx.fillStyle = "#ffffff30";
	ctx.fillRect(PAD, H - PAD - 20, W - PAD * 2, 1);
	ctx.fillStyle = MUTED;
	fitText(
		ctx,
		`Season points through final games · ▲▼ places moved in Week ${share.week}`,
		PAD,
		H - PAD + 26,
		W - PAD * 2,
		500,
		26,
		SANS,
	);
}
