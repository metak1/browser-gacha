/**
 * Mulberry32 as a pure step function, so the RNG state can live inside
 * serializable battle state. Returns [value in [0, 1), next state].
 */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

/** FNV-1a over 32-bit ints. Deterministic choices that must not consume RNG state. */
export function hash32(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
