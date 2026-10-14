/**
 * Chain rattle and padlock slam for the Lock of the Week, synthesized with Web
 * Audio so there's no file to fetch. Only ever called from the user's own click,
 * which is what lets browsers start audio.
 */

/** When the padlock lands, in seconds after the click. Matches the animation. */
export const SLAM_AT = 0.55;

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

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

function noiseBuffer(ac: AudioContext) {
	if (noise) return noise;
	noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
	const data = noise.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	return noise;
}

/** One struck piece of metal: inharmonic partials over a short scrape of noise. */
function hit(
	ac: AudioContext,
	out: AudioNode,
	t: number,
	freq: number,
	gain: number,
	decay: number,
) {
	[1, 2.76, 5.4, 8.93].forEach((ratio, i) => {
		const osc = ac.createOscillator();
		osc.frequency.value = freq * ratio;
		const g = ac.createGain();
		const end = t + decay / (1 + i * 0.6);
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(gain / (i + 1), t + 0.002);
		g.gain.exponentialRampToValueAtTime(0.0001, end);
		osc.connect(g).connect(out);
		osc.start(t);
		osc.stop(end + 0.02);
	});
	const src = ac.createBufferSource();
	src.buffer = noiseBuffer(ac);
	const hp = ac.createBiquadFilter();
	hp.type = "highpass";
	hp.frequency.value = 2500;
	const g = ac.createGain();
	g.gain.setValueAtTime(gain * 0.8, t);
	g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
	src.connect(hp).connect(g).connect(out);
	src.start(t);
	src.stop(t + 0.05);
}

/** Chains rattling in, then the padlock slamming shut with a heavy clink. */
export function playLockSound(slamAt = SLAM_AT) {
	const ac = audio();
	if (!ac) return;
	const now = ac.currentTime + 0.01;
	const master = ac.createGain();
	master.gain.value = 0.55;
	const comp = ac.createDynamicsCompressor();
	master.connect(comp).connect(ac.destination);

	// Chain links knocking together as the chains swing in.
	const links = Math.max(0, Math.floor(slamAt / 0.05));
	for (let i = 0; i < links; i++) {
		const t = now + i * 0.05 + Math.random() * 0.02;
		hit(
			ac,
			master,
			t,
			1700 + Math.random() * 1500,
			0.07 + Math.random() * 0.07,
			0.12,
		);
	}

	const slam = now + slamAt;
	// Body thump.
	const thump = ac.createOscillator();
	thump.frequency.setValueAtTime(150, slam);
	thump.frequency.exponentialRampToValueAtTime(45, slam + 0.25);
	const tg = ac.createGain();
	tg.gain.setValueAtTime(0.9, slam);
	tg.gain.exponentialRampToValueAtTime(0.0001, slam + 0.35);
	thump.connect(tg).connect(master);
	thump.start(slam);
	thump.stop(slam + 0.4);
	// The clank, then the shackle clicking home.
	hit(ac, master, slam, 520, 0.4, 1.1);
	hit(ac, master, slam + 0.005, 1240, 0.22, 0.6);
	hit(ac, master, slam + 0.07, 3300, 0.18, 0.08);
	// A last chain settle.
	hit(ac, master, slam + 0.22, 2400, 0.06, 0.15);
	hit(ac, master, slam + 0.31, 2900, 0.04, 0.12);
}

/** A small click for taking the lock back off. */
export function playUnlockSound() {
	const ac = audio();
	if (!ac) return;
	const out = ac.createGain();
	out.gain.value = 0.4;
	out.connect(ac.destination);
	hit(ac, out, ac.currentTime + 0.01, 2600, 0.15, 0.08);
}
