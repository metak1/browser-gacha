/**
 * Procedural background music (Web Audio, no asset files): a short chord loop
 * per mood, scheduled a little ahead of time so it stays in time. Tracks
 * cross-fade when the mood changes.
 */
export type Track = 'menu' | 'battle' | 'boss';

interface TrackDef {
  bpm: number;
  /** One chord (MIDI notes) per bar. */
  chords: number[][];
  /** Steps (16ths, 0-15) where the bass plays the chord root. */
  bass: number[];
  /** Arpeggio: one note every `arpEvery` steps, cycling up the chord. */
  arpEvery: number;
  arpWave: OscillatorType;
  /** Soft sustained chord at the start of each bar. */
  pad: boolean;
  drums: boolean;
  /** Optional lead: chord-tone index per 8th note (-1 = rest), an octave up. */
  lead?: number[];
}

const TRACKS: Record<Track, TrackDef> = {
  // Cmaj7 - Am7 - Fmaj7 - G6: calm lobby.
  menu: {
    bpm: 76,
    chords: [
      [60, 64, 67, 71],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 64],
    ],
    bass: [0, 10],
    arpEvery: 2,
    arpWave: 'triangle',
    pad: true,
    drums: false,
  },
  // Am - F - C - G: steady adventure beat.
  battle: {
    bpm: 112,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    bass: [0, 3, 6, 8, 11, 14],
    arpEvery: 1,
    arpWave: 'square',
    pad: false,
    drums: true,
    lead: [0, -1, 1, 2, -1, 1, 0, -1],
  },
  // Dm - Bb - C - A: tense and driving.
  boss: {
    bpm: 132,
    chords: [
      [50, 53, 57],
      [46, 50, 53],
      [48, 52, 55],
      [45, 49, 52],
    ],
    bass: [0, 2, 4, 6, 8, 10, 12, 14],
    arpEvery: 1,
    arpWave: 'sawtooth',
    pad: false,
    drums: true,
    lead: [2, 1, 0, 1, 2, -1, 2, 2],
  },
};

const VOLUME = 0.07;
const LOOKAHEAD = 0.25;
const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let ctx: AudioContext | null = null;
let current: { track: Track; gain: GainNode; step: number; nextTime: number } | null = null;
let wanted: Track | null = null;
let enabled = true;
let timer: ReturnType<typeof setInterval> | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

function note(out: GainNode, t: number, midi: number, dur: number, vol: number, type: OscillatorType) {
  const ac = out.context;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq(midi), t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function drum(out: GainNode, t: number, kind: 'kick' | 'snare' | 'hat') {
  const ac = out.context;
  if (kind === 'kick') {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
    return;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ac.createBiquadFilter();
  filter.type = kind === 'hat' ? 'highpass' : 'bandpass';
  filter.frequency.value = kind === 'hat' ? 7000 : 1800;
  const g = ac.createGain();
  const dur = kind === 'hat' ? 0.04 : 0.12;
  g.gain.setValueAtTime(kind === 'hat' ? 0.25 : 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Schedules one 16th-note step of the current track. */
function playStep(def: TrackDef, out: GainNode, step: number, t: number) {
  const stepDur = 60 / def.bpm / 4;
  const bar = Math.floor(step / 16) % def.chords.length;
  const s = step % 16;
  const chord = def.chords[bar]!;
  if (def.pad && s === 0) for (const n of chord) note(out, t, n, stepDur * 16, 0.12, 'sine');
  if (def.bass.includes(s)) note(out, t, chord[0]! - 12, stepDur * (def.pad ? 6 : 1.6), 0.5, def.pad ? 'sine' : 'triangle');
  if (s % def.arpEvery === 0) {
    const i = (s / def.arpEvery) % chord.length;
    note(out, t, chord[i]! + 12, stepDur * 1.5, def.pad ? 0.18 : 0.1, def.arpWave);
  }
  if (def.lead && s % 2 === 0) {
    const degree = def.lead[(s / 2 + bar * 2) % def.lead.length]!;
    if (degree >= 0) note(out, t, chord[degree % chord.length]! + 24, stepDur * 1.8, 0.14, 'triangle');
  }
  if (def.drums) {
    if (s % 8 === 0) drum(out, t, 'kick');
    if (s % 8 === 4) drum(out, t, 'snare');
    if (s % 2 === 1) drum(out, t, 'hat');
  }
}

function tick() {
  const ac = ctx;
  if (!ac || !current) return;
  const def = TRACKS[current.track];
  const stepDur = 60 / def.bpm / 4;
  while (current.nextTime < ac.currentTime + LOOKAHEAD) {
    playStep(def, current.gain, current.step, current.nextTime);
    current.step++;
    current.nextTime += stepDur;
  }
}

function fadeOut(gain: GainNode) {
  const t = gain.context.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.8);
  setTimeout(() => gain.disconnect(), 1000);
}

function apply() {
  const target = enabled ? wanted : null;
  if (current && current.track === target) return;
  if (current) fadeOut(current.gain);
  current = null;
  if (!target) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume();
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(VOLUME, ac.currentTime + 1);
  gain.connect(ac.destination);
  current = { track: target, gain, step: 0, nextTime: ac.currentTime + 0.1 };
  if (!timer) timer = setInterval(tick, 90);
  tick();
}

export const music = {
  /** The mood for the current screen; null stops the music. */
  play(track: Track | null) {
    wanted = track;
    apply();
  },
  setEnabled(on: boolean) {
    enabled = on;
    apply();
  },
};

// Browsers only start audio after a user gesture: resume on the first one.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (ctx?.state === 'suspended') void ctx.resume();
    apply();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
