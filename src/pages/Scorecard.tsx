import { useState } from "react";
import { Card, PageHead } from "../ui";
import { num, PALETTE, pct } from "../theme";
import type { Props } from "../App";
import { Terms, TermLink } from "./Metrics";

/* How good are the predictions? (acuity_insights/build.py: scorecard_section): every prediction the models
   make, scored in words doctors and nurse managers use, beside the simple rule it has to beat; the model used,
   the models compared with it and why it was chosen; and the pass marks it met or missed. Judgements (pass /
   fail) are shown only where a pass mark was written before testing (docs/NEOSTAY_ACCEPTANCE_CRITERIA.md);
   elsewhere the score is compared with the simple rule only. Every score links to Metrics explained. */

type Metric = { label: string; value: number | null; fmt: string; metric: string; base: number | null; base_label: string | null; ideal: string | null;
  better: string; explain: string; passed: boolean | null };
type Compared = { columns: { label: string; fmt: string; metric: string }[]; rows: { name: string; chosen: boolean; baseline: boolean; passed: boolean | null; values: (number | null)[] }[] };
type Detail = { key: string; name: string; why: string; inputs: string; features: string[]; core?: string[]; unit_features?: string[]; settings: string[];
  by_month: { month: string; setting: string }[]; importance: { name: string; weight: number }[] };
type Item = { key: string; group: string; title: string; ask: string; model: string; test: string; n: string; status: string; verdict: string; why: string;
  compared?: Compared; checks?: { label: string; passed: boolean | null }[]; metrics: Metric[]; details?: Detail[] };
type Stat = { n: number; missing: number | null; binary: boolean; share_yes?: number; min?: number; p5?: number; median?: number; p95?: number; max?: number };
type Input = { id: string; name: string; group: string; sets?: string[]; real: Stat; synthetic: Stat };
type Inputs = { babies: Input[]; unit: Input[]; excluded: { field: string; why: string }[]; sets: Record<string, string[]>; n: Record<string, number> };

/* A value range in words: yes/no inputs as the share of yes; numbers as the middle 90% (5th–95th percentile),
   the median and the full range. */
const rng = (s: Stat) => {
  if (s.min == null) return "—";
  if (s.binary) return `${pct(s.share_yes ?? 0, s.share_yes != null && s.share_yes < 0.1 ? 1 : 0)} yes`;
  const f = (v?: number) => (v == null ? "—" : Math.abs(v) >= 100 ? num(v, 0) : num(v, Math.abs(v) < 10 ? 2 : 1));
  return `${f(s.p5)}–${f(s.p95)} (median ${f(s.median)}; ${f(s.min)} to ${f(s.max)})`;
};
const miss = (s: Stat) => (s.missing == null ? "—" : s.missing === 0 ? "none" : pct(s.missing, s.missing < 0.01 ? 1 : 0));

function RangeTable({ rows, compact }: { rows: Input[]; compact?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="sc-table sc-ranges">
        <thead><tr><th>Input</th>{!compact && <th>Group</th>}<th>Real boards: middle 90% (median; full range)</th><th>Missing</th>
          <th>Synthetic data: middle 90% (median; full range)</th><th>Missing</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td><b>{r.name}</b><small>{r.id}</small></td>{!compact && <td><small>{r.group}</small></td>}
            <td className="sc-val">{rng(r.real)}</td><td className="sc-val">{miss(r.real)}</td>
            <td className="sc-val">{rng(r.synthetic)}</td><td className="sc-val">{miss(r.synthetic)}</td></tr>))}
        </tbody>
      </table>
    </div>
  );
}

/* How each model in a comparison was trained: why it is there, its inputs (with ranges), the settings tried and
   chosen in every month, and, for the Temporal Fusion Transformers, the inputs they weighed most. */
function Details({ ds, inputs, mode }: { ds: Detail[]; inputs?: Inputs; mode: "light" | "dark" }) {
  const p = PALETTE[mode];
  const byId = Object.fromEntries([...(inputs?.babies ?? []), ...(inputs?.unit ?? [])].map((r) => [r.id, r]));
  return (
    <details className="sc-details">
      <summary>How each model was trained: inputs, settings and value ranges (real and synthetic)</summary>
      {ds.map((d) => {
        const feats = (d.unit_features?.length ? d.unit_features : d.features).filter((f) => byId[f]);
        return (
          <div key={d.key} className="sc-detail">
            <h5>{d.name}</h5>
            <p className="muted">{d.why}</p>
            <p><b>Inputs.</b> {d.inputs}</p>
            {d.settings.length > 0 && <ul className="sc-set">{d.settings.map((x) => <li key={x}>{x}</li>)}</ul>}
            {d.by_month.length > 0 && (
              <div className="table-scroll"><table className="sc-table">
                <thead><tr><th>Month (cut-off)</th><th>Chosen on the 30 days before the cut-off</th></tr></thead>
                <tbody>{d.by_month.map((m) => <tr key={m.month}><td>{m.month}</td><td><small>{m.setting}</small></td></tr>)}</tbody>
              </table></div>)}
            {d.importance.length > 0 && (
              <div className="sc-imp"><span>Inputs it weighed most (variable-selection weights, average over the six months)</span>
                {d.importance.map((x) => (
                  <div key={x.name}><span>{x.name}</span><i style={{ width: `${Math.min(100, (x.weight / d.importance[0].weight) * 100)}%`, background: p.series[0] }} /><b>{pct(x.weight, 1)}</b></div>))}
              </div>)}
            {feats.length > 0 && (
              <details className="sc-details inner">
                <summary>{feats.length} input{feats.length > 1 ? "s" : ""}{d.core && d.features.length !== d.core.length ? ` (every input; the ${d.core.length} core inputs are marked ●)` : ""}: value ranges in the real and synthetic data</summary>
                <RangeTable compact rows={feats.map((f) => ({ ...byId[f], name: `${d.core && d.features.length !== d.core.length && d.core.includes(f) ? "● " : ""}${byId[f].name}` }))} />
              </details>)}
          </div>);
      })}
    </details>
  );
}

/* Every input the models can use, grouped, with its range in the real boards and in the synthetic data. */
export function ModelInputs({ inputs }: { inputs?: Inputs }) {
  const [group, setGroup] = useState("all");
  if (!inputs) return null;
  const groups = Array.from(new Set(inputs.babies.map((b) => b.group)));
  const rows = inputs.babies.filter((b) => group === "all" || b.group === group);
  return (
    <Card wide id="sc-inputs" title="Every model input, with its range in the real and the synthetic data"
      sub={`Each baby's inputs are read from the board at the moment of the prediction and the boards before it (never later). Real: ${num(inputs.n.real_baby_shifts, 0)} baby-shifts; synthetic: ${num(inputs.n.synthetic_baby_shifts, 0)} baby-shifts of Center 6's synthetic unit.`}
      n={`${inputs.babies.length} baby inputs · ${inputs.unit.length} unit inputs`}>
      <p className="muted">Core inputs ({inputs.sets.core.length}) are the ones the models used first; every input ({inputs.sets.all.length}) adds every other field both datasets carry,
        trends and the unit's state on the same board. In each month of the test, each model chose between them on the 30 days before the cut-off. At admission the models use {inputs.sets.admission_all.length} inputs
        (no history yet). The Temporal Fusion Transformer always reads every input.</p>
      <div className="row" style={{ margin: "6px 0 10px" }}>
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group">
          <option value="all">All groups</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <RangeTable rows={rows.map((r) => ({ ...r, name: `${r.sets?.includes("core") ? "● " : ""}${r.name}` }))} />
      <small className="muted">● core input. Middle 90% = 5th to 95th percentile. Yes/no inputs show the share of baby-shifts with yes.</small>
      <h4 className="sc-h">The unit's inputs (Temporal Fusion Transformer for the unit)</h4>
      <RangeTable rows={inputs.unit} compact />
      <small className="muted">Real: {num(inputs.n.real_boards, 0)} boards; synthetic: {num(inputs.n.synthetic_boards, 0)} boards.</small>
      <h4 className="sc-h">Fields left out on purpose</h4>
      <ul className="sc-set">{inputs.excluded.map((x) => <li key={x.field}><b>{x.field}.</b> {x.why}</li>)}</ul>
    </Card>
  );
}

const STATUS: Record<string, { label: string; cls: string; text: string }> = {
  silent: { label: "Ready for a silent trial", cls: "good",
    text: "Met every pass mark written down before the test. Next step: a silent trial — the model runs beside normal work, nobody acts on it, and its predictions are checked against what happened." },
  not_ready: { label: "Not ready", cls: "bad",
    text: "Missed at least one pass mark (each card shows which, marked ✗). It is not shown to staff as a prediction until it is improved and tested again." },
  comparison: { label: "Measured, not yet gated", cls: "",
    text: "Scored once on unseen babies, but not yet put through the monthly test and its pass marks, so no decision has been made." },
};

const show = (v: number | null, fmt: string) => {
  if (v == null) return "—";
  if (fmt === "pct") return pct(v, 0);
  if (fmt === "signed_pct") return `${v > 0 ? "+" : ""}${num(v * 100, 1)} points`;
  if (fmt === "days") return `${num(v, 1)} days`;
  if (fmt === "babies") return `${num(v, 1)} babies`;
  if (fmt === "babies_signed" || fmt === "signed") return `${v > 0 ? "+" : ""}${num(v, 2)}${fmt === "babies_signed" ? " babies" : ""}`;
  if (fmt === "num1") return num(v, 1);
  if (fmt === "num3") return v.toFixed(3);
  return v.toFixed(2);
};

/* Better or worse than the simple rule, judged on the numbers as shown. */
function vsRule(m: Metric): { word: string; cls: string } | null {
  if (m.base == null || m.value == null || (m.better !== "higher" && m.better !== "lower")) return null;
  if (show(m.value, m.fmt) === show(m.base, m.fmt)) return { word: "same as the rule", cls: "" };
  const better = m.better === "higher" ? m.value > m.base : m.value < m.base;
  return better ? { word: "better than the rule", cls: "good" } : { word: "worse than the rule", cls: "bad" };
}

/* A bar for scores on a 0-100% scale, with the simple rule as a tick. */
function Meter({ m, mode }: { m: Metric; mode: "light" | "dark" }) {
  const p = PALETTE[mode];
  if (m.fmt !== "pct" || m.value == null) return null;
  return (
    <div className="meter" aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(1, m.value)) * 100}%`, background: p.series[0] }} />
      {m.base != null && <b style={{ left: `${Math.max(0, Math.min(1, m.base)) * 100}%`, background: p.muted }} title={m.base_label ?? ""} />}
    </div>
  );
}

const tick = (v: boolean | null | undefined) => (v == null ? <span className="badge">not judged</span> : v ? <span className="badge good">✓ met</span> : <span className="badge bad">✗ missed</span>);

function ItemCard({ it, mode, inputs }: { it: Item; mode: "light" | "dark"; inputs?: Inputs }) {
  const st = STATUS[it.status] ?? STATUS.comparison;
  return (
    <Card wide id={`sc-${it.key}`} title={it.title} sub={it.ask} n={`${it.n} · ${it.test}`} right={<span className={`badge ${st.cls}`}>{st.label}</span>}>
      <div className="sc-model">
        <div><span>Model used</span><b>{it.model}</b></div>
        <div><span>Why this model</span><p>{it.why}</p></div>
      </div>
      <h4 className="sc-h">Its scores</h4>
      <div className="table-scroll">
        <table className="sc-table">
          <thead><tr><th>Score</th><th>This model</th><th>Simple rule</th><th>Ideal</th><th>Verdict</th><th>What it means</th></tr></thead>
          <tbody>
            {it.metrics.map((m, i) => {
              const vr = vsRule(m);
              return (
                <tr key={m.label}>
                  <td><b>{m.label}</b>{i === 0 && <small>main score</small>}<TermLink id={m.metric} /></td>
                  <td className="sc-val">{show(m.value, m.fmt)}<Meter m={m} mode={mode} /></td>
                  <td>{m.base != null ? <>{show(m.base, m.fmt)}<small>{m.base_label}</small></> : "—"}</td>
                  <td><small>{m.ideal}</small></td>
                  <td>{m.passed != null ? tick(m.passed) : vr ? <span className={`badge ${vr.cls}`}>{vr.word}</span> : "—"}</td>
                  <td><small>{m.explain}</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {it.compared && (<>
        <h4 className="sc-h">Models compared on the same babies</h4>
        <div className="table-scroll">
          <table className="sc-table">
            <thead><tr><th>Model</th>{it.compared.columns.map((c) => <th key={c.label}>{c.label}<TermLink id={c.metric} /></th>)}{it.checks && it.checks.length > 0 && <th>All pass marks</th>}</tr></thead>
            <tbody>{it.compared.rows.map((r) => (
              <tr key={r.name} className={r.chosen ? "sc-chosen" : ""}>
                <td><b>{r.name}</b>{r.chosen && <small>model used</small>}{r.baseline && <small>simple rule</small>}</td>
                {r.values.map((v, j) => <td key={j} className="sc-val">{show(v, it.compared!.columns[j].fmt)}</td>)}
                {it.checks && it.checks.length > 0 && <td>{r.baseline ? "—" : tick(r.passed)}</td>}
              </tr>))}
            </tbody>
          </table>
        </div>
      </>)}
      {it.details && it.details.length > 0 && <Details ds={it.details} inputs={inputs} mode={mode} />}
      {it.checks && it.checks.length > 0 && (<>
        <h4 className="sc-h">Pass marks for the model used</h4>
        <ul className="sc-checks">{it.checks.map((c) => <li key={c.label}>{tick(c.passed)}<span>{c.label}</span></li>)}</ul>
      </>)}
      <div className={`note ${it.status === "silent" ? "good-note" : it.status === "not_ready" ? "warn-note" : ""}`}><b>Where it stands today.</b> {it.verdict}</div>
    </Card>
  );
}

export function WhyNotBigger({ data }: { data: any }) {
  const k = data.real?.kpis;
  const days = k ? Math.round((new Date(k.period[1]).getTime() - new Date(k.period[0]).getTime()) / 86400000) + 1 : null;
  const D = data.scorecard?.deep, F = data.predictive?.results?.tft;
  if (!D) return null;
  const f3 = (x: number | undefined) => (x == null ? "—" : x.toFixed(3));
  const best = (o: Record<string, number>, keys: string[]) => keys.filter((x) => o[x] != null).reduce((a, b) => (o[b] < o[a] ? b : a));
  const NM: Record<string, string> = { km: "average stay", logit: "logistic model", gbm: "boosted model", tcn: "TCN", tft: "TFT", lookup: "table", persistence: "same as today", anchored: "forecast from today's babies", train_mean: "training average" };
  const fx = F?.babies?.experiments, ux = F?.unit?.experiments;
  return (
    <Card wide title="The Temporal Fusion Transformer: tested, and where it stands" sub="Why the best models here are not the biggest ones, with the numbers">
      <div className="sc-why">
        <p><b>What it is.</b> The Temporal Fusion Transformer (TFT) is a deep-learning forecaster built for many inputs: it weighs every input, remembers the recent past, looks back at the days that matter and forecasts every day ahead. We built two: one reads each baby's last 28 shifts with <b>every</b> input on the board ({num(D.tft_parameters, 0)} numbers to learn); the other reads the unit's last 28 boards ({num(D.unit_tft_parameters, 0)} numbers). Both were put through the same monthly test as every other model.</p>
        <p><b>Monthly test, learning only from the real boards before each cut-off.</b> Remaining stay: overall error {f3(D.daily_ibs.tft)} for the TFT, against {f3(D.daily_ibs[best(D.daily_ibs, ["logit", "gbm", "tcn"])])} for the {NM[best(D.daily_ibs, ["logit", "gbm", "tcn"])]} and {f3(D.daily_ibs.km)} for the average stay (lower is better).
          Nurse ratio (penalty for confident mistakes, 1 / 3 / 7 days): TFT {["1", "3", "7"].map((h) => f3(D.ratio_log_loss[h].tft)).join(" / ")}, best other model {["1", "3", "7"].map((h) => f3(D.ratio_log_loss[h][best(D.ratio_log_loss[h], ["lookup", "gbm", "tcn"])])).join(" / ")}.
          Babies on the unit (typical miss, 1 / 3 / 7 / 14 days): TFT {["1", "3", "7", "14"].map((h) => num(D.census_mae[h].tft, 1)).join(" / ")}, same as today {["1", "3", "7", "14"].map((h) => num(D.census_mae[h].persistence, 1)).join(" / ")}.</p>
        {fx && ux && <p><b>Learning from synthetic data as well (75-day test).</b> A model this size needs far more examples than one unit has, so we also trained it on Center 6's synthetic babies (from generators fitted before the test days). Remaining stay, overall error: synthetic only {f3(fx.A.survival.ibs)}, real only {f3(fx.B.survival.ibs)}, both {f3(fx.C.survival.ibs)}; the logistic model, real only, {f3(data.predictive?.results?.survival?.modes?.daily?.experiments?.B?.logit?.ibs)}.
          Babies on the unit, typical miss at 1 / 7 days: synthetic only {num(ux.A.by_h["1"].mae, 1)} / {num(ux.A.by_h["7"].mae, 1)}, both {num(ux.C.by_h["1"].mae, 1)} / {num(ux.C.by_h["7"].mae, 1)}, against {num(F.unit.persistence["1"].mae, 1)} / {num(F.unit.persistence["7"].mae, 1)} for same as today.</p>}
        <p><b>Why it does not win here.</b> One unit gives {k ? `${num(k.boards, 0)} boards over ${days} days and ${num(k.stays, 0)} stays` : "a few hundred boards"}. Each month the unit model learns from only {D.unit_train_days[0]}–{D.unit_train_days[D.unit_train_days.length - 1]} days. A model with {num(D.tft_parameters, 0)} numbers to learn can memorise that past and still miss new weeks; boosted trees and simple tables need far less data. And tomorrow's unit looks very much like today's, so "same as today" is hard to beat.</p>
        <p><b>What we use instead.</b> For each question, the model that scored best in the monthly test and met the pass marks (see each card). Every model could use every input; inside each month it kept the extra inputs only where they predicted better on the days before the cut-off.</p>
        <p><b>When the TFT should be tried again.</b> With several years of boards, real data from more centers, or planned events the boards do not yet hold (booked admissions, planned discharges). It stays in the monthly test, so it will be used as soon as it beats the simpler models.</p>
      </div>
    </Card>
  );
}

export default function Scorecard({ data, mode }: Props) {
  const sc = data.scorecard;
  if (!sc?.items?.length) return <div className="empty">No prediction scores yet: run `make insights-data` in acuity-models.</div>;
  const items: Item[] = sc.items;
  const counts = { silent: items.filter((i) => i.status === "silent").length, not_ready: items.filter((i) => i.status === "not_ready").length,
    comparison: items.filter((i) => i.status === "comparison").length };
  return (
    <>
      <PageHead eyebrow="Predictive models" title="How good are the predictions?"
        lead="Every prediction the models make, scored on real Center 6 babies the models never saw while learning, in plain words and beside the simple rule it has to beat. For each one: the model used, the models it was compared with, why it was chosen, and the pass marks it met or missed. No model is approved for decisions about an individual baby." />
      <div className="note"><b>Which test?</b> These results come from the <TermLink id="monthly" text="monthly test" /> (six months, each model retrained before a cut-off and tested on the next 30 days), the decisive test.
        The <a href="#predictive/overview">Predictive modeling &amp; evaluation</a> pages show the earlier <TermLink id="holdout" text="75-day test" />, a single look at the last 75 days, with more technical detail; their numbers differ a little because the babies tested differ.</div>
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Predictions scored</span><span className="kpi-value">{items.length}</span><span className="kpi-sub">stays, ratios, breathing, feeding, census and nurses</span></div>
        <div className="kpi" style={{ "--accent": PALETTE[mode].good } as React.CSSProperties}><span className="kpi-label">Ready for a silent trial</span><span className="kpi-value">{counts.silent}</span><span className="kpi-sub">met every pass mark</span></div>
        <div className="kpi" style={{ "--accent": PALETTE[mode].bad } as React.CSSProperties}><span className="kpi-label">Not ready</span><span className="kpi-value">{counts.not_ready}</span><span className="kpi-sub">missed a pass mark</span></div>
        <div className="kpi"><span className="kpi-label">Measured, not yet gated</span><span className="kpi-value">{counts.comparison}</span><span className="kpi-sub">one test or the earlier study</span></div>
      </div>
      <div className="grid">
        <Card wide title="What the three statuses mean" sub="Every prediction has one">
          <div className="sc-gloss">{Object.entries(STATUS).map(([k, s]) => <div key={k}><b><span className={`badge ${s.cls}`}>{s.label}</span></b><span>{s.text}</span></div>)}</div>
        </Card>
        <Card wide title="Where each prediction stands today" sub="One line per prediction: the model used, its main score beside the simple rule, and the status. The main score is the one score shown first for each prediction, because it answers the question most people ask about it; click a prediction for all its scores."
          n={`${items.length} predictions`}>
          <div className="table-scroll">
            <table className="sc-table">
              <thead><tr><th>Prediction</th><th>Model used</th><th>Main score</th><th>Model</th><th>Simple rule</th><th>Status</th></tr></thead>
              <tbody>
                {items.map((it) => {
                  const h = it.metrics[0], st = STATUS[it.status] ?? STATUS.comparison;
                  return (
                    <tr key={it.key}>
                      <td><a href="#scorecard" onClick={(e) => { e.preventDefault(); document.getElementById(`sc-${it.key}`)?.scrollIntoView({ behavior: "smooth" }); }}><b>{it.title}</b></a></td>
                      <td><small>{it.model}</small></td>
                      <td>{h.label}<TermLink id={h.metric} /></td><td className="sc-val">{show(h.value, h.fmt)}</td>
                      <td>{h.base != null ? <>{show(h.base, h.fmt)}<small>{h.base_label}</small></> : "—"}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Terms wide title="Scores used on this page" ids={["main-score", "c-index", "typical-miss", "ibs", "skill", "coverage", "slope", "in-the-large", "ppv", "sensitivity", "accuracy", "log-loss", "honest-chances", "mae", "within-one", "bias", "baseline", "paired", "pass-mark", "silent", "feature-set", "tft", "tcn"]} />
        {items.map((it) => <ItemCard key={it.key} it={it} mode={mode} inputs={data.model_inputs} />)}
        <WhyNotBigger data={data} />
        <ModelInputs inputs={data.model_inputs} />
      </div>
    </>
  );
}
