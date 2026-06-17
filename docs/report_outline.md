# Report Outline (the living Google Doc → final report)

Keep this in sync with the Google Doc. Grow it section-by-section as the project progresses;
it becomes the final report. Each section notes where the content comes from.

1. **Executive summary** — the problem, what we built, headline findings (₹ delay cost saved).
2. **Problem context** — KM workshop pains: manpower idiosyncrasies, bay blocking by accidents,
   festival absenteeism, delay costs. *(from the case)*
3. **Objective & scope** — what's in/out. *(from `PROJECT_GUIDE.md` §3)*
4. **Data & distribution fitting** — turning Exhibits 2/4/5/8 into rates, service-time
   distributions, skill map and worker requirements; the Poisson over-dispersion check.
   *(from `EQUATIONS.md` §2–§4)*
5. **Model & methodology** — the DES architecture, seize/release logic, skill-based service,
   accident time-share, queue policies. *(from `EQUATIONS.md` §5–§8 + `js/sim.js`)*
6. **The tool** — UI walkthrough, the levers and metrics; link to the hosted app.
7. **Validation** — simulated time-in-workshop vs Exhibit 8 buckets; what matches, what doesn't,
   why. *(from `EQUATIONS.md` §11)*
8. **Experiments & results** — answers to management's questions:
   - bays vs mechanics (which relieves delay more, per rupee),
   - separating long jobs (does dedicating bays to accidents reduce blocking?),
   - festival absenteeism robustness,
   - SJF vs FIFO and car-carrier priority,
   - the non-linear delay blow-up near full utilisation.
9. **Recommendations to KM** — right-sized manpower per department, bay policy, festival staffing.
10. **Limitations & future work** — see the assumptions register (`EQUATIONS.md` §12).
11. **Appendix** — full equations (`EQUATIONS.md`), data tables (`data/exhibits.json`).
