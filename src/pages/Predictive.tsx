import { useState } from "react";
import Chart from "../Chart";
import { Card, cnt, Kpi, Legend, PageHead, Segmented, TableView } from "../ui";
import { axis, base, num, PALETTE, pct } from "../theme";
import type { Props } from "../App";

/* Predictive modeling & evaluation (docs/NEOSTAY_PREDICTIVE_INTELLIGENCE.md §19). Every number comes from
   data/processed/ml/predictive/results.json (python -m acuity_predict.study): actual runs on the real Center 6
   test period (2026-07-18 to 2026-09-30, never used for any choice). */

const RAT = ["1:3-4", "1:3", "1:2-3", "1:2", "1:1"];
const EXP: Record<string, string> = { A: "Synthetic only", B: "Real only", C: "Real + synthetic" };
const MODEL: Record<string, string> = { logit: "Logistic hazard", gbm: "Gradient-boosted hazard", ensemble: "Ensemble" };
const STATUS_CLS: Record<string, string> = { "real-data retrospectively evaluated": "info", "internally evaluated": "warn", trained: "warn", experimental: "warn",
  "approved for a specified intended use": "good", "clinical review required": "warn", "prospective silent validation": "info" };

function Explain({ level, simple, technical }: { level: string; simple: React.ReactNode; technical: React.ReactNode }) {
  return <div className="note" style={{ marginTop: 0, marginBottom: 14 }}>{level === "simple" ? simple : technical}</div>;
}

const sub = () => location.hash.slice(1).split("/")[1] || "overview";

export default function Predictive({ data, mode, center }: Props) {
  const p = PALETTE[mode];
  const pr = data.predictive;
  const [level, setLevel] = useState("simple");
  const [replay, setReplay] = useState(0);
  const [dep, setDep] = useState("ga_weeks");
  const [smode, setSmode] = useState("daily");
  if (!pr) return <div className="empty">No predictive results yet: run `python -m acuity_predict.study` in acuity-models.</div>;
  const R = pr.results, reg = pr.registry, rd = pr.readiness;
  const S = R.survival?.modes?.[smode];
  const J = R.journey, T = R.tcn, H = R.hospital;
  const v = sub();
  const realCenter = !center || center.has_real_data;
  const banner = !realCenter && <div className="banner scenario"><b>{center.name}</b><span>EVALUATION IS FOR CENTER 6 ONLY</span><p>These models were trained and evaluated on Center 6 data. Their performance at {center.name} is unknown; forecasts for it are simulated scenarios.</p></div>;
  const head = (title: string, lead: string) => (
    <><PageHead eyebrow="Predictive modeling & evaluation" title={title} lead={lead} />{banner}
      <div className="row" style={{ marginBottom: 12 }}><Segmented value={level} onChange={setLevel} options={[{ key: "simple", label: "Simple explanation" }, { key: "technical", label: "Technical explanation" }]} />
        <span className="badge">Test period: 2026-07-18 to 2026-09-30 (real, Center 6) · retrospective evaluation, not clinical validation</span></div></>);

  // ---------------------------------------------------------------- A. Overview
  if (v === "overview") {
    const best = [
      ["Leaving the unit (daily updates)", `Logistic hazard, IBS ${num(S && R.survival.modes.daily.experiments.B.logit.ibs, 3)}; gradient-boosted chosen on validation (${num(R.survival.modes.daily.experiments.B.gbm.ibs, 3)})`],
      ["Leaving the unit (at admission)", `Gradient-boosted hazard, IBS ${num(R.survival.modes.admission.experiments.B.gbm.ibs, 3)}`],
      ["Nurse ratio, day 1", `Development lookup table, log loss ${num(J?.baselines.empirical.ratio_d1.log_loss, 3)}`],
      ["Nurse ratio, days 3 and 7", `TCN, log loss ${num(T?.experiments.C.ratio.ratio_d3.log_loss, 3)} / ${num(T?.experiments.B.ratio.ratio_d7.log_loss, 3)}`],
      ["Census, 1-7 days", `Persistence (today's census) — the engine did not beat it`],
      ["Census, 30 days", `Development mean (MAE ${num(H?.metrics["30"].dev_mean_mae, 2)}); engine ${num(H?.metrics["30"].mae, 2)}`],
    ];
    return (
      <>{head("Forecasting overview", "What the models predict, which were trained, how they performed on unseen real data, and what the data can and cannot support.")}
        <Explain level={level} simple={<>We trained models to predict when a baby leaves the unit, the nurse ratio in the coming days, and how many babies and nurses the unit will need. Each was tested on the last 75 days of real Center 6 boards, which none of them saw while learning. Some models beat simple rules; some did not — both results are shown.</>}
          technical={<>Chronological split: development = boards before 2026-07-18 (200 stays, 3,585 daily origins), test = 75 days after (105 stays, 1,543 daily origins). Tuning, recalibration and ensemble weights use only the last 45 development days. Experiments A/B/C: synthetic-only, real-only, augmented. Bootstrap CIs resample stays.</>} />
        <div className="kpis">
          <Kpi label="Models registered" value={`${reg?.models.length ?? 0}`} sub="none approved for clinical use" />
          <Kpi label="Test babies" value={`${rd?.origins.daily.test.stays}`} sub={`${num(rd?.origins.daily.test.origins, 0)} daily predictions`} />
          <Kpi label="Development babies" value={`${rd?.origins.daily.development.stays}`} sub={`${num(rd?.origins.daily.development.origins, 0)} daily origins`} />
          <Kpi label="Best leaving-the-unit IBS" value={num(R.survival.modes.daily.experiments.B.logit.ibs, 3)} sub={`vs ${num(R.survival.modes.daily.kaplan_meier.ibs, 3)} with no features (lower is better)`} />
        </div>
        <div className="grid">
          <Card wide n={cnt(rd?.tasks.length, "tasks")} title="What the data can support" sub="Model-readiness audit of the real Center 6 boards">
            <TableView open head={["Prediction task", "Status", "Why"]} rows={(rd?.tasks || []).map((t: any) => [t.task, t.status, t.why])} />
          </Card>
          <Card wide title="Best-supported model by task" sub="On the real test period; the simplest adequate model is preferred">
            <TableView open head={["Task", "Best-supported"]} rows={best} />
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- B. Training and experiments
  if (v === "experiments") {
    const rows: any[] = [];
    for (const md of ["admission", "daily"]) for (const e of ["A", "B", "C"]) for (const k of ["logit", "gbm"]) {
      const s = R.survival.modes[md].experiments[e][k];
      rows.push([md, EXP[e], MODEL[k], num(s.ibs, 4), s.ibs_ci ? `${num(s.ibs_ci[0], 3)}–${num(s.ibs_ci[1], 3)}` : "", num(s.c_index, 3), pct(s.coverage_80, 0), JSON.stringify(s.tuning.chosen), s.seeds ? s.seeds.ibs.map((x: number) => num(x, 3)).join(" / ") : ""]);
    }
    const curve = T?.experiments[level === "simple" ? "B" : "B"].curve || [];
    const cOpt = { ...base(mode), legend: { show: false }, grid: { left: 44, right: 12, top: 14, bottom: 36 },
      xAxis: { type: "category", data: curve.map((c: any) => c.epoch), name: "epoch", nameLocation: "middle", nameGap: 22, ...axis(mode) },
      yAxis: { type: "value", ...axis(mode), axisLine: { show: false }, scale: true },
      series: [{ name: "Training loss", type: "line", data: curve.map((c: any) => c.train_loss), lineStyle: { color: p.series[1] }, itemStyle: { color: p.series[1] } },
        { name: "Validation loss", type: "line", data: curve.map((c: any) => c.validation_loss), lineStyle: { color: p.series[0] }, itemStyle: { color: p.series[0] } }] };
    return (
      <>{head("Training and experiments", "Every model trained three ways and scored on the same real test babies.")}
        <Explain level={level} simple={<>"Synthetic only" models learned from simulated babies; "Real only" from real development boards; "Real + synthetic" from both. All were tested on the same real babies. Adding synthetic data helped some predictions (short-term nurse ratio) and not others.</>}
          technical={<>Survival: person-period discrete-time hazards (30 days), Platt-recalibrated on development validation, refitted on all training data; grid search on validation IBS; gradient-boosted models over 3 seeds. Synthetic: Center 6 large-scale dataset from development-fitted generators (600 stays daily, 4,000 admissions). TCN: Adam, weight decay 1e-4, early stopping (patience 8).</>} />
        <div className="grid">
          <Card wide n={`${R.survival.modes.daily.n.test_origins} daily / ${R.survival.modes.admission.n.test_origins} admission test origins`} title="Leaving the unit: all experiments" sub="Integrated Brier score (IBS, lower is better) with 95% bootstrap interval over stays; C-index; share of actual stays inside the predicted 80% range">
            <TableView open head={["Mode", "Training data", "Model", "Test IBS", "95% CI", "C-index", "80% coverage", "Chosen settings", "IBS over seeds"]} rows={rows} />
          </Card>
          <Card n={`${T?.n.development_origins} training / ${T?.n.validation_origins} validation origins`} title="TCN training curve (real only)" sub="Early stopping keeps the epoch with the lowest validation loss" right={<Legend items={[{ color: p.series[1], label: "Training" }, { color: p.series[0], label: "Validation" }]} />}>
            <Chart option={cOpt} height={240} label="TCN loss curve" />
          </Card>
          <Card n={`${J?.n.test_origins} test origins`} title="Journey model and TCN runs" sub="Seconds per experiment (three seeds each)">
            <TableView open head={["Model", "Experiment", "Seconds", "Notes"]} rows={[...["A", "B", "C"].map((e) => ["Journey (multistate)", EXP[e], num(J?.experiments[e].seconds, 0), `invalid trajectories ${pct(J?.experiments[e].invalid_trajectory_rate, 2)}`]),
              ...["A", "B", "C"].map((e) => ["TCN", EXP[e], num(T?.experiments[e].seconds, 0), `${T?.experiments[e].epochs} epochs`]),
              ["Hospital engine", "B", num(H?.seconds, 0), `${H?.origins} origins × ${H?.scenarios_per_origin} scenarios`]]} />
            <div className="note">Warnings: LightGBM could not load (needs the system OpenMP library); scikit-learn's histogram gradient boosting (the same algorithm family) was used. The SHAP package conflicts with NumPy 2; attributions use our own Monte Carlo Shapley.</div>
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- C. Architectures
  if (v === "architectures") {
    const boxes = (items: string[], color: string) => (
      <svg viewBox={`0 0 ${items.length * 150} 70`} width="100%" height="76" role="img" aria-label="architecture">
        {items.map((t, i) => (<g key={t}><rect x={i * 150 + 4} y={10} width={130} height={50} rx={10} fill={color + "22"} stroke={color} />
          <text x={i * 150 + 69} y={39} textAnchor="middle" fontSize="11" fill={p.ink}>{t}</text>
          {i < items.length - 1 && <path d={`M${i * 150 + 136} 35 L${i * 150 + 152} 35`} stroke={p.muted} markerEnd="url(#a)" />}</g>))}
        <defs><marker id="a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill={p.muted} /></marker></defs>
      </svg>);
    return (
      <>{head("Model architectures", "What goes in, what comes out, and the main assumption of each model.")}
        <div className="grid">
          <Card wide title="Discrete-time survival (logistic and gradient-boosted)" sub="Event: leaving the unit; competing risks not estimable (exit type not recorded)">
            {boxes(["Board features", "+ day basis", "Hazard per day", "Platt recalibration", "S(d) = Π(1−h)"], p.series[0])}
            <div className="note">Inputs: {(R.survival.modes.daily.features || []).length} features at the origin board. Output: probability of leaving by day 1–30, median and 80% range. Assumption: hazards depend only on the origin features and the day.</div>
          </Card>
          <Card wide title="Multistate patient journey" sub="Boosted transition models of the hybrid generator, simulated shift by shift">
            {boxes(["Today's board", "Ratio → breathing → feeding …", "Flags, weight", "Leave? (stop)", "Daily distributions"], p.series[1])}
            <div className="note">Output: for each day, the distribution of nurse ratio, breathing support, feeding and the chance of still being in the unit, from {J?.paths_per_origin} simulated futures per baby. Assumption: the next board depends on today's board and age (first order).</div>
          </Card>
          <Card wide title="Temporal convolutional network" sub={`${num(T?.architecture.parameters, 0)} parameters`}>
            {boxes(["28-shift history + mask", "Dilated causal conv ×4", "+ static features", "Hazard head (30 d)", "Ratio head (1, 3, 7 d)"], p.series[2])}
            <div className="note">Channels {T?.architecture.conv_channels}, dilations {T?.architecture.dilations?.join(", ")}, dropout {T?.architecture.dropout}. Assumption: the last 14 days of boards carry the useful history.</div>
          </Card>
          <Card wide title="Hospital forecasting engine" sub="Monte Carlo over current and new babies">
            {boxes(["Current babies' futures", "+ Bayesian admissions", "32-bed limit", "Ratios → nurses", "Daily quantiles"], p.series[0])}
            <div className="note">Census conservation (census = previous + admitted − left); unmet admissions counted, never dropped silently; available nurses are provisional (assumed).</div>
          </Card>
          <Card wide title="Ensemble" sub="Evaluated, not enabled"><div className="note">Weights chosen on development validation came out 0 for one member in every experiment, so no ensemble improved validated performance.</div></Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- D. Comparison
  if (v === "comparison") {
    const ibs = (md: string) => ({ ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (x: number) => num(x, 4) },
      grid: { left: 44, right: 10, top: 14, bottom: 30 }, xAxis: { type: "category", data: ["A", "B", "C"].map((e) => EXP[e]), ...axis(mode), splitLine: { show: false } },
      yAxis: { type: "value", ...axis(mode), axisLine: { show: false }, name: "IBS" },
      series: [...["logit", "gbm"].map((k, i) => ({ name: MODEL[k], type: "bar", barMaxWidth: 22, itemStyle: { color: p.series[i], borderRadius: [4, 4, 0, 0] },
        data: ["A", "B", "C"].map((e) => R.survival.modes[md].experiments[e][k].ibs) })),
        ...(md === "daily" ? [{ name: "TCN", type: "bar", barMaxWidth: 22, itemStyle: { color: p.series[2], borderRadius: [4, 4, 0, 0] }, data: ["A", "B", "C"].map((e) => T?.experiments[e].survival.ibs) }] : []),
        { name: "No features (KM)", type: "line", data: [1, 2, 3].map(() => R.survival.modes[md].kaplan_meier.ibs), lineStyle: { color: p.muted, type: "dashed" }, symbol: "none" }] });
    const days = ["d1", "d3", "d7"];
    const ll = { ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (x: number) => num(x, 3) },
      grid: { left: 44, right: 10, top: 14, bottom: 30 }, xAxis: { type: "category", data: ["Day 1", "Day 3", "Day 7"], ...axis(mode), splitLine: { show: false } },
      yAxis: { type: "value", name: "log loss", ...axis(mode), axisLine: { show: false } },
      series: [
        { name: "Persistence", type: "line", data: days.map((d) => J?.baselines.persistence[`ratio_${d}`].log_loss), lineStyle: { color: p.muted, type: "dashed" }, itemStyle: { color: p.muted } },
        { name: "Lookup table", type: "line", data: days.map((d) => J?.baselines.empirical[`ratio_${d}`].log_loss), lineStyle: { color: p.ink }, itemStyle: { color: p.ink } },
        { name: "Journey (real)", type: "line", data: days.map((d) => J?.experiments.B.summary[`ratio_${d}`].log_loss_mean), lineStyle: { color: p.series[1] }, itemStyle: { color: p.series[1] } },
        { name: "TCN (real)", type: "line", data: days.map((d) => T?.experiments.B.ratio[`ratio_${d}`].log_loss), lineStyle: { color: p.series[2] }, itemStyle: { color: p.series[2] } },
        { name: "TCN (real + synthetic)", type: "line", data: days.map((d) => T?.experiments.C.ratio[`ratio_${d}`].log_loss), lineStyle: { color: p.series[0] }, itemStyle: { color: p.series[0] } }] };
    const hz = ["1", "3", "7", "30"];
    const hOpt = { ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (x: number) => `${num(x, 2)} babies` },
      grid: { left: 44, right: 10, top: 14, bottom: 30 }, xAxis: { type: "category", data: hz.map((h) => `${h} d`), ...axis(mode), splitLine: { show: false } },
      yAxis: { type: "value", name: "MAE (babies)", ...axis(mode), axisLine: { show: false } },
      series: [{ name: "Engine", key: "mae", c: p.series[0] }, { name: "Persistence", key: "persistence_mae", c: p.muted }, { name: "Development mean", key: "dev_mean_mae", c: p.series[1] }]
        .map((s) => ({ name: s.name, type: "bar", barMaxWidth: 18, itemStyle: { color: s.c, borderRadius: [4, 4, 0, 0] }, data: hz.map((h) => H?.metrics[h]?.[s.key]) })) };
    return (
      <>{head("Model comparison", "Side by side on identical real test origins; the best-supported model is not always the most complex.")}
        <Explain level={level} simple={<>Lower bars are better. For leaving the unit, models using the baby's details beat a no-information curve by a wide margin. For the nurse ratio tomorrow, a simple table of what usually happens is hard to beat; the neural network helps for 3–7 days. For the census, today's count is the best guess for the next week.</>}
          technical={<>IBS over 30 days with known-status Brier; ratio log loss over 6 outcomes (5 ratios + left) on origins with a known outcome; census MAE at origins every third test day (overlapping horizons).</>} />
        <div className="row" style={{ marginBottom: 12 }}><Segmented value={smode} onChange={setSmode} options={[{ key: "daily", label: "Daily updates" }, { key: "admission", label: "At admission" }]} /></div>
        <div className="grid">
          <Card n={`${S?.n.test_origins} test origins`} title={`Leaving the unit (${smode})`} sub="IBS by model and training data; dashed: Kaplan–Meier with no features" right={<Legend items={[{ color: p.series[0], label: "Logistic" }, { color: p.series[1], label: "Boosted" }, ...(smode === "daily" ? [{ color: p.series[2], label: "TCN" }] : [])]} />}>
            <Chart option={ibs(smode)} height={250} label="IBS comparison" />
          </Card>
          <Card n={`${J?.n.known_outcomes["day 1"]} / ${J?.n.known_outcomes["day 7"]} known outcomes (day 1 / day 7)`} title="Nurse ratio ahead" sub="Log loss (lower is better)" right={<Legend items={[{ color: p.muted, label: "Persistence" }, { color: p.ink, label: "Lookup" }, { color: p.series[1], label: "Journey" }, { color: p.series[2], label: "TCN" }, { color: p.series[0], label: "TCN aug." }]} />}>
            <Chart option={ll} height={250} label="Ratio comparison" />
          </Card>
          <Card n={`${H?.origins} origins`} title="Census forecast error" sub="Mean absolute error in babies, by horizon" right={<Legend items={[{ color: p.series[0], label: "Engine" }, { color: p.muted, label: "Persistence" }, { color: p.series[1], label: "Dev. mean" }]} />}>
            <Chart option={hOpt} height={250} label="Census comparison" />
          </Card>
          <Card n={`${S?.n.test_stays} test babies`} title="By gestational age (real only)" sub="IBS and C-index by GA band (bands with 5+ babies)">
            <TableView open head={["Model", "GA band", "Origins", "Babies", "IBS", "C-index"]} rows={Object.entries(S?.subgroups || {}).flatMap(([k, g]: any) => Object.entries(g).map(([b, x]: any) => [MODEL[k], b, x.origins, x.stays, num(x.ibs, 3), num(x.c_index, 3)]))} />
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- E. Patient journey (historical replay)
  if (v === "journey") {
    const rp = J?.replay?.[replay];
    if (!rp) return <>{head("Patient journey evaluation", "")}<div className="empty">No replay cases.</div></>;
    const obs = rp.observed;
    const oOpt = { ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `day ${x.value[0]}: ${RAT[x.value[1]]}` },
      grid: { left: 56, right: 12, top: 14, bottom: 36 },
      xAxis: { type: "value", name: "day on the unit", nameLocation: "middle", nameGap: 22, ...axis(mode) },
      yAxis: { type: "category", data: RAT, ...axis(mode) },
      series: [{ type: "line", step: "end", data: obs.filter((o: any) => o.day <= rp.origin_day).map((o: any) => [o.day, RAT.indexOf(o.ratio)]), lineStyle: { color: p.series[0], width: 2.5 }, itemStyle: { color: p.series[0] }, showSymbol: false },
        { type: "line", step: "end", data: obs.filter((o: any) => o.day >= rp.origin_day && o.day <= rp.origin_day + 7).map((o: any) => [o.day, RAT.indexOf(o.ratio)]), lineStyle: { color: p.ink, width: 2, type: "dashed" }, itemStyle: { color: p.ink }, showSymbol: false }],
      markLine: undefined };
    const dk = Object.keys(rp.predicted_ratio);
    const cats = [...RAT, "left"];
    const colors = [...p.ratio, mode === "light" ? "#c8cfdb" : "#4a5578"];
    const pOpt = { ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (x: number) => pct(x, 0) },
      grid: { left: 44, right: 10, top: 10, bottom: 30 }, xAxis: { type: "category", data: dk, ...axis(mode), splitLine: { show: false } },
      yAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (x: number) => pct(x) } },
      series: cats.map((c, i) => ({ name: c, type: "bar", stack: "s", data: dk.map((d) => rp.predicted_ratio[d][c]), itemStyle: { color: colors[i], borderColor: p.surface, borderWidth: 1 } })) };
    return (
      <>{head("Patient journey evaluation", "Historical replay of pseudonymous test babies: what the model predicted at a past origin, and what actually happened. Not a live prediction.")}
        <Explain level={level} simple={<>Solid line: the baby's recorded nurse ratio up to the prediction day. Dashed: what happened next (shown only because this is a look back). Bars: the model's chances for each of the next 7 days — several possible futures, not one.</>}
          technical={<>Journey model (experiment B), {J?.paths_per_origin} simulated paths from the origin board; predicted distributions include the absorbing "left" state; example paths are 5 of the simulated futures.</>} />
        <div className="row" style={{ marginBottom: 12 }}><select value={replay} onChange={(e) => setReplay(+e.target.value)}>{J.replay.map((r: any, i: number) => <option key={i} value={i}>{r.case} · GA {num(r.ga_weeks, 1)} wk · {num(r.bw_g, 0)} g</option>)}</select>
          <span className="badge warn">Historical replay — retrospective</span></div>
        <div className="grid">
          <Card n={`${obs.length} recorded boards`} title="Observed journey" sub={`Prediction origin: day ${num(rp.origin_day, 1)}`} right={<Legend items={[{ color: p.series[0], label: "Before the origin" }, { color: p.ink, label: "What happened (7 days)" }]} />}>
            <Chart option={oOpt} height={240} label="Observed ratio" />
          </Card>
          <Card n={`${J?.paths_per_origin} simulated futures`} title="Predicted nurse ratio, next 7 days" sub="Share of simulated futures in each ratio, or having left" right={<Legend items={cats.map((c, i) => ({ color: colors[i], label: c }))} />}>
            <Chart option={pOpt} height={240} label="Predicted distribution" />
          </Card>
          <Card title="Five possible futures (simulated)" sub="Nurse ratio on days 1–7 in five of the simulated paths">
            <TableView open head={["Path", "D1", "D2", "D3", "D4", "D5", "D6", "D7"]} rows={rp.paths.map((pa: string[], i: number) => [`#${i + 1}`, ...pa])} />
          </Card>
          <Card title="Chance of still being on the unit" sub="By day after the origin (simulated)">
            <TableView open head={["Day", ...rp.p_in_unit.slice(0, 14).map((_: number, i: number) => `${i + 1}`)]} rows={[["P(in unit)", ...rp.p_in_unit.slice(0, 14).map((x: number) => pct(x, 0))]]} />
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- F. Calibration
  if (v === "calibration") {
    const cal = (rows: any[], name: string) => ({ ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `predicted ${pct(x.value[0], 0)} · observed ${pct(x.value[1], 0)}` },
      grid: { left: 46, right: 12, top: 14, bottom: 38 }, xAxis: { type: "value", min: 0, max: 1, name, nameLocation: "middle", nameGap: 24, ...axis(mode), axisLabel: { color: p.muted, formatter: (x: number) => pct(x) } },
      yAxis: { type: "value", min: 0, max: 1, name: "observed", ...axis(mode), axisLabel: { color: p.muted, formatter: (x: number) => pct(x) } },
      series: [{ type: "line", data: [[0, 0], [1, 1]], showSymbol: false, lineStyle: { color: p.axis } }, { type: "line", data: rows.map((b: any) => [b.predicted, b.observed]), symbolSize: 10, lineStyle: { color: p.series[0] }, itemStyle: { color: p.series[0] } }] });
    const sc = R.survival.modes[smode].experiments.B[R.survival.modes[smode].primary.model];
    return (
      <>{head("Calibration and reliability", "When a model says 30%, does it happen about 30% of the time?")}
        <Explain level={level} simple={<>Points on the diagonal mean the stated chances matched what happened. An "80% range" should contain the real outcome about 8 times in 10.</>}
          technical={<>Survival: predicted vs observed still-in-unit share at 7 and 14 days by fifths of prediction (known status only). Journey: confidence of the most likely ratio vs its hit rate. Census: share of actual values inside the 10th–90th percentile band.</>} />
        <div className="row" style={{ marginBottom: 12 }}><Segmented value={smode} onChange={setSmode} options={[{ key: "daily", label: "Daily updates" }, { key: "admission", label: "At admission" }]} /></div>
        <div className="grid">
          {["7", "14"].map((d) => <Card key={d} n={cnt(sc.calibration[d]?.reduce((a: number, b: any) => a + b.n, 0), "origins")} title={`Still on the unit at ${d} days`} sub={`${MODEL[R.survival.modes[smode].primary.model]} (chosen on validation), real only`}>
            <Chart option={cal(sc.calibration[d] || [], "predicted chance still in the unit")} height={240} label="Survival calibration" /></Card>)}
          <Card n={`${J?.n.known_outcomes["day 1"]} outcomes`} title="Nurse ratio tomorrow: reliability" sub="Confidence of the most likely outcome vs how often it was right (journey model)">
            <Chart option={cal(J?.experiments.B.calibration_ratio_d1 || [], "confidence")} height={240} label="Ratio reliability" />
          </Card>
          <Card n={`${H?.origins} origins`} title="Interval coverage" sub="Share of actual outcomes inside the predicted 80% range">
            <TableView open head={["Forecast", "Coverage of 80% range"]} rows={[["Remaining stay (daily, logistic)", pct(R.survival.modes.daily.experiments.B.logit.coverage_80, 0)], ["Remaining stay (daily, boosted)", pct(R.survival.modes.daily.experiments.B.gbm.coverage_80, 0)],
              ...["1", "3", "7", "30"].map((h) => [`Census, ${h} days`, pct(H?.metrics[h]?.coverage_80, 0)]), ...["1", "7", "30"].map((h) => [`Nurses required, ${h} days`, pct(H?.metrics[h]?.nurses_coverage_80, 0)])]} />
          </Card>
          <Card title="Outcome-specific Brier scores" sub="Leaving the unit by each horizon (daily, real only)">
            <TableView open head={["Horizon", "Logistic", "Boosted", "No features"]} rows={["1", "3", "7", "14", "30"].map((d) => [`${d} days`, num(R.survival.modes.daily.experiments.B.logit.brier[d], 3), num(R.survival.modes.daily.experiments.B.gbm.brier[d], 3), num(R.survival.modes.daily.kaplan_meier.brier[d], 3)])} />
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- G. Explainability
  if (v === "explain") {
    const at = R.survival.modes[smode].attribution;
    const g = at.global.slice(0, 12);
    const gOpt = { ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (x: number) => num(x, 4) },
      grid: { left: 200, right: 20, top: 6, bottom: 24 }, xAxis: { type: "value", ...axis(mode) },
      yAxis: { type: "category", data: g.map((x: any) => x.feature), inverse: true, ...axis(mode), axisLine: { show: false } },
      series: [{ type: "bar", data: g.map((x: any) => x.mean_abs), barWidth: 12, itemStyle: { color: p.series[0], borderRadius: 4 } }] };
    const dd = at.dependence[dep];
    const dOpt = dd && { ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `${num(x.value[0], 2)} → ${num(x.value[1], 3)}` },
      grid: { left: 50, right: 12, top: 12, bottom: 36 }, xAxis: { type: "value", name: dep, nameLocation: "middle", nameGap: 22, scale: true, ...axis(mode) },
      yAxis: { type: "value", name: "contribution", ...axis(mode) },
      series: [{ type: "scatter", data: dd.x.map((x: number, i: number) => [x, dd.phi[i]]), symbolSize: 6, itemStyle: { color: p.series[1], opacity: 0.7 } }] };
    const ab = T?.experiments.B.ablation || [];
    return (
      <>{head("Explainability", "Which recorded information the models' predictions are associated with — not what causes the outcome.")}
        <Explain level={level} simple={<>Longer bars: information that moved the model's estimate of leaving within 7 days more. Gestational and corrected age, birth weight and feeding stage matter most. These show what the model relies on, not medical causes.</>}
          technical={<>Monte Carlo permutation Shapley values ({at.n_explained} test origins, 30 permutations, development background); additivity gap {num(at.additivity_gap, 3)}; rank stability under ±2% input noise {num(at.stability_rank_correlation, 2)}. Logistic: odds ratios per SD of each feature (daily hazard). TCN: input-group ablation and temporal sensitivity.</>} />
        <div className="row" style={{ marginBottom: 12 }}><Segmented value={smode} onChange={setSmode} options={[{ key: "daily", label: "Daily updates" }, { key: "admission", label: "At admission" }]} /></div>
        <div className="grid">
          <Card n={`${at.n_explained} test origins`} title="Global attribution" sub={at.output}><Chart option={gOpt} height={320} label="Global attribution" /></Card>
          <Card n={`${at.n_explained} test origins`} title="Dependence" sub="Contribution to the 7-day leaving probability against the feature's value" right={<select value={dep} onChange={(e) => setDep(e.target.value)}>{Object.keys(at.dependence).map((k) => <option key={k} value={k}>{k}</option>)}</select>}>
            {dOpt ? <Chart option={dOpt} height={280} label="Dependence" /> : <div className="empty">Not available in this mode.</div>}
          </Card>
          <Card title="Hazard associations (logistic model)" sub="Odds ratio of leaving on a given day per standard deviation of the feature; above 1: sooner">
            <TableView open head={["Feature", "Odds ratio per SD"]} rows={R.survival.modes[smode].hazard_associations.slice(0, 12).map((r: any) => [r.feature, num(r.odds_ratio_per_sd, 2)])} />
          </Card>
          <Card n={`${T?.n.test_origins} test origins`} title="TCN: what the network needs" sub="Change in test scores when an input group is removed, and with shorter history">
            <TableView open head={["Inputs removed", "IBS change", "Ratio day-7 log-loss change"]} rows={ab.map((a: any) => [a["inputs removed"], num(a.ibs_change, 4), num(a.ratio_d7_log_loss_change, 3)])} />
            <TableView open head={["History (shifts)", "IBS", "Ratio day-7 log loss"]} rows={(T?.experiments.B.temporal_sensitivity || []).map((t: any) => [t.history_shifts, num(t.ibs, 4), num(t.ratio_d7_log_loss, 3)])} />
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- H. Error analysis
  if (v === "errors") {
    const e = R.survival.modes.daily.experiments.B.logit.error_by_remaining_stay;
    return (
      <>{head("Error analysis", "Where the models go wrong.")}
        <Explain level={level} simple={<>The models are least accurate for babies who end up staying much longer than usual, and for babies born at 28–31 weeks (few test babies). The census engine tended to predict too few babies in the test period, which was busier and sicker than the months it learned from.</>}
          technical={<>Median-remaining-stay error by actual remaining stay (daily logistic, real only); subgroup IBS; census forecasts with the largest absolute errors; journey day-1 transition-distribution error by current ratio (TVD).</>} />
        <div className="grid">
          <Card title="Remaining-stay error by how long babies actually stayed" sub="Mean absolute error of the predicted median (days) and mean predicted median">
            <TableView open head={["Actual remaining stay", "Origins", "Mean abs. error (days)", "Mean predicted median"]} rows={Object.entries(e).map(([k, x]: any) => [k, x.n, num(x.median_abs_error_days, 1), num(x.predicted_median_mean, 1)])} />
          </Card>
          <Card title="Census: largest errors" sub="Forecast median against the census actually on the board">
            <TableView open head={["Origin slot", "Horizon (d)", "Actual", "Forecast", "80% range"]} rows={(H?.largest_errors || []).map((r: any) => [r.origin, r.h, r.actual, r.pred, `${r.lo80}–${r.hi80}`])} />
            <div className="note">Bias of the census forecast: {["1", "3", "7", "30"].map((h) => `${h} d ${num(H?.metrics[h]?.bias, 2)}`).join(" · ")} babies (negative = too few).</div>
          </Card>
          <Card title="Missed ratio transitions (journey model, day 1)" sub="Predicted vs observed next-day ratio, by today's ratio">
            <TableView open head={["Today", "Origins", "Distance (TVD)", "Predicted 1:3-4 … 1:1", "Observed"]} rows={(J?.experiments.B.transition_error_day1 || []).map((t: any) => [t.from, t.n, num(t.tvd, 3), t.predicted.map((x: number) => pct(x, 0)).join(" "), t.observed.map((x: number) => pct(x, 0)).join(" ")])} />
          </Card>
          <Card title="Underperforming subgroups" sub="Daily survival, real only">
            <TableView open head={["Model", "GA band", "Babies", "IBS", "C-index"]} rows={Object.entries(R.survival.modes.daily.subgroups).flatMap(([k, g]: any) => Object.entries(g).map(([b, x]: any) => [MODEL[k], b, x.stays, num(x.ibs, 3), num(x.c_index, 3)]))} />
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- I. Registry
  return (
    <>{head("Model registry", "Every model, its data, evaluation and release status. Retrospective evaluation does not authorise clinical use.")}
      <Explain level={level} simple={<>No model is approved for clinical decisions. Moving a model on requires clinical review and a prospective silent trial, recorded here.</>}
        technical={<>Lifecycle: {reg?.lifecycle.join(" → ")}. The prediction service enforces the status: research users see all; clinical roles see patient-level predictions only from approved models (or labelled silent evaluation); management sees unit forecasts in labelled demonstration mode.</>} />
      <div className="grid">
        <Card wide n={cnt(reg?.models.length, "models")} title="Registered models" sub={`Updated ${reg?.updated}`}>
          <div className="table-scroll"><table><thead><tr><th>Model</th><th>Version</th><th>Task</th><th>Type</th><th>Training data</th><th>Evaluation period</th><th>Status</th><th>Restrictions</th></tr></thead>
            <tbody>{(reg?.models || []).map((m: any) => <tr key={m.id}><td><b>{m.id}</b>{m.primary ? " ★" : ""}</td><td>{m.version}</td><td>{m.task}</td><td>{m.type}</td><td>{m.training_data}</td><td>{m.evaluation_period}</td>
              <td><span className={`badge ${STATUS_CLS[m.status] || ""}`}>{m.status}</span></td><td style={{ fontSize: 12 }}>{m.restrictions.join("; ")}</td></tr>)}</tbody></table></div>
        </Card>
        <Card wide title="Deployment and governance history"><TableView open head={["Date", "Event", "By"]} rows={(reg?.history || []).map((h: any) => [h.date, h.event, h.by || "system"])} /></Card>
      </div>
    </>);
}
