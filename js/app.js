// app.js — UI wiring: reads the control panel, runs the DES, renders KPIs,
// charts (Chart.js) and the day-by-day animation. No modelling logic lives
// here; all of that is in sim.js / distributions.js.

const DEPTS = EXHIBITS.meta.departments;

// ----- Default configuration (drawn straight from the case exhibits) -----
function defaultConfig() {
  const staffing = {};
  for (const d of DEPTS) {
    const m = EXHIBITS.workerSkillMap[d];
    staffing[d] = { high: m.high, medium: m.medium, low: m.low };
  }
  return {
    generalBays: 8,        // 8 numbered service bays (case)
    extraBays: 4,          // 4 planned dedicated long-job bays (case)
    useInspectionBay: false,
    separateLongJobs: true,
    staffing,
    discipline: "SJF",
    carrierPriority: true,
    demandMultiplier: 1.0,
    absenteeism: 0.0,
    simDays: 73,           // matches the Exhibit 4 observation window
    warmupDays: 5,
    replications: 8,
    seed: 12345,
  };
}

let lastResult = null;
let scenarios = { A: null, B: null };

// ----- Build staffing inputs -----
function buildStaffingInputs() {
  const wrap = document.getElementById("staffing");
  wrap.innerHTML =
    '<div class="staff-head"><span></span><span>High</span><span>Med</span><span>Low</span></div>';
  for (const d of DEPTS) {
    const m = EXHIBITS.workerSkillMap[d];
    const row = document.createElement("div");
    row.className = "staff-row";
    row.innerHTML =
      `<span class="dname">${d}</span>` +
      `<input type="number" min="0" id="st_${d}_high" value="${m.high}">` +
      `<input type="number" min="0" id="st_${d}_medium" value="${m.medium}">` +
      `<input type="number" min="0" id="st_${d}_low" value="${m.low}">`;
    wrap.appendChild(row);
  }
  wrap.addEventListener("input", updateStaffTotal);
}
function updateStaffTotal() {
  let t = 0;
  for (const d of DEPTS)
    for (const s of ["high", "medium", "low"])
      t += Number(document.getElementById(`st_${d}_${s}`).value) || 0;
  document.getElementById("staffTotal").textContent = `Total mechanics: ${t} (case default: 36)`;
}

// ----- Bind range/select/checkbox controls -----
const SLIDERS = ["generalBays","extraBays","demandMultiplier","absenteeism","simDays","warmupDays","replications"];
function setControlsFromConfig(cfg) {
  document.getElementById("generalBays").value = cfg.generalBays;
  document.getElementById("extraBays").value = cfg.extraBays;
  document.getElementById("useInspectionBay").checked = cfg.useInspectionBay;
  document.getElementById("separateLongJobs").checked = cfg.separateLongJobs;
  document.getElementById("discipline").value = cfg.discipline;
  document.getElementById("carrierPriority").checked = cfg.carrierPriority;
  document.getElementById("demandMultiplier").value = cfg.demandMultiplier;
  document.getElementById("absenteeism").value = cfg.absenteeism;
  document.getElementById("simDays").value = cfg.simDays;
  document.getElementById("warmupDays").value = cfg.warmupDays;
  document.getElementById("replications").value = cfg.replications;
  document.getElementById("seed").value = cfg.seed;
  for (const d of DEPTS)
    for (const s of ["high", "medium", "low"])
      document.getElementById(`st_${d}_${s}`).value = cfg.staffing[d][s];
  refreshSliderLabels();
  updateStaffTotal();
}
function refreshSliderLabels() {
  document.getElementById("generalBaysVal").textContent = document.getElementById("generalBays").value;
  document.getElementById("extraBaysVal").textContent = document.getElementById("extraBays").value;
  document.getElementById("demandMultiplierVal").textContent = Number(document.getElementById("demandMultiplier").value).toFixed(1) + "×";
  document.getElementById("absenteeismVal").textContent = Math.round(document.getElementById("absenteeism").value * 100) + "%";
  document.getElementById("simDaysVal").textContent = document.getElementById("simDays").value;
  document.getElementById("warmupDaysVal").textContent = document.getElementById("warmupDays").value;
  document.getElementById("replicationsVal").textContent = document.getElementById("replications").value;
}

function readConfig() {
  const staffing = {};
  for (const d of DEPTS) {
    staffing[d] = {
      high: Number(document.getElementById(`st_${d}_high`).value) || 0,
      medium: Number(document.getElementById(`st_${d}_medium`).value) || 0,
      low: Number(document.getElementById(`st_${d}_low`).value) || 0,
    };
  }
  return {
    generalBays: +document.getElementById("generalBays").value,
    extraBays: +document.getElementById("extraBays").value,
    useInspectionBay: document.getElementById("useInspectionBay").checked,
    separateLongJobs: document.getElementById("separateLongJobs").checked,
    staffing,
    discipline: document.getElementById("discipline").value,
    carrierPriority: document.getElementById("carrierPriority").checked,
    demandMultiplier: +document.getElementById("demandMultiplier").value,
    absenteeism: +document.getElementById("absenteeism").value,
    simDays: +document.getElementById("simDays").value,
    warmupDays: +document.getElementById("warmupDays").value,
    replications: +document.getElementById("replications").value,
    seed: +document.getElementById("seed").value || 1,
  };
}

// ----- Run -----
function run() {
  const cfg = readConfig();
  const sim = new WorkshopSimulation(EXHIBITS, cfg);
  const t0 = performance.now();
  const res = sim.run();
  res._ms = Math.round(performance.now() - t0);
  res._cfg = cfg;
  lastResult = res;
  renderKpis(res);
  renderCharts(res);
  setupAnimation(res);
}

// ----- KPIs -----
function kpi(label, value, ci, cls) {
  return `<div class="kpi ${cls || ""}"><div class="label">${label}</div>` +
    `<div class="num">${value}</div>${ci ? `<div class="ci">${ci}</div>` : ""}</div>`;
}
function renderKpis(r) {
  const ciStr = (o, unit, dp = 2) => `95% CI ±${o.ci95.toFixed(dp)}${unit || ""}`;
  const waitCls = r.avgWaitDays.mean > 1 ? "bad" : r.avgWaitDays.mean > 0.3 ? "warn" : "good";
  const utilCls = r.bayUtil.mean > 0.9 ? "bad" : r.bayUtil.mean > 0.75 ? "warn" : "good";
  const html = [
    kpi("Avg truck waiting time",
      r.avgWaitDays.mean.toFixed(2) + " days",
      `${r.avgWaitMin.mean.toFixed(0)} min · ${ciStr(r.avgWaitDays, "d")}`, waitCls),
    kpi("90th-percentile wait",
      (r.p90WaitMin.mean / EXHIBITS.meta.productiveMinutesPerDay).toFixed(2) + " days",
      `${r.p90WaitMin.mean.toFixed(0)} min`, waitCls),
    kpi("Throughput", r.throughputPerDay.mean.toFixed(1) + " /day",
      ciStr(r.throughputPerDay, "", 2), "good"),
    kpi("Avg backlog (queue)", r.avgQueueLen.mean.toFixed(1) + " jobs",
      ciStr(r.avgQueueLen, "", 2)),
    kpi("Bay utilisation", (r.bayUtil.mean * 100).toFixed(1) + "%",
      ciStr({ ci95: r.bayUtil.ci95 * 100 }, "%", 1), utilCls),
    kpi("Delay cost", "₹" + Math.round(r.delayCost.mean).toLocaleString("en-IN"),
      `over ${r._cfg.simDays - r._cfg.warmupDays} measured days · ` + ciStr({ ci95: r.delayCost.ci95 }, "", 0), waitCls),
  ].join("");
  document.getElementById("kpis").innerHTML = html;
}

// ----- Charts -----
let charts = {};
function destroyCharts() { for (const k in charts) { charts[k].destroy(); } charts = {}; }
function renderCharts(r) {
  destroyCharts();
  const days = r.dailySnapshots.map((s) => s.day);

  charts.queue = new Chart(document.getElementById("queueChart"), {
    type: "line",
    data: { labels: days, datasets: [{ label: "Waiting jobs", data: r.dailySnapshots.map((s) => s.queueLen),
      borderColor: "#ffb454", backgroundColor: "rgba(255,180,84,.15)", fill: true, tension: .2, pointRadius: 0 }] },
    options: lineOpts("Day", "Jobs waiting"),
  });

  charts.bay = new Chart(document.getElementById("bayChart"), {
    type: "line",
    data: { labels: days, datasets: [
      { label: "Bays busy", data: r.dailySnapshots.map((s) => s.baysBusy),
        borderColor: "#4f9cff", backgroundColor: "rgba(79,156,255,.15)", fill: true, tension: .2, pointRadius: 0 },
      { label: "Total bays", data: r.dailySnapshots.map((s) => s.baysTotal),
        borderColor: "#5a6b80", borderDash: [5, 4], pointRadius: 0, fill: false }] },
    options: lineOpts("Day", "Bays"),
  });

  charts.util = new Chart(document.getElementById("utilChart"), {
    type: "bar",
    data: { labels: DEPTS, datasets: [{ label: "Utilisation %",
      data: DEPTS.map((d) => +(r.deptUtil[d] * 100).toFixed(1)),
      backgroundColor: DEPTS.map((d) => r.deptUtil[d] > 0.9 ? "#ff6b6b" : r.deptUtil[d] > 0.7 ? "#ffb454" : "#38d39f") }] },
    options: { ...barOpts("Department", "Utilisation %"), scales: { ...barOpts().scales, y: { beginAtZero: true, max: 100, ticks: { color: "#9fb0c3" }, grid: { color: "#2b3a4d" } } } },
  });

  // Validation vs Exhibit 8 — convert case counts to the same horizon scale
  // by expressing both as PERCENTAGE of completed trucks.
  const ex8 = EXHIBITS.validationExhibit8;
  const exTotal = ex8.totalCases;
  const casecum = { lt1: 310, gt1: 30, gt2: 8, gt5: 5, gt20: 1 };
  const simTotal = r.completed.mean || 1;
  const labels = ["<1 day", ">1 day", ">2 days", ">5 days", ">20 days"];
  const keys = ["lt1", "gt1", "gt2", "gt5", "gt20"];
  charts.valid = new Chart(document.getElementById("validChart"), {
    type: "bar",
    data: { labels, datasets: [
      { label: "Simulation %", data: keys.map((k) => +(100 * r.buckets[k] / simTotal).toFixed(2)), backgroundColor: "#4f9cff" },
      { label: "Case Exhibit 8 %", data: keys.map((k) => +(100 * casecum[k] / exTotal).toFixed(2)), backgroundColor: "#38d39f" }] },
    options: barOpts("Time in workshop", "% of trucks"),
  });
}
function lineOpts(x, y) {
  return { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#e6edf3" } } },
    scales: { x: { title: { display: true, text: x, color: "#9fb0c3" }, ticks: { color: "#9fb0c3", maxTicksLimit: 12 }, grid: { color: "#22303f" } },
              y: { title: { display: true, text: y, color: "#9fb0c3" }, ticks: { color: "#9fb0c3" }, grid: { color: "#22303f" }, beginAtZero: true } } };
}
function barOpts(x, y) {
  return { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#e6edf3" } } },
    scales: { x: { title: { display: true, text: x, color: "#9fb0c3" }, ticks: { color: "#9fb0c3" }, grid: { display: false } },
              y: { title: { display: true, text: y, color: "#9fb0c3" }, ticks: { color: "#9fb0c3" }, grid: { color: "#22303f" }, beginAtZero: true } } };
}

// ----- Day-by-day animation on a canvas -----
let animState = { snaps: null, day: 1, playing: false, raf: null };
function setupAnimation(r) {
  animState.snaps = r.dailySnapshots;
  const scrub = document.getElementById("dayScrub");
  scrub.min = 1; scrub.max = r.dailySnapshots.length; scrub.value = 1;
  animState.day = 1;
  drawAnim();
}
function drawAnim() {
  const c = document.getElementById("animCanvas");
  const ctx = c.getContext("2d");
  const W = c.width = c.clientWidth; const H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (!animState.snaps) return;
  const s = animState.snaps[animState.day - 1];
  document.getElementById("dayLabel").textContent =
    `Day ${s.day}/${animState.snaps.length} · ${s.baysBusy}/${s.baysTotal} bays busy · ${s.queueLen} waiting`;
  document.getElementById("dayScrub").value = animState.day;

  // Draw bays as a row of cells (filled = busy).
  const n = s.baysTotal; const pad = 16; const gap = 8;
  const cellW = Math.min(48, (W - pad * 2 - gap * (n - 1)) / n);
  const cellH = 46; const y = 26;
  ctx.fillStyle = "#9fb0c3"; ctx.font = "12px sans-serif";
  ctx.fillText("Bays", pad, 18);
  for (let i = 0; i < n; i++) {
    const x = pad + i * (cellW + gap);
    const busy = i < s.baysBusy;
    ctx.fillStyle = busy ? "#4f9cff" : "#26354a";
    ctx.strokeStyle = "#2b3a4d";
    roundRect(ctx, x, y, cellW, cellH, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = busy ? "#fff" : "#5a6b80";
    ctx.fillText("🚚", x + cellW / 2 - 9, y + cellH / 2 + 5);
  }
  // Draw the waiting queue as a bar of trucks below.
  const qy = y + cellH + 24;
  ctx.fillStyle = "#9fb0c3"; ctx.fillText("Waiting queue", pad, qy - 6);
  const qn = Math.min(s.queueLen, 40);
  for (let i = 0; i < qn; i++) {
    const x = pad + i * 14;
    ctx.fillStyle = "#ffb454";
    roundRect(ctx, x, qy, 10, 16, 3); ctx.fill();
  }
  if (s.queueLen > 40) { ctx.fillStyle = "#ffb454"; ctx.fillText("+" + (s.queueLen - 40), pad + 40 * 14 + 6, qy + 13); }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function playAnim() {
  if (!animState.snaps) return;
  animState.playing = !animState.playing;
  document.getElementById("playBtn").textContent = animState.playing ? "⏸ Pause" : "▶ Play";
  const step = () => {
    if (!animState.playing) return;
    animState.day++;
    if (animState.day > animState.snaps.length) { animState.day = 1; }
    drawAnim();
    animState.raf = setTimeout(() => requestAnimationFrame(step), 180);
  };
  if (animState.playing) step();
}

// ----- Scenario compare -----
function saveScenario(slot) {
  if (!lastResult) { alert("Run a simulation first."); return; }
  scenarios[slot] = {
    label: slot,
    avgWaitDays: lastResult.avgWaitDays.mean,
    p90Days: lastResult.p90WaitMin.mean / EXHIBITS.meta.productiveMinutesPerDay,
    throughput: lastResult.throughputPerDay.mean,
    backlog: lastResult.avgQueueLen.mean,
    bayUtil: lastResult.bayUtil.mean,
    delayCost: lastResult.delayCost.mean,
    cfg: `${lastResult._cfg.generalBays}+${lastResult._cfg.extraBays} bays, ` +
         `${totalStaff(lastResult._cfg)} mech, abs ${Math.round(lastResult._cfg.absenteeism*100)}%`,
  };
  renderCompare();
}
function totalStaff(cfg) {
  let t = 0; for (const d of DEPTS) for (const s of ["high","medium","low"]) t += cfg.staffing[d][s]; return t;
}
function renderCompare() {
  const box = document.getElementById("compareBox");
  const A = scenarios.A, B = scenarios.B;
  if (!A && !B) return;
  const rows = [
    ["Config", (A?A.cfg:"—"), (B?B.cfg:"—")],
    ["Avg wait (days)", fmt(A,"avgWaitDays",2), fmt(B,"avgWaitDays",2)],
    ["P90 wait (days)", fmt(A,"p90Days",2), fmt(B,"p90Days",2)],
    ["Throughput /day", fmt(A,"throughput",1), fmt(B,"throughput",1)],
    ["Avg backlog", fmt(A,"backlog",1), fmt(B,"backlog",1)],
    ["Bay util %", A?(A.bayUtil*100).toFixed(1):"—", B?(B.bayUtil*100).toFixed(1):"—"],
    ["Delay cost ₹", A?Math.round(A.delayCost).toLocaleString("en-IN"):"—", B?Math.round(B.delayCost).toLocaleString("en-IN"):"—"],
  ];
  box.classList.remove("hint");
  box.innerHTML = `<table class="compare-table"><tr><th>Metric</th><th>A</th><th>B</th></tr>` +
    rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("") + `</table>`;
}
function fmt(s, k, dp) { return s ? s[k].toFixed(dp) : "—"; }

// ----- Wire up -----
function init() {
  buildStaffingInputs();
  setControlsFromConfig(defaultConfig());
  SLIDERS.forEach((id) => document.getElementById(id).addEventListener("input", refreshSliderLabels));
  document.getElementById("runBtn").addEventListener("click", run);
  document.getElementById("resetBtn").addEventListener("click", () => setControlsFromConfig(defaultConfig()));
  document.getElementById("playBtn").addEventListener("click", playAnim);
  document.getElementById("dayScrub").addEventListener("input", (e) => {
    animState.day = +e.target.value; drawAnim();
  });
  document.getElementById("saveA").addEventListener("click", () => saveScenario("A"));
  document.getElementById("saveB").addEventListener("click", () => saveScenario("B"));
}
document.addEventListener("DOMContentLoaded", init);
