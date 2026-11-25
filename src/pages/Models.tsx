import { useState } from "react";
import Chart from "../Chart";
import { Card, cnt, Kpi, Legend, PageHead, Segmented, TableView } from "../ui";
import { axis, base, num, PALETTE, pct } from "../theme";
import type { Props } from "../App";
import { TermsBox } from "./Metrics";

const FAMILY: Record<string, string> = { baseline: "Simple rule", statistical: "Statistical", machine_learning: "Machine learning", deep_learning: "Deep learning", ensemble: "Ensemble" };
type Row = { name: string; family: string; what: string; cv: number; cv_se: number; test: number };
export function boardChart(mode: "light" | "dark", rows: Row[], selected: string, scoreName: string) {
  const p = PALETTE[mode];
  const familyColor = (f: string) => (f === "ensemble" ? p.series[0] : f === "baseline" ? p.muted : p.ramp[1]);
  return {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => { const r = rows[x.dataIndex]; return `<b>${r.name}</b><br>${r.what}<br>cross-validation ${num(r.cv, 4)} ± ${num(r.cv_se, 4)}<br>test ${num(r.test, 4)}`; } },
    grid: { left: 190, right: 30, top: 8, bottom: 44 },
    xAxis: { type: "value", name: `${scoreName} (lower is better)`, nameLocation: "middle", nameGap: 22, ...axis(mode), scale: true },
    yAxis: { type: "category", data: rows.map((r) => r.name), inverse: true, ...axis(mode), axisLabel: { color: p.soft, fontSize: 11 } },
    series: [
      { type: "bar", data: rows.map((r) => ({ value: r.cv, itemStyle: { color: r.name === selected ? familyColor("ensemble") : familyColor(r.family), borderRadius: [0, 4, 4, 0] } })), barWidth: 10 },
      { type: "custom", encode: { x: [1, 2], y: 0 }, renderItem: (_: any, api: any) => {
          const [lo, y] = api.coord([api.value(1), api.value(0)]);
          const [hi] = api.coord([api.value(2), api.value(0)]);
          return { type: "group", children: [
            { type: "line", shape: { x1: lo, y1: y, x2: hi, y2: y }, style: { stroke: p.ink, lineWidth: 1.5, opacity: 0.5 } },
            { type: "line", shape: { x1: lo, y1: y - 4, x2: lo, y2: y + 4 }, style: { stroke: p.ink, lineWidth: 1.5, opacity: 0.5 } },
            { type: "line", shape: { x1: hi, y1: y - 4, x2: hi, y2: y + 4 }, style: { stroke: p.ink, lineWidth: 1.5, opacity: 0.5 } }] };
        }, data: rows.map((r, i) => [i, r.cv - r.cv_se, r.cv + r.cv_se]), z: 5, tooltip: { show: false } },
    ],
  };
}

const HORIZON: Record<string, string> = { "2": "1 day", "6": "3 days", "14": "7 days", "28": "14 days", "56": "28 days", "1": "12 h", "4": "48 h", "12": "6 days" };

export function JourneyView({ data, mode, task }: Props & { task: string }) {
  const p = PALETTE[mode];
  const m = data.models;
  if (!m) return <div className="empty">No model results yet: run the journey study in acuity-models.</div>;
  const t = m.tasks[task];
  const rows = t.leaderboard;
  const board = boardChart(mode, rows, t.selected, t.score_name);
  const met = t.metrics;
  const cal = task === "stay" ? t.calibration["14"] || Object.values(t.calibration)[0] : null;
  const calChart = cal && {
    ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `predicted ${pct(x.value[0], 1)}<br>observed ${pct(x.value[1], 1)}` },
    grid: { left: 50, right: 16, top: 16, bottom: 44 },
    xAxis: { type: "value", name: "predicted chance still in the unit at 7 days", nameLocation: "middle", nameGap: 26, min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    yAxis: { type: "value", name: "observed", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    series: [
      { type: "line", data: [[0, 0], [1, 1]], showSymbol: false, lineStyle: { color: p.axis, width: 1.5 }, tooltip: { show: false } },
      { type: "line", data: cal.map((b: any) => [b.predicted, b.observed]), symbolSize: 11, lineStyle: { color: p.series[0], width: 2 }, itemStyle: { color: p.series[0], borderColor: p.surface, borderWidth: 2 } },
    ],
  };
  const byH = task === "acuity" ? Object.entries(t.by_h as Record<string, any>) : [];
  const hChart = task === "acuity" && {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) },
    grid: { left: 44, right: 16, top: 16, bottom: 56 },
    xAxis: { type: "category", data: byH.map(([h]) => HORIZON[h] || `${+h * 12} h`), ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", min: 0.4, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: [
      { name: "Most likely ratio right", type: "line", data: byH.map(([, v]) => v.accuracy), symbolSize: 9, lineStyle: { color: p.ramp[3], width: 2.5 }, itemStyle: { color: p.ramp[3], borderColor: p.surface, borderWidth: 2 } },
      { name: "Balanced accuracy", type: "line", data: byH.map(([, v]) => v.balanced_accuracy), symbolSize: 9, lineStyle: { color: p.ramp[1], width: 2 }, itemStyle: { color: p.ramp[1], borderColor: p.surface, borderWidth: 2 } },
    ],
  };
  const imp = t.importance ? Object.entries(t.importance.groups as Record<string, number>).slice(0, 10) : [];
  const impChart = {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => num(v, 4) },
    grid: { left: 210, right: 40, top: 6, bottom: 10 },
    xAxis: { type: "value", show: false }, yAxis: { type: "category", data: imp.map(([k]) => k), inverse: true, ...axis(mode), axisLine: { show: false }, axisLabel: { color: p.soft, fontSize: 11 } },
    series: [{ type: "bar", data: imp.map(([, v]) => v), barWidth: 11, itemStyle: { color: p.series[0], borderRadius: 4 } }],
  };
  const hist = Object.entries(t.by_history as Record<string, any>);
  const histChart = {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => num(v, 4) },
    grid: { left: 44, right: 16, top: 16, bottom: 50 },
    xAxis: { type: "category", data: hist.map(([k]) => k), ...axis(mode), axisLabel: { color: p.muted, interval: 0, fontSize: 10.5 }, splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLine: { show: false } },
    series: [{ name: t.score_name, type: "bar", data: hist.map(([, v]) => v.score), barWidth: 22, itemStyle: { color: p.series[0], borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", color: p.soft, formatter: (x: any) => num(x.value, 3) } }],
  };
  const sel = rows.find((r: any) => r.name === t.selected);
  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="badge good">Chosen: {t.selected}</span>
        <span className="badge">Rolling cross-validation, then a held-out test period · study of {m.date}</span>
      </div>
      <div className="kpis">
        {task === "stay" ? (
          <>
            <Kpi label="Ranking right (C-index)" value={pct(met.c_index, 1)} sub="pairs of babies in the right order" />
            <Kpi label="Days off" value={`${num(met.mae_days, 1)} d`} sub="median stay vs actual, on average" />
            <Kpi label="In the middle half" value={pct(met.iqr_coverage)} sub="true stay inside the predicted middle half (ideal 50%)" />
            <Kpi label="Test score" value={num(sel?.test, 3)} sub={`${t.score_name}; CV ${num(sel?.cv, 3)}`} />
          </>
        ) : (
          <>
            <Kpi label="Right, 12 h ahead" value={pct(t.by_h["1"]?.accuracy, 1)} sub="most likely ratio = recorded" />
            <Kpi label="Right, 7 days ahead" value={pct(t.by_h["14"]?.accuracy, 1)} sub="among babies still in the unit" />
            <Kpi label="Under-calls" value={pct(met.under_call, 1)} sub="ratio predicted too low" />
            <Kpi label="Test log loss" value={num(met.log_loss, 3)} sub={`CV ${num(sel?.cv, 3)}`} />
          </>
        )}
      </div>
      <div className="grid">
        <Card n={`${m.protocol.folds} cross-validation folds; test ${cnt(t.n_test?.landmarks, "forecasts")} from ${cnt(t.n_test?.stays, "stays")}`} wide title="Every model compared" sub="Cross-validated score with its standard error (lower is better). Teal: ensembles (the top one is chosen); light teal: single models; grey: simple rules; whiskers: one standard error">
          <Chart option={board} height={Math.max(260, rows.length * 22)} label="Model leaderboard" />
          <TableView head={["Model", "Family", "CV score", "± SE", "Test score", "Test 95% interval"]}
            rows={rows.map((r: any) => [r.name, FAMILY[r.family] || r.family, num(r.cv, 4), num(r.cv_se, 4), num(r.test, 4), `${num(r.test_ci[0], 3)}–${num(r.test_ci[1], 3)}`])} />
        </Card>
        {calChart && <Card n={cnt((cal as any[]).reduce((a, b) => a + b.n, 0), "test forecasts")} title="Calibration at 7 days" sub="Predicted against observed chance of still being in the unit, by fifth of predictions; on the diagonal is perfect"><Chart option={calChart} height={290} label="Calibration plot" /></Card>}
        {hChart && <Card n={`${cnt(t.n_test?.landmarks, "test forecasts (baby × board ahead)")} from ${cnt(t.n_test?.stays, "stays")}`} title="Accuracy by how far ahead" sub="Share of babies whose most likely ratio was the recorded one"><Chart option={hChart} height={290} label="Accuracy by horizon" /></Card>}
        <Card n={cnt(hist.reduce((a, [, v]) => a + (v.landmarks || 0), 0), "test forecasts")} title="With more or less history" sub={`Test score by how many earlier boards a forecast had on hand (lower is better)`}><Chart option={histChart} height={290} label="Score by history on hand" /></Card>
        {imp.length > 0 && <Card n={`${m.protocol.folds} cross-validation folds`} title="What drives the predictions" sub={`Increase in error when each group of fields is shuffled (${t.importance.model})`}><Chart option={impChart} height={320} label="Grouped permutation importance" /></Card>}
        <Card n={`${cnt(t.n_test?.landmarks, "test forecasts")} from ${cnt(t.n_test?.stays, "stays")}`} title="By patient group" sub={`Test score by gestational age and birth weight band (groups of ${data.min_stays}+ stays; lower is better)`}>
          <Chart option={(() => { const sg = Object.entries(t.subgroups as Record<string, any>); return {
            ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `${sg[x.dataIndex][0]}<br>${sg[x.dataIndex][1].stays} stays · score <b>${num(x.value, 3)}</b>` },
            grid: { left: 130, right: 46, top: 6, bottom: 10 }, xAxis: { type: "value", show: false },
            yAxis: { type: "category", data: sg.map(([k]) => k.replace("ga: ", "GA ").replace("bw: ", "BW ")), inverse: true, ...axis(mode), axisLine: { show: false } },
            series: [{ type: "bar", data: sg.map(([, v]) => v.score), barWidth: 11, itemStyle: { color: p.series[0], borderRadius: 4 }, label: { show: true, position: "right", color: p.soft, formatter: (x: any) => num(x.value, 3) } }],
          }; })()} height={300} label="Score by patient group" />
          <TableView head={["Group", "Stays", "Baby-shifts", t.score_name]} rows={Object.entries(t.subgroups as Record<string, any>).map(([k, v]) => [k, v.stays, v.landmarks, num(v.score, 4)])} />
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ One clinical question (acuity_ml.questions) */
function QuestionView({ data, mode, q }: Props & { q: any }) {
  const p = PALETTE[mode];
  const rows = q.leaderboard as any[];
  const sel = rows.find((r) => r.name === q.selected);
  const met = q.metrics;
  const board = boardChart(mode, rows, q.selected, "Integrated Brier score");
  const cal = q.calibration as any[];
  const calChart = {
    ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `predicted ${pct(x.value[0], 1)}<br>observed ${pct(x.value[1], 1)}` },
    grid: { left: 50, right: 16, top: 16, bottom: 44 },
    xAxis: { type: "value", name: `predicted ${q.calib_label}`, nameLocation: "middle", nameGap: 26, min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    yAxis: { type: "value", name: "observed", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    series: [
      { type: "line", data: [[0, 0], [1, 1]], showSymbol: false, lineStyle: { color: p.axis, width: 1.5 }, tooltip: { show: false } },
      { type: "line", data: cal.map((b) => [b.predicted, b.observed]), symbolSize: 11, lineStyle: { color: p.series[0], width: 2 }, itemStyle: { color: p.series[0], borderColor: p.surface, borderWidth: 2 } },
    ],
  };
  const curve = q.curve;
  const curveChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 0) },
    grid: { left: 48, right: 16, top: 16, bottom: 44 },
    xAxis: { type: "category", data: curve.days, name: "days ahead", nameLocation: "middle", nameGap: 26, ...axis(mode), axisLabel: { color: p.muted, interval: 6 }, splitLine: { show: false } },
    yAxis: { type: "value", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: [
      { name: "Observed (Kaplan-Meier)", type: "line", step: "end", data: curve.observed, showSymbol: false, lineStyle: { color: p.ink, width: 2, opacity: 0.55 }, itemStyle: { color: p.ink } },
      { name: "Predicted (average)", type: "line", data: curve.predicted, showSymbol: false, smooth: 0.2, lineStyle: { color: p.series[0], width: 2.5 }, itemStyle: { color: p.series[0] } },
    ],
  };
  const groups = Object.entries(q.groups as Record<string, any>);
  const groupChart = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => `${num(v, 0)} days` },
    grid: { left: 190, right: 30, top: 6, bottom: 34 },
    xAxis: { type: "value", name: "median days (test babies)", nameLocation: "middle", nameGap: 22, ...axis(mode) },
    yAxis: { type: "category", data: groups.map(([k]) => k), inverse: true, ...axis(mode), axisLine: { show: false }, axisLabel: { color: p.soft, fontSize: 11 } },
    series: [
      { name: "Observed", type: "bar", data: groups.map(([, v]) => v.observed_median), barWidth: 8, barGap: "30%", itemStyle: { color: p.muted, borderRadius: [0, 4, 4, 0] } },
      { name: "Predicted", type: "bar", data: groups.map(([, v]) => v.predicted_median), barWidth: 8, itemStyle: { color: p.series[0], borderRadius: [0, 4, 4, 0] } },
    ],
  };
  const hr = (q.hazard_ratios as any[]).slice(0, 12);
  const hrChart = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => { const r = hr[x.dataIndex]; return `<b>${r.feature}</b><br>hazard ratio ${num(r.hr, 2)} (95% ${num(r.lo, 2)}–${num(r.hi, 2)})<br>p = ${num(r.p, 3)}`; } },
    grid: { left: 250, right: 24, top: 6, bottom: 40 },
    xAxis: { type: "log", min: 0.5, max: 2, name: q.event === "leaving the unit" ? "← longer stay · hazard ratio · shorter stay →" : "← later · hazard ratio · sooner off tube →", nameLocation: "middle", nameGap: 24, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => num(v, 2) } },
    yAxis: { type: "category", data: hr.map((r) => r.feature), inverse: true, ...axis(mode), axisLine: { show: false }, axisLabel: { color: p.soft, fontSize: 11 } },
    series: [
      { type: "custom", encode: { x: [1, 2], y: 0 }, renderItem: (_: any, api: any) => {
          const [lo, y] = api.coord([Math.max(api.value(1), 0.5), api.value(0)]);
          const [hi] = api.coord([Math.min(api.value(2), 2), api.value(0)]);
          return { type: "line", shape: { x1: lo, y1: y, x2: hi, y2: y }, style: { stroke: p.soft, lineWidth: 2, opacity: 0.6 } };
        }, data: hr.map((r, i) => [i, r.lo, r.hi]), tooltip: { show: false }, z: 2 },
      { type: "scatter", data: hr.map((r, i) => [Math.min(Math.max(r.hr, 0.5), 2), i]), symbolSize: 11,
        itemStyle: { color: (x: any) => (hr[x.dataIndex].p < 0.05 ? p.series[0] : p.muted), borderColor: p.surface, borderWidth: 2 }, z: 3,
        markLine: { silent: true, symbol: "none", data: [{ xAxis: 1 }], lineStyle: { color: p.axis, type: "solid", width: 1.5 }, label: { show: false } } },
    ],
  };
  return (
    <>
      <div className="note" style={{ marginTop: 0, marginBottom: 16 }}><b>{q.ask}</b> {q.rows.train_stays} training babies ({q.rows.train} rows), {q.rows.test_stays} later babies held out for the test ({q.rows.test} rows); event: {q.event}.{q.left_on_tube_stays ? ` ${q.left_on_tube_stays} babies left the unit still on a tube; their rows count as followed until they left.` : ""}</div>
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="badge good">Chosen: {q.selected}</span>
        <span className="badge">5-fold cross-validation on the earlier babies, then a held-out test on the later ones · study of {data.questions.date}</span>
      </div>
      <div className="kpis">
        <Kpi label="Ranking right (C-index)" value={pct(met.c_index, 1)} sub="pairs of babies put in the right order" />
        <Kpi label="Days off" value={`${num(met.mae_days, 1)} d`} sub={`predicted median vs actual, on average (within ${q.horizon} days)`} />
        <Kpi label="In the middle half" value={pct(met.iqr_coverage)} sub="actual inside the predicted middle half (ideal 50%)" />
        <Kpi label="Test score" value={num(sel?.test, 3)} sub={`integrated Brier score; 95% ${num(sel?.test_ci[0], 3)}–${num(sel?.test_ci[1], 3)}`} />
      </div>
      <div className="grid">
        <Card n={`training ${cnt(q.rows.train, "rows")} from ${cnt(q.rows.train_stays, "babies")}; test ${cnt(q.rows.test, "rows")} from ${cnt(q.rows.test_stays, "babies")}`} wide title="Every model compared" sub="Integrated Brier score over the next days in cross-validation, with its standard error (lower is better). Teal: chosen; light teal: models using the baby's details; grey: simple curves">
          <Chart option={board} height={Math.max(240, rows.length * 26)} label="Model leaderboard" />
          <TableView head={["Model", "Family", "What it is", "CV score", "± SE", "Test score", "Test 95% interval", "C-index", "Days off", "Middle half"]}
            rows={rows.map((r) => [r.name, FAMILY[r.family] || r.family, r.what, num(r.cv, 4), num(r.cv_se, 4), num(r.test, 4), `${num(r.test_ci[0], 3)}–${num(r.test_ci[1], 3)}`, num(r.c_index, 3), num(r.mae_days, 1), pct(r.iqr_coverage)])} />
        </Card>
        <Card n={`${cnt(q.rows.test, "test rows")} from ${cnt(q.rows.test_stays, "babies")}`} title="Predicted against observed, on average" sub={`Chance the event has not happened yet, by days ahead, for the held-out babies (${q.selected})`}>
          <Chart option={curveChart} height={280} label="Average predicted and observed curve" />
          <Legend items={[{ color: p.ink, label: "Observed (Kaplan-Meier)" }, { color: p.series[0], label: "Predicted (average)" }]} />
        </Card>
        <Card n={cnt(cal.reduce((a, b) => a + b.n, 0), "test rows")} title="Calibration" sub={`Predicted against observed ${q.calib_label}, by fifth of predictions; on the diagonal is perfect`}>
          <Chart option={calChart} height={280} label="Calibration plot" />
        </Card>
        {groups.length > 0 && <Card n={`${cnt(q.rows.test, "test rows")} from ${cnt(q.rows.test_stays, "babies")}`} title="By group of babies" sub="Median predicted and observed days, held-out babies (groups of 5+ babies)">
          <Chart option={groupChart} height={Math.max(180, groups.length * 40)} label="Predicted and observed by group" />
          <Legend items={[{ color: p.muted, label: "Observed" }, { color: p.series[0], label: "Predicted" }]} />
          <TableView head={["Group", "Babies", "Rows", "Observed median", "Predicted median", "Brier score", "C-index"]} rows={groups.map(([k, v]) => [k, v.stays, v.rows, v.observed_median == null ? "not reached" : `${num(v.observed_median, 1)} d`, `${num(v.predicted_median, 1)} d`, num(v.ibs, 3), num(v.c_index, 3)])} />
        </Card>}
        <Card n={`${cnt(q.rows.train, "training rows")} from ${cnt(q.rows.train_stays, "babies")}`} title="What moves the prediction" sub="Cox model hazard ratios with 95% intervals, per the unit shown (axis cut at 0.5 and 2); teal: clearly different from 1 (p < 0.05)">
          <Chart option={hrChart} height={Math.max(260, hr.length * 28)} label="Hazard ratios" />
          <TableView head={["Feature", "Hazard ratio", "95% interval", "p"]} rows={(q.hazard_ratios as any[]).map((r) => [r.feature, num(r.hr, 2), `${num(r.lo, 2)}–${num(r.hi, 2)}`, num(r.p, 3)])} />
        </Card>
      </div>
    </>
  );
}

const TASKS = [
  { key: "admission_los", label: "Stay from admission", lead: "From the birth facts and the first board: how long the whole stay will be." },
  { key: "stay", label: "Remaining stay", lead: "From the stay so far (any amount of history): how much longer the baby will stay, over the next 28 days." },
  { key: "off_tube", label: "Off tube feeds", lead: "From the stay so far and today's feeding: how many days until the baby is off tube feeds." },
  { key: "acuity", label: "Nurse ratio ahead", lead: "From the stay so far: the nurse:patient ratio on each of the next 14 boards." },
];

export default function Models({ data, mode, go }: Props) {
  const [task, setTask] = useState("admission_los");
  const avail = TASKS.filter((t) => (t.key === "stay" || t.key === "acuity" ? data.models : data.questions?.questions?.[t.key]));
  const cur = avail.find((t) => t.key === task) || avail[0];
  if (!cur) return <div className="empty">No model results yet: run `make questions` and the journey study in acuity-models.</div>;
  return (
    <>
      <PageHead eyebrow="Models" title="Predictive models" lead="Four clinical questions, each answered by many kinds of model and compared on the same babies: simple curves, statistical models, machine learning and neural networks. Every score here is on babies the models did not learn from." />
      <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>This is the earlier study, kept for comparison. Decisions and the model used for each prediction are on <a href="#scorecard">How good are the predictions?</a>.</div>
      <TermsBox ids={["ibs", "c-index", "typical-miss", "coverage", "km", "hazard", "calibration", "odds-ratio", "ci", "unseen"]} />
      <div className="row" style={{ marginBottom: 12 }}>
        <Segmented value={cur.key} onChange={setTask} options={avail.map((t) => ({ key: t.key, label: t.label }))} />
      </div>
      <p className="lead-small">{cur.lead}</p>
      {cur.key === "stay" || cur.key === "acuity"
        ? <JourneyView data={data} mode={mode} go={go} task={cur.key} />
        : <QuestionView data={data} mode={mode} go={go} q={data.questions.questions[cur.key]} />}
    </>
  );
}
