import { Card, Legend, PageHead } from "../ui";
import { num, PALETTE, pct } from "../theme";
import type { Props } from "../App";

/* Prediction scorecard (acuity_insights/build.py: scorecard_section): every prediction the models make,
   scored in words doctors and nurse managers use, beside the simple rule it has to beat. Judgements
   (pass / fail) are shown only where a pass mark was written before testing (docs/NEOSTAY_ACCEPTANCE_CRITERIA.md);
   elsewhere the score is compared with the simple rule only. */

type Metric = { label: string; value: number | null; fmt: string; base: number | null; base_label: string | null; ideal: string | null; better: string; explain: string; passed: boolean | null };
type Item = { key: string; group: string; title: string; ask: string; model: string; test: string; n: string; status: string; verdict: string; metrics: Metric[] };

const STATUS: Record<string, { label: string; cls: string; text: string }> = {
  silent: { label: "Ready for a silent trial", cls: "good", text: "Passed every pass mark set before testing. Next: run beside normal work, with nobody acting on it, and check again." },
  not_ready: { label: "Not ready", cls: "bad", text: "Failed at least one pass mark. Not shown to staff as a prediction." },
  comparison: { label: "Measured, not yet gated", cls: "", text: "Scored on unseen babies, but not yet put through the monthly test and pass marks." },
};

const show = (v: number | null, fmt: string) => {
  if (v == null) return "—";
  if (fmt === "pct") return pct(v, 0);
  if (fmt === "days") return `${num(v, 1)} days`;
  if (fmt === "babies") return `${num(v, 1)} babies`;
  if (fmt === "babies_signed") return `${v > 0 ? "+" : ""}${num(v, 2)} babies`;
  return num(v, 2);
};

/* Met or missed a pass mark written before the backtest (docs/NEOSTAY_ACCEPTANCE_CRITERIA.md), as the
   backtest recorded it; null where no pass mark applies. */
const passMark = (m: Metric): boolean | null => (m.passed == null ? null : m.passed);

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

function ItemCard({ it, mode }: { it: Item; mode: "light" | "dark" }) {
  const st = STATUS[it.status] ?? STATUS.comparison;
  return (
    <Card wide id={`sc-${it.key}`} title={it.title} sub={it.ask} n={`${it.n} · ${it.test}`}
      right={<span className={`badge ${st.cls}`}>{st.label}</span>}>
      <div className="sc-model">Model: <b>{it.model}</b></div>
      <div className="table-scroll">
        <table className="sc-table">
          <thead><tr><th>Score</th><th>This model</th><th>Simple rule</th><th>Ideal</th><th>Verdict</th><th>What it means</th></tr></thead>
          <tbody>
            {it.metrics.map((m) => {
              const pm = passMark(m), vr = vsRule(m);
              return (
                <tr key={m.label}>
                  <td><b>{m.label}</b></td>
                  <td className="sc-val">{show(m.value, m.fmt)}<Meter m={m} mode={mode} /></td>
                  <td>{m.base != null ? <>{show(m.base, m.fmt)}<small>{m.base_label}</small></> : "—"}</td>
                  <td><small>{m.ideal}</small></td>
                  <td>{pm != null ? <span className={`badge ${pm ? "good" : "bad"}`}>{pm ? "meets pass mark" : "misses pass mark"}</span>
                    : vr ? <span className={`badge ${vr.cls}`}>{vr.word}</span> : "—"}</td>
                  <td><small>{m.explain}</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`note ${it.status === "silent" ? "good-note" : it.status === "not_ready" ? "warn-note" : ""}`}><b>Where it stands today.</b> {it.verdict}</div>
    </Card>
  );
}

const GLOSSARY: [string, string][] = [
  ["Gets the order right", "Take two babies: how often does the model say correctly which one leaves (or comes off tube feeds) first? 50% is a coin toss, 100% is perfect. Good models in medicine often score 70–85%."],
  ["Typical miss", "How far the predicted number of days is from what really happened. Smaller is better."],
  ["Right answer / right ratio", "How often the model's single most likely answer (a ratio, a breathing support, a feeding stage) was what the baby had."],
  ["Honest range", "Models give a range they are 80% (or 50%) sure of. An honest model's 80% range holds the real outcome about 8 times in 10, not 6 and not 10."],
  ["Stated chances match reality", "When the model says 70%, does it happen 7 times in 10? A score of 1.0 is perfect; below 1 means the model is too sure of itself."],
  ["Honest chances", "A rule like 'same as today' is always 100% sure, so when it is wrong it is badly wrong. This score shows how much the model reduces the penalty for confident mistakes."],
  ["Nurses right within one", "How often the forecast of bedside nurses needed was within one nurse of what the babies' ratios really needed."],
  ["Simple rule", "What we would do without a model: the unit's average stay for every baby, or 'same as today'. A model is only worth using if it beats it."],
];

export default function Scorecard({ data, mode }: Props) {
  const sc = data.scorecard;
  if (!sc?.items?.length) return <div className="empty">No prediction scores yet: run `make insights-data` in acuity-models.</div>;
  const items: Item[] = sc.items;
  const counts = { silent: items.filter((i) => i.status === "silent").length, not_ready: items.filter((i) => i.status === "not_ready").length,
    comparison: items.filter((i) => i.status === "comparison").length };
  return (
    <>
      <PageHead eyebrow="Predictive models" title="How good are the predictions?"
        lead="Every prediction the models make, scored on real Center 6 babies the models never saw while learning, in plain words, and beside the simple rule it has to beat. No model is approved for decisions about an individual baby." />
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Predictions scored</span><span className="kpi-value">{items.length}</span><span className="kpi-sub">babies' stays, ratios, breathing, feeding, census and nurses</span></div>
        <div className="kpi" style={{ "--accent": PALETTE[mode].good } as React.CSSProperties}><span className="kpi-label">Ready for a silent trial</span><span className="kpi-value">{counts.silent}</span><span className="kpi-sub">passed every pass mark</span></div>
        <div className="kpi" style={{ "--accent": PALETTE[mode].bad } as React.CSSProperties}><span className="kpi-label">Not ready</span><span className="kpi-value">{counts.not_ready}</span><span className="kpi-sub">missed a pass mark or the simple rule</span></div>
        <div className="kpi"><span className="kpi-label">Measured, not yet gated</span><span className="kpi-value">{counts.comparison}</span><span className="kpi-sub">one test or the earlier study</span></div>
      </div>
      <div className="grid">
        <Card wide title="Where each prediction stands today" sub="One line per prediction: its headline score against the simple rule, and the decision" n={`${items.length} predictions`}>
          <div className="table-scroll">
            <table className="sc-table">
              <thead><tr><th>Prediction</th><th>Headline score</th><th>Model</th><th>Simple rule</th><th>Status</th></tr></thead>
              <tbody>
                {items.map((it) => {
                  const h = it.metrics[0], st = STATUS[it.status] ?? STATUS.comparison;
                  return (
                    <tr key={it.key}>
                      <td><a href={`#scorecard`} onClick={(e) => { e.preventDefault(); document.getElementById(`sc-${it.key}`)?.scrollIntoView({ behavior: "smooth" }); }}><b>{it.title}</b></a></td>
                      <td>{h.label}</td><td className="sc-val">{show(h.value, h.fmt)}</td>
                      <td>{h.base != null ? <>{show(h.base, h.fmt)}<small>{h.base_label}</small></> : "—"}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Legend items={[{ color: PALETTE[mode].good, label: STATUS.silent.text }, { color: PALETTE[mode].bad, label: STATUS.not_ready.text }, { color: PALETTE[mode].muted, label: STATUS.comparison.text }]} />
        </Card>
        <Card wide title="How to read the scores" sub="The same few scores are used for every prediction">
          <div className="sc-gloss">{GLOSSARY.map(([t, d]) => <div key={t}><b>{t}</b><span>{d}</span></div>)}</div>
          <div className="note">Tested on: the monthly test refits each model on all boards before a cut-off date and tests it on the next 30 days, six times (31 March to 28 August 2026 cut-offs). Breathing and feeding ahead were tested once on the last 75 days. The pass marks were written down before the test was run.</div>
        </Card>
        {items.map((it) => <ItemCard key={it.key} it={it} mode={mode} />)}
      </div>
    </>
  );
}
