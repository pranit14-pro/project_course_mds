// distributions.js — Probability distributions fitted from the KM case exhibits.
//
// Two random processes drive the model:
//   1) ARRIVALS  -> Exponential inter-arrival times (a Poisson arrival process).
//   2) SERVICE   -> Lognormal service times (non-negative, mildly right-skewed).
//
// All sampling goes through an RNG instance so it is reproducible by seed.

const Distributions = {
  // ---- Exponential inter-arrival time ----
  // For a Poisson process with rate lambda (events per unit time), the gaps
  // between consecutive events are Exponential with mean 1/lambda.
  // Inverse-transform: T = -ln(U)/lambda, U ~ Uniform(0,1).
  exponential(rng, lambda) {
    let u = rng.uniform();
    if (u < 1e-12) u = 1e-12;
    return -Math.log(u) / lambda;
  },

  // ---- Lognormal service time ----
  // We are given a MEAN (m) from Exhibit 5 and choose a coefficient of
  // variation (CV = sd/mean) from the case note (CV ~ 0.3 routine, larger for
  // accident/denting/engine-overhaul).
  // A Lognormal whose underlying normal has parameters (mu, sigma) has:
  //     E[X]   = exp(mu + sigma^2 / 2)
  //     CV^2   = exp(sigma^2) - 1
  // Solving for (mu, sigma) from a target mean m and CV:
  //     sigma^2 = ln(1 + CV^2)
  //     mu      = ln(m) - sigma^2 / 2
  // Sample: X = exp(mu + sigma * Z),  Z ~ N(0,1).
  lognormal(rng, mean, cv) {
    if (mean <= 0) return 0;
    const sigma2 = Math.log(1 + cv * cv);
    const sigma = Math.sqrt(sigma2);
    const mu = Math.log(mean) - sigma2 / 2;
    return Math.exp(mu + sigma * rng.normal());
  },

  // Convenience: draw a service time for a job given its base (expert) mean,
  // its CV, and a skill-speed multiplier (see sim.js skillMultiplier()).
  // The skill multiplier scales the MEAN; the shape (CV) is preserved.
  serviceTime(rng, baseMeanExpert, cv, skillMultiplier) {
    return this.lognormal(rng, baseMeanExpert * skillMultiplier, cv);
  },
};
