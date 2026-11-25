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
type Item = { key: string; group: string; title: string; ask: string; model: string; test: string; n: string; status: string; verdict: string; why: string;
  compared?: Compared; checks?: { label: string; passed: boolean | null }[]; metrics: Metric[] };

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

function ItemCard({ it, mode }: { it: Item; mode: "light" | "dark" }) {
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
  const tcn = data.predictive?.results?.tcn;
  return (
    <Card wide title="Why not bigger models, such as the Temporal Fusion Transformer?" sub="Why the models here are simple, and what would have to change">
      <div className="sc-why">
        <p><b>What those models are.</b> The Temporal Fusion Transformer (TFT), N-BEATS, DeepAR, PatchTST and similar models are deep-learning forecasters built for long time series and many related series (for example thousands of shops or sensors). They have from hundreds of thousands to millions of numbers to learn.</p>
        <p><b>What we have.</b> One unit; {k ? `${num(k.boards, 0)} boards (one per shift) over ${days} days, ${num(k.stays, 0)} baby stays and ${num(k.baby_shifts, 0)} baby-shifts` : "a few hundred boards"}. For the census that is one series of about {days ?? "250"} daily values. The monthly test has {data.scorecard?.items?.find((i: any) => i.key === "census_d1")?.n ?? "about 160 forecasts"} for the 1-day census. A model with millions of parameters would learn this one unit's past by heart and fail on new weeks.</p>
        <p><b>What we tested.</b> A deep model is already in the comparison: a temporal convolutional network (TCN){tcn?.architecture?.parameters ? ` with ${num(tcn.architecture.parameters, 0)} parameters` : ""}, reading two weeks of each baby's boards. For the nurse ratio it was worse than the simple table 1 day ahead, not better by more than chance 3 days ahead, and better 7 days ahead; for leaving the unit it scored the same as the much simpler logistic model. For the census, nothing beat "same as today" for 1–7 days: tomorrow's unit looks very much like today's (Babies & nurses: most babies keep their ratio from shift to shift).</p>
        <p><b>When a bigger model becomes worth testing.</b> More history (several years of boards), real data from more centers, and planned events the boards do not hold yet (booked admissions, planned discharges). A TFT or similar model would then be added to the same monthly test and judged against the same simple rules and pass marks; it would be used only if it beat them.</p>
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
        <Terms wide title="Scores used on this page" ids={["main-score", "c-index", "typical-miss", "ibs", "skill", "coverage", "slope", "in-the-large", "ppv", "sensitivity", "accuracy", "log-loss", "honest-chances", "mae", "within-one", "bias", "baseline", "paired", "pass-mark", "silent"]} />
        {items.map((it) => <ItemCard key={it.key} it={it} mode={mode} />)}
        <WhyNotBigger data={data} />
      </div>
    </>
  );
}
