import { useState } from "react";
import Chart from "../Chart";
import { Card, cnt, Kpi, PageHead, Segmented, TableView } from "../ui";
import { axis, base, num, PALETTE, pct } from "../theme";
import type { Props } from "../App";
import { TermsBox } from "./Metrics";

/* Predictive modeling & evaluation (docs/NEOSTAY_PREDICTIVE_INTELLIGENCE.md §19). Every number comes from
   data/processed/ml/predictive/results.json (python -m acuity_predict.study): actual runs on the real Center 6
   test period (2026-07-18 to 2026-09-30, never used for any choice). */

const EXP: Record<string, string> = { A: "Synthetic only", B: "Real only", C: "Real + synthetic" };
const MODEL: Record<string, string> = { logit: "Logistic hazard", gbm: "Gradient-boosted hazard", ensemble: "Ensemble" };
const STATUS_CLS: Record<string, string> = { "real-data retrospectively evaluated": "info", "internally evaluated": "warn", trained: "warn", experimental: "warn",
  "approved for a specified intended use": "good", "clinical review required": "warn", "prospective silent validation": "info" };

function Explain({ level, simple, technical }: { level: string; simple: React.ReactNode; technical: React.ReactNode }) {
  return <div className="note" style={{ marginTop: 0, marginBottom: 14 }}>{level === "simple" ? simple : technical}</div>;
}

const sub = () => location.hash.slice(1).split("/")[1] || "overview";

/* The terms each sub-page uses (metrics.ts), shown folded under its heading. */
const PAGE_TERMS: Record<string, string[]> = {
  overview: ["score-01", "monthly", "holdout", "unseen", "km"],
  experiments: ["ibs", "ci", "c-index", "coverage"],
  calibration: ["calibration", "coverage", "brier", "slope"],
  explain: ["shapley", "odds-ratio"],
  errors: ["typical-miss", "ibs", "c-index"],
  registry: ["silent", "pass-mark", "status"],
};

export default function Predictive({ data, mode, center }: Props) {
  const p = PALETTE[mode];
  const pr = data.predictive;
  const [level, setLevel] = useState("simple");
  const [dep, setDep] = useState("ga_weeks");
  const [smode, setSmode] = useState("daily");
  if (!pr) return <div className="empty">No predictive results yet: run `python -m acuity_predict.study` in acuity-models.</div>;
  const R = pr.results, reg = pr.registry, rd = pr.readiness;
  const v = sub();
  const realCenter = !center || center.has_real_data;
  const banner = !realCenter && <div className="banner scenario"><b>{center.name}</b><span>EVALUATION IS FOR CENTER 6 ONLY</span><p>These models were trained and evaluated on Center 6 data. Their performance at {center.name} is unknown; forecasts for it are simulated scenarios.</p></div>;
  const head = (title: string, lead: string) => (
    <><PageHead eyebrow="Predictive modeling & evaluation" title={title} lead={lead} />{banner}
      <div className="row" style={{ marginBottom: 12 }}><Segmented value={level} onChange={setLevel} options={[{ key: "simple", label: "Simple explanation" }, { key: "technical", label: "Technical explanation" }]} />
        <span className="badge">Test period: 2026-07-18 to 2026-09-30 (real, Center 6) · retrospective evaluation, not clinical validation</span></div>
      <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>This section shows the <b>75-day test</b>: one look at the last 75 days, with technical detail. Decisions about each model come from the six-month <b>monthly test</b> on <a href="#scorecard">How good are the predictions?</a>, which also names the model used for each prediction and why. Every term is defined on <a href="#metrics">Metrics explained</a>.</div>
      <TermsBox ids={PAGE_TERMS[v] ?? []} /></>);

  // ---------------------------------------------------------------- A. Overview
  if (v === "overview") {
    const sm = data.scorecard?.simple;
    const tasks = (rd?.tasks || []).filter((t: any) => !/ratio requirement|nurse|census|staffing/i.test(t.task));
    return (
      <>{head("Forecasting overview", "What the models predict, how they are tested, and what the data can and cannot support.")}
        <Explain level={level} simple={<>Everything starts from the baby: how long the stay will be, and how the baby's breathing support and feeding will change. The nurse ratio follows from the condition through the unit's past practice. Nurses needed for the whole unit will follow by adding up the babies, later. Scores are on <a href="#scorecard">How good are the predictions?</a>; these pages hold the detail.</>}
          technical={<>Two tests. The monthly test (six cut-offs from 2026-03-31, each model refitted on every board before the cut and scored on the next 30 days) decides. The 75-day test (development = boards before 2026-07-18, test = the 75 days after) is a single look used for the experiments with synthetic training data, calibration plots, attributions and error analysis.</>} />
        <div className="kpis">
          <Kpi label="Stay, at admission" value={sm ? sm.stay.admission.score.toFixed(2) : "–"} sub="score from 0 to 1 (monthly test)" />
          <Kpi label="Stay, every later day" value={sm ? sm.stay.daily.score.toFixed(2) : "–"} sub={`typically ${sm ? num(sm.stay.daily.miss, 1) : "–"} days off`} />
          <Kpi label="Breathing in a week" value={sm ? sm.condition[0].by[2].score.toFixed(2) : "–"} sub={`right ${sm ? Math.round(sm.condition[0].by[2].acc * 100) : "–"} in 100`} />
          <Kpi label="Ratio from condition" value={sm ? `${Math.round(sm.ratio.now.acc * 100)}%` : "–"} sub="right today, from breathing and feeding" />
        </div>
        <div className="grid">
          <Card wide title="The three pieces" sub="Every prediction in NeoStay Insights comes from these">
            <TableView open head={["Piece", "What it does", "How it is built"]} rows={[
              ["Stay model", "How long a baby will stay, at admission and on every later day, with the chance of leaving by each day and an 80% range", "Daily: logistic and gradient-boosted discrete-time hazard models (30 days) averaged, then recalibrated on every earlier month. At admission: the gradient-boosted model."],
              ["Condition model", "Breathing support and feeding stage in 1, 3 and 7 days, or gone home", "The change table (what followed each state in the training months) and a gradient-boosted classifier reading every input on the board, mixed with a weight chosen on the 30 days before each cut-off."],
              ["Past-practice ratio table", "The nurse ratio for a breathing support and feeding stage", "Counts of the ratios assigned on past boards for each combination; no prediction. Applied to today's or the predicted condition."]]} />
          </Card>
          <Card wide n={cnt(tasks.length, "tasks")} title="What the data can support" sub="Readiness audit of the real Center 6 boards, for the questions about the baby">
            <TableView open head={["Prediction task", "Status", "Why"]} rows={tasks.map((t: any) => [t.task, t.status, t.why])} />
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
    return (
      <>{head("Learning from synthetic data", "The stay model's two parts trained three ways and scored on the same real test babies (75-day test).")}
        <Explain level={level} simple={<>"Synthetic only" models learned from simulated babies; "Real only" from real development boards; "Real + synthetic" from both. All were tested on the same real babies. Models trained only on synthetic babies came close to those trained on real ones.</>}
          technical={<>Person-period discrete-time hazards (30 days), Platt-recalibrated on development validation, refitted on all training data; feature set (core or every input) and settings chosen on validation IBS; gradient-boosted models over 3 seeds. Synthetic: Center 6 large-scale dataset from development-fitted generators (600 stays daily, 4,000 admissions).</>} />
        <div className="grid">
          <Card wide n={`${R.survival.modes.daily.n.test_origins} daily / ${R.survival.modes.admission.n.test_origins} admission test origins`} title="Leaving the unit: all experiments" sub="Integrated Brier score (IBS, lower is better) with 95% bootstrap interval over stays; C-index; share of actual stays inside the predicted 80% range">
            <TableView open head={["Mode", "Training data", "Model", "Test IBS", "95% CI", "C-index", "80% coverage", "Chosen settings", "IBS over seeds"]} rows={rows} />
          </Card>
        </div>
      </>);
  }

  if (v === "calibration") {
    const cal = (rows: any[], name: string) => ({ ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `predicted ${pct(x.value[0], 0)} · observed ${pct(x.value[1], 0)}` },
      grid: { left: 46, right: 12, top: 14, bottom: 38 }, xAxis: { type: "value", min: 0, max: 1, name, nameLocation: "middle", nameGap: 24, ...axis(mode), axisLabel: { color: p.muted, formatter: (x: number) => pct(x) } },
      yAxis: { type: "value", min: 0, max: 1, name: "observed", ...axis(mode), axisLabel: { color: p.muted, formatter: (x: number) => pct(x) } },
      series: [{ type: "line", data: [[0, 0], [1, 1]], showSymbol: false, lineStyle: { color: p.axis } }, { type: "line", data: rows.map((b: any) => [b.predicted, b.observed]), symbolSize: 10, lineStyle: { color: p.series[0] }, itemStyle: { color: p.series[0] } }] });
    const sc = R.survival.modes[smode].experiments.B[R.survival.modes[smode].primary.model];
    return (
      <>{head("Calibration and reliability", "When a model says 30%, does it happen about 30% of the time?")}
        <Explain level={level} simple={<>Points on the diagonal mean the stated chances matched what happened. An "80% range" should contain the real outcome about 8 times in 10.</>}
          technical={<>Predicted vs observed still-in-unit share at 7 and 14 days by fifths of prediction (known status only); share of actual stays inside the 10th–90th percentile range. The stay model's recalibration on every earlier month is checked in the monthly test (calibration slope; How good are the predictions? → technical details).</>} />
        <div className="row" style={{ marginBottom: 12 }}><Segmented value={smode} onChange={setSmode} options={[{ key: "daily", label: "Daily updates" }, { key: "admission", label: "At admission" }]} /></div>
        <div className="grid">
          {["7", "14"].map((d) => <Card key={d} n={cnt(sc.calibration[d]?.reduce((a: number, b: any) => a + b.n, 0), "origins")} title={`Still on the unit at ${d} days`} sub={`${MODEL[R.survival.modes[smode].primary.model]} (chosen on validation), real only`}>
            <Chart option={cal(sc.calibration[d] || [], "predicted chance still in the unit")} height={240} label="Survival calibration" /></Card>)}
          <Card title="Interval coverage" sub="Share of actual stays inside the predicted 80% range">
            <TableView open head={["Forecast", "Coverage of 80% range"]} rows={[["Remaining stay (daily, logistic)", pct(R.survival.modes.daily.experiments.B.logit.coverage_80, 0)], ["Remaining stay (daily, boosted)", pct(R.survival.modes.daily.experiments.B.gbm.coverage_80, 0)],
              ["Stay at admission (boosted)", pct(R.survival.modes.admission.experiments.B.gbm.coverage_80, 0)]]} />
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
    return (
      <>{head("Explainability", "Which recorded information the models' predictions are associated with — not what causes the outcome.")}
        <Explain level={level} simple={<>Longer bars: information that moved the model's estimate of leaving within 7 days more. Gestational and corrected age, birth weight and feeding stage matter most. These show what the model relies on, not medical causes.</>}
          technical={<>Monte Carlo permutation Shapley values ({at.n_explained} test origins, 30 permutations, development background); additivity gap {num(at.additivity_gap, 3)}; rank stability under ±2% input noise {num(at.stability_rank_correlation, 2)}. Logistic: odds ratios per SD of each feature (daily hazard).</>} />
        <div className="row" style={{ marginBottom: 12 }}><Segmented value={smode} onChange={setSmode} options={[{ key: "daily", label: "Daily updates" }, { key: "admission", label: "At admission" }]} /></div>
        <div className="grid">
          <Card n={`${at.n_explained} test origins`} title="Global attribution" sub={at.output}><Chart option={gOpt} height={320} label="Global attribution" /></Card>
          <Card n={`${at.n_explained} test origins`} title="Dependence" sub="Contribution to the 7-day leaving probability against the feature's value" right={<select value={dep} onChange={(e) => setDep(e.target.value)}>{Object.keys(at.dependence).map((k) => <option key={k} value={k}>{k}</option>)}</select>}>
            {dOpt ? <Chart option={dOpt} height={280} label="Dependence" /> : <div className="empty">Not available in this mode.</div>}
          </Card>
          <Card title="Hazard associations (logistic model)" sub="Odds ratio of leaving on a given day per standard deviation of the feature; above 1: sooner">
            <TableView open head={["Feature", "Odds ratio per SD"]} rows={R.survival.modes[smode].hazard_associations.slice(0, 12).map((r: any) => [r.feature, num(r.odds_ratio_per_sd, 2)])} />
          </Card>
        </div>
      </>);
  }

  // ---------------------------------------------------------------- H. Error analysis
  if (v === "errors") {
    const e = R.survival.modes.daily.experiments.B.logit.error_by_remaining_stay;
    return (
      <>{head("Error analysis", "Where the models go wrong.")}
        <Explain level={level} simple={<>The stay models are least accurate for babies who end up staying much longer than usual, and for babies born at 28–31 weeks (few test babies). In the monthly test the stay model is weakest in a baby's second week on the unit.</>}
          technical={<>Median-remaining-stay error by actual remaining stay (daily logistic, real only); subgroup IBS and C-index by gestational-age band.</>} />
        <div className="grid">
          <Card title="Remaining-stay error by how long babies actually stayed" sub="Mean absolute error of the predicted median (days) and mean predicted median">
            <TableView open head={["Actual remaining stay", "Origins", "Mean abs. error (days)", "Mean predicted median"]} rows={Object.entries(e).map(([k, x]: any) => [k, x.n, num(x.median_abs_error_days, 1), num(x.predicted_median_mean, 1)])} />
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
        {(() => {
          const row = (m: any) => <tr key={m.id}><td><b>{m.id}</b></td><td>{m.version}</td><td>{m.task}</td><td>{m.type}</td><td>{m.training_data}</td><td>{m.evaluation_period}</td>
            <td><span className={`badge ${STATUS_CLS[m.status] || ""}`}>{m.status}</span></td><td style={{ fontSize: 12 }}>{m.restrictions.join("; ")}</td></tr>;
          const head = <thead><tr><th>Model</th><th>Version</th><th>Task</th><th>Type</th><th>Training data</th><th>Evaluation</th><th>Status</th><th>Restrictions</th></tr></thead>;
          const fin = (reg?.models || []).filter((m: any) => m.role === "final"), rest = (reg?.models || []).filter((m: any) => m.role !== "final");
          return (<>
            <Card wide n={cnt(fin.length, "pieces")} title="The three pieces in use" sub={`Updated ${reg?.updated}`}>
              <div className="table-scroll"><table>{head}<tbody>{fin.map(row)}</tbody></table></div>
            </Card>
            {rest.length > 0 && <Card wide title="Earlier models, kept for the record" sub="Components of the stay model, and models no longer used for predictions">
              <details className="sc-details inner"><summary>{rest.length} models</summary>
                <div className="table-scroll"><table>{head}<tbody>{rest.map(row)}</tbody></table></div></details>
            </Card>}
          </>);
        })()}
        <Card wide title="Deployment and governance history"><TableView open head={["Date", "Event", "By"]} rows={(reg?.history || []).map((h: any) => [h.date, h.event, h.by || "system"])} /></Card>
      </div>
    </>);
}
