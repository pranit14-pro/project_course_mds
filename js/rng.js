// rng.js — Seeded pseudo-random number generator.
// We use a seeded RNG so every simulation run is REPRODUCIBLE: the same seed
// always produces the same arrivals/service times. This is essential for a
// report — results must be repeatable and scenarios must be comparable on the
// same random stream.

// Mulberry32: a small, fast, well-distributed 32-bit PRNG.
// Given a 32-bit integer seed it returns a function producing uniforms in [0,1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A thin wrapper exposing the common samplers used by the simulation.
class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._u = mulberry32(this.seed);
    this._spare = null; // cache for the Box–Muller pair
  }

  // Uniform(0,1)
  uniform() {
    return this._u();
  }

  // Standard Normal N(0,1) via the Box–Muller transform.
  // Z = sqrt(-2 ln U1) * cos(2*pi*U2). The sine term gives a second
  // independent normal which we cache in _spare for efficiency.
  normal() {
    if (this._spare !== null) {
      const z = this._spare;
      this._spare = null;
      return z;
    }
    let u1 = this.uniform();
    let u2 = this.uniform();
    if (u1 < 1e-12) u1 = 1e-12; // guard against ln(0)
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    this._spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  }
}
