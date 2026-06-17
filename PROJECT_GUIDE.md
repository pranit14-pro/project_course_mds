# Project Guide — A Simulation-Based Study of Maintenance Workshop Operations
### (KM Trans Logistics: Workshop Operations — Term IV Project Course)

> **Team:** Jayant Gangwar (B.Tech Aerospace, IIT Kanpur), Pranit Rastogi (B.Tech Chemical, IIT Delhi)
> **Faculty Guide:** Prof. Debjit Roy · **Area:** CTL / Operations Management
> **End deliverable:** A *hosted*, browser-based discrete-event simulation (DES) "playground" for the KM Jaipur workshop, plus a report (the living Google Doc) and a final presentation.
> **Hard deadline signal:** Hosted by **mid-August**. Final presentation **after mid-August**, examined by someone other than Prof. Debjit.

---

## 0. How to read this guide

This is the master plan. It captures (a) what the deliverable is, (b) how we turn the case
exhibits into a working simulation, (c) the week-by-week plan, and (d) the academic/process
requirements (meeting logs, report, presentation). We build the website **step by step** from
this guide. Nothing here is final — the report Google Doc and this guide both keep getting
updated as we learn.

---

## 1. What the professor actually asked for (decoded from meeting notes)

| Professor's note | What it means for us |
|---|---|
| "Google Doc keeps getting updated — eventually becomes the report" | Maintain ONE living report doc. Don't write it at the end; grow it from Week 1. |
| "Post-project presentation required (after mid-Aug) — someone other than Prof. Debjit" | An external examiner judges the final output. It must stand on its own and be self-explanatory. |
| "Submit log of all meetings (≥ every 2 weeks) — date, time, signature, larger objective" | Keep a signed meeting log. No minutes needed — just date, time, signature, the objective discussed. |
| "Think of End Deliverable / Scope of Project" | Lock scope early (Section 3). A hosted, interactive DES tool for KM. |
| **"AI percentage should be less"** | The *intellectual* work — modelling, distribution fitting, the DES logic, validation — must be ours. AI (Claude) is used mainly to scaffold the UI. We must be able to explain every modelling choice. |
| "Similar to Chartered Speed — different resources" | Same *genre* as a prior project (a simulation/analytics tool), but our resources/context = trucks, bays, mechanics, skills. |
| **"Claude — UI (not Littlefield)"** | Use Claude to build the UI. This is NOT a Littlefield-style game; it's an analytical sandbox driven by real case data. |
| **"Challenging part — DES: model interval & service times, allocation of workers"** | This is the graded core. Get the arrival process, service-time distributions, and worker/skill allocation right. |
| "KM case has many exhibits — data should be used to make the distribution" | Every distribution in the model is *fitted from / justified by* an exhibit. No invented numbers. |
| **"Exhibit 2 — type of workers — look at it and model it"** | Skill heterogeneity (high/medium/low across 6 departments) must be an explicit, first-class part of the model. |
| "Week 1 — Interfaces, how will we do simulation" | First milestone: agree the UI layout AND the simulation architecture. |
| "Mid August — Hosted" | Deploy publicly (e.g., GitHub Pages / Netlify / Vercel). |

---

## 2. The problem (from the KM case)

KM's Jaipur workshop maintains **175 trucks** (flatbed steel carriers + car carriers + chassis).
Management cannot decide the *right* number of mechanics, how to allocate trucks to mechanics/bays,
and how to cut truck waiting time — especially around festivals (Diwali) when absenteeism spikes and
long jobs (accidents, 12–20 days) block bays. Each day a truck is delayed costs ~**INR 2,500**.

**Decisions management wants help with → become our simulation's "levers":**
1. How many mechanics per department? (rightsizing manpower)
2. How to allocate trucks → mechanics + bays?
3. How many bays, and should long jobs get dedicated bays?
4. How robust is the system to seasonal absenteeism / demand spikes?

**System-level outputs they care about → our "metrics":**
Truck waiting time, bay utilization, mechanic utilization, throughput, backlog/queue length,
and delay cost (₹2,500/truck/day).

---

## 3. Scope (locked)

**In scope**
- A single-workshop DES of the **Jaipur** workshop.
- Resources modelled: **bays** (8 usual + planned 4 "extra" long-job bays + 1 unused inspection bay)
  and **mechanics** across **6 departments** (Mechanical, Denting, Balancing/Balance-Rod, Electrician,
  Welder, Tire) with **skill levels** (high/medium/low).
- Job types from Exhibit 4 (≈42 job types) with arrival rates, service times (Exhibit 5),
  and department/worker requirements (Exhibit 5 continued).
- Policies: shortest-job-first; car carriers prioritized over flatbed; separation of long jobs to
  extra bays; seasonal absenteeism toggle.
- Interactive controls + live metrics + charts.

**Out of scope (state explicitly in report)**
- Gurgaon workshop, finance/HR fraud modelling, GPS/ERP integration, spare-parts inventory dynamics
  (we treat parts as available, per case: "shortage… generally not a major problem"),
  multi-workshop routing.

---

## 4. Turning the exhibits into a model (the heart of the project)

This is where the "AI percentage" must be low — *we* do this analysis and document it.

### 4.1 Arrival process (Exhibit 4)
- Exhibit 4 gives, per job type, counts of **Flatbed** and **Car Carrier** arrivals over **73 days**
  (1 Apr – 12 Jun 2013) plus a **std. deviation of arrivals/day** and an indicative labour cost.
- **Daily arrival rate** for a job type = (Flatbed + Car) / 73.
- **Modelling choice:** treat each job type's daily count as a counting process.
  - Default: **Poisson arrivals** with λ = mean/day → inter-arrival times ~ Exponential(λ).
  - Validation check: for a Poisson process, mean ≈ variance. Compare the given std.dev against √mean.
    Where std.dev >> √mean (over-dispersion), note it and optionally use a Negative-Binomial / Normal
    daily count. **Document this comparison per job type** — it's exactly the "use the data to make the
    distribution" the professor wants.
- **Priority/segmentation:** keep flatbed vs car-carrier split so we can apply the
  "car carriers > flatbed" priority rule.

### 4.2 Service-time distributions (Exhibit 5)
- Exhibit 5 gives a **mean time (minutes)** per job type for an **expert (skill level 10)** mechanic.
- The case states service times have **low std. dev (CV ≤ 0.3)** EXCEPT **accident, denting, and
  outsourced engine overhaul**, and says "suitable assumptions may be made regarding the distribution."
- **Modelling choice:**
  - Routine jobs: **Lognormal** (or Gamma) with mean from Exhibit 5 and CV ≈ 0.3 (non-negative, mild skew).
  - High-variability jobs (accident, denting, engine overhaul): heavier-tailed Lognormal/Gamma with larger CV;
    accident mean ≈ **6,300 min** (≈15 days) — these are the bay-blockers.
- **Skill scaling (Exhibit 5 note + case text):** expert = skill 10. A skill-4 worker takes
  **10/4 = 2.5×** longer. General rule: **service_time = base_time × (10 / skill_level)**.
  - Map Exhibit 2 categories → skill levels: **High = 10, Medium ≈ 7, Low = 4** (so low = 2.5× expert).
    (We can expose these mappings as parameters and justify them in the report.)

### 4.3 Worker / department requirements (Exhibit 5 continued)
- For each job type, Exhibit 5 (continued) lists how many workers of each department are needed
  (e.g., Clutch Overhaul = 2 Mechanical; Tire = 2 Tire; Battery = 1 Electrician).
- **Accidents are special:** requirements are *fractional* (Mechanical 0.3, Denting 0.7, Balancer 0.1,
  Electrician 0.3, Welder 0.6, Tire 0.1) = pro-rated share of labour across the long job duration.
  Model accidents as occupying a bay for the full duration while drawing fractional labour from several
  departments over that time.

### 4.4 Workforce structure (Exhibit 2 — must be modelled explicitly)
| Department | High | Medium | Low | Total |
|---|---|---|---|---|
| Mechanical | 3 | 8 | 3 | 14 |
| Denting | 3 | 1 | 1 | 5 |
| Balance Rod | 3 | 0 | 0 | 3 |
| Electrician | 3 | 0 | 0 | 3 |
| Welder | 1 | 4 | 1 | 6 |
| Tire | 5 | 0 | 0 | 5 |
| **Total** | **18** | **13** | **5** | **36** |

Each mechanic is a resource with `{department, skill_level}`. Service time depends on the assigned
worker's skill. Allocation logic must respect department requirements per job and (optionally) prefer
faster/idle workers. This table also defines the **default staffing**, which the sliders perturb.

### 4.5 Bays (case text + Exhibits 1 & 3)
- **8 numbered service bays** (general use).
- **1 inspection bay** — effectively unused (drivers won't drive over the pit). Model as optional/disabled.
- **4 planned "extra" bays** — dedicated to long jobs (accident, denting, welding, cabin setting, tire);
  the case says all jobs ≥ 4 days go here. Toggling these on/off is a key experiment
  ("separate long jobs to reduce blocking").

### 4.6 Operating calendar & costs
- Shift: 10:00–19:00 with 2 hrs break → **~7 productive hours/day** per mechanic.
- Jobs ≥ 45 min minimum handling once admitted; <30-min trivial jobs are fixed outside the gate (exclude).
- **Delay opportunity cost = INR 2,500 / truck / day** (a headline output metric).
- Spare-parts lead time ~3 days exists but parts assumed available (out of scope to model stockouts).

### 4.7 Validation targets (Exhibit 8 — so the model isn't a fantasy)
Exhibit 8 gives real time-in-workshop stats for 340 cases: **310 trucks < 1 day, 30 > 1 day, 8 > 2 days,
5 > 5 days, 1 > 20 days**, with mean/SD of minutes spent by max-days bucket. **We calibrate the model so
its simulated time-in-system distribution roughly reproduces these proportions.** This is our reality check.

---

## 5. The deliverable: the simulation playground (UI spec)

A single hosted web page (no backend needed — pure client-side JS so it's trivially hostable).

**Layout (Week-1 interface decision):**
- **Left panel — Controls (levers):**
  - Bays: # general bays, # extra long-job bays (toggle), use inspection bay (toggle).
  - Staffing: # mechanics per department, with skill mix (high/med/low) — defaults from Exhibit 2.
  - Policies: queue discipline (FIFO / Shortest-Job-First), car-carrier priority (toggle),
    long-job separation (toggle).
  - Scenario: demand multiplier, **seasonal absenteeism %** (festival mode), simulation horizon (days),
    # replications, random seed.
- **Center — Run + live state:** Run/Pause/Reset, sim clock, animated bay occupancy + department queues.
- **Right / bottom — Metrics & charts:**
  - Avg & 90th-percentile truck waiting time, throughput/day, backlog over time,
    bay utilization, mechanic utilization by department, **total delay cost (₹)**,
    time-in-system histogram (overlaid with Exhibit-8 targets for validation).
- **Top — Scenario compare:** save scenario A vs B (e.g., "+4 bays" vs "+5 mechanics") side by side.

**Tech (kept simple & hostable):**
- Plain **HTML + CSS + vanilla JS** (or a light setup with Vite). Charts via a small lib (Chart.js).
- A self-contained **DES engine module** (event queue / future-event list) — the graded core, written by us.
- Case data (exhibits) stored as a JSON file we generate from the exhibits.
- Deterministic given a seed (seeded RNG) so results are reproducible for the report.

---

## 6. Simulation architecture (the DES engine)

Event-scheduling DES with a **future-event list (FEL)** ordered by time:

- **Entities:** Truck (job) with `{type, carrier_class, arrival_time, required_departments, base_service_time}`.
- **Resources:** Bays (general/extra), Mechanics (`department`, `skill`).
- **Event types:** `ARRIVAL`, `START_SERVICE` (seize bay + required mechanics), `END_SERVICE`
  (release resources, record stats), `END_DAY`/shift boundaries, `WORKER_ABSENT` (festival mode).
- **Core loop:** pop earliest event → update clock → handle event → schedule follow-ups → repeat until horizon.
- **Seizing logic:** a job starts only when (a) a suitable bay is free and (b) all required department
  workers are available (respecting skill → speed). Long jobs route to extra bays if separation is on.
- **RNG:** seeded; sample inter-arrivals (Exponential), service times (Lognormal/Gamma), with skill scaling.
- **Stats:** time-weighted utilization, waiting time per truck, queue lengths, cost accumulators;
  multiple replications → means + confidence intervals.

We will document the engine with a small diagram and pseudocode in the report (shows it's our work).

---

## 7. Week-by-week plan (now → mid-August)

| Phase | Weeks | Goal | Output |
|---|---|---|---|
| **W1 — Interfaces & approach** | 1 | Agree UI wireframe + DES architecture (this guide's §5–§6). Build static UI shell with dummy data. | Wireframe, repo scaffold, hosted "hello" page. |
| **W2 — Data layer** | 2 | Digitize ALL exhibits into clean JSON; fit/justify arrival & service distributions (§4.1–4.3); skill mapping. | `data/exhibits.json`, a short "distribution fitting" note for the report. |
| **W3–4 — DES engine** | 3–4 | Implement the engine (FEL, seize/release, skill scaling, accident fractional labour). Unit-test with a tiny known case. | Working `sim.js`, console-validated. |
| **W5 — Integration** | 5 | Wire engine to UI controls; live metrics + charts; seeded reproducibility. | Interactive end-to-end tool. |
| **W6 — Validation** | 6 | Calibrate to Exhibit 8; reproduce ≈310/30/8/5/1 day buckets; sanity-check utilization. | Validation section in report. |
| **W7 — Experiments** | 7 | Run the management questions: bays vs mechanics, long-job separation, festival absenteeism, priority rules. | Results tables/plots + insights. |
| **W8 — Polish & host** | 8 | UX polish, scenario compare, deploy publicly, write-up. | **Hosted tool (mid-Aug)** + report draft. |
| **Post** | — | Rehearse + deliver presentation to external examiner. | Slides + demo. |

> Buffer: the DES engine (W3–4) is the riskiest piece — protect that time. Everything else can slip; this can't.

---

## 8. Process & academic requirements (don't lose marks here)

1. **Meeting log** — `docs/meeting_log.md` (or a sheet): every prof meeting ≥ biweekly with
   **date, time, larger objective, signature** column. Bring it to each meeting.
2. **Living report (Google Doc)** — start now; sections mirror this guide
   (Problem → Data/Distributions → Model → Validation → Experiments → Insights → Recommendations).
   Update after each phase.
3. **Low AI footprint** — keep our own derivations (distribution fitting, engine logic, validation)
   clearly authored by us; use Claude mainly for UI scaffolding and boilerplate. Be ready to explain
   every number and every modelling choice in the presentation.
4. **Hosting** — public URL by mid-August (GitHub Pages is simplest for a static client-side app).
5. **Presentation** — self-contained story for an examiner who hasn't seen the case:
   problem → approach → live demo → key findings (₹ savings from right-sizing) → recommendations to KM.

---

## 9. Immediate next steps (what we do right after you approve this guide)

1. **W1 deliverable:** scaffold the repo and build the **static UI shell** + agree the wireframe
   (so we have something to show in the Week-1 prof meeting on "interfaces").
2. **Create `data/exhibits.json`** from the exhibits (I've already extracted all exhibit tables).
3. **Stub the DES engine module** with the event loop and clear TODOs, so the architecture is concrete.
4. Set up `docs/meeting_log.md` and a report outline.

> Tell me to proceed and I'll start with Step 1 (repo scaffold + UI shell + exhibits JSON), keeping the
> graded DES core as our own clearly-documented work.
