# KM Trans Workshop — Discrete-Event Simulation Playground

An interactive, browser-based **discrete-event simulation (DES)** of the KM Trans Logistics
maintenance workshop (Jaipur), built for the Term IV Project Course under Prof. Debjit Roy.

> **Team:** Jayant Gangwar (IIT Kanpur) · Pranit Rastogi (IIT Delhi)

Adjust bays, mechanics (by department and skill), policies and seasonal scenarios with
sliders, press **Run**, and instantly see waiting time, backlog, utilisation, delay cost and a
day-by-day animation — all driven by distributions fitted from the case exhibits.

## What's here

| File | Purpose |
|---|---|
| `index.html` | The app (controls, KPIs, charts, animation). |
| `js/sim.js` | **The DES engine** — arrivals, service, skill-based worker allocation, bays, policies. |
| `js/distributions.js` | Exponential arrivals + Lognormal service times (fitted from exhibits). |
| `js/rng.js` | Seeded RNG (reproducible runs). |
| `js/app.js` | UI wiring, charts (Chart.js), animation. |
| `js/exhibits-data.js` / `data/exhibits.json` | Case data (Exhibits 2, 4, 5, 8). |
| `EQUATIONS.md` | **Every equation and the logic behind it.** |
| `PROJECT_GUIDE.md` | The overall project plan / roadmap. |
| `docs/` | Meeting log and report outline. |

## Run locally

No build step. Just open `index.html` in a browser, **or** serve it (recommended so charts/CDN load cleanly):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

The case data is embedded in `js/exhibits-data.js`, so the app works from `file://` too. The
only external dependency is **Chart.js via CDN** (needs internet for the charts).

## Host it (mid-August deliverable)

It's a pure static site — host it free on **GitHub Pages**:

1. Push this repo to GitHub.
2. Settings → Pages → Source: deploy from branch → pick the branch and `/ (root)`.
3. Your tool is live at `https://<user>.github.io/<repo>/`.

(Netlify / Vercel / any static host work identically — drag-and-drop the folder.)

## How to read the model

Start with `EQUATIONS.md` (the math + reasoning), then `js/sim.js` (the engine). Defaults
reproduce the case: 8 general + 4 extra bays, 36 mechanics across 6 departments (Exhibit 2),
shortest-job-first with car-carrier priority, 73-day horizon. The "Time-in-workshop vs case"
chart validates the model against Exhibit 8.
