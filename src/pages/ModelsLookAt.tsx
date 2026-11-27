import { Fragment, useState } from "react";
import { Card, PageHead, Segmented } from "../ui";
import { num, PALETTE, pct } from "../theme";
import type { Props } from "../App";
import "./models-look-at.css";

/* What the models look at (acuity_predict/feature_use.py -> insights.json "feature_use", joined with
   "model_inputs" for groups and value ranges). For every prediction: what is predicted, when the model is used,
   and for every item of the board how the model uses it (weighed = predictor; starting point = predicate, the
   row of a table the prediction starts from), how much it matters (permutation importance, cross-fitted by baby),
   which way it pushes the prediction (typical low to typical high value, everything else as on the board), the
   questions the boosted trees ask about it, in how many of the six test months it was used, and its typical value
   in the real and the synthetic data. Written for doctors and hospital management. */

type Q = { text: string; share: number };
type Row = { id: string; role: string; months: number; importance?: number; rank?: number; effect?: number; low?: string; high?: string;
  tree_share?: number; questions?: Q[]; odds_ratio_per_sd?: number };
type Horizon = { h: number | null; label: string; base?: number; weight_table?: number; features_set?: string; features: Row[]; training_origins?: number };
type Task = { key: string; name: string; outcome: string; applies: string; effect_of: string; model: string; horizons: Horizon[]; candidates: number;
  training_origins?: number; training_babies?: number };
type Use = { month: string; trained_on: string; folds: number; names: Record<string, string>; help: Record<string, string>; codes?: Record<string, string[]>; tasks: Task[] };
type Stat = { binary: boolean; share_yes?: number; p5?: number; median?: number; p95?: number; missing?: number | null };
type Inp = { id: string; group: string; real: Stat; synthetic: Stat };
type Out = { name: string; symbol: string; values: string; meaning: string };
type IO = { key: string; kind: "final" | "part" | "tested"; name: string; how: string; inputs_note: string; extra_inputs: string[]; inputs: string[]; starting_point: string[]; outputs: Out[] };

/* Every model as input variables -> model -> output variables. */
function InputsOutputs({ io, names, groups }: { io: IO[]; names: Record<string, string>; groups: Record<string, string> }) {
  const one = (m: IO) => {
    const byGroup: Record<string, string[]> = {};
    m.inputs.forEach((f) => { (byGroup[groups[f] ?? "Other"] ??= []).push(f); });
    return (
      <div key={m.key} className="mla-io">
        <div className="mla-io-in">
          <span className="mla-io-h">Input variables{m.inputs.length ? ` (${m.inputs.length})` : ""}</span>
          <p className="mla-muted">{m.inputs_note}</p>
          {Object.entries(byGroup).map(([g, fs]) => (
            <p key={g}><b>{g}:</b> {fs.map((f, i) => <span key={f}>{i ? ", " : ""}{names[f] ?? f}{m.starting_point.includes(f) ? " (starting point)" : ""}</span>)}</p>))}
          {m.extra_inputs.length > 0 && <ul>{m.extra_inputs.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
        <div className="mla-io-model"><b>{m.name}</b><span>{m.how}</span><i aria-hidden>→</i></div>
        <div className="mla-io-out">
          <span className="mla-io-h">Output variables</span>
          {m.outputs.map((o) => <p key={o.name}><b>{o.name}</b> <span className="mla-muted">({o.symbol})</span><br />{o.values}{o.meaning ? `. ${o.meaning}` : ""}</p>)}
        </div>
      </div>
    );
  };
  return (
    <Card wide title="Inputs and outputs of every model" sub="Each model takes input variables from the baby's board and produces output variables. The final models make every prediction in the app; their parts, the reference and the models tested but not used are folded below.">
      {io.filter((m) => m.kind === "final").map(one)}
      <details className="sc-details"><summary>Their parts, the reference curve, and the models tested but not used</summary>
        {io.filter((m) => m.kind !== "final").map(one)}
      </details>
    </Card>
  );
}

const ROLE: Record<string, { label: string; tech: string; cls: string; text: string }> = {
  predictor: { label: "Input", tech: "weighed", cls: "w", text: "An input variable: the model weighs it together with the other inputs to produce its outputs." },
  predicate: { label: "Input", tech: "starting point", cls: "s", text: "An input variable that picks the row of a table the prediction starts from: what usually followed babies in the same state." },
  "predicate+predictor": { label: "Input", tech: "starting point and weighed", cls: "s", text: "An input variable that picks the starting row of the table, and is also weighed by the boosted trees." },
  other_months: { label: "Not an input", tech: "other months only", cls: "o", text: "Not an input of this month's model; chosen in some other months of the test." },
  unused: { label: "Not an input", tech: "", cls: "o", text: "Never an input of this model." },
};

const typical = (s?: Stat, codes?: string[]) => {
  if (!s || s.median == null) return "—";
  if (codes) {
    const c = (v?: number) => (v == null ? "—" : codes[Math.max(0, Math.min(codes.length - 1, Math.round(v)))]);
    return s.p5 === s.p95 ? c(s.median) : `${c(s.median)} (${c(s.p5)} to ${c(s.p95)})`;
  }
  if (s.binary) return `${pct(s.share_yes ?? 0, (s.share_yes ?? 0) < 0.1 ? 1 : 0)} of boards`;
  const f = (v?: number) => (v == null ? "—" : Math.abs(v) >= 100 ? num(v, 0) : num(v, Math.abs(v) < 10 ? 2 : 1));
  return `${f(s.median)} (${f(s.p5)}–${f(s.p95)})`;
};

function Effect({ r, of }: { r: Row; of: string }) {
  if (r.effect == null || !of) return <span className="mla-muted">—</span>;
  const pts = Math.round(Math.abs(r.effect) * 100);
  const dir = pts < 1 ? "hardly changes" : r.effect > 0 ? `↑ ${pts} point${pts > 1 ? "s" : ""}` : `↓ ${pts} point${pts > 1 ? "s" : ""}`;
  return (
    <span title={`Moving ${r.low} to ${r.high} for every baby, all else as on the board: the ${of} ${pts < 1 ? "hardly changes" : `${r.effect > 0 ? "goes up" : "goes down"} by ${pts} percentage points`}.`}>
      <span className="mla-from">{r.low} → {r.high}</span> <b>{dir}</b>
    </span>
  );
}

export default function ModelsLookAt({ data, mode }: Props) {
  const use: Use | undefined = data.feature_use;
  const [task, setTask] = useState("stay_daily");
  const [h, setH] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [showSmall, setShowSmall] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!use) return <div className="empty">No feature-use results yet: run python -m acuity_predict.feature_use, then make insights-data.</div>;
  const p = PALETTE[mode];
  const inputs: Record<string, Inp> = Object.fromEntries((data.model_inputs?.babies ?? []).map((b: Inp) => [b.id, b]));
  const groups: Record<string, string> = Object.fromEntries(Object.values(inputs).map((b) => [b.id, b.group]));
  const T = use.tasks.find((t) => t.key === task) ?? use.tasks[0];
  const H = T.horizons[Math.min(h, T.horizons.length - 1)] ?? T.horizons[0];
  const used = H.features.filter((r) => r.role !== "unused" && r.role !== "other_months").sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  // Items that matter less than 1% are folded (still listed), so the page opens on what the model relies on.
  const big = used.filter((r, i) => i < 5 || (r.importance ?? 0) >= 0.01 || r.role.startsWith("predicate")), small = used.filter((r) => !big.includes(r));
  const rest = H.features.filter((r) => r.role === "unused" || r.role === "other_months").sort((a, b) => b.months - a.months);
  const top = Math.max(...used.map((r) => r.importance ?? 0), 1e-9);
  const name = (id: string) => use.names[id] ?? id;
  const shortNames: Record<string, string> = { stay_admission: "Stay at admission", stay_daily: "Stay, every day", mode: "Breathing ahead", stage: "Feeding ahead", practice: "Nurse ratio" };

  const row = (r: Row) => {
    const role = ROLE[r.role] ?? ROLE.unused, inp = inputs[r.id], isOpen = open === r.id;
    return (
      <Fragment key={r.id}>
        <tr className={`mla-row ${isOpen ? "open" : ""}`} onClick={() => setOpen(isOpen ? null : r.id)}>
          <td><b>{name(r.id)}</b><small>{inp?.group ?? ""}</small></td>
          <td><span className={`mla-chip ${role.cls}`} title={role.text}>{role.label}</span>{role.tech && <small>{role.tech}</small>}</td>
          <td className="mla-bar">{r.importance != null ? (
            <><span className="mla-track"><i style={{ width: `${Math.max(2, (r.importance / top) * 100)}%`, background: p.series[0] }} /></span><b>{pct(r.importance, r.importance < 0.01 ? 1 : 0)}</b></>) : <span className="mla-muted">—</span>}</td>
          <td><Effect r={r} of={T.effect_of} /></td>
          <td className="mla-num">{T.key === "practice" ? "—" : `${r.months} of 6`}</td>
          <td className="mla-typ">{typical(inp?.real, use.codes?.[r.id])}</td>
          <td className="mla-typ">{typical(inp?.synthetic, use.codes?.[r.id])}</td>
        </tr>
        {isOpen && (
          <tr className="mla-more"><td colSpan={7}>
            <p><b>What it is.</b> {use.help[r.id] ?? ""}</p>
            <p><b>How this model uses it.</b> {role.text}</p>
            {r.questions && r.questions.length > 0 && <p><b>Questions the boosted trees ask most.</b> {r.questions.map((q) => `"${q.text}"`).join("; ")}{r.tree_share != null && ` (this item: ${pct(r.tree_share, 0)} of what the trees learned)`}</p>}
            {r.odds_ratio_per_sd != null && <p><b>Statistical part.</b> One standard deviation higher multiplies the daily odds of going home by {num(r.odds_ratio_per_sd, 2)}.</p>}
          </td></tr>)}
      </Fragment>
    );
  };

  return (
    <div className="page">
      <PageHead eyebrow="Models" title="What the models look at"
        lead="Every model takes input variables from the baby's board (at the moment of the prediction and the boards before it, never later) and produces output variables. First, each model's inputs and outputs; then, for each prediction, how much each input matters and which way it pushes the outputs." />
      {data.model_io && <InputsOutputs io={data.model_io} names={use.names} groups={groups} />}

      <Card wide title="How to read the tables below" sub={`The models shown are the ones trained on ${use.trained_on} (the last month of the test), with the inputs and settings that month chose.`}>
        <div className="mla-legend">
          {(["predictor", "predicate"] as const).map((k) => (
            <div key={k}><span className={`mla-chip ${ROLE[k].cls}`}>{ROLE[k].label}</span><span><b>({ROLE[k].tech})</b> {ROLE[k].text}</span></div>))}
          <div><span className="mla-chip p">Output</span><span>What the model produces (listed above). An output is never one of the model's own inputs.</span></div>
        </div>
        <ul className="mla-notes">
          <li><b>How much it matters</b>: how much worse the predictions get, for babies the model did not learn from, when this item is shuffled among them. Shares add up to 100% for each prediction.</li>
          <li><b>Which way</b>: the average change in the predicted chance when the item is moved from a typical low value to a typical high one (10th to 90th percentile, or no to yes) for every baby, all else as on the board. It shows what the model learned from past babies, <b>not a medical cause</b>.</li>
          <li><b>Typical value</b>: median (middle 90% of boards) in the real boards and in the synthetic data. Click a row for what the item is and the questions the model asks about it.</li>
        </ul>
      </Card>

      <Card wide title={T.name} sub={T.model} right={<Segmented options={use.tasks.map((t) => ({ key: t.key, label: shortNames[t.key] ?? t.name }))} value={T.key} onChange={(k) => { setTask(k); setOpen(null); setShowSmall(false); setShowAll(false); }} />}>
        <div className="mla-facts">
          <div><span className="mla-chip p">Output</span> {T.outcome}</div>
          <div><b>Used on:</b> {T.applies}</div>
          {T.key !== "practice" && <div><b>Input variables:</b> {used.length} in this month's model, of {T.candidates} available{T.key === "stay_admission" ? " (items about the journey so far do not exist yet on the first board)" : ""}{T.training_babies ? `; learned from ${num(T.training_babies, 0)} babies` : ""}.</div>}
          {H.weight_table != null && <div><b>Mix:</b> {pct(H.weight_table, 0)} the change table (starting point: today's state), {pct(1 - H.weight_table, 0)} the boosted trees ({H.features_set === "all" ? "every input" : "core inputs"}).</div>}
          {H.base != null && T.effect_of && <div><b>On average:</b> {T.effect_of} {pct(H.base, 0)}.</div>}
        </div>
        {T.horizons.length > 1 && (
          <div className="row" style={{ margin: "8px 0" }}>
            <Segmented options={T.horizons.map((x, i) => ({ key: String(i), label: x.label }))} value={String(Math.min(h, T.horizons.length - 1))} onChange={(k) => setH(Number(k))} />
          </div>)}
        {T.key === "practice" && <p className="muted">No input is weighed: the ratio is read from a table of past boards, at the row for the baby's breathing support and the column for its feeding stage (combinations seen fewer than 5 times use the breathing-support row). The table is on <i>How good are the predictions?</i>.</p>}
        <div className="table-scroll">
          <table className="mla-table">
            <thead><tr><th>Input variable</th><th>How it is used</th><th>How much it matters</th><th>Which way{T.effect_of ? ` (${T.effect_of})` : ""}</th><th>Months used</th><th>Typical value, real</th><th>Typical value, synthetic</th></tr></thead>
            <tbody>{big.map(row)}{showSmall && small.map(row)}</tbody>
          </table>
        </div>
        {small.length > 0 && (
          <button className="mla-toggle" onClick={() => setShowSmall(!showSmall)}>{showSmall ? "Hide" : "Show"} the {small.length} other inputs (each under 1%)</button>)}
        {rest.length > 0 && (
          <>
            <button className="mla-toggle" style={{ marginLeft: small.length ? 8 : 0 }} onClick={() => setShowAll(!showAll)}>{showAll ? "Hide" : "Show"} the {rest.length} board items that are not inputs of this model</button>
            {showAll && <div className="table-scroll"><table className="mla-table"><tbody>{rest.map(row)}</tbody></table></div>}
          </>)}
      </Card>
    </div>
  );
}
