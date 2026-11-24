import { ReactNode, useState } from "react";

/* "286 stays", "9,819 baby-shifts": a count with its unit, for the n line on each card. */
export const cnt = (v: number | null | undefined, unit: string) => (v == null ? "" : `${v.toLocaleString()} ${unit}`);

/* One count per dataset: "real 243 · ML 241 · DL 244 completed stays". */
const SET_NAME: Record<string, string> = { real: "real", ml: "ML", dl: "DL", holdout: "held-out real", train: "training" };
export const bySet = (counts: any, field: string, unit: string, keys = ["real", "ml", "dl"]) =>
  keys.filter((k) => counts?.[k]?.[field] != null).map((k) => `${SET_NAME[k]} ${counts[k][field].toLocaleString()}`).join(" · ") + ` ${unit}`;

export function Card({ title, sub, children, wide, right, id, n }: { title?: string; sub?: string; children: ReactNode; wide?: boolean; right?: ReactNode; id?: string; n?: string }) {
  return (
    <section id={id} className={`card${wide ? " wide" : ""}`}>
      {(title || right) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p>{sub}</p>}
            {n && <span className="n-line" title="Instances used in this chart">n = {n}</span>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi" style={accent ? ({ "--accent": accent } as React.CSSProperties) : undefined}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export function PageHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <div className="page-head">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{lead}</p>
    </div>
  );
}

export function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.key} role="tab" aria-selected={o.key === value} className={o.key === value ? "on" : ""} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* A ring that fills to a 0-100 score. */
export function Ring({ value, color, label, sub }: { value: number; color: string; label: string; sub?: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" width="132" height="132" role="img" aria-label={`${label}: ${value}`}>
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle cx="60" cy="60" r={r} stroke={color} className="ring-fill" strokeDasharray={`${(value / 100) * c} ${c}`} />
        <text x="60" y="58" className="ring-value">{value.toFixed(1)}</text>
        <text x="60" y="76" className="ring-unit">/ 100</text>
      </svg>
      <b>{label}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/* Folded table view of a chart's numbers. */
export function TableView({ head, rows, open: startOpen = false }: { head: string[]; rows: (string | number)[][]; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="tableview">
      <button className="link" onClick={() => setOpen(!open)}>{open ? "Hide the numbers" : "Show the numbers"}</button>
      {open && (
        <div className="table-scroll">
          <table>
            <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
