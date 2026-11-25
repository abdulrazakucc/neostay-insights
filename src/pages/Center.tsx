import { useEffect, useState } from "react";
import Chart from "../Chart";
import { Card, cnt, Kpi, Legend, PageHead, Segmented, TableView } from "../ui";
import { axis, base, num, PALETTE, pct } from "../theme";
import type { Props } from "../App";
import { TermsBox } from "./Metrics";
import Stays from "./Stays";
import { STAGE_COLORS } from "./Feeding";
import { loadData } from "../vault";

/* This hosted copy is read-only: editing profiles, running jobs and downloads need the local API in acuity-models. */
const HOSTED = true;

/* Six-center pages (docs/NICU_SYNTHETIC_DATA_REQUIREMENTS.md). Each reads one center's file
   (public/data/centers/<id>.json), loaded when the center is chosen. Every block is labelled real
   (Center 6 only) or synthetic/simulated, and says what it counts. */

export type CenterProps = Props & { center: any };
const RATIOS = ["1:3-4", "1:3", "1:2-3", "1:2", "1:1"];
const MODES = ["Ventilator", "NIPPV", "CPAP", "High-flow", "Nasal cannula", "Room air"];
const STATUS: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "good" }, user_supplied: { label: "User supplied", cls: "info" },
  assumed: { label: "Assumed", cls: "warn" }, derived_from_center_6: { label: "Derived from Center 6", cls: "" },
};
const NE = "Not estimable";

export function useCenterData(id: string) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    loadData(`centers/${id}.json`)
      .then((d) => live && setData(d))
      .catch(() => live && setErr("No data for this center in this copy."));
    return () => { live = false; };
  }, [id]);
  return { data, err };
}

const fmt = (v: any): string => (v == null ? "—" : typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k}: ${fmt(x)}`).join(" · ")
  : typeof v === "number" ? num(v, 3) : String(v));

export function Banner({ center }: { center: any }) {
  return (
    <div className={`banner ${center.has_real_data ? "real" : "scenario"}`}>
      <b>{center.name}</b><span>{center.data_source}</span>
      {center.notice && <p>{center.notice}</p>}
    </div>
  );
}

function Head({ center, title, lead }: { center: any; title: string; lead: string }) {
  return (<><PageHead eyebrow={center.name} title={title} lead={lead} /><Banner center={center} /></>);
}

function NotYet({ center }: { center: any }) {
  return <div className="empty">No synthetic dataset for {center.name} yet. Generate it on the "Generation and reports" tab or with `make centers-generate`.</div>;
}

const share = (counts: number[]) => { const t = counts.reduce((a, b) => a + b, 0) || 1; return counts.map((c) => c / t); };

function histOption(mode: "light" | "dark", series: { name: string; h: any; color: string }[], unit: string, fmtX = (v: number) => num(v, 0)) {
  const p = PALETTE[mode];
  const edges: number[] = series[0].h.edges;
  return {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) },
    grid: { left: 42, right: 10, top: 12, bottom: 38 },
    xAxis: { type: "category", data: edges.slice(0, -1).map(fmtX), name: unit, nameLocation: "middle", nameGap: 24, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: series.map((s, i) => ({ name: s.name, type: "line", step: "middle", data: share(s.h.counts), showSymbol: false,
      lineStyle: { width: i === 0 ? 2.6 : 2, color: s.color }, itemStyle: { color: s.color }, areaStyle: i === 0 ? { color: s.color + "1c" } : undefined })),
  };
}

function stackOption(mode: "light" | "dark", rows: string[], matrix: number[][], colors: string[], names: string[]) {
  const p = PALETTE[mode];
  return {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => pct(v, 0) },
    grid: { left: 110, right: 16, top: 6, bottom: 26 },
    xAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    yAxis: { type: "category", data: rows, inverse: true, ...axis(mode), axisLine: { show: false } },
    series: names.map((nm, k) => ({ name: nm, type: "bar", stack: "s", barWidth: 16, data: matrix.map((r) => r[k] ?? 0),
      itemStyle: { color: colors[k], borderColor: p.surface, borderWidth: 1 } })),
  };
}

function barsOption(mode: "light" | "dark", labels: string[], sets: { name: string; values: number[]; color: string }[], yFmt = (v: number) => pct(v, 0)) {
  const p = PALETTE[mode];
  return {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: yFmt },
    grid: { left: 46, right: 10, top: 14, bottom: 30 },
    xAxis: { type: "category", data: labels, ...axis(mode), axisLabel: { color: p.muted, fontSize: 10.5, interval: 0 }, splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, formatter: yFmt }, axisLine: { show: false } },
    series: sets.map((s) => ({ name: s.name, type: "bar", data: s.values, barMaxWidth: 20, barGap: "15%", itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] } })),
  };
}

const realColor = (mode: "light" | "dark") => PALETTE[mode].series[0];
const synColor = (mode: "light" | "dark") => PALETTE[mode].series[1];

/* ------------------------------------------------------------------ Center configuration */
export function CenterConfig({ mode, center }: CenterProps) {
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const editable = ["beds", "max_capacity", "nurses", "admission_scale", "discharge_scale"];
  const save = async (parameter: string) => {
    try {
      const r = await fetch(`/api/centers/${center.center}/param`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameter, value: Number(edit[parameter]) }) });
      const j = await r.json();
      setMsg(r.ok ? `Saved ${parameter} = ${edit[parameter]} as user supplied. ${j.note}` : `Not saved: ${j.error}`);
    } catch { setMsg("The local API is not running: start the app with `make insights` to edit profiles."); }
  };
  const p = PALETTE[mode];
  const sv = center.scenario_validation?.assumptions_differing_from_center_6 || [];
  return (
    <>
      <Head center={center} title="Center configuration" lead="Every parameter the simulation of this center uses, with its status and source. Assumed values are scenario settings, not facts about the hospital; replace them with the center's own figures when known." />
      {center.scenario && <div className="note" style={{ marginBottom: 16 }}><b>Scenario:</b> {center.scenario}</div>}
      <div className="grid">
        <Card wide n={cnt(center.assumptions.length, "parameters")} title="Parameters" sub="Status: verified (the unit's documents or data), user supplied, assumed (provisional scenario value), derived from Center 6">
          <div className="table-scroll"><table>
            <thead><tr><th>Parameter</th><th>Value</th><th>Status</th><th>Source</th>{!HOSTED && <th></th>}</tr></thead>
            <tbody>{center.assumptions.map((a: any) => (
              <tr key={a.parameter}>
                <td><b>{a.parameter.replace(/_/g, " ")}</b></td><td style={{ maxWidth: 280 }}>{fmt(a.value)}</td>
                <td><span className={`badge ${STATUS[a.status]?.cls}`}>{STATUS[a.status]?.label || a.status}</span></td>
                <td style={{ maxWidth: 420, color: "var(--soft)", fontSize: 12 }}>{a.source}</td>
                {!HOSTED && <td>{editable.includes(a.parameter) && (
                  <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <input style={{ width: 70 }} placeholder={String(a.value)} value={edit[a.parameter] ?? ""} onChange={(e) => setEdit({ ...edit, [a.parameter]: e.target.value })} />
                    <button className="link" disabled={!edit[a.parameter]} onClick={() => save(a.parameter)}>Save</button>
                  </span>)}</td>}
              </tr>))}</tbody>
          </table></div>
          {msg && <div className="note">{msg}</div>}
        </Card>
        {!center.has_real_data && sv.length > 0 && (
          <Card wide n={cnt(sv.length, "parameters")} title="How this center's assumptions differ from Center 6" sub="Simulated assumptions, not observed differences between the centers">
            <TableView head={["Parameter", "This center", "Center 6", "Status"]} rows={sv.map((r: any) => [r.parameter, fmt(r.this_center), fmt(r.center_6), STATUS[r.status]?.label || r.status])} />
            <Chart option={barsOption(mode, sv.filter((r: any) => typeof r.this_center === "number" && typeof r.center_6 === "number").map((r: any) => r.parameter.replace(/_/g, " ")),
              [{ name: "This center ÷ Center 6", color: p.series[2], values: sv.filter((r: any) => typeof r.this_center === "number" && typeof r.center_6 === "number").map((r: any) => r.this_center / r.center_6) }],
              (v: number) => `${num(v, 2)}×`)} height={220} label="Scenario multipliers" />
          </Card>)}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Synthetic data insights */
export function SynthInsights({ mode, center }: CenterProps) {
  const p = PALETTE[mode];
  const s = center.synthetic;
  if (!s) return <><Head center={center} title="Synthetic data insights" lead="" /><NotYet center={center} /></>;
  const sm = center.summary;
  const col = synColor(mode);
  const h = (key: string, unit: string, f?: (v: number) => string) => histOption(mode, [{ name: "Synthetic", h: s.population[key], color: col }], unit, f);
  const bands = Object.keys(s.population.band_mix);
  return (
    <>
      <Head center={center} title="Synthetic data insights" lead={`The ${center.name} synthetic dataset: who the babies are, what care they need, and how the simulated unit runs. All figures here are synthetic.`} />
      <div className="kpis">
        <Kpi label="Synthetic stays" value={num(sm.stays, 0)} sub={`${num(sm.completed, 0)} completed; ${sm.left_truncated} left-truncated, ${sm.right_censored} right-censored`} />
        <Kpi label="Baby-shifts" value={num(sm.baby_shifts, 0)} sub={`${num(sm.occupied_bed_shifts, 0)} occupied bed-shifts`} />
        <Kpi label="Simulated period" value={`${num(sm.recorded_period.days / 365.25, 1)} years`} sub={`${sm.recorded_period.first_date} to ${sm.recorded_period.last_date} (simulated calendar)`} />
        <Kpi label="Mean census" value={num(sm.mean_census, 1)} sub={`peak ${sm.peak_census} of ${sm.beds} beds`} />
        <Kpi label="Redirected admissions" value={num(sm.redirected_admissions, 0)} sub={`${num(center.unmet_admissions?.per_1000_arrivals, 1)} per 1,000 arrivals (no bed free)`} />
      </div>
      <div className="grid">
        <Card n={cnt(s.population.ga.n, "stays")} title="Gestational age at birth" sub="Share of synthetic stays"><Chart option={h("ga", "weeks")} height={230} label="GA" /></Card>
        <Card n={cnt(s.population.bw.n, "stays")} title="Birth weight" sub="Share of synthetic stays"><Chart option={h("bw", "g")} height={230} label="Birth weight" /></Card>
        <Card n={cnt(s.population.los_completed.n, "completed stays")} title="Length of stay" sub="Completed synthetic stays"><Chart option={h("los_completed", "days")} height={230} label="LOS" /></Card>
        <Card n={cnt(s.population.cga.n, "baby-shifts")} title="Corrected age on the boards" sub="Share of synthetic baby-shifts"><Chart option={h("cga", "weeks")} height={230} label="CGA" /></Card>
        <Card n={cnt(s.n.stays, "stays")} title="Mix of babies and their stay" sub="Stays by GA band; median completed stay (days) by band">
          <Chart option={barsOption(mode, bands.map((b) => `born ${b}`), [{ name: "Share of stays", values: share(bands.map((b) => s.population.band_mix[b])), color: col }])} height={200} label="GA band mix" />
          <TableView head={["Born", "Stays", "Median stay", "Middle half", "90th"]} rows={bands.map((b) => { const q = s.population.los_by_band[b] || {}; return [b, s.population.band_mix[b], num(q.median, 1), `${num(q.q1, 1)}–${num(q.q3, 1)}`, num(q.p90, 1)]; })} />
        </Card>
        <Card n={cnt(s.n.baby_shifts, "baby-shifts")} title="Care needs" sub="Share of synthetic baby-shifts by nurse ratio, breathing support and feeding stage">
          <Chart option={stackOption(mode, ["Nurse ratio"], [share(s.care.ratio)], p.ratio, RATIOS)} height={70} label="Ratio mix" />
          <Chart option={stackOption(mode, ["Breathing"], [share(s.care.resp_mode)], [...p.band, p.ramp[mode === "light" ? 1 : 3], mode === "light" ? "#cfd6e2" : "#4a5578"], MODES)} height={70} label="Breathing mix" />
          <Chart option={stackOption(mode, ["Feeding"], [share(s.care.feed_stage)], STAGE_COLORS[mode], ["NPO", "tube only", "tube + oral <½", "tube + oral (not stated)", "tube + oral >½", "off tube"])} height={70} label="Feeding mix" />
          <Legend items={RATIOS.map((r, i) => ({ color: p.ratio[i], label: r }))} />
        </Card>
        <Card wide n={cnt(s.n.baby_shifts, "baby-shifts")} title="What sets the nurse ratio (synthetic)" sub="Share of baby-shifts at each ratio, by breathing support and by gestational age at birth" right={<Legend items={RATIOS.map((r, i) => ({ color: p.ratio[i], label: r }))} />}>
          <div className="grid"><Chart option={stackOption(mode, MODES, s.care.ratio_by_mode, p.ratio, RATIOS)} height={230} label="Ratio by breathing" />
            <Chart option={stackOption(mode, bands.map((b) => `born ${b}`), s.care.ratio_by_band, p.ratio, RATIOS)} height={230} label="Ratio by GA band" /></div>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Longitudinal patient analysis */
export function Longitudinal(props: CenterProps) {
  const { mode, center, data } = props;
  const p = PALETTE[mode];
  const s = center.synthetic, r = center.real;
  if (!s) return <><Head center={center} title="Longitudinal patient analysis" lead="" /><NotYet center={center} /></>;
  const source = { ...center.baby_stays_sample, ml: center.baby_stays_sample, real: r ? data.baby_stays?.real : undefined };
  const km = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 0) },
    grid: { left: 44, right: 12, top: 14, bottom: 38 },
    xAxis: { type: "value", min: 0, max: 90, name: "days since admission", nameLocation: "middle", nameGap: 24, ...axis(mode) },
    yAxis: { type: "value", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: [...(r ? [{ name: "Real", d: r }] : []), { name: "Synthetic", d: s }].map((x, i) => ({ name: x.name, type: "line", step: "end", showSymbol: false,
      data: x.d.longitudinal.km.days.map((dd: number, k: number) => [dd, x.d.longitudinal.km.still_in_unit[k]]),
      lineStyle: { width: 2.4, color: r && i === 0 ? realColor(mode) : synColor(mode) }, itemStyle: { color: r && i === 0 ? realColor(mode) : synColor(mode) } })),
  };
  const heat = (m: number[][]) => ({
    ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `From ${RATIOS[x.value[1]]} to ${RATIOS[x.value[0]]}: <b>${pct(x.value[2], 1)}</b>` },
    grid: { left: 56, right: 10, top: 6, bottom: 46 },
    xAxis: { type: "category", data: RATIOS, name: "next shift", nameLocation: "middle", nameGap: 28, ...axis(mode) },
    yAxis: { type: "category", data: RATIOS, ...axis(mode) },
    visualMap: { show: false, min: 0, max: 1, inRange: { color: p.seq } },
    series: [{ type: "heatmap", data: m.flatMap((row, i) => row.map((v, j) => [j, i, v])), label: { show: true, formatter: (x: any) => pct(x.value[2], 0), color: p.ink, fontSize: 10.5 },
      itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 5 } }],
  });
  return (
    <>
      <Head center={center} title="Longitudinal patient analysis" lead={r ? "Babies' stays over time: real Center 6 babies beside the large-scale synthetic sample, how long they stay and how their ratio changes." : "Synthetic babies' stays over time: a sample of stays, how long they stay and how their ratio changes. Simulated data only."} />
      <Stays {...props} embedded source={source} synthLabel="Synthetic (large scale)" />
      <div style={{ height: 20 }} />
      <div className="grid">
        <Card n={r ? `real ${r.longitudinal.km.n} · synthetic ${num(s.longitudinal.km.n, 0)} admitted stays` : cnt(s.longitudinal.km.n, "admitted stays")} title="Still in the unit, by day since admission"
          sub="Kaplan–Meier: stays still in the unit when recording ended count until then" right={<Legend items={[...(r ? [{ color: realColor(mode), label: "Real" }] : []), { color: synColor(mode), label: "Synthetic" }]} />}>
          <Chart option={km} height={260} label="Length of stay curves" />
        </Card>
        <Card n={cnt(s.longitudinal.transition_pairs, "synthetic shift-to-shift pairs")} title="How the ratio changes from one shift to the next (synthetic)" sub="Each row adds to 100%">
          <Chart option={heat(s.longitudinal.ratio_transitions)} height={260} label="Synthetic transitions" />
        </Card>
        {r && <Card n={cnt(r.longitudinal.transition_pairs, "real shift-to-shift pairs")} title="How the ratio changes (real Center 6)" sub="Each row adds to 100%"><Chart option={heat(r.longitudinal.ratio_transitions)} height={260} label="Real transitions" /></Card>}
        <Card n={cnt(s.n.baby_shifts, "synthetic baby-shifts")} title="Time spent at each ratio" sub="Days in a run of the same ratio (median, middle half, 90th)">
          <TableView open head={["Ratio", ...(r ? ["Real median", "Real middle half"] : []), "Synthetic median", "Synthetic middle half", "Synthetic 90th"]}
            rows={RATIOS.map((rt) => { const q = s.longitudinal.dwell[rt] || {}; const qr = r?.longitudinal.dwell[rt] || {};
              return [rt, ...(r ? [num(qr.median, 1), `${num(qr.q1, 1)}–${num(qr.q3, 1)}`] : []), num(q.median, 1), `${num(q.q1, 1)}–${num(q.q3, 1)}`, num(q.p90, 1)]; })} />
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Staffing */
export function StaffingBlock({ mode, center }: CenterProps) {
  const p = PALETTE[mode];
  const st = center.staffing;
  if (!st) return null;
  const weeks = st.weekly.required.map((_: number, i: number) => i);
  const line = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => num(v, 1) },
    grid: { left: 40, right: 12, top: 14, bottom: 56 },
    xAxis: { type: "category", data: weeks, name: "simulated week", nameLocation: "middle", nameGap: 24, ...axis(mode), axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: "value", name: "nurses", ...axis(mode), axisLine: { show: false } },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 14, bottom: 8, borderColor: "transparent", backgroundColor: p.grid }],
    series: [{ name: "Required (more-nurse end)", type: "line", data: st.weekly.required, showSymbol: false, lineStyle: { color: p.series[1], width: 1.6 }, itemStyle: { color: p.series[1] } },
      { name: "Available bedside", type: "line", data: st.weekly.available, showSymbol: false, lineStyle: { color: p.series[0], width: 1.6 }, itemStyle: { color: p.series[0] } }],
  };
  const reasons = Object.entries(st.unmet_reasons as Record<string, number>);
  return (
    <>
      <div className="note" style={{ marginBottom: 14 }}>Simulated staffing with provisional parameters (nurse pool, competency mix, rota, absences). The nurses are synthetic, not employees. Required staffing comes from the babies' ratios (acuity tool); available staffing from the simulated rota.</div>
      <div className="kpis">
        <Kpi label="Synthetic nurses" value={`${st.nurses}`} sub={Object.entries(st.competency_mix).map(([k, v]) => `${v} ${k}`).join(" · ")} />
        <Kpi label="Required vs available" value={`${num(st.required_max.mean, 1)} / ${num(st.available_bedside.mean, 1)}`} sub="mean bedside nurses per shift: required (more-nurse end) / available" />
        <Kpi label="Shifts short of required" value={pct(st.shifts_required_above_available, 0)} sub="required (more-nurse end) above available bedside nurses" />
        <Kpi label="Babies without a nurse" value={pct(st.unassigned_share_of_baby_shifts, 2)} sub={`of baby-shifts; ${st.skill_shortage_shifts} shifts with a skill shortage`} />
        <Kpi label="Continuity" value={pct(st.continuity, 0)} sub="baby-shifts cared for by a nurse who had the baby in the last 7 days" />
      </div>
      <div className="grid">
        <Card wide n={cnt(st.n_shifts, "simulated shifts")} title="Nurses required and available" sub="Weekly means over the simulated period" right={<Legend items={[{ color: p.series[1], label: "Required (more-nurse end)" }, { color: p.series[0], label: "Available bedside" }]} />}>
          <Chart option={line} height={260} label="Required and available nurses" />
        </Card>
        <Card n={cnt(reasons.reduce((a, [, v]) => a + v, 0), "unassigned baby-shifts")} title="Why babies were left without a nurse" sub="Reasons recorded by the assignment check">
          {reasons.length ? <TableView head={["Reason", "Baby-shifts"]} rows={reasons} /> : <div className="empty">No baby was left without a nurse.</div>}
          {reasons.length > 0 && <Chart option={barsOption(mode, reasons.map(([k]) => k), [{ name: "Baby-shifts", values: reasons.map(([, v]) => v), color: p.series[1] }], (v: number) => num(v, 0))} height={200} label="Unassigned reasons" />}
        </Card>
        <Card n={cnt(st.n_shifts, "simulated shifts")} title="Shift coverage" sub="Rota, absences and call-ins">
          <TableView open head={["Measure", "Value"]} rows={[["Mean absences per shift", num(st.absences_per_shift, 2)], ["Shifts with a call-in", num(st.call_in_shifts, 0)],
            ["Shifts with an unassigned baby", pct(st.shifts_with_unassigned, 1)], ["Required, fewer-nurse end (mean)", num(st.required_min.mean, 2)],
            ["Required, more-nurse end (mean / 90th)", `${num(st.required_max.mean, 2)} / ${num(st.required_max.p90, 1)}`], ["Available bedside (mean)", num(st.available_bedside.mean, 2)]]} />
        </Card>
      </div>
    </>
  );
}

export function Staffing(props: CenterProps) {
  const { center } = props;
  return (<><Head center={center} title="Staffing and care requirements" lead="The bedside nurses the synthetic babies' care ratios require, the simulated nurses on duty, and every baby left without a competent nurse." />
    {center.staffing ? <StaffingBlock {...props} /> : <NotYet center={center} />}</>);
}

/* ------------------------------------------------------------------ NICU operational analysis */
export function Operations(props: CenterProps) {
  const { mode, center } = props;
  const p = PALETTE[mode];
  const s = center.synthetic, r = center.real;
  const [view, setView] = useState("synthetic");
  if (!s) return <><Head center={center} title="NICU operational analysis" lead="" /><NotYet center={center} /></>;
  const o = (view === "real" && r ? r : s).operations;
  const isReal = view === "real" && r;
  const wk = o.census_weekly;
  const line = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => num(v, 1) },
    grid: { left: 40, right: 12, top: 14, bottom: 60 },
    xAxis: { type: "category", data: wk.week_start, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: string) => (isReal ? v.slice(5) : v.slice(0, 7)) }, splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLine: { show: false } },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 14, bottom: 8, borderColor: "transparent", backgroundColor: p.grid }],
    series: [{ name: "Mean census", type: "line", data: wk.mean_census, showSymbol: false, lineStyle: { color: isReal ? realColor(mode) : synColor(mode), width: 1.8 }, itemStyle: { color: isReal ? realColor(mode) : synColor(mode) } },
      { name: "Peak census", type: "line", data: wk.peak_census, showSymbol: false, lineStyle: { color: p.muted, width: 1, type: "dashed" }, itemStyle: { color: p.muted } }],
  };
  const both = r ? [{ name: "Real", h: r.operations.census, color: realColor(mode) }, { name: "Synthetic", h: s.operations.census, color: synColor(mode) }] : [{ name: "Synthetic", h: s.operations.census, color: synColor(mode) }];
  const nboth = r ? [{ name: "Real", h: r.operations.nurses_required, color: realColor(mode) }, { name: "Synthetic", h: s.operations.nurses_required, color: synColor(mode) }] : [{ name: "Synthetic", h: s.operations.nurses_required, color: synColor(mode) }];
  const rows = (k: string, label: string) => [label, ...(r ? [num(r.operations[k].mean, 2), num(r.operations[k].p90, 2)] : []), num(s.operations[k].mean, 2), num(s.operations[k].p90, 2)];
  const legend = <Legend items={[...(r ? [{ color: realColor(mode), label: "Real (observed)" }] : []), { color: synColor(mode), label: r ? "Synthetic (simulated)" : "Simulated" }]} />;
  return (
    <>
      <Head center={center} title="NICU operational analysis" lead={r ? "Census, admissions, discharges and nurse demand: the real Center 6 boards (observed) and the synthetic unit (simulated), labelled separately and compared per shift and per day." : "Census, admissions, discharges, nurse demand and staffing of the simulated unit. All figures are simulated."} />
      <div className="kpis">
        <Kpi label="Beds (configured)" value={`${center.summary.beds}`} sub={center.assumptions.find((a: any) => a.parameter === "beds")?.status === "verified" ? "verified" : "assumed scenario value"} />
        <Kpi label="Mean census" value={`${r ? `${num(r.operations.census_stats.mean, 1)} / ` : ""}${num(s.operations.census_stats.mean, 1)}`} sub={r ? "real / synthetic, per board" : "simulated, per board"} />
        <Kpi label="Admissions per day" value={`${r ? `${num(r.operations.admissions_per_day.mean, 2)} / ` : ""}${num(s.operations.admissions_per_day.mean, 2)}`} sub={r ? "real / synthetic" : "simulated"} />
        <Kpi label="Nurses required per shift" value={`${r ? `${num(r.operations.nurses_required_stats.mean, 1)} / ` : ""}${num(s.operations.nurses_required_stats.mean, 1)}`} sub="more-nurse end of the ratios" />
        <Kpi label="Redirected (no bed)" value={num(center.summary.redirected_admissions, 0)} sub="simulated arrivals recorded as unmet demand" />
      </div>
      <div className="grid">
        <Card wide n={cnt(o.boards, "boards")} title={`Census over time (${isReal ? "real, observed" : "synthetic, simulated calendar"})`} sub="Weekly mean and peak babies on the unit"
          right={r ? <Segmented value={view} onChange={setView} options={[{ key: "synthetic", label: "Synthetic" }, { key: "real", label: "Real" }]} /> : undefined}>
          <Chart option={line} height={280} label="Weekly census" />
        </Card>
        <Card n={r ? `real ${r.operations.boards} · synthetic ${num(s.operations.boards, 0)} boards` : cnt(s.operations.boards, "boards")} title="Census distribution" sub="Share of boards with each number of babies" right={legend}>
          <Chart option={histOption(mode, both, "babies on the unit")} height={240} label="Census distribution" />
        </Card>
        <Card n={r ? `real ${r.operations.boards} · synthetic ${num(s.operations.boards, 0)} boards` : cnt(s.operations.boards, "boards")} title="Bedside nurses required per shift" sub="Share of boards; more-nurse end of the ratios" right={legend}>
          <Chart option={histOption(mode, nboth, "nurses required")} height={240} label="Nurses required" />
        </Card>
        <Card n={r ? `real ${r.operations.days} · synthetic ${num(s.operations.days, 0)} days` : cnt(s.operations.days, "days")} title="Daily flow and occupancy" sub="Per day and per board; same units on both sides">
          <TableView open head={["Measure", ...(r ? ["Real mean", "Real 90th"] : []), "Synthetic mean", "Synthetic 90th"]}
            rows={[rows("admissions_per_day", "Admissions per day"), rows("discharges_per_day", "Discharges per day"), rows("census_stats", "Census per board"), rows("occupancy_stats", "Occupancy per board")]} />
          <div className="note">Day/night: mean census AM / PM — {r ? `real ${num(r.operations.am_pm_census[0], 1)} / ${num(r.operations.am_pm_census[1], 1)}; ` : ""}synthetic {num(s.operations.am_pm_census[0], 1)} / {num(s.operations.am_pm_census[1], 1)}.</div>
        </Card>
        {s.operations.ratio_demand_mean && <Card n={r ? `real ${r.operations.boards} · synthetic ${num(s.operations.boards, 0)} boards` : cnt(s.operations.boards, "boards")} title="Care requirements by ratio" sub="Mean babies per board at each ratio" right={legend}>
          <Chart option={barsOption(mode, RATIOS, [...(r?.operations.ratio_demand_mean ? [{ name: "Real", values: r.operations.ratio_demand_mean, color: realColor(mode) }] : []), { name: "Synthetic", values: s.operations.ratio_demand_mean, color: synColor(mode) }], (v: number) => num(v, 1))} height={230} label="Babies per ratio" />
        </Card>}
      </div>
      {center.staffing && <><h2 className="section-title">Simulated staffing</h2><StaffingBlock {...props} /></>}
    </>
  );
}

/* ------------------------------------------------------------------ Data quality and validation / scenario validation */
function ConstraintTables({ center }: { center: any }) {
  const c = center.constraints;
  if (!c) return null;
  const hard = Object.entries(c.hard as Record<string, number>);
  const soft = Object.entries(c.clinical_flags as Record<string, number>);
  const ref = center.real_clinical_reference;
  return (
    <>
      <Card n={cnt(center.summary?.baby_shifts, "synthetic baby-shifts")} title="Hard constraints (synthetic)" sub={`Each must be zero. Total violations: ${c.hard_violations}`}>
        <div className="table-scroll"><table><thead><tr><th>Constraint</th><th>Violations</th></tr></thead>
          <tbody>{hard.map(([k, v]) => <tr key={k}><td>{k}</td><td><span className={`badge ${v === 0 ? "good" : "bad"}`}>{v === 0 ? "0 ✓" : `${v} ✗`}</span></td></tr>)}</tbody></table></div>
      </Card>
      <Card n={cnt(c.flagged_records, "flagged records")} title="Clinical consistency flags (synthetic)" sub="Flags for review, not rejections; thresholds in config/clinical_checks.json, each with its source">
        <div className="table-scroll"><table><thead><tr><th>Check</th><th>Flagged</th>{ref && <th>Real Center 6</th>}</tr></thead>
          <tbody>{soft.map(([k, v]) => <tr key={k}><td>{k}</td><td>{num(v, 0)}</td>{ref && <td>{ref[k] != null ? num(ref[k], 0) : "—"}</td>}</tr>)}</tbody></table></div>
        {ref && <div className="note">Real reference counted on {num(ref.baby_shifts, 0)} real baby-shifts.</div>}
      </Card>
    </>
  );
}

export function Validation(props: CenterProps) {
  const { mode, center } = props;
  const p = PALETTE[mode];
  const q = center.real_quality;
  const sv = center.scenario_validation;
  if (!center.has_real_data) {
    const ov = sv?.operational_validity;
    return (
      <>
        <Head center={center} title="Scenario and constraint validation" lead="This center has no real data, so it is not compared with real data. Instead: every hard constraint, clinical consistency flags, and whether the simulated unit operates within its configured beds and staffing." />
        <div className="grid">
          <ConstraintTables center={center} />
          {ov && <Card wide n={cnt(center.summary?.boards, "simulated boards")} title="Operational validity (simulated)" sub="Beds, admission handling, nurse availability and skills, shift coverage, workload and continuity">
            <TableView open head={["Check", "Value"]} rows={[["Census never above beds", ov.census_never_above_beds ? "yes ✓" : "no ✗"], ["Peak census / beds", `${ov.peak_census} / ${ov.beds}`],
              ["Redirected share of arrivals", pct(ov.redirected_share_of_arrivals, 2)], ["Shifts with an unassigned baby", pct(ov.shifts_with_unassigned_babies, 1)],
              ["Unassigned share of baby-shifts", pct(ov.unassigned_baby_shifts_share, 2)], ["Shifts with a skill shortage", num(ov.skill_shortage_shifts, 0)],
              ["Mean available bedside nurses", num(ov.mean_available_bedside_nurses, 2)], ["Mean required (more-nurse end)", num(ov.mean_required_nurses_more_nurse_end, 2)],
              ["Shifts where required exceeds available", pct(ov.shifts_required_above_available, 1)], ["Shifts with a call-in", num(ov.call_in_shifts, 0)],
              ["Nurse continuity", pct(ov.nurse_continuity_share, 0)]]} />
          </Card>}
          {sv?.assumptions_differing_from_center_6 && <Card wide n={cnt(sv.assumptions_differing_from_center_6.length, "parameters")} title="Assumptions that differ from Center 6" sub="Simulated assumptions, not observed differences">
            <TableView open head={["Parameter", "This center", "Center 6", "Status"]} rows={sv.assumptions_differing_from_center_6.map((r: any) => [r.parameter, fmt(r.this_center), fmt(r.center_6), STATUS[r.status]?.label || r.status])} />
          </Card>}
        </div>
        {!sv && <div className="note">Run `make centers-report` for the operational validation.</div>}
      </>
    );
  }
  const obs = q ? Object.entries(q.stays_by_observation as Record<string, number>) : [];
  const miss = q ? Object.entries(q.missing_share as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 12) : [];
  return (
    <>
      <Head center={center} title="Data quality and validation" lead="What the real boards contain and lack (written before any generator was fitted), and the hard constraints and clinical checks of the synthetic data." />
      {q && <div className="kpis">
        <Kpi label="Boards" value={`${q.boards.with_data}`} sub={`of ${q.boards.expected} shifts; ${q.boards.missing_shifts} missing; ${q.duplicate_files_dropped} duplicate files dropped`} />
        <Kpi label="Stays / patients" value={`${q.observations.stays} / ${q.observations.patients}`} sub={`${q.observations.patients_with_more_than_one_stay} patients with more than one stay`} />
        <Kpi label="Baby-shifts" value={num(q.observations.baby_shifts, 0)} sub="individual observations (not boards)" />
        <Kpi label="Stays with gaps" value={`${q.irregular_observation.stays_with_gaps}`} sub={`${q.irregular_observation.missing_boards_inside_stays_unit_board_missing} missing boards, ${q.irregular_observation.missing_boards_inside_stays_baby_absent} absences`} />
        <Kpi label="Holdout" value={`${q.holdout.days} days`} sub={`from ${q.holdout.first_date}, untouched by the generators`} />
      </div>}
      <div className="grid">
        {q && <Card n={cnt(q.observations.stays, "real stays")} title="How much of each stay is observed (real)" sub="Censoring: left-truncated stays began before the first board, right-censored ones continue after the last">
          <Chart option={barsOption(mode, obs.map(([k]) => k.split(" (")[0]), [{ name: "Stays", values: obs.map(([, v]) => v), color: p.series[0] }], (v: number) => num(v, 0))} height={220} label="Stays by observation" />
          <div className="note">How a stay ended (home, transfer, death): {q.exit_types.home}. {q.exit_types.why}</div>
        </Card>}
        {q && <Card n={cnt(q.observations.baby_shifts, "real baby-shifts")} title="Missing values (real)" sub="Share of baby-shifts with the field empty (the 12 most often missing)">
          <Chart option={barsOption(mode, miss.map(([k]) => k), [{ name: "Missing", values: miss.map(([, v]) => v), color: p.series[0] }], (v: number) => pct(v, 1))} height={220} label="Missing share" />
          <TableView head={["Check", "Count"]} rows={Object.entries(q.identifier_checks).map(([k, v]) => [k.replace(/_/g, " "), String(v)])} />
        </Card>}
        <ConstraintTables center={center} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Generation configuration and reports */
export function Generation(props: CenterProps & { generatorsPage?: React.ReactNode }) {
  const { center, generatorsPage } = props;
  const [job, setJob] = useState<any>(center.job);
  const [msg, setMsg] = useState<string | null>(null);
  const [stays, setStays] = useState("10000");
  useEffect(() => {
    if (HOSTED) return;
    const t = window.setInterval(async () => {
      try { const r = await fetch("/api/jobs"); if (r.ok) { const j = await r.json(); setJob(j[center.center]); } } catch { /* API not running */ }
    }, 4000);
    return () => window.clearInterval(t);
  }, [center.center]);
  const act = async (what: "start" | "cancel") => {
    try {
      const r = await fetch(`/api/jobs/${center.center}/${what}${what === "start" ? `?stays=${Number(stays)}` : ""}`, { method: "POST" });
      const j = await r.json();
      setMsg(r.ok ? (what === "start" ? `Started (process ${j.pid}). Progress updates below.` : "Cancel requested: the job stops after the current chunk.") : `Not done: ${j.error}`);
    } catch { setMsg("The local API is not running: start the app with `make insights`, or run `make centers-generate`."); }
  };
  const sm = center.summary;
  const prog = job?.progress ?? 0;
  const dec = center.evaluation?.decision;
  return (
    <>
      <Head center={center} title="Generation configuration and reports" lead={HOSTED ? "How this center's large-scale synthetic dataset was generated, with its job record, dataset summary and the generator decision." : "Generate or resume this center's large-scale synthetic dataset in the background, follow its progress, and download the dataset with its reports and provenance."} />
      {center.has_real_data && <TermsBox ids={["fidelity", "detectability", "coverage-gap", "mia", "near-dup", "ks", "tvd"]} />}
      <div className="grid">
        <Card title="Generation job" n={job?.target ? `target ${num(job.target, 0)} stays` : undefined} sub={`State: ${job?.state || "not started"}${job?.updated ? ` · updated ${job.updated}` : ""}`}>
          <div className="progress"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>
          {!HOSTED && <div className="row" style={{ margin: "12px 0" }}>
            <label className="row" style={{ gap: 6 }}>Stays <input style={{ width: 90 }} value={stays} onChange={(e) => setStays(e.target.value)} /></label>
            <button className="link" onClick={() => act("start")}>Start / regenerate</button>
            <button className="link" onClick={() => act("cancel")}>Cancel</button>
          </div>}
          {msg && <div className="note">{msg}</div>}
          <TableView head={["Field", "Value"]} rows={Object.entries(job || {}).filter(([k]) => k !== "summary").map(([k, v]) => [k, fmt(v)])} />
        </Card>
        {sm && <Card n={cnt(sm.stays, "stays")} title="Dataset" sub={`${sm.generator_version} · seed ${sm.seed} · simulated ${sm.recorded_period.first_date} to ${sm.recorded_period.last_date}`}>
          <TableView open head={["Measure", "Value"]} rows={[["Stays recorded", num(sm.stays, 0)], ["Admitted in the recorded period", num(sm.admitted_in_period, 0)], ["Completed", num(sm.completed, 0)],
            ["Left-truncated / right-censored", `${sm.left_truncated} / ${sm.right_censored}`], ["Baby-shifts", num(sm.baby_shifts, 0)], ["Occupied bed-shifts", num(sm.occupied_bed_shifts, 0)],
            ["Boards", num(sm.boards, 0)], ["Redirected / delayed admissions", `${sm.redirected_admissions} / ${sm.delayed_admissions}`], ["Hard constraint violations", String(sm.hard_constraint_violations)]]} />
          {!HOSTED && <div className="note">Downloads (CSV and JSON Lines, with configuration, validation, evaluation and privacy reports, data dictionary and provenance):{" "}
            {(center.exports || []).length ? center.exports.map((e: any) => <a key={e.file} href={`/api/download/${center.center}/${e.file}`}>{e.file} ({e.mb} MB) </a>) : "run `make centers-report` to export."}</div>}
        </Card>}
        {dec && <Card wide n={`${center.evaluation.seeds} seeds per generator`} title="Generator decision (Center 6)" sub={dec.rule}>
          <TableView open head={["Family", "Traditional ML (hybrid)", "Deep learning", "Better"]} rows={dec.table.map((r: any) => [r.family, fmt(r.ml), fmt(r.dl), r.better || ""])} />
          <div className="note"><b>Primary generator: {dec.primary === "ml" ? "hybrid statistical / machine learning" : "deep learning"}.</b> Wins: {fmt(dec.wins)}. Not trained: {Object.entries(dec.deep_models_not_trained).map(([k, v]) => `${k}: ${v}`).join(" ")}</div>
        </Card>}
      </div>
      {generatorsPage}
    </>
  );
}

/* ------------------------------------------------------------------ Center 6: evaluation evidence (real vs synthetic) */
export function Evaluation({ mode, center }: CenterProps) {
  const ev = center.evaluation;
  const [gen, setGen] = useState("ml");
  if (!ev) return <><Head center={center} title="Real vs synthetic: evidence" lead="" /><div className="empty">Run `make centers-report` for the Center 6 evaluation.</div></>;
  const dev = ev.development[gen];
  const d0 = dev.detail_seed_0;
  const ks = dev.stability.key_stats;
  const hold = ev.holdout[gen];
  const uni = d0.univariate;
  const p = PALETTE[mode];
  const famRows = Object.entries(dev.stability.families as Record<string, any>).map(([k, v]) => [k.replace(/_/g, " "), num(v.mean, 4), num(v.sd, 4), num(v.worst, 4)]);
  const cond = d0.multivariate.conditionals;
  const cov = d0.coverage;
  const pv = d0.privacy;
  const op = d0.operational;
  const lon = d0.longitudinal;
  const kmo = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 0) },
    grid: { left: 44, right: 12, top: 14, bottom: 38 },
    xAxis: { type: "value", min: 0, max: 60, name: "days since admission", nameLocation: "middle", nameGap: 24, ...axis(mode) },
    yAxis: { type: "value", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: (["real", "synthetic"] as const).map((k, i) => ({ name: k, type: "line", step: "end", showSymbol: false,
      data: lon.length_of_stay_km[k].days.map((dd: number, j: number) => [dd, lon.length_of_stay_km[k].still_in_unit[j]]),
      lineStyle: { width: 2.4, color: i === 0 ? realColor(mode) : synColor(mode) }, itemStyle: { color: i === 0 ? realColor(mode) : synColor(mode) } })),
  };
  const v = (x: any, k = 3) => (x == null ? NE : typeof x === "string" ? x : num(x, k));
  return (
    <>
      <Head center={center} title="Real vs synthetic: evidence" lead="Center 6 only. Generators were fitted and compared on the development period (before the 75-day holdout), over several seeds; the holdout is compared once and never used to choose or tune. No single similarity score is given: each family stands on its own." />
      <TermsBox ids={["ci", "ks", "wasserstein", "jsd", "tvd", "mmd", "corr-gap", "detectability", "km", "dwell", "autocorr", "coverage-gap", "dcr", "near-dup", "mia", "attr-inf", "exact-copies", "holdout"]} />
      <div className="row" style={{ marginBottom: 14 }}>
        <Segmented value={gen} onChange={setGen} options={[{ key: "ml", label: "Hybrid (traditional ML)" }, { key: "dl", label: "Deep learning" }]} />
        <span className="badge good">Primary: {ev.decision.primary === "ml" ? "hybrid (traditional ML)" : "deep learning"}</span>
        <span className="badge">Development: {ev.split.development_stays} real stays · holdout: {ev.split.holdout_stays} real stays on the unit from {ev.split.holdout_first_date}</span>
      </div>
      <div className="grid">
        <Card wide n={`${ev.seeds} seeds; real intervals from 300 stay-level resamples`} title="Key statistics with uncertainty" sub="Real development value with its 95% bootstrap interval (stays resampled with all their boards); synthetic mean, spread and range across seeds">
          <TableView open head={["Statistic", "Real", "Real 95%", "Synthetic mean", "± SD", "Range over seeds", "Inside real interval"]}
            rows={Object.entries(ks as Record<string, any>).map(([k, x]) => [k, num(x.real, 3), `${num(x.real_95[0], 3)}–${num(x.real_95[1], 3)}`, num(x.mean, 3), num(x.sd, 3), `${num(x.min, 3)}–${num(x.max, 3)}`, x.synthetic_mean_inside_real_interval ? "yes" : "no"])} />
          <div className="note">Census (real, 7-day block bootstrap): mean {ev.real_bootstrap.census["census mean"].map((x: number) => num(x, 1)).join("–")}, 90th percentile {ev.real_bootstrap.census["census 90th percentile"].map((x: number) => num(x, 1)).join("–")}.</div>
        </Card>
        <Card n={`${ev.seeds} seeds`} title="Generator stability by family" sub="Mean, standard deviation and worst value across seeds (lower is better)">
          <TableView open head={["Family", "Mean", "SD", "Worst"]} rows={famRows} />
        </Card>
        <Card n={`real ${d0.n.real.stays} · synthetic ${d0.n.synthetic.stays} stays (seed 0)`} title="Population and clinical care (development)" sub="Stay-level and shift-level distributions">
          <TableView open head={["Field", "Level", "KS", "Wasserstein / IQR", "JSD", "TVD", "Missing real / synthetic"]}
            rows={[...Object.entries(uni.stay).map(([k, x]: any) => [k, "stay", v(x.ks), v(x.wasserstein_over_iqr), v(x.jsd), v(x.tvd), `${pct(x.missing_real, 1)} / ${pct(x.missing_synthetic, 1)}`]),
              ...Object.entries(uni.shift).map(([k, x]: any) => [k, "baby-shift", v(x.ks), v(x.wasserstein_over_iqr), v(x.jsd), v(x.tvd), `${pct(x.missing_real, 1)} / ${pct(x.missing_synthetic, 1)}`])]} />
        </Card>
        <Card n={`${d0.multivariate.discriminator_stays.n_each} stays each`} title="Clinical relationships" sub="Conditional distributions (weighted TVD), correlation gap, MMD and a balanced discriminator">
          <TableView open head={["Relationship", "Value"]} rows={[...cond.map((c: any) => [`P(${c.target} | ${c.given})`, v(c.weighted_tvd)]),
            ["Correlation gap (mean |Δr|)", v(d0.multivariate.correlation_gap_mean_abs)], ["MMD² (p-value)", `${v(d0.multivariate.mmd_stays.mmd2, 5)} (p = ${v(d0.multivariate.mmd_stays.p_value)})`],
            ["Discriminator AUC (balanced, 5-fold)", v(d0.multivariate.discriminator_stays.auc)]]} />
          <div className="note">{d0.multivariate.discriminator_stays.note}.</div>
        </Card>
        <Card n={`real ${lon.length_of_stay_km.real.n} · synthetic ${lon.length_of_stay_km.synthetic.n} admitted stays`} title="Length of stay and trajectories" sub="Kaplan–Meier (censoring-aware); dwell times at each ratio"
          right={<Legend items={[{ color: realColor(mode), label: "Real" }, { color: synColor(mode), label: "Synthetic" }]} />}>
          <Chart option={kmo} height={220} label="LOS curves" />
          <TableView open head={["Measure", "Real", "Synthetic"]} rows={[["Median stay (days)", v(lon.length_of_stay_km.real.median_days, 1), v(lon.length_of_stay_km.synthetic.median_days, 1)],
            ...Object.entries(lon.ratio_dwell_boards).map(([k, x]: any) => [`Dwell at ${k} (boards), KS`, "", v(x.ks)]),
            ...Object.entries(lon.autocorrelation_lag1).map(([k, x]: any) => [`Lag-1 autocorrelation: ${k}`, v(x[0]), v(x[1])])]} />
        </Card>
        <Card n={`real ${d0.n.real.boards} · synthetic ${d0.n.synthetic.boards} boards (same boards)`} title="Census and flow (development)" sub="Per board and per day, same window and boards">
          <TableView open head={["Measure", "Real", "Synthetic", "KS"]} rows={[["Census mean", v(op.census.mean?.[0], 1), v(op.census.mean?.[1], 1), v(op.census.ks)],
            ["Admissions per day", v(op.admissions_per_day.mean?.[0], 2), v(op.admissions_per_day.mean?.[1], 2), v(op.admissions_per_day.ks)],
            ["Discharges per day", v(op.discharges_per_day.mean?.[0], 2), v(op.discharges_per_day.mean?.[1], 2), v(op.discharges_per_day.ks)],
            ["Census change between shifts (SD)", v(op.census_change_between_shifts.sd?.[0], 2), v(op.census_change_between_shifts.sd?.[1], 2), v(op.census_change_between_shifts.ks)],
            ["Occupancy autocorrelation, 1 day", v(op.occupancy_autocorrelation.lag_1_day[0]), v(op.occupancy_autocorrelation.lag_1_day[1]), ""],
            ["Shifts at high demand (≥ real 90th)", pct(op.high_demand_share.real, 0), pct(op.high_demand_share.synthetic, 0), ""],
            ["Mean high-occupancy run (shifts)", v(op.high_occupancy_runs.real_mean_shifts, 1), v(op.high_occupancy_runs.synthetic_mean_shifts, 1), ""]]} />
        </Card>
        <Card n={`real ${d0.n.real.stays} · synthetic ${d0.n.synthetic.stays} stays`} title="Coverage, diversity and rare patterns" sub="Does the synthetic data cover the real categories, transitions, subgroups, rare events and long stays?">
          <TableView open head={["Measure", "Real", "Synthetic"]} rows={[["Ratio transitions covered", String(cov.ratio_transitions.real_observed), pct(cov.ratio_transitions.covered, 0)],
            ["Ratio pathways (unique / effective number)", `${cov.pathways.unique_real} / ${num(cov.pathways.effective_number[0], 1)}`, `${cov.pathways.unique_synthetic} / ${num(cov.pathways.effective_number[1], 1)}`],
            ...Object.entries(cov.rare_events).map(([k, x]: any) => [`Stays with ${k}`, pct(x.real_share_of_stays, 1), pct(x.synthetic_share_of_stays, 1)]),
            ["Completed stays above the real 90th percentile", pct(cov.los_tail.real_share_above_p90, 0), pct(cov.los_tail.synthetic_share_above_p90, 0)],
            ...Object.entries(cov.subgroups).map(([k, x]: any) => [`Stays born ${k}`, pct(x.real_share, 1), pct(x.synthetic_share, 1)])]} />
        </Card>
        <Card n={`${d0.n.synthetic.stays} synthetic stays against ${ev.split.development_stays} development stays`} title="Privacy and memorisation" sub={pv.caution}>
          <TableView open head={["Check", "Value"]} rows={[["Exact copies of real stays", String(pv.exact_copies)], ["Synthetic stays repeating a real 10+-board trajectory exactly", String(pv.trajectory_copies.synthetic_stays_repeating_one_exactly)],
            ["Distance to closest real stay: synthetic / held-out median", `${v(pv.distance_to_closest_record.synthetic_median)} / ${v(pv.distance_to_closest_record.holdout_median)}`],
            ["Near-duplicates: synthetic / held-out share", `${pct(pv.near_duplicates.share_synthetic_closer_than_threshold, 1)} / ${pct(pv.near_duplicates.share_holdout_closer_than_threshold, 1)}`],
            ["Membership inference AUC (0.5 = no signal)", v(pv.membership_inference_auc)],
            ...Object.entries(pv.attribute_inference || {}).map(([k, x]: any) => [`Attribute inference ${k}: members / non-members`, `${pct(x.accuracy_members, 0)} / ${pct(x.accuracy_non_members, 0)}`]),
            ["Real stays unique on GA week, weight band, stay week / matched by synthetic", `${pv.singling_out.real_stays_unique_on_ga_week_bw_band_los_week} / ${pv.singling_out.of_which_matched_exactly_by_a_synthetic_stay}`],
            ["Copied notes", String(pv.copied_notes.synthetic_note_text_not_from_approved_phrases)]]} />
        </Card>
        <Card wide n={`real ${hold.n.real.stays} · synthetic ${hold.n.synthetic.stays} stays in the holdout window`} title="Untouched holdout (last 75 days): compared once" sub={hold.interpretation}>
          <TableView open head={["Statistic", "Real holdout", "Synthetic"]} rows={Object.keys(hold.key_stats.real).map((k) => [k, num(hold.key_stats.real[k], 3), num(hold.key_stats.synthetic[k], 3)])} />
          <div className="note">Discriminator AUC on the holdout: {v(hold.discriminator_stays.auc)}; median stay real {v(hold.length_of_stay_km.real.median_days, 1)} vs synthetic {v(hold.length_of_stay_km.synthetic.median_days, 1)} days.</div>
        </Card>
        {center.large_scale_comparison && <Card wide n={`real ${center.large_scale_comparison.n.real.stays} · synthetic ${num(center.large_scale_comparison.n.synthetic.stays, 0)} stays`} title="Large-scale dataset against all real data" sub="Rates and distributions (the synthetic unit runs for years; totals are not comparable)">
          <TableView open head={["Statistic", "Real", "Synthetic (large scale)"]} rows={Object.keys(center.large_scale_comparison.key_stats.real).map((k) => [k, num(center.large_scale_comparison.key_stats.real[k], 3), num(center.large_scale_comparison.key_stats.synthetic[k], 3)])} />
        </Card>}
      </div>
    </>
  );
}

