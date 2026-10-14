/**
 * Heavy chains and a padlock slam for the Lock of the Week, synthesized with
 * Web Audio so there's no file to fetch. Only ever played from the user's own
 * click, which is what lets browsers start audio.
 */

/** When the padlock lands, in seconds after the click. Matches the animation. */
export const SLAM_AT = 1.5;
/** When each pair of chains crashes into place during the buildup. */
export const CHAIN_HITS = [0.5, 0.85];

let ctx: AudioContext | null = null;
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
const rooms = new WeakMap<BaseAudioContext, AudioBuffer>();

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

function noiseBuffer(ac: BaseAudioContext) {
	let buf = noises.get(ac);
	if (!buf) {
		buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		noises.set(ac, buf);
	}
	return buf;
}

/** A huge, dark hall so the slam booms out instead of stopping dead. */
function roomBuffer(ac: BaseAudioContext) {
	let buf = rooms.get(ac);
	if (!buf) {
		const len = Math.floor(ac.sampleRate * 3.2);
		buf = ac.createBuffer(2, len, ac.sampleRate);
		for (let c = 0; c < 2; c++) {
			const data = buf.getChannelData(c);
			let lp = 0;
			for (let i = 0; i < len; i++) {
				// Low-passed noise tail: a cavernous rumble, not a hiss.
				lp += 0.25 * (Math.random() * 2 - 1 - lp);
				data[i] = lp * 2 * (1 - i / len) ** 3;
			}
		}
		rooms.set(ac, buf);
	}
	return buf;
}

function trim(ac: BaseAudioContext, gain: number) {
	const g = ac.createGain();
	g.gain.value = gain;
	return g;
}

/** Soft clipping for grit, so the clang growls instead of chiming. */
function grit(ac: BaseAudioContext, amount: number) {
	const shaper = ac.createWaveShaper();
	const curve = new Float32Array(2048);
	for (let i = 0; i < curve.length; i++) {
		const x = (i / (curve.length - 1)) * 2 - 1;
		curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
	}
	shaper.curve = curve;
	shaper.oversample = "4x";
	return shaper;
}

function noise(
	ac: BaseAudioContext,
	out: AudioNode,
	t: number,
	dur: number,
	gain: number,
	filter: BiquadFilterType,
	freq: number,
	q = 1,
) {
	const src = ac.createBufferSource();
	src.buffer = noiseBuffer(ac);
	const f = ac.createBiquadFilter();
	f.type = filter;
	f.frequency.value = freq;
	f.Q.value = q;
	const g = ac.createGain();
	g.gain.setValueAtTime(gain, t);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	src.connect(f).connect(g).connect(out);
	src.start(t, Math.random() * 0.5);
	src.stop(t + dur + 0.02);
}

/** Struck metal: inharmonic partials, slightly detuned so they beat. */
function metal(
	ac: BaseAudioContext,
	out: AudioNode,
	t: number,
	freq: number,
	gain: number,
	decay: number,
	ratios = [1, 1.47, 2.09, 2.56, 3.39, 4.17, 5.43],
) {
	ratios.forEach((ratio, i) => {
		for (const detune of [-1, 1]) {
			const osc = ac.createOscillator();
			osc.type = i === 0 ? "triangle" : "sine";
			osc.frequency.value = freq * ratio * (1 + detune * 0.005);
			const g = ac.createGain();
			const end = t + decay / (1 + i * 0.3);
			g.gain.setValueAtTime(0, t);
			g.gain.linearRampToValueAtTime(gain / (i + 1.2), t + 0.002);
			g.gain.exponentialRampToValueAtTime(0.0001, end);
			osc.connect(g).connect(out);
			osc.start(t);
			osc.stop(end + 0.02);
		}
	});
}

/** Pitch-dropping sine for low-end weight. */
function boom(
	ac: BaseAudioContext,
	out: AudioNode,
	t: number,
	from: number,
	to: number,
	gain: number,
	dur: number,
	type: OscillatorType = "sine",
) {
	const osc = ac.createOscillator();
	osc.type = type;
	osc.frequency.setValueAtTime(from, t);
	osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.45);
	const g = ac.createGain();
	g.gain.setValueAtTime(gain, t);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	osc.connect(g).connect(out);
	osc.start(t);
	osc.stop(t + dur + 0.05);
}

/**
 * A bomb going off: a broadband blast that darkens as it rolls away, a long
 * rumbling tail, a pressure-wave thump and crackling debris.
 */
function explosion(
	ac: BaseAudioContext,
	master: AudioNode,
	bus: AudioNode,
	t: number,
) {
	const blast = ac.createBufferSource();
	blast.buffer = noiseBuffer(ac);
	const lp = ac.createBiquadFilter();
	lp.type = "lowpass";
	lp.Q.value = 0.5;
	lp.frequency.setValueAtTime(9000, t);
	lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
	lp.frequency.exponentialRampToValueAtTime(120, t + 1.9);
	const g = ac.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.linearRampToValueAtTime(2.8, t + 0.006);
	g.gain.exponentialRampToValueAtTime(0.9, t + 0.3);
	g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
	blast.connect(lp).connect(grit(ac, 4)).connect(g).connect(bus);
	blast.start(t);
	blast.stop(t + 2.5);
	// Long, low rumble rolling away.
	const rumble = ac.createBufferSource();
	rumble.buffer = noiseBuffer(ac);
	const rl = ac.createBiquadFilter();
	rl.type = "lowpass";
	rl.frequency.value = 140;
	rl.Q.value = 1.5;
	const rg = ac.createGain();
	rg.gain.setValueAtTime(0.0001, t);
	rg.gain.linearRampToValueAtTime(3, t + 0.05);
	rg.gain.exponentialRampToValueAtTime(0.0001, t + 3);
	rumble.connect(rl).connect(rg).connect(master);
	rumble.start(t, 0.3);
	rumble.stop(t + 3.1);
	// Pressure wave: one huge, fast thump.
	boom(ac, master, t, 180, 20, 2.2, 0.7);
	// Debris crackling as it falls.
	for (let i = 0; i < 40; i++) {
		const dt = 0.05 + Math.random() ** 1.6 * 1.6;
		noise(
			ac,
			bus,
			t + dt,
			0.01 + Math.random() * 0.03,
			(0.5 + Math.random() * 0.6) * (1 - dt / 1.8),
			"bandpass",
			1200 + Math.random() * 4000,
			2,
		);
	}
}

/** One thick steel link slamming into the next: a thunk with a dull ring. */
function link(ac: BaseAudioContext, out: AudioNode, t: number, gain: number) {
	metal(
		ac,
		out,
		t,
		230 + Math.random() * 200,
		gain,
		0.4,
		[1, 1.53, 2.31, 3.1, 4.4],
	);
	boom(ac, out, t, 140, 60, gain * 1.4, 0.12);
	noise(
		ac,
		out,
		t,
		0.08,
		gain * 1.8,
		"bandpass",
		900 + Math.random() * 600,
		1.1,
	);
	noise(ac, out, t, 0.12, gain * 1.6, "lowpass", 350);
}

/**
 * The windup: two pairs of chains crash into place, then the links rattle
 * faster and faster over a rising drone and a rushing swell, with a beat of
 * silence right before the slam.
 */
function buildup(
	ac: BaseAudioContext,
	master: AudioNode,
	bus: AudioNode,
	t0: number,
	slamAt: number,
) {
	const slam = t0 + slamAt;
	const hush = slam - 0.07;

	// Chains dragging: a chopped scrape that tightens as the tension builds.
	const drag = ac.createBufferSource();
	drag.buffer = noiseBuffer(ac);
	drag.loop = true;
	const bp = ac.createBiquadFilter();
	bp.type = "bandpass";
	bp.frequency.setValueAtTime(400, t0);
	bp.frequency.exponentialRampToValueAtTime(1400, hush);
	bp.Q.value = 0.8;
	const dg = ac.createGain();
	dg.gain.setValueAtTime(0.0001, t0);
	dg.gain.exponentialRampToValueAtTime(0.5, t0 + 0.4);
	dg.gain.setValueAtTime(0.5, t0 + 0.9);
	dg.gain.exponentialRampToValueAtTime(0.9, hush - 0.02);
	dg.gain.linearRampToValueAtTime(0, hush);
	const chop = ac.createGain();
	chop.gain.value = 0.5;
	const lfo = ac.createOscillator();
	lfo.type = "square";
	lfo.frequency.setValueAtTime(10, t0);
	lfo.frequency.exponentialRampToValueAtTime(34, hush);
	const depth = ac.createGain();
	depth.gain.value = 0.5;
	lfo.connect(depth).connect(chop.gain);
	drag.connect(bp).connect(dg).connect(chop).connect(bus);
	drag.start(t0);
	drag.stop(hush + 0.01);
	lfo.start(t0);
	lfo.stop(hush + 0.01);

	// Links knocking, closer and harder together as the slam nears.
	let t = 0.03;
	while (t0 + t < hush - 0.02) {
		const p = t / slamAt;
		link(ac, bus, t0 + t, 0.15 + p * 0.35);
		t += 0.09 - p * 0.065 + Math.random() * 0.015;
	}
	// Each pair of chains crashing into place.
	for (const at of CHAIN_HITS) {
		if (at >= slamAt - 0.1) continue;
		for (let i = 0; i < 4; i++) link(ac, bus, t0 + at + i * 0.012, 0.55);
		boom(ac, master, t0 + at, 110, 40, 0.9, 0.5);
		noise(ac, bus, t0 + at, 0.2, 0.9, "lowpass", 600);
	}

	// A rising, growling drone underneath.
	const drone = ac.createOscillator();
	drone.type = "sawtooth";
	drone.frequency.setValueAtTime(38, t0 + 0.3);
	drone.frequency.exponentialRampToValueAtTime(95, hush);
	const dl = ac.createBiquadFilter();
	dl.type = "lowpass";
	dl.frequency.setValueAtTime(150, t0 + 0.3);
	dl.frequency.exponentialRampToValueAtTime(900, hush);
	const dgain = ac.createGain();
	dgain.gain.setValueAtTime(0.0001, t0 + 0.3);
	dgain.gain.exponentialRampToValueAtTime(0.6, hush - 0.02);
	dgain.gain.linearRampToValueAtTime(0, hush);
	drone.connect(dl).connect(dgain).connect(master);
	drone.start(t0 + 0.3);
	drone.stop(hush + 0.01);

	// A rushing swell sucking in right before impact.
	const rush = ac.createBufferSource();
	rush.buffer = noiseBuffer(ac);
	rush.loop = true;
	const rf = ac.createBiquadFilter();
	rf.type = "lowpass";
	const from = Math.max(t0, slam - 0.8);
	rf.frequency.setValueAtTime(200, from);
	rf.frequency.exponentialRampToValueAtTime(5000, hush);
	const rg = ac.createGain();
	rg.gain.setValueAtTime(0.0001, from);
	rg.gain.exponentialRampToValueAtTime(0.8, hush - 0.01);
	rg.gain.linearRampToValueAtTime(0, hush);
	rush.connect(rf).connect(rg).connect(master);
	rush.start(from);
	rush.stop(hush + 0.01);
}

/**
 * Schedules the whole sound into any audio context starting at `t0`: heavy
 * chains dragging and crashing as they whip in, a rising rush, then the
 * padlock slamming home with a sub-bass drop, a distorted steel clang in a
 * huge hall, the shackle locking and the chains crashing down after it.
 */
export function scheduleLockSound(
	ac: BaseAudioContext,
	dest: AudioNode,
	t0: number,
	slamAt = SLAM_AT,
) {
	const limiter = ac.createDynamicsCompressor();
	limiter.threshold.value = -10;
	limiter.knee.value = 4;
	limiter.ratio.value = 12;
	limiter.attack.value = 0.001;
	limiter.release.value = 0.3;
	const master = ac.createGain();
	master.gain.value = 1;
	// Drive the limiter hard and round off what's left, so it's as loud as it
	// can be without harsh digital clipping.
	const drive = ac.createGain();
	drive.gain.value = 1.4;
	master
		.connect(limiter)
		.connect(drive)
		.connect(grit(ac, 1.6))
		.connect(trim(ac, 0.92))
		.connect(dest);

	const room = ac.createConvolver();
	room.buffer = roomBuffer(ac);
	const wet = ac.createGain();
	wet.gain.value = 0.5;
	room.connect(wet).connect(master);
	const bus = ac.createGain();
	bus.connect(master);
	bus.connect(room);

	if (slamAt > 0.1) {
		// Held well under the slam so the hit lands with everything it has.
		const quiet = (to: AudioNode) => {
			const g = ac.createGain();
			g.gain.value = 0.1;
			g.connect(to);
			return g;
		};
		buildup(ac, quiet(master), quiet(bus), t0, slamAt);
	}

	const slam = t0 + slamAt;

	explosion(ac, master, bus, slam);
	// Sub-bass drop: a cinematic boom that shakes the room.
	boom(ac, master, slam, 120, 28, 1.6, 1.6);
	boom(ac, master, slam, 75, 22, 1.2, 2.0, "triangle");
	boom(ac, bus, slam, 220, 45, 0.9, 0.35, "square");
	// The impact: a dense crunch of low noise and a hard crack on top.
	noise(ac, bus, slam, 0.4, 2.4, "lowpass", 700, 0.8);
	noise(ac, bus, slam, 0.12, 1.4, "bandpass", 1600, 0.7);
	noise(ac, bus, slam, 0.04, 1.2, "highpass", 3000);
	// A massive steel clang, pushed through distortion so it growls.
	const dirty = grit(ac, 6);
	const dirtyOut = ac.createGain();
	dirtyOut.gain.value = 0.7;
	dirty.connect(dirtyOut).connect(bus);
	metal(ac, dirty, slam, 98, 1.3, 3.0);
	metal(ac, dirty, slam + 0.003, 147, 1.0, 2.4);
	metal(ac, dirty, slam + 0.006, 211, 0.7, 1.8);
	metal(ac, bus, slam + 0.002, 440, 0.3, 1.4);
	// The shackle slamming home: two hard, heavy clacks.
	for (const [dt, g] of [
		[0.08, 0.9],
		[0.13, 0.65],
	] as const) {
		metal(ac, dirty, slam + dt, 520, g * 0.5, 0.18, [1, 2.7, 4.9]);
		boom(ac, bus, slam + dt, 160, 70, g * 0.8, 0.12);
		noise(ac, bus, slam + dt, 0.05, g * 1.2, "bandpass", 1800, 1.5);
	}
	// A second, deeper aftershock as the weight settles.
	boom(ac, master, slam + 0.18, 60, 25, 0.8, 1.2);
	noise(ac, bus, slam + 0.18, 0.3, 0.8, "lowpass", 300);
	// Chains crashing down and settling after the hit.
	[0.22, 0.3, 0.37, 0.45, 0.52, 0.63, 0.74, 0.88, 1.02].forEach((dt, i) => {
		link(ac, bus, slam + dt + Math.random() * 0.02, 0.45 * 0.8 ** i);
	});
}

/** Chains whipping in, then the padlock slamming shut. */
export function playLockSound(slamAt = SLAM_AT) {
	const ac = audio();
	if (!ac) return;
	scheduleLockSound(ac, ac.destination, ac.currentTime + 0.01, slamAt);
}

/** A small click for taking the lock back off. */
export function playUnlockSound() {
	const ac = audio();
	if (!ac) return;
	const out = ac.createGain();
	out.gain.value = 0.6;
	out.connect(ac.destination);
	const t = ac.currentTime + 0.01;
	metal(ac, out, t, 700, 0.3, 0.1, [1, 2.7]);
	noise(ac, out, t, 0.05, 0.4, "bandpass", 1600, 1.5);
}
