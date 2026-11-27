import { useEffect, useState } from "react";
import Chart from "../Chart";
import { Card, cnt, Kpi, Legend, PageHead, Segmented, TableView } from "../ui";
import { axis, base, num, PALETTE, pct, wd } from "../theme";
import type { Props } from "../App";
import Stays from "./Stays";
import Feeding from "./Feeding";
import { Journey, Patients } from "./Real";

const RATIOS = ["1:3-4", "1:3", "1:2-3", "1:2", "1:1"];
const MODE_NAMES: Record<string, string> = { VENT: "Ventilator", NIPPV: "NIPPV", CPAP: "CPAP", HFNC: "High-flow", NC: "Nasal cannula", RA: "Room air" };

/* A tab inside a Your data page, kept in the address (#babies/feeding) so a tab can be linked. */
function useTab(page: string, tabs: string[]): [string, (t: string) => void] {
  const read = () => {
    const [p, t] = location.hash.slice(1).split("/");
    const alias: Record<string, string> = { stays: "stays", patients: "birth", journey: "care", feeding: "feeding" };
    const tab = p === page ? t : alias[p];
    return tabs.includes(tab) ? tab : tabs[0];
  };
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [tab, (t: string) => { location.hash = `${page}/${t}`; setTab(t); }];
}

/* Scroll to the section named in the address (#nurses/needed opens the card with id sec-needed). */
function useSection(page: string) {
  useEffect(() => {
    const go = () => {
      const [p, t] = location.hash.slice(1).split("/");
      if (p !== page) return;
      const el = t && document.getElementById(`sec-${t}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const id = window.setTimeout(go, 80);
    window.addEventListener("hashchange", go);
    return () => { window.clearTimeout(id); window.removeEventListener("hashchange", go); };
  }, []);
}

/* ------------------------------------------------------------------ Babies */
const BABY_TABS = [
  { key: "stays", label: "Baby stays", lead: "Every baby of the gestational age and weight you choose, one line per stay, the real babies beside a synthetic unit's." },
  { key: "birth", label: "Birth & length of stay", lead: "How premature and how small the babies are at birth, how long they stay, and how they grow." },
  { key: "care", label: "Care during the stay", lead: "Breathing support and feeding by corrected age, and the events and procedures noted on the boards." },
  { key: "feeding", label: "Feeding & growth", lead: "When babies of each gestational age start oral feeds, come off tube feeds and reach room air, and how fast they grow." },
];

export function Babies(props: Props) {
  const [tab, setTab] = useTab("babies", BABY_TABS.map((t) => t.key));
  const cur = BABY_TABS.find((t) => t.key === tab)!;
  return (
    <>
      <PageHead eyebrow="Your data" title="Babies" lead={cur.lead} />
      <div className="row" style={{ marginBottom: 18 }}>
        <Segmented value={tab} onChange={setTab} options={BABY_TABS.map((t) => ({ key: t.key, label: t.label }))} />
      </div>
      {tab === "stays" && <Stays {...props} embedded />}
      {tab === "birth" && <Patients {...props} embedded />}
      {tab === "care" && <Journey {...props} section="babies" />}
      {tab === "feeding" && <Feeding {...props} embedded />}
    </>
  );
}

/* ------------------------------------------------------------------ Nurses */
export function Nurses({ data, mode }: Props) {
  const p = PALETTE[mode];
  const n = data.nurses;
  useSection("nurses");
  if (!n) return <div className="empty">No nurse summary yet: run `make insights-data`.</div>;
  const k = n.kpis;
  const short = (v: string) => v.slice(5, 10);
  const zoom = (bottom: number) => [{ type: "inside" }, { type: "slider", height: 16, bottom, borderColor: "transparent", fillerColor: p.series[0] + "22",
    backgroundColor: p.grid, dataBackground: { lineStyle: { color: p.axis }, areaStyle: { color: p.grid } }, handleStyle: { color: p.series[0] } }];
  const mix = {
    ...base(mode), legend: { show: false },
    grid: { left: 44, right: 16, top: 28, bottom: 56 },
    xAxis: { type: "category", data: n.labels, ...axis(mode), axisLabel: { color: p.muted, formatter: short }, splitLine: { show: false } },
    yAxis: { type: "value", name: "babies", ...axis(mode), axisLine: { show: false } },
    dataZoom: zoom(8),
    series: RATIOS.map((name, i) => ({ name, type: "line", stack: "mix", data: n.ratio_mix[i], showSymbol: false, smooth: 0.25,
      lineStyle: { width: 0 }, areaStyle: { color: p.ratio[i], opacity: 0.95 }, itemStyle: { color: p.ratio[i] }, emphasis: { focus: "series" } })),
  };
  const nurses = {
    ...base(mode), legend: { show: false },
    grid: { left: 40, right: 16, top: 30, bottom: 56 },
    xAxis: { type: "category", data: n.labels, ...axis(mode), axisLabel: { color: p.muted, formatter: short }, splitLine: { show: false } },
    yAxis: { type: "value", name: "nurses", ...axis(mode), axisLine: { show: false }, min: (v: any) => Math.floor(v.min - 1) },
    dataZoom: zoom(8),
    series: [
      { name: "Fewer-nurse end", type: "line", data: n.nurses_min, showSymbol: false, smooth: 0.3, lineStyle: { color: p.muted, width: 1.5, type: "dashed" }, itemStyle: { color: p.muted } },
      { name: "More-nurse end", type: "line", data: n.nurses_max, showSymbol: false, smooth: 0.3, lineStyle: { color: p.series[0], width: 2 }, itemStyle: { color: p.series[0] }, areaStyle: { color: p.series[0] + "18" } },
    ],
  };
  const need = Object.entries(n.need_hist as Record<string, number>);
  const total = need.reduce((a, [, v]) => a + v, 0);
  const needChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: (x: any) => `${x[0].name} nurses: <b>${x[0].value}</b> shifts (${pct(x[0].value / total, 0)})` },
    grid: { left: 40, right: 12, top: 30, bottom: 40 },
    xAxis: { type: "category", data: need.map(([k]) => k), name: "bedside nurses needed (more-nurse end, rounded up)", nameLocation: "middle", nameGap: 24, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", name: "shifts", ...axis(mode), axisLine: { show: false } },
    series: [{ type: "bar", data: need.map(([, v]) => v), barWidth: "58%", itemStyle: { color: p.series[0], borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: "top", color: p.soft, fontSize: 10.5, formatter: (x: any) => pct(x.value / total, 0) } }],
  };
  const g = n.by_day_shift;
  const vals = (g.values as (number | null)[][]).flat().filter((v): v is number => v != null);
  const heat = {
    ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `${g.days[x.value[0]]} ${g.shifts[x.value[1]]}: <b>${num(x.value[2], 1)}</b> nurses on average` },
    grid: { left: 40, right: 12, top: 8, bottom: 30 },
    xAxis: { type: "category", data: g.days, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "category", data: g.shifts, ...axis(mode), splitLine: { show: false } },
    visualMap: { show: false, min: Math.min(...vals), max: Math.max(...vals), inRange: { color: p.seq.slice(0, 4) } },
    series: [{ type: "heatmap", data: g.values.flatMap((row: number[], si: number) => row.map((v, di) => [di, si, v])),
      label: { show: true, color: p.ink, fontSize: 11, formatter: (x: any) => num(x.value[2], 1) }, itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 5 } }],
  };
  const share = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `${x.name}: <b>${pct(x.value, 1)}</b> of baby-shifts` },
    series: [{ type: "pie", radius: ["52%", "78%"], itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 },
      label: { color: p.soft, formatter: (x: any) => `${x.name}\n${pct(x.value, 0)}` },
      data: RATIOS.map((r, i) => ({ name: r, value: n.ratio_share[i], itemStyle: { color: p.ratio[i] } })) }],
  };
  return (
    <>
      <PageHead eyebrow="Your data" title="Nurses" lead="How many bedside nurses the babies' nurse:patient ratios call for, shift by shift, read from the boards. These are the nurses the ratios require, not the nurses who were rostered." />
      <div className="kpis">
        <Kpi label="Nurses needed" value={`${num(k.mean_nurses, 1)}`} sub="on an average shift (more-nurse end)" />
        <Kpi label="Busy shifts" value={`${num(k.p90_nurses, 1)}`} sub={`nurses on 1 shift in 10; peak ${num(k.peak_nurses, 1)}`} />
        <Kpi label="Babies per nurse" value={num(k.babies_per_nurse, 1)} sub={`average census ${num(k.mean_census, 1)}`} />
        <Kpi label="Intensive ratios" value={pct(k.intensive_share)} sub="of baby-shifts at 1:2 or 1:1" />
      </div>
      <div className="grid">
        <Card n={`${cnt(n.boards, "boards")} · ${cnt(n.baby_shifts, "baby-shifts")}`} wide id="sec-ratio" title="Babies on the unit, by nurse:patient ratio" sub="One colour per ratio, as in NeoStay: blue 1:3-4, green 1:3, amber 1:2-3, orange 1:2, crimson 1:1. Drag the slider to zoom into a period."
          right={<Legend items={RATIOS.map((r, i) => ({ color: p.ratio[i], label: r }))} />}>
          <Chart option={mix} height={340} label="Babies by nurse ratio over time" />
        </Card>
        <Card n={cnt(n.boards, "boards (one per shift)")} wide id="sec-needed" title="Bedside nurses needed" sub="Both ends of the ranged ratios (1:3-4 and 1:2-3 can be staffed at either end)"
          right={<Legend items={[{ color: p.muted, label: "Fewer-nurse end (dashed)" }, { color: p.series[0], label: "More-nurse end" }]} />}>
          <Chart option={nurses} height={300} label="Nurses needed over time" />
        </Card>
        <Card n={cnt(total, "shifts")} id="sec-levels" title="How often each staffing level was needed" sub="Shifts by the nurses their babies' ratios called for">
          <Chart option={needChart} height={280} label="Shifts by nurses needed" />
          <TableView head={["Nurses needed", "Shifts", "Share"]} rows={need.map(([k, v]) => [k, v, pct(v / total, 1)])} />
        </Card>
        <Card n={`${cnt(n.boards, "shifts")}; ratio mix ${cnt(n.baby_shifts, "baby-shifts")}`} id="sec-week" title="By weekday and shift" sub="Average nurses needed (more-nurse end); the ratios hardly depend on the day">
          <Chart option={heat} height={150} label="Nurses needed by weekday and shift" />
          <div style={{ height: 14 }} />
          <h3 style={{ margin: "6px 0 2px", fontSize: 15 }}>Mix of ratios</h3>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12.5 }}>Share of all baby-shifts at each ratio</p>
          <Chart option={share} height={200} label="Share of baby-shifts by ratio" />
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Babies & nurses */
/* The babies nurses looked after at each ratio: who they are (day of life, gestational age,
   corrected age, weight) and their condition (the acuity tool's body systems on the boards). */
const MEASURE_KEYS = [["dol", "Day of life"], ["ga_weeks", "GA at birth"], ["cga_weeks", "Corrected age"], ["weight_g", "Weight"]];
const TIER = ["continuing care", "continuing care", "intermediate care", "intensive care", "intensive care"];

/* Every skill of the unit's acuity tool: whether the boards show it, how it is read, and the ratios of the baby-shifts
   showing it (acuity_insights/build.py: skills_coverage). */
const SEEN: Record<string, { word: string; cls: string }> = { yes: { word: "on the boards", cls: "good" }, partly: { word: "partly", cls: "warn" }, no: { word: "not recorded", cls: "bad" } };
const TIER_NAME: Record<string, string> = { intensive: "Intensive (1:2 or 1:1)", intermediate: "Intermediate (1:2-3)", continuing: "Continuing (1:3 or 1:3-4)" };
function SkillsCard({ sk }: { sk: any; mode: Props["mode"] }) {
  const [show, setShow] = useState("all");
  const rows = (sk.rows as any[]).filter((r) => show === "all" || r.seen === show);
  return (
    <Card wide id="sec-skills" title="Nurse skills: which conditions the boards show"
      sub={`Every skill in the unit's acuity tool (the nurse skills list), whether the boards record it, and the ratios the babies who showed it were at. Source: ${sk.source}.`}
      n={`${sk.counts.yes} on the boards · ${sk.counts.partly} partly · ${sk.counts.no} not recorded`}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Segmented value={show} onChange={setShow} options={[{ key: "all", label: `All ${sk.rows.length}` }, { key: "yes", label: `On the boards (${sk.counts.yes})` },
          { key: "partly", label: `Partly (${sk.counts.partly})` }, { key: "no", label: `Not recorded (${sk.counts.no})` }]} />
      </div>
      <div className="table-scroll">
        <table className="sc-table skills">
          <thead><tr><th>Skill (the tool's words)</th><th>Tool level</th><th>On the boards?</th><th>How it is read</th><th>Baby-shifts</th>{sk.ratios.map((x: string) => <th key={x}>at {x}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.code}><td><b>{r.skill}</b><small>{r.system}</small></td><td><small>{TIER_NAME[r.tier] ?? r.tier}</small></td>
              <td><span className={`badge ${SEEN[r.seen].cls}`}>{SEEN[r.seen].word}</span></td><td><small>{r.how}</small></td>
              <td className="sc-val">{r.shifts != null ? r.shifts.toLocaleString() : "–"}</td>
              {sk.ratios.map((_: string, k: number) => <td key={k} className="sc-val">{r.by_ratio && r.shifts ? pct(r.by_ratio[k] / r.shifts, 0) : "–"}</td>)}</tr>))}
          </tbody>
        </table>
      </div>
      <p className="note">{sk.counts.no} of the tool's {sk.rows.length} skills cannot be seen on the boards (medications, seizures, cooling, phototherapy, the state of a sepsis, anomalies, bedside surgery, resuscitation), and {sk.counts.partly} only partly. Babies needing them are on the boards, but these conditions are not written there. The ratio written on the board may reflect them; the past-practice table and the models can see them only through that ratio. Recording them (for example from the medication record) would let the tool's levels be checked in full.</p>
    </Card>
  );
}

function RatioBabies({ at, mode, skills }: { at: any; mode: Props["mode"]; skills?: any }) {
  const p = PALETTE[mode];
  const [m, setM] = useState("dol");
  const [dir, setDir] = useState("col");   // "col": share of each ratio with the condition; "row": the ratios of babies with the condition
  const meas = at.measures[m];
  const isAge = m === "ga_weeks" || m === "cga_weeks";
  const fmt = (v: number | null | undefined) => (v == null ? "–" : isAge ? wd(v) : m === "weight_g" ? `${num(v, 0)} g` : `${num(v, 0)} d`);
  const label = (i: number) => `${at.ratios[i]}${at.stays[i] < 10 ? " *" : ""}`;
  const rows = meas.rows as any[];
  const box = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => {
      const i = x.value[0], q = rows[i];
      return `<b>${at.ratios[i]}</b> · ${TIER[i]}<br>${at.stays[i]} babies · ${q.n.toLocaleString()} baby-shifts<br>median <b>${fmt(q.median)}</b><br>middle half ${fmt(q.q1)} – ${fmt(q.q3)}<br>8 in 10 between ${fmt(q.p10)} and ${fmt(q.p90)}`; } },
    grid: { left: 70, right: 28, top: 8, bottom: 44 },
    xAxis: { type: "value", scale: true, name: `${meas.label} (${isAge ? "weeks+days" : meas.unit})`, nameLocation: "middle", nameGap: 28, ...axis(mode),
      axisLabel: { color: p.muted, formatter: (v: number) => (isAge ? wd(v, "") : num(v, 0)) } },
    yAxis: { type: "category", data: at.ratios.map((_: string, i: number) => label(i)), inverse: true, ...axis(mode), axisLine: { show: false }, axisLabel: { color: p.soft, fontSize: 12 } },
    series: [
      { type: "custom", z: 2, encode: { x: [1, 5], y: 0 }, renderItem: (_: any, api: any) => {
          const i = api.value(0); if (rows[i].median == null) return null;
          const y = api.coord([0, i])[1], x = (v: number) => api.coord([v, i])[0];
          const c = p.ratio[i];
          return { type: "group", children: [
            { type: "line", shape: { x1: x(api.value(1)), y1: y, x2: x(api.value(5)), y2: y }, style: { stroke: c, lineWidth: 2 } },
            { type: "rect", shape: { x: x(api.value(2)), y: y - 9, width: Math.max(x(api.value(4)) - x(api.value(2)), 2), height: 18, r: 4 }, style: { fill: c, opacity: 0.3, stroke: c, lineWidth: 1 } },
            { type: "circle", shape: { cx: x(api.value(3)), cy: y, r: 6 }, style: { fill: c, stroke: p.surface, lineWidth: 2 } },
          ] };
        }, data: rows.map((q, i) => [i, q.p10, q.q1, q.median, q.q3, q.p90]) },
    ],
  };
  // Condition profile: one heading row per body system, then its conditions; cells are the share of baby-shifts.
  const ylab: string[] = [], cells: any[] = [], heads = new Set<number>();
  const rowShare = (r: any) => { const t = r.shifts.reduce((a: number, b: number) => a + b, 0); return r.shifts.map((x: number) => (t ? x / t : null)); };
  at.groups.forEach((g: any) => {
    heads.add(ylab.length); ylab.push(dir === "col" ? `${g.name}${g.exclusive ? "" : " · can overlap"}` : g.name);
    g.rows.forEach((r: any) => { const yi = ylab.length; ylab.push(r.name); (dir === "col" ? r.share : rowShare(r)).forEach((v: number | null, k: number) => cells.push([k, yi, v, r.shifts[k]])); });
  });
  const heat = {
    ...base(mode),
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => dir === "col"
      ? `<b>${ylab[x.value[1]]}</b> at ${at.ratios[x.value[0]]}<br>${pct(x.value[2], 1)} of the ${at.shifts[x.value[0]].toLocaleString()} baby-shifts at ${at.ratios[x.value[0]]} (${x.value[3].toLocaleString()})`
      : `<b>${ylab[x.value[1]]}</b><br>${pct(x.value[2], 1)} of these baby-shifts were at ${at.ratios[x.value[0]]} (${x.value[3].toLocaleString()})` },
    grid: { left: 260, right: 16, top: 34, bottom: 8 },
    xAxis: { type: "category", position: "top", data: at.ratios.map((_: string, i: number) => label(i)), ...axis(mode), axisLine: { show: false }, splitArea: { show: false },
      axisLabel: { color: p.ink, fontSize: 12, fontWeight: 600 } },
    yAxis: { type: "category", data: ylab, inverse: true, ...axis(mode), axisLine: { show: false }, splitLine: { show: false },
      axisLabel: { fontSize: 11.5, formatter: (v: string, i: number) => (heads.has(i) ? `{h|${v.toUpperCase()}}` : v), color: p.soft,
        rich: { h: { color: p.muted, fontSize: 10.5, fontWeight: 700, padding: [8, 0, 0, 0] } } } },
    visualMap: { show: false, min: 0, max: 1, dimension: 2, inRange: { color: p.seq } },
    series: [{ type: "heatmap", itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 4 },
      label: { show: true, fontSize: 11, formatter: (x: any) => (x.value[2] == null ? "" : pct(x.value[2], 0)) },
      emphasis: { itemStyle: { borderColor: p.ink, borderWidth: 1 } },
      // Cells at the top of the scale are dark in the light theme and light in the dark theme.
      data: cells.map((c) => ({ value: c, label: { color: (c[2] ?? 0) > 0.55 ? (mode === "light" ? "#ffffff" : "#0f1a2e") : p.ink } })) }],
  };
  const sumStays = at.stays.reduce((a: number, b: number) => a + b, 0);
  const sumShifts = at.shifts.reduce((a: number, b: number) => a + b, 0);
  return (
    <>
      <Card wide id="sec-at-ratio" n={`${cnt(sumShifts, "baby-shifts")} · ${at.stays.map((s: number, i: number) => `${at.ratios[i]} ${s}`).join(" · ")} babies`}
        title="The babies nurses looked after at each ratio" sub={`${meas.label} of the babies on the boards where they were at each ratio (each board counts once): median, middle half and 8 in 10. The boards record the ratio each baby needed, not which nurse was assigned.`}
>
        <div className="row"><Segmented value={m} onChange={setM} options={MEASURE_KEYS.map(([k, l]) => ({ key: k, label: l }))} /></div>
        <Chart option={box} height={290} label={`${meas.label} by nurse ratio`} />
        <p className="note">* Fewer than 10 babies: read with care. A baby counts at every ratio they needed during the stay ({cnt(sumStays, "baby-ratio pairs")} in all).</p>
        <TableView head={["Ratio", "Care tier", "Babies", "Baby-shifts", "Median", "Middle half", "8 in 10 between"]}
          rows={rows.map((q, i) => [at.ratios[i], TIER[i], at.stays[i], q.n.toLocaleString(), fmt(q.median), `${fmt(q.q1)} – ${fmt(q.q3)}`, `${fmt(q.p10)} – ${fmt(q.p90)}`])} />
      </Card>
      <Card wide n={`${cnt(sumShifts, "baby-shifts")} from ${at.stays.map((s: number, i: number) => `${at.ratios[i]} ${s}`).join(" · ")} babies`}
        title="Their condition at each ratio" sub="The acuity tool's body systems as the boards record them; comment keywords (such as sepsis) are left out because a mention is not a diagnosis. Last block: the body system the acuity tool, applied to the board, points to.">
        <div className="row" style={{ marginBottom: 8 }}>
          <Segmented value={dir} onChange={setDir} options={[{ key: "col", label: "Within each ratio (columns)" }, { key: "row", label: "For each condition (rows)" }]} />
        </div>
        <p className="note" style={{ marginTop: 0 }}>{dir === "col"
          ? <>Each <b>column</b> is one ratio: the share of its baby-shifts with each condition. Within a block, a column adds to 100%, except the blocks marked <i>can overlap</i> (a baby can have a central line and IV fluids at once). Rows do not add up: each cell is a share of a different group.</>
          : <>Each <b>row</b> is one condition: of the baby-shifts with it, the share at each ratio. Every row adds to 100%. Example: of the baby-shifts on a ventilator, how many were at 1:2 and how many at 1:1.</>}</p>
        <Chart option={heat} height={ylab.length * 25 + 50} label="Condition profile by nurse ratio" />
        <TableView head={["Condition", ...at.ratios, "Baby-shifts"]} rows={at.groups.flatMap((g: any) => g.rows.map((r: any) => [`${g.name}: ${r.name}`, ...(dir === "col" ? r.share : rowShare(r)).map((v: number | null) => pct(v, 1)), r.shifts.reduce((a: number, b: number) => a + b, 0).toLocaleString()]))} />
      </Card>
      {skills && <SkillsCard sk={skills} mode={mode} />}
    </>
  );
}

export function BabiesNurses(props: Props) {
  const { data, mode } = props;
  const p = PALETTE[mode];
  const bn = data.babies_nurses;
  const [by, setBy] = useState("mode");
  useSection("babies-nurses");
  if (!bn) return <div className="empty">No summary yet: run `make insights-data`.</div>;
  const table = by === "band" ? bn.by_band : by === "mode" ? bn.by_mode : bn.by_stage;
  const rowName = (r: string) => (by === "band" ? `born ${r}` : by === "mode" ? MODE_NAMES[r] || r : r);
  const stack = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => pct(v, 0) },
    grid: { left: 190, right: 20, top: 8, bottom: 30 },
    xAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    yAxis: { type: "category", data: table.rows.map(rowName), inverse: true, ...axis(mode), axisLine: { show: false }, axisLabel: { color: p.soft, fontSize: 11.5 } },
    series: RATIOS.map((r, i) => ({ name: r, type: "bar", stack: "s", data: table.series[i], barWidth: 18, itemStyle: { color: p.ratio[i], borderColor: p.surface, borderWidth: 1 } })),
  };
  const w = bn.workload as Record<string, any>;
  const wb = Object.keys(w);
  const work = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => { const q = w[wb[x.dataIndex]]; return `<b>Born ${wb[x.dataIndex]}</b><br>${q.n} stays · median ${num(q.median, 1)} nurse-shifts<br>middle half ${num(q.q1, 1)}–${num(q.q3, 1)}<br>${pct(q.share, 0)} of all nursing`; } },
    grid: { left: 90, right: 24, top: 8, bottom: 40 },
    xAxis: { type: "log", min: 1, max: 128, logBase: 2, name: "nurse-shifts per stay (log scale)", nameLocation: "middle", nameGap: 24, ...axis(mode), axisLabel: { color: p.muted } },
    yAxis: { type: "category", data: wb.map((b) => `born ${b}`), inverse: true, ...axis(mode), axisLine: { show: false } },
    series: [
      { type: "custom", encode: { x: [1, 2], y: 0 }, renderItem: (_: any, api: any) => {
          const y = api.coord([1, api.value(0)])[1];
          const lo = api.coord([api.value(1), 0])[0], hi = api.coord([api.value(2), 0])[0];
          return { type: "rect", shape: { x: lo, y: y - 7, width: Math.max(hi - lo, 2), height: 14, r: 7 }, style: { fill: p.band[api.value(0)], opacity: 0.35 } };
        }, data: wb.map((b, i) => [i, Math.max(w[b].q1, 1), w[b].q3]), z: 2 },
      { type: "scatter", data: wb.map((b, i) => [Math.max(w[b].median, 1), i]), symbolSize: 13, itemStyle: { color: (x: any) => p.band[x.dataIndex], borderColor: p.surface, borderWidth: 2 }, z: 3 },
    ],
  };
  const shareChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `Born ${x.name}: <b>${pct(x.value, 0)}</b> of all nursing` },
    series: [{ type: "pie", radius: ["50%", "76%"], itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 },
      label: { color: p.soft, formatter: (x: any) => `${x.name}\n${pct(x.value, 0)}` },
      data: wb.map((b, i) => ({ name: b, value: w[b].share, itemStyle: { color: p.band[i] } })) }],
  };
  return (
    <>
      <PageHead eyebrow="Your data" title="Babies & nurses" lead="How the babies' condition sets the nursing they need: the ratio by breathing support, feeding and gestational age, how it changes through a stay, and which babies take most of the nursing." />
      <div className="kpis">
        {wb.map((b) => <Kpi key={b} label={`Born ${b}`} value={`${num(w[b].median, 0)}`} sub={`median nurse-shifts per stay; ${pct(w[b].share, 0)} of all nursing`} accent={p.band[wb.indexOf(b)]} />)}
      </div>
      <div className="grid">
        <Card n={`${cnt(table.shifts.reduce((a: number, b: number) => a + b, 0), "baby-shifts")} of ${cnt(data.real?.kpis?.baby_shifts, "")}from ${cnt(by === "band" ? table.stays.reduce((a: number, b: number) => a + b, 0) : data.nurses?.stays, "stays")}`} wide id="sec-sets" title="What sets the nurse ratio"
          sub={`Share of baby-shifts at each ratio (groups with 5 or more babies). Baby-shifts with the ${by === "mode" ? "breathing support" : by === "stage" ? "feeding label" : "gestational age"} blank on the board are left out.`}
          right={<div className="row"><Segmented value={by} onChange={setBy} options={[{ key: "mode", label: "By breathing support" }, { key: "stage", label: "By feeding" }, { key: "band", label: "By gestational age" }]} />
            <Legend items={RATIOS.map((r, i) => ({ color: p.ratio[i], label: r }))} /></div>}>
          <Chart option={stack} height={Math.max(200, table.rows.length * 34 + 40)} label="Nurse ratio by group" />
          <TableView head={["Group", "Babies", ...RATIOS]} rows={table.rows.map((r: string, j: number) => [rowName(r), table.stays[j], ...RATIOS.map((_, i) => pct(table.series[i][j], 0))])} />
        </Card>
        {bn.at_ratio && <RatioBabies at={bn.at_ratio} mode={mode} skills={bn.skills} />}
        <Card n={cnt(wb.reduce((a, b) => a + w[b].n, 0), "completed stays")} id="sec-per-baby" title="Nursing each baby needs" sub="Nurse-shifts over a completed stay (each baby-shift counts its ratio's share of a nurse, more-nurse end): median and middle half">
          <Chart option={work} height={260} label="Nurse-shifts per stay by GA band" />
          <TableView head={["Born", "Stays", "Median", "Middle half", "90th", "Share of all nursing"]} rows={wb.map((b) => [b, w[b].n, num(w[b].median, 1), `${num(w[b].q1, 1)}–${num(w[b].q3, 1)}`, num(w[b].p90, 1), pct(w[b].share, 0)])} />
        </Card>
        <Card n={cnt(wb.reduce((a, b) => a + w[b].n, 0), "completed stays")} title="Who takes the nursing" sub="Share of all nurse-shifts of completed stays, by gestational age at birth">
          <Chart option={shareChart} height={260} label="Share of nursing by GA band" />
        </Card>
      </div>
      <div style={{ height: 20 }} />
      <Journey {...props} section="nurses" />
    </>
  );
}
