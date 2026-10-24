/**
 * Synthesized sound effects (Web Audio, no asset files). Everything is short
 * and quiet; `setMuted` gates all output.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

function audio(): { ac: AudioContext; out: GainNode } | null {
  if (muted || typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ac: ctx, out: master! };
}

interface ToneOpts {
  freq: number;
  to?: number;
  type?: OscillatorType;
  duration?: number;
  volume?: number;
  delay?: number;
}

function tone({ freq, to, type = 'sine', duration = 0.15, volume = 0.2, delay = 0 }: ToneOpts) {
  const a = audio();
  if (!a) return;
  const t = a.ac.currentTime + delay;
  const osc = a.ac.createOscillator();
  const gain = a.ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(a.out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise({
  duration = 0.15,
  volume = 0.2,
  freq = 1200,
  q = 1,
  delay = 0,
  sweepTo,
}: {
  duration?: number;
  volume?: number;
  freq?: number;
  q?: number;
  delay?: number;
  sweepTo?: number;
}) {
  const a = audio();
  if (!a) return;
  const t = a.ac.currentTime + delay;
  const buffer = a.ac.createBuffer(1, Math.ceil(a.ac.sampleRate * duration), a.ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ac.createBufferSource();
  src.buffer = buffer;
  const filter = a.ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
  filter.Q.value = q;
  const gain = a.ac.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(a.out);
  src.start(t);
}

const notes = (freqs: number[], step: number, opts: Omit<ToneOpts, 'freq'> = {}) =>
  freqs.forEach((freq, i) => tone({ ...opts, freq, delay: (opts.delay ?? 0) + i * step }));

export const sfx = {
  click: () => tone({ freq: 720, type: 'triangle', duration: 0.06, volume: 0.08 }),
  turn: () => tone({ freq: 520, to: 780, type: 'sine', duration: 0.12, volume: 0.06 }),
  swing: () => noise({ duration: 0.18, volume: 0.18, freq: 900, sweepTo: 3000, q: 0.8 }),
  hit: () => {
    noise({ duration: 0.12, volume: 0.35, freq: 700, q: 0.7 });
    tone({ freq: 160, to: 60, type: 'square', duration: 0.12, volume: 0.12 });
  },
  crit: () => {
    noise({ duration: 0.25, volume: 0.45, freq: 500, q: 0.6 });
    tone({ freq: 220, to: 50, type: 'sawtooth', duration: 0.25, volume: 0.15 });
    tone({ freq: 1400, to: 700, type: 'triangle', duration: 0.18, volume: 0.08, delay: 0.02 });
  },
  skill: () => {
    noise({ duration: 0.5, volume: 0.15, freq: 400, sweepTo: 4000, q: 1.5 });
    notes([392, 523, 659], 0.06, { type: 'triangle', duration: 0.3, volume: 0.07 });
  },
  heal: () => notes([523, 659, 784, 1047], 0.07, { type: 'sine', duration: 0.35, volume: 0.08 }),
  shield: () => tone({ freq: 300, to: 900, type: 'sine', duration: 0.3, volume: 0.1 }),
  buff: () => tone({ freq: 440, to: 990, type: 'triangle', duration: 0.22, volume: 0.07 }),
  debuff: () => tone({ freq: 520, to: 180, type: 'sawtooth', duration: 0.25, volume: 0.05 }),
  resist: () => tone({ freq: 300, type: 'square', duration: 0.06, volume: 0.04 }),
  stun: () => notes([880, 660, 880, 660], 0.06, { type: 'square', duration: 0.06, volume: 0.04 }),
  defeat: () => {
    noise({ duration: 0.6, volume: 0.2, freq: 300, sweepTo: 80 });
    tone({ freq: 300, to: 60, type: 'sawtooth', duration: 0.5, volume: 0.08 });
  },
  victory: () => {
    notes([523, 659, 784], 0.12, { type: 'triangle', duration: 0.25, volume: 0.12 });
    tone({ freq: 1047, type: 'triangle', duration: 0.8, volume: 0.12, delay: 0.38 });
    tone({ freq: 784, type: 'sine', duration: 0.8, volume: 0.08, delay: 0.38 });
  },
  lose: () => notes([392, 349, 311, 262], 0.18, { type: 'triangle', duration: 0.35, volume: 0.1 }),
  battleStart: () => {
    noise({ duration: 0.4, volume: 0.2, freq: 300, sweepTo: 2000 });
    notes([262, 392, 523], 0.08, { type: 'square', duration: 0.18, volume: 0.06 });
  },
  ultimate: () => {
    noise({ duration: 1.2, volume: 0.25, freq: 200, sweepTo: 5000, q: 2 });
    tone({ freq: 110, to: 55, type: 'sawtooth', duration: 1.1, volume: 0.12 });
    notes([523, 659, 784, 1047, 1319], 0.09, { type: 'triangle', duration: 0.6, volume: 0.1, delay: 0.25 });
  },
  boom: () => {
    noise({ duration: 0.6, volume: 0.5, freq: 160, q: 0.5 });
    tone({ freq: 90, to: 30, type: 'sine', duration: 0.6, volume: 0.25 });
  },
  meteor: () => noise({ duration: 1.1, volume: 0.2, freq: 3000, sweepTo: 300, q: 2 }),
  flip: (rarity: number) => {
    noise({ duration: 0.12, volume: 0.12, freq: 2500, q: 1 });
    if (rarity === 5) notes([784, 988, 1175, 1568], 0.08, { type: 'triangle', duration: 0.5, volume: 0.12 });
    else if (rarity === 4) notes([659, 880, 1175], 0.07, { type: 'triangle', duration: 0.35, volume: 0.09 });
    else tone({ freq: 880, type: 'sine', duration: 0.12, volume: 0.05 });
  },
  coins: () => notes([1319, 1568, 2093], 0.05, { type: 'square', duration: 0.08, volume: 0.04 }),
};
