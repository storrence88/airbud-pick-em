import clipUrl from "#/assets/lock-of-the-week.mp3?url";

/**
 * The Lock of the Week sound: a cell-door lock clip whose ratchet clicks play
 * at normal speed, then slow down like tape (dropping in pitch as they go)
 * right before the lock slams, which lands lower and rings out into reverb.
 * Only ever played from the user's own click, which lets browsers start audio.
 */

/** Where the slam starts in the clip, in seconds. */
const CLIP_SLAM = 1.195;
/** Level for the clip; slowing it softens its peaks, so it can stay at full level. */
const CLIP_GAIN = 1;
/** Normal speed until here, then the slowdown begins. */
const SLOW_FROM = 0.5;
/** How long the slowdown takes. */
const SLOW_FOR = 0.7;
/** Final speed, which also sets the pitch: 0.75 is about 5 semitones down. */
const SLOW_TO = 0.75;

/** Playback speed at `t` seconds: 1, easing smoothly down to SLOW_TO, then held. */
function rateAt(t: number) {
	if (t <= SLOW_FROM) return 1;
	const p = Math.min(1, (t - SLOW_FROM) / SLOW_FOR);
	const ease = p * p * (3 - 2 * p);
	return 1 + (SLOW_TO - 1) * ease;
}

/** How far into playback the slowed-down slam lands. */
function slamTime() {
	const dt = 0.001;
	let pos = 0;
	let t = 0;
	while (pos < CLIP_SLAM) {
		pos += rateAt(t) * dt;
		t += dt;
	}
	return t;
}

/** When the padlock lands, in seconds after the click. The animation uses it too. */
export const SLAM_AT = Math.round(slamTime() * 1000) / 1000;

let ctx: AudioContext | null = null;
let bytes: Promise<ArrayBuffer> | null = null;
const decoded = new WeakMap<BaseAudioContext, Promise<AudioBuffer>>();
const halls = new WeakMap<BaseAudioContext, AudioBuffer>();

function audio(): AudioContext | null {
	if (typeof window === "undefined") return null;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctor) return null;
	ctx ??= new Ctor();
	if (ctx.state === "suspended") void ctx.resume();
	return ctx;
}

/** Starts downloading the clip so the first lock plays on time. */
export function preloadLockSound() {
	if (typeof window === "undefined" || bytes) return;
	bytes = fetch(clipUrl).then((r) => {
		if (!r.ok) throw new Error(`lock sound: ${r.status}`);
		return r.arrayBuffer();
	});
	bytes.catch(() => {
		bytes = null;
	});
}

function clip(ac: BaseAudioContext) {
	let buf = decoded.get(ac);
	if (!buf) {
		preloadLockSound();
		// decodeAudioData detaches the bytes it's given, so hand it a copy.
		buf = (bytes ?? Promise.reject(new Error("lock sound unavailable"))).then(
			(b) => ac.decodeAudioData(b.slice(0)),
		);
		decoded.set(ac, buf);
		buf.catch(() => decoded.delete(ac));
	}
	return buf;
}

/** A big, dark hall: a low-passed noise tail that fades over a few seconds. */
function hall(ac: BaseAudioContext) {
	let buf = halls.get(ac);
	if (!buf) {
		const len = Math.floor(ac.sampleRate * 3);
		buf = ac.createBuffer(2, len, ac.sampleRate);
		for (let c = 0; c < 2; c++) {
			const data = buf.getChannelData(c);
			let lp = 0;
			for (let i = 0; i < len; i++) {
				lp += 0.35 * (Math.random() * 2 - 1 - lp);
				data[i] = lp * (1 - i / len) ** 2.5;
			}
		}
		halls.set(ac, buf);
	}
	return buf;
}

/**
 * Plays the clip into any audio context from `t0`: normal speed, the
 * slowdown into the slam, and the reverb swelling as the lock lands.
 * `reduced` skips ahead to just before the slam, at the slowed speed.
 */
export function scheduleLockSound(
	ac: BaseAudioContext,
	dest: AudioNode,
	buffer: AudioBuffer,
	t0: number,
	reduced = false,
) {
	const src = ac.createBufferSource();
	src.buffer = buffer;

	const level = ac.createGain();
	level.gain.value = CLIP_GAIN;
	const dry = ac.createGain();
	dry.gain.value = 0.85;
	const room = ac.createConvolver();
	room.buffer = hall(ac);
	const wet = ac.createGain();
	src.connect(level);
	level.connect(dry).connect(dest);
	level.connect(room).connect(wet).connect(dest);

	if (reduced) {
		src.playbackRate.value = SLOW_TO;
		wet.gain.value = 0.45;
		src.start(t0, CLIP_SLAM - 0.03);
		return;
	}

	// The slowdown, sampled finely enough to sound continuous.
	const steps = 64;
	const curve = new Float32Array(steps);
	for (let i = 0; i < steps; i++)
		curve[i] = rateAt(SLOW_FROM + (SLOW_FOR * i) / (steps - 1));
	src.playbackRate.setValueAtTime(1, t0);
	src.playbackRate.setValueCurveAtTime(curve, t0 + SLOW_FROM, SLOW_FOR);

	// A little room throughout, then a big hall as the lock lands.
	wet.gain.setValueAtTime(0.12, t0);
	wet.gain.setValueAtTime(0.12, t0 + SLAM_AT - 0.1);
	wet.gain.linearRampToValueAtTime(0.45, t0 + SLAM_AT + 0.05);
	src.start(t0);
}

/** Plays the lock sound now. With `reduced`, just the slam. */
export function playLockSound(reduced = false) {
	const ac = audio();
	if (!ac) return;
	const clicked = ac.currentTime;
	clip(ac)
		.then((buffer) => {
			// Too slow to arrive (first tap on a bad connection): stay quiet
			// rather than slam out of step with the animation.
			if (ac.currentTime - clicked > 0.25) return;
			const t0 = Math.max(clicked + 0.02, ac.currentTime + 0.005);
			scheduleLockSound(ac, ac.destination, buffer, t0, reduced);
		})
		.catch(() => {});
}

/** A small click for taking the lock back off. */
export function playUnlockSound() {
	const ac = audio();
	if (!ac) return;
	const t = ac.currentTime + 0.01;
	const osc = ac.createOscillator();
	osc.frequency.setValueAtTime(1800, t);
	osc.frequency.exponentialRampToValueAtTime(900, t + 0.05);
	const g = ac.createGain();
	g.gain.setValueAtTime(0.2, t);
	g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
	osc.connect(g).connect(ac.destination);
	osc.start(t);
	osc.stop(t + 0.08);
}
