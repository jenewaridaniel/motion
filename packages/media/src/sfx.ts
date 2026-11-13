/**
 * Built-in sound effects, made in code (no recordings, so no licences).
 * Each one is rendered with an OfflineAudioContext and saved as a WAV file,
 * then added to the project like any imported sound. Noise uses a fixed
 * seed, so a given effect is the same file every time.
 */
import { encodeWav } from "@motion/core";

export interface SoundEffect {
  id: string;
  name: string;
  /** Seconds. */
  duration: number;
}

type Recipe = (ctx: OfflineAudioContext, out: AudioNode) => void;

const RATE = 48_000;

/** Repeatable white noise. */
function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed = 1) {
  const buf = ctx.createBuffer(
    1,
    Math.ceil(seconds * ctx.sampleRate),
    ctx.sampleRate,
  );
  const d = buf.getChannelData(0);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < d.length; i++) {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    d[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
  return buf;
}

function noise(ctx: BaseAudioContext, seconds: number, seed?: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds, seed);
  return src;
}

/** Gain node with an attack / decay envelope. */
function envelope(ctx: BaseAudioContext, points: [number, number][]): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(points[0]?.[1] ?? 0, 0);
  for (const [t, v] of points.slice(1)) {
    if (v <= 0.0001) g.gain.linearRampToValueAtTime(0, t);
    else g.gain.exponentialRampToValueAtTime(v, t);
  }
  return g;
}

function tone(
  ctx: BaseAudioContext,
  type: OscillatorType,
  freq: [number, number][],
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq[0]?.[1] ?? 440, 0);
  for (const [t, f] of freq.slice(1))
    o.frequency.exponentialRampToValueAtTime(f, t);
  return o;
}

const RECIPES: Record<
  string,
  { name: string; duration: number; make: Recipe }
> = {
  whoosh: {
    name: "Whoosh",
    duration: 0.9,
    make(ctx, out) {
      const n = noise(ctx, 0.9, 7);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, 0);
      bp.frequency.exponentialRampToValueAtTime(2800, 0.45);
      bp.frequency.exponentialRampToValueAtTime(500, 0.9);
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(-0.7, 0);
      pan.pan.linearRampToValueAtTime(0.7, 0.9);
      const env = envelope(ctx, [
        [0, 0.001],
        [0.4, 1],
        [0.9, 0.001],
      ]);
      n.connect(bp).connect(env).connect(pan).connect(out);
      n.start(0);
    },
  },
  swish: {
    name: "Swish",
    duration: 0.35,
    make(ctx, out) {
      const n = noise(ctx, 0.35, 11);
      const hp = ctx.createBiquadFilter();
      hp.type = "bandpass";
      hp.Q.value = 2;
      hp.frequency.setValueAtTime(5000, 0);
      hp.frequency.exponentialRampToValueAtTime(1500, 0.35);
      const env = envelope(ctx, [
        [0, 0.001],
        [0.06, 1],
        [0.35, 0.001],
      ]);
      n.connect(hp).connect(env).connect(out);
      n.start(0);
    },
  },
  pop: {
    name: "Pop",
    duration: 0.2,
    make(ctx, out) {
      const o = tone(ctx, "sine", [
        [0, 900],
        [0.08, 180],
      ]);
      const env = envelope(ctx, [
        [0, 0.001],
        [0.004, 1],
        [0.18, 0.001],
      ]);
      o.connect(env).connect(out);
      o.start(0);
      o.stop(0.2);
    },
  },
  click: {
    name: "Click",
    duration: 0.06,
    make(ctx, out) {
      const n = noise(ctx, 0.06, 3);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3200;
      bp.Q.value = 4;
      const env = envelope(ctx, [
        [0, 1],
        [0.03, 0.001],
      ]);
      n.connect(bp).connect(env).connect(out);
      n.start(0);
    },
  },
  ding: {
    name: "Ding",
    duration: 1.6,
    make(ctx, out) {
      for (const [f, level] of [
        [1318.5, 1],
        [2637, 0.35],
        [3955.5, 0.12],
      ] as const) {
        const o = tone(ctx, "sine", [[0, f]]);
        const env = envelope(ctx, [
          [0, 0.001],
          [0.005, level],
          [1.6, 0.001],
        ]);
        o.connect(env).connect(out);
        o.start(0);
        o.stop(1.6);
      }
    },
  },
  notify: {
    name: "Notification",
    duration: 0.45,
    make(ctx, out) {
      for (const [at, f] of [
        [0, 880],
        [0.13, 1320],
      ] as const) {
        const o = tone(ctx, "triangle", [[0, f]]);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, 0);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.9, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
        o.connect(g).connect(out);
        o.start(0);
        o.stop(0.45);
      }
    },
  },
  riser: {
    name: "Riser",
    duration: 2,
    make(ctx, out) {
      const o = tone(ctx, "sawtooth", [
        [0, 180],
        [2, 1400],
      ]);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(400, 0);
      lp.frequency.exponentialRampToValueAtTime(6000, 2);
      const n = noise(ctx, 2, 5);
      const nGain = ctx.createGain();
      nGain.gain.value = 0.25;
      const env = envelope(ctx, [
        [0, 0.01],
        [1.9, 0.8],
        [2, 0.001],
      ]);
      o.connect(lp).connect(env).connect(out);
      n.connect(nGain).connect(lp);
      o.start(0);
      o.stop(2);
      n.start(0);
    },
  },
  impact: {
    name: "Impact",
    duration: 1.4,
    make(ctx, out) {
      const o = tone(ctx, "sine", [
        [0, 130],
        [0.4, 42],
      ]);
      const env = envelope(ctx, [
        [0, 0.001],
        [0.005, 1],
        [1.4, 0.001],
      ]);
      o.connect(env).connect(out);
      o.start(0);
      o.stop(1.4);
      const n = noise(ctx, 0.5, 9);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const nEnv = envelope(ctx, [
        [0, 0.8],
        [0.4, 0.001],
      ]);
      n.connect(lp).connect(nEnv).connect(out);
      n.start(0);
    },
  },
  shutter: {
    name: "Camera shutter",
    duration: 0.25,
    make(ctx, out) {
      for (const [at, seed] of [
        [0, 21],
        [0.07, 22],
      ] as const) {
        const n = noise(ctx, 0.06, seed);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 2400;
        bp.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, 0);
        g.gain.setValueAtTime(1, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
        n.connect(bp).connect(g).connect(out);
        n.start(at);
      }
    },
  },
};

export const SOUND_EFFECTS: SoundEffect[] = Object.entries(RECIPES).map(
  ([id, r]) => ({ id, name: r.name, duration: r.duration }),
);

/** Render an effect: stereo samples at 48 kHz, peak at -2 dB. */
export async function renderSoundEffect(id: string): Promise<AudioBuffer> {
  const r = RECIPES[id];
  if (!r) throw new Error(`Unknown sound effect: ${id}`);
  const ctx = new OfflineAudioContext(2, Math.ceil(r.duration * RATE), RATE);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  r.make(ctx, master);
  const buf = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) {
    const k = 0.8 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? 0) * k;
    }
  }
  return buf;
}

/** An effect as a WAV file, ready to import. */
export async function soundEffectFile(id: string): Promise<File> {
  const buf = await renderSoundEffect(id);
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) =>
    buf.getChannelData(c),
  );
  const name = RECIPES[id]?.name ?? id;
  return new File([encodeWav(channels, buf.sampleRate)], `${name}.wav`, {
    type: "audio/wav",
  });
}
