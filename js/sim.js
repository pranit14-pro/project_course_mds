// sim.js — Discrete-Event Simulation (DES) engine for the KM Jaipur workshop.
//
// This is the analytical core of the project. It models:
//   * a Poisson stream of truck/job arrivals (rates from Exhibit 4),
//   * Lognormal service times (means from Exhibit 5) scaled by worker SKILL,
//   * bays (general + dedicated "extra" bays) as primary servers,
//   * mechanics in 6 departments at 3 skill levels (Exhibit 2) as secondary,
//     constrained resources that must be seized together with a bay,
//   * queueing policies (FIFO / shortest-job-first, car-carrier priority,
//     long-job separation) and seasonal absenteeism.
//
// TIME UNIT: "working minutes". The case service times are productive minutes
// (Accident = 6300 min = 15 days x 420 productive min/day), so we run the clock
// in working minutes and convert to days by dividing by productiveMinutesPerDay.

// ---------- A minimal binary min-heap for the Future-Event List (FEL) ----------
class EventHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(ev) {
    const a = this.a; a.push(ev); let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].time <= a[i].time) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2; let s = i;
        if (l < a.length && a[l].time < a[s].time) s = l;
        if (r < a.length && a[r].time < a[s].time) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]]; i = s;
      }
    }
    return top;
  }
}

const SKILL_LEVEL = { high: 10, medium: 7, low: 4 };
const EXPERT = 10;

class WorkshopSimulation {
  constructor(exhibits, config) {
    this.ex = exhibits;
    this.cfg = config;
    this.PMD = exhibits.meta.productiveMinutesPerDay; // 420
    this.depts = exhibits.meta.departments;
  }

  // Service-time speed multiplier from worker skill.
  // Exhibit 5 note: times are for expert (skill 10). A skill-s worker takes
  // (10 / s) times as long. So multiplier = EXPERT / skill (>= 1).
  skillMultiplier(skill) { return EXPERT / skill; }

  // Build the resource pools for one replication, applying staffing overrides
  // and seasonal absenteeism.
  buildResources() {
    const cfg = this.cfg;
    // Workers available per department, by skill level (counts).
    const workers = {};
    for (const d of this.depts) {
      const base = cfg.staffing[d]; // {high, medium, low}
      const avail = { high: base.high, medium: base.medium, low: base.low };
      // Seasonal absenteeism: remove round(p * count) from each skill bucket.
      if (cfg.absenteeism > 0) {
        for (const s of ["high", "medium", "low"]) {
          avail[s] = Math.max(0, avail[s] - Math.round(cfg.absenteeism * avail[s]));
        }
      }
      workers[d] = avail;
    }
    return {
      workers,
      genBaysFree: cfg.generalBays + (cfg.useInspectionBay ? 1 : 0),
      extraBaysFree: cfg.extraBays,
    };
  }

  deptCapacity(workers, d) {
    return workers[d].high + workers[d].medium + workers[d].low;
  }

  // Number of workers a job needs from a department.
  // Integer requirement -> that many. Fractional (only accidents) -> 1 worker.
  reqCount(reqVal) {
    if (reqVal >= 1) return Math.round(reqVal);
    if (reqVal > 0) return 1;
    return 0;
  }

  // Can this job's required workers be seized right now?
  workersAvailable(R, job) {
    for (const d of this.depts) {
      const need = this.reqCount(job.req[d]);
      if (need > 0 && this.deptCapacity(R.workers, d) < need) return false;
    }
    return true;
  }

  // Seize workers greedily (highest skill first so faster workers are used
  // when free). Returns the composition seized per department and the GOVERNING
  // (minimum) skill across all seized workers — the slowest sub-task governs
  // how long the whole job takes.
  seizeWorkers(R, job) {
    const seized = {};
    let minSkill = EXPERT;
    for (const d of this.depts) {
      const need = this.reqCount(job.req[d]);
      if (need === 0) continue;
      const pool = R.workers[d];
      const take = { high: 0, medium: 0, low: 0 };
      let remaining = need;
      for (const s of ["high", "medium", "low"]) {
        while (remaining > 0 && pool[s] > 0) {
          pool[s]--; take[s]++; remaining--;
          minSkill = Math.min(minSkill, SKILL_LEVEL[s]);
        }
      }
      seized[d] = take;
    }
    return { seized, minSkill };
  }

  releaseWorkers(R, seized) {
    for (const d in seized) {
      const t = seized[d];
      R.workers[d].high += t.high;
      R.workers[d].medium += t.medium;
      R.workers[d].low += t.low;
    }
  }

  // Which bay pool does this job use, and is one free?
  // separation ON  : Extra-type jobs use the extra pool (fallback to general
  //                  only if no extra bays exist); Usual jobs use general.
  // separation OFF : a single pooled set of bays serves everyone.
  bayAvailable(R, job) {
    if (!this.cfg.separateLongJobs) return (R.genBaysFree + R.extraBaysFree) > 0;
    if (job.bayType === "Extra" && this.cfg.extraBays > 0) return R.extraBaysFree > 0;
    return R.genBaysFree > 0;
  }
  seizeBay(R, job) {
    if (!this.cfg.separateLongJobs) {
      if (R.genBaysFree > 0) { R.genBaysFree--; return "gen"; }
      R.extraBaysFree--; return "extra";
    }
    if (job.bayType === "Extra" && this.cfg.extraBays > 0) { R.extraBaysFree--; return "extra"; }
    R.genBaysFree--; return "gen";
  }
  releaseBay(R, which) {
    if (which === "extra") R.extraBaysFree++; else R.genBaysFree++;
  }

  // Order the waiting queue by the active policy and try to start jobs.
  dispatch(R, stats) {
    const cfg = this.cfg;
    // Sort a copy of the queue by priority.
    const q = stats.queue.slice().sort((x, y) => {
      if (cfg.carrierPriority && x.carrier !== y.carrier) {
        return x.carrier === "car" ? -1 : 1;          // car carriers first
      }
      if (cfg.discipline === "SJF") return x.baseMean - y.baseMean; // shortest first
      return x.arrival - y.arrival;                                 // FIFO
    });
    for (const job of q) {
      if (job.started) continue;
      if (!this.bayAvailable(R, job)) continue;
      if (!this.workersAvailable(R, job)) continue;
      this.startJob(R, stats, job);
    }
    // Compact the queue (remove started jobs).
    stats.queue = stats.queue.filter((j) => !j.started);
  }

  startJob(R, stats, job) {
    const now = stats.now;
    const bayKind = this.seizeBay(R, job);
    const { seized, minSkill } = this.seizeWorkers(R, job);
    // Sample the service time for this job given the governing skill.
    const mult = this.skillMultiplier(minSkill);
    const duration = Math.max(
      1,
      Distributions.serviceTime(stats.rng, job.baseMean, job.cv, mult)
    );

    job.started = true;
    job.start = now;
    job.duration = duration;
    job.wait = now - job.arrival;

    // Resource accounting (busy-minutes). We CLIP each occupancy interval to the
    // measured window [warmupMin, horizon] so utilisation can never exceed 100%
    // (a long job that spills past the horizon only counts the minutes inside it).
    const clip = (a, b) =>
      Math.max(0, Math.min(b, stats.horizon) - Math.max(a, stats.warmupMin));
    stats.bayBusyMin += clip(now, now + duration);
    for (const d in seized) {
      const cnt = seized[d].high + seized[d].medium + seized[d].low;
      // Fractional accident departments hold workers only req*duration.
      const reqVal = job.req[d];
      const hold = reqVal > 0 && reqVal < 1 ? reqVal * duration : duration;
      stats.deptBusyMin[d] += cnt * clip(now, now + hold);
    }

    // Schedule per-department worker releases (fractional accident depts free
    // earlier) and the bay release / job completion at start+duration.
    for (const d in seized) {
      const reqVal = job.req[d];
      const hold = reqVal > 0 && reqVal < 1 ? reqVal * duration : duration;
      if (hold < duration - 1e-9) {
        stats.fel.push({ time: now + hold, kind: "WORKER_RELEASE",
                         seized: { [d]: seized[d] } });
      }
    }
    // Workers whose hold == duration are released at completion.
    const fullDeptSeized = {};
    for (const d in seized) {
      const reqVal = job.req[d];
      const hold = reqVal > 0 && reqVal < 1 ? reqVal * duration : duration;
      if (!(hold < duration - 1e-9)) fullDeptSeized[d] = seized[d];
    }
    stats.fel.push({ time: now + duration, kind: "DEPARTURE", job,
                     bayKind, seized: fullDeptSeized });
  }

  // Build the job catalogue with arrival weights.
  prepareJobs() {
    const jobs = this.ex.jobs;
    const dm = this.cfg.demandMultiplier;
    let total = 0;
    const weighted = jobs.map((j) => {
      const lam = j.lambdaPerDay * dm;
      total += lam;
      return { j, lam };
    });
    return { weighted, totalLambdaPerDay: total };
  }

  // Pick a job type proportional to its arrival rate, then a carrier class.
  sampleJobType(rng, weighted, totalLam) {
    let u = rng.uniform() * totalLam;
    for (const w of weighted) {
      u -= w.lam;
      if (u <= 0) return w.j;
    }
    return weighted[weighted.length - 1].j;
  }
  sampleCarrier(rng, j) {
    const tot = j.flatbed + j.car;
    return rng.uniform() < j.flatbed / tot ? "flatbed" : "car";
  }

  // ---------------- Run ONE replication ----------------
  runOnce(seed) {
    const cfg = this.cfg;
    const horizon = cfg.simDays * this.PMD;          // working minutes
    const warmupMin = cfg.warmupDays * this.PMD;
    const R = this.buildResources();
    const { weighted, totalLambdaPerDay } = this.prepareJobs();
    const ratePerMin = totalLambdaPerDay / this.PMD; // arrivals per working min

    const stats = {
      rng: new RNG(seed),
      now: 0,
      warmupMin,
      horizon,
      fel: new EventHeap(),
      queue: [],
      completed: [],
      bayBusyMin: 0,
      deptBusyMin: Object.fromEntries(this.depts.map((d) => [d, 0])),
      // time-weighted queue length accumulator
      qArea: 0,
      lastEventTime: 0,
      dailySnapshots: [],
    };

    // Schedule the first arrival.
    const firstGap = Distributions.exponential(stats.rng, ratePerMin);
    stats.fel.push({ time: firstGap, kind: "ARRIVAL" });
    // Schedule daily snapshot ticks for the live animation.
    for (let d = 1; d <= cfg.simDays; d++) {
      stats.fel.push({ time: d * this.PMD, kind: "SNAPSHOT", day: d });
    }

    const totalBaysFor = (R) => R.genBaysFree + R.extraBaysFree;
    const totalBaysCapacity = cfg.generalBays + cfg.extraBays + (cfg.useInspectionBay ? 1 : 0);

    while (stats.fel.size > 0) {
      const ev = stats.fel.pop();
      if (ev.time > horizon && ev.kind !== "DEPARTURE") {
        // Past horizon: stop generating new work but let in-progress jobs finish
        // only if we still have departures queued. Arrivals/snapshots ignored.
        if (ev.kind === "ARRIVAL" || ev.kind === "SNAPSHOT") continue;
      }
      // Accumulate time-weighted queue length (post warm-up).
      if (stats.now >= warmupMin) {
        stats.qArea += stats.queue.length * (ev.time - stats.lastEventTime);
      }
      stats.lastEventTime = ev.time;
      stats.now = ev.time;

      if (ev.kind === "ARRIVAL") {
        const j = this.sampleJobType(stats.rng, weighted, totalLambdaPerDay);
        const carrier = this.sampleCarrier(stats.rng, j);
        const job = {
          type: j.name, bayType: j.bayType, carrier,
          req: j.deptRequirements, baseMean: j.meanServiceMinExpert,
          cv: j.serviceCV, labourCost: j.labourCost,
          arrival: stats.now, started: false,
        };
        stats.queue.push(job);
        // Next arrival.
        const gap = Distributions.exponential(stats.rng, ratePerMin);
        stats.fel.push({ time: stats.now + gap, kind: "ARRIVAL" });
        this.dispatch(R, stats);
      } else if (ev.kind === "DEPARTURE") {
        this.releaseBay(R, ev.bayKind);
        this.releaseWorkers(R, ev.seized);
        const job = ev.job;
        job.end = stats.now;
        job.sojourn = job.end - job.arrival;
        if (job.arrival >= warmupMin) stats.completed.push(job);
        this.dispatch(R, stats);
      } else if (ev.kind === "WORKER_RELEASE") {
        this.releaseWorkers(R, ev.seized);
        this.dispatch(R, stats);
      } else if (ev.kind === "SNAPSHOT") {
        stats.dailySnapshots.push({
          day: ev.day,
          queueLen: stats.queue.length,
          baysBusy: totalBaysCapacity - totalBaysFor(R),
          baysTotal: totalBaysCapacity,
        });
      }
    }

    return this.summarize(stats, horizon, warmupMin, totalBaysCapacity);
  }

  summarize(stats, horizon, warmupMin, totalBays) {
    const effMin = horizon - warmupMin;          // measured window (working min)
    const effDays = effMin / this.PMD;
    const comp = stats.completed;
    const n = comp.length;

    const waits = comp.map((j) => j.wait);
    const sojourns = comp.map((j) => j.sojourn);
    const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const pct = (arr, p) => {
      if (!arr.length) return 0;
      const s = arr.slice().sort((a, b) => a - b);
      const idx = Math.min(s.length - 1, Math.floor(p * s.length));
      return s[idx];
    };

    // Delay cost: avoidable waiting converted to truck-days x INR 2,500/day.
    const delayCost = comp.reduce(
      (acc, j) => acc + (j.wait / this.PMD) * this.ex.meta.delayCostPerTruckPerDay, 0
    );

    // Department utilization.
    const deptUtil = {};
    for (const d of this.depts) {
      const capAfterAbs = (() => {
        const b = this.cfg.staffing[d];
        let c = 0;
        for (const s of ["high", "medium", "low"]) {
          c += this.cfg.absenteeism > 0
            ? Math.max(0, b[s] - Math.round(this.cfg.absenteeism * b[s]))
            : b[s];
        }
        return c;
      })();
      deptUtil[d] = capAfterAbs > 0 ? stats.deptBusyMin[d] / (capAfterAbs * effMin) : 0;
    }

    // Time-in-system buckets (days) for validation vs Exhibit 8.
    const buckets = { lt1: 0, gt1: 0, gt2: 0, gt5: 0, gt20: 0 };
    for (const j of comp) {
      const days = j.sojourn / this.PMD;
      if (days < 1) buckets.lt1++;
      if (days > 1) buckets.gt1++;
      if (days > 2) buckets.gt2++;
      if (days > 5) buckets.gt5++;
      if (days > 20) buckets.gt20++;
    }

    return {
      completed: n,
      throughputPerDay: n / effDays,
      avgWaitMin: mean(waits),
      avgWaitDays: mean(waits) / this.PMD,
      p90WaitMin: pct(waits, 0.9),
      avgSojournMin: mean(sojourns),
      avgSojournDays: mean(sojourns) / this.PMD,
      avgQueueLen: stats.qArea / effMin,
      bayUtil: stats.bayBusyMin / (totalBays * effMin),
      deptUtil,
      delayCost,
      buckets,
      dailySnapshots: stats.dailySnapshots,
    };
  }

  // ---------------- Run R replications and aggregate ----------------
  run() {
    const reps = this.cfg.replications;
    const base = this.cfg.seed;
    const runs = [];
    for (let r = 0; r < reps; r++) {
      runs.push(this.runOnce((base + r * 7919) >>> 0)); // 7919 prime stride
    }
    return this.aggregate(runs);
  }

  aggregate(runs) {
    const keysScalar = [
      "completed", "throughputPerDay", "avgWaitMin", "avgWaitDays",
      "p90WaitMin", "avgSojournMin", "avgSojournDays", "avgQueueLen",
      "bayUtil", "delayCost",
    ];
    const agg = { reps: runs.length, perRun: runs };
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = (arr, m) =>
      arr.length > 1
        ? Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1))
        : 0;
    for (const k of keysScalar) {
      const vals = runs.map((r) => r[k]);
      const m = mean(vals);
      const s = sd(vals, m);
      // 95% CI half-width using normal approx (z=1.96).
      agg[k] = { mean: m, sd: s, ci95: 1.96 * s / Math.sqrt(runs.length) };
    }
    // Department utilization averaged across runs.
    agg.deptUtil = {};
    for (const d of this.depts) {
      agg.deptUtil[d] = mean(runs.map((r) => r.deptUtil[d]));
    }
    // Validation buckets averaged across runs.
    const bkeys = ["lt1", "gt1", "gt2", "gt5", "gt20"];
    agg.buckets = {};
    for (const k of bkeys) agg.buckets[k] = mean(runs.map((r) => r.buckets[k]));
    // Use the first run's daily snapshots for the live animation.
    agg.dailySnapshots = runs[0].dailySnapshots;
    return agg;
  }
}
