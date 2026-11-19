// A tiny seeded RNG (mulberry32): the same seed always builds the same city and stages
// the same screenshot, so renders are reproducible run to run.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max). */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max]. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** A random element of `list`. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
