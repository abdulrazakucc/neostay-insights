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
  const fx = F?.babies?.experiments;
  return (
    <Card wide title="Why not a bigger model, such as the Temporal Fusion Transformer?" sub="Tested; the numbers">
      <div className="sc-why">
        <p><b>What it is.</b> A deep-learning forecaster built for many inputs: it weighs every input, remembers the recent past and forecasts every day ahead. We built one that reads each baby's last 28 shifts with every input on the board ({num(D.tft_parameters, 0)} numbers to learn) and put it through the same monthly test.</p>
        <p><b>Result.</b> Remaining stay, overall error (lower is better): {f3(D.daily_ibs.tft)} for the TFT against {f3(D.daily_ibs.ens ?? D.daily_ibs.gbm)} for the stay model and {f3(D.daily_ibs.km)} for the average stay.
          {fx && <> Trained on synthetic babies as well (75-day test) it improved ({f3(fx.B.survival.ibs)} real only, {f3(fx.C.survival.ibs)} with synthetic), but stayed behind the logistic model ({f3(data.predictive?.results?.survival?.modes?.daily?.experiments?.B?.logit?.ibs)}).</>}</p>
        <p><b>Why.</b> One unit gives {k ? `${num(k.boards, 0)} boards over ${days} days and ${num(k.stays, 0)} stays` : "a few hundred boards"}: too little for a model this size, which can memorise the past and still miss new weeks. Boosted trees and simple tables need far less data. It stays in the test and would be used if it ever won.</p>
      </div>
    </Card>
  );
}

/* The simple view: the stay, the baby's condition ahead, and the ratio that follows from the condition through the
   unit's past practice; one score from 0 to 1 each. */
type Sc = { score: number | null };
type Simple = { models: { key: string; name: string; what: string }[]; period: string;
  stay: { admission: Sc & { c: number; miss: number; km_miss: number; n: string }; daily: Sc & { c: number; miss: number; km_miss: number; n: string };
    by_day: (Sc & { label: string; miss: number; km_miss: number; n: number; babies: number })[] };
  condition: { key: string; name: string; by: (Sc & { h: string; when: string; rule: number | null; acc: number; rule_acc: number; n: number })[] }[];
  ratio: { now: Sc & { acc: number; n: number }; ahead: (Sc & { h: string; when: string; acc: number; rule_acc: number })[] };
  practice: { modes: string[]; stages: string[]; table: { ratio: string; share: number; n: number }[][] } };

function ScoreBar({ v, mode }: { v: number | null; mode: "light" | "dark" }) {
  const p = PALETTE[mode];
  if (v == null) return null;
  return (
    <div className="simple-bar" aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: p.series[0] }} />
      {[0.25, 0.5, 0.75].map((t) => <b key={t} style={{ left: `${t * 100}%` }} />)}
    </div>
  );
}
const Big = ({ v, mode, label }: { v: number | null; mode: "light" | "dark"; label?: string }) => (
  <div className="simple-score">{label && <span className="simple-lab">{label}</span>}<strong>{v != null ? v.toFixed(2) : "–"}</strong><ScoreBar v={v} mode={mode} /></div>);

function SimpleView({ sm, mode }: { sm: Simple; mode: "light" | "dark" }) {
  const st = sm.stay, r = sm.ratio;
  return (
    <>
      <div className="simple-models">
        {sm.models.map((m) => <div key={m.key}><b>{m.name}</b><p>{m.what}</p></div>)}
      </div>
      <Card wide title="1. How long will the baby stay?" sub="Stay model · score from 0 (no better than the unit's average stay) to 1 (always right)">
        <div className="simple-two">
          <div><Big v={st.admission.score} mode={mode} label="At admission" />
            <p className="simple-say">Of two newly admitted babies, it says correctly which one leaves first {Math.round(st.admission.c * 100)} times in 100; typically {num(st.admission.miss, 1)} days off (the average stay: {num(st.admission.km_miss, 1)} days off).</p></div>
          <div><Big v={st.daily.score} mode={mode} label="On every later day" />
            <p className="simple-say">For a baby already on the unit: right order {Math.round(st.daily.c * 100)} times in 100; typically {num(st.daily.miss, 1)} days off (the average stay: {num(st.daily.km_miss, 1)}).</p></div>
        </div>
        {st.by_day.length > 0 && (<>
          <h4 className="sc-h">By how long the baby has already been on the unit</h4>
          <div className="simple-days">{st.by_day.map((b) => (
            <div key={b.label}><span>{b.label}</span><strong>{b.score != null ? b.score.toFixed(2) : "–"}</strong><ScoreBar v={b.score} mode={mode} />
              <small>typically {num(b.miss, 1)} days off (average stay: {num(b.km_miss, 1)}) · {b.babies} babies</small></div>))}
          </div></>)}
      </Card>
      <Card wide title="2. How will the baby's condition change?" sub="Condition model · breathing support and feeding stage (or gone home) · score from 0 (no better than the unit's usual mix) to 1 (always right)">
        <div className="table-scroll">
          <table className="sc-table simple-cond">
            <thead><tr><th></th>{sm.condition[0].by.map((x) => <th key={x.h}>{x.when}</th>)}</tr></thead>
            <tbody>{sm.condition.map((c) => (
              <tr key={c.key}><td><b>{c.name}</b></td>{c.by.map((x) => (
                <td key={x.h}><Big v={x.score} mode={mode} /><small>right {Math.round(x.acc * 100)} times in 100 (same as today: {Math.round(x.rule_acc * 100)})</small></td>))}</tr>))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card wide title="3. Which nurse ratio follows from the condition?" sub="Past-practice ratio table · not a prediction: how the unit assigned ratios for each breathing support and feeding stage">
        <div className="simple-two">
          <div><Big v={r.now.score} mode={mode} label="Today's ratio from today's condition" />
            <p className="simple-say">Knowing only today's breathing support and feeding, past practice gives the right ratio {Math.round(r.now.acc * 100)} times in 100. The rest depends on things the boards hold less well: spells, procedures, judgement and staffing.</p>
            <p className="simple-say">For tomorrow, "same as today" is still the better guess for the ratio: it rarely changes overnight. A week ahead, the ratio from the predicted condition is right far more often.</p></div>
          <div><span className="simple-lab">The ratio ahead, from the predicted condition</span>
            <div className="simple-days small">{r.ahead.map((x) => (
              <div key={x.h}><span>{x.when}</span><strong>{x.score != null ? x.score.toFixed(2) : "–"}</strong><ScoreBar v={x.score} mode={mode} /><small>right {Math.round(x.acc * 100)} in 100 (same as today: {Math.round(x.rule_acc * 100)})</small></div>))}
            </div></div>
        </div>
        <details className="sc-details inner">
          <summary>See the past-practice table: the usual ratio for each breathing support and feeding stage</summary>
          <div className="table-scroll">
            <table className="sc-table practice">
              <thead><tr><th>Breathing support</th>{sm.practice.stages.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>{sm.practice.modes.map((m, a) => (
                <tr key={m}><td><b>{m}</b></td>{sm.practice.table[a].map((c, b) => (
                  <td key={b} className={c.n < 5 ? "few" : ""}>{c.n ? <><b>{c.ratio}</b><small>{pct(c.share, 0)} of {c.n} boards</small></> : <small>never seen</small>}</td>))}</tr>))}
              </tbody>
            </table>
          </div>
          <small className="muted">From the training months of the last test month. Combinations seen fewer than 5 times use the breathing-support row.</small>
        </details>
      </Card>
      <div className="note"><b>How to read the score</b> <TermLink id="score-01" text="(definition)" />. It says how much smaller a model's errors are than those of the simplest guess
        (the unit's averages): 0.40 means 40% smaller. "Same as today" can be right as often as a model yet score lower, because it is always fully sure and each miss counts heavily.
        Every score comes from {sm.period}. No prediction is used for decisions about an individual baby. Nurses needed for the whole unit will follow from these by adding up the babies; it is not the focus yet.</div>
    </>
  );
}

/* Every model compared for the condition ahead (analysts). */
function ConditionDetail({ cond }: { cond: any }) {
  const NM: Record<string, string> = { persistence: "Same as today", table: "What usually follows today's state", gbm: "Boosted-tree model", ens: "Condition model (mix)", base: "The unit's usual mix" };
  return (
    <Card wide title="The condition ahead: every model compared" sub="Monthly test, pooled over six months. Brier score and log loss: lower is better.">
      {[["mode", "Breathing support"], ["stage", "Feeding stage"]].map(([t, name]) => (
        <div key={t} className="table-scroll"><h4 className="sc-h">{name}</h4>
          <table className="sc-table">
            <thead><tr><th>Model</th>{["1", "3", "7"].map((h) => <th key={h}>{h} day{h !== "1" ? "s" : ""}: right · Brier · log loss</th>)}</tr></thead>
            <tbody>{["base", "persistence", "table", "gbm", "ens"].map((k) => (
              <tr key={k} className={k === "ens" ? "sc-chosen" : ""}><td><b>{NM[k]}</b></td>{["1", "3", "7"].map((h) => { const m = cond[t][h].models[k]; return (
                <td key={h} className="sc-val">{pct(m.accuracy, 0)} · {m.brier.toFixed(3)} · {m.log_loss.toFixed(3)}</td>); })}</tr>))}
            </tbody>
          </table></div>))}
    </Card>
  );
}

export default function Scorecard({ data, mode }: Props) {
  const sc = data.scorecard;
  if (!sc?.items?.length) return <div className="empty">No prediction scores yet: run `make insights-data` in acuity-models.</div>;
  const items: Item[] = sc.items;
  return (
    <>
      <PageHead eyebrow="Predictive models" title="How good are the predictions?"
        lead="Everything starts from the baby: how long the stay will be, and how the baby's condition will change. The nurse ratio follows from the condition through the unit's past practice. Each gets one score from 0 (no better than the unit's averages) to 1 (always right), measured on real Center 6 babies the models had never seen." />
      {sc.simple && <SimpleView sm={sc.simple} mode={mode} />}
      <details className="sc-details analyst">
        <summary>Technical details for analysts: every score, the models compared, pass marks, training settings and inputs</summary>
        <div className="grid" style={{ marginTop: 12 }}>
          <Terms wide title="Scores used in these details" ids={["c-index", "typical-miss", "ibs", "skill", "coverage", "slope", "in-the-large", "ppv", "sensitivity", "accuracy", "log-loss", "brier", "baseline", "paired", "pass-mark", "feature-set", "tft"]} />
          {items.filter((it) => it.key.startsWith("leave_")).map((it) => <ItemCard key={it.key} it={it} mode={mode} inputs={data.model_inputs} />)}
          {sc.condition && <ConditionDetail cond={sc.condition} />}
          <ModelInputs inputs={data.model_inputs} />
          <WhyNotBigger data={data} />
        </div>
      </details>
    </>
  );
}
