import { useState } from "react";
import Chart from "../Chart";
import { Card, cnt, Kpi, Legend, PageHead, Segmented, TableView } from "../ui";
import { axis, base, num, PALETTE, pct, wd } from "../theme";
import type { Props } from "../App";

/* Feeding stages, an ordered scale from nil by mouth to off tube; "share not stated" sits in a
   muted blue-grey because the board does not say how much is by mouth. */
export const STAGE_COLORS = {
  light: ["#e3c9a8", "#bfe3e0", "#7cc3c0", "#a6b4cc", "#2b8f91", "#0a5458"],
  dark: ["#6b5a45", "#1a3a48", "#227a77", "#45557a", "#4bb2a9", "#8fe0d4"],
};

export default function Feeding({ data, mode, embedded }: Props) {
  const p = PALETTE[mode];
  const f = data.feeding;
  const [milestone, setMilestone] = useState("off_tube");
  const [clock, setClock] = useState("cga");
  const [stageBand, setStageBand] = useState("All babies");
  const [stageClock, setStageClock] = useState("cga");
  if (!f) return <div className="empty">No feeding summary yet: run `make insights-data`.</div>;
  const bands: string[] = f.bands;
  const label = (b: string) => (b === "All babies" ? b : `born ${b}`);
  const bandColor = (b: string) => (b === "All babies" ? p.series[0] : p.band[bands.indexOf(b)]);
  const summary = (m: string) => f.summary[m] as any[];
  const off = Object.fromEntries(summary("off_tube").map((r) => [r.band, r]));
  const all = off["All babies"] || {};

  // Milestone curves: share reaching it by each age, one line per GA band.
  const curves = f.curves[milestone][clock] as Record<string, (number | null)[]>;
  const grid: number[] = clock === "cga" ? f.cga_grid : f.dol_grid;
  const names = Object.keys(curves);
  const msChart = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, formatter: (xs: any[]) => `<b>${clock === "cga" ? `corrected age ${wd(xs[0].value[0])}` : `day of life ${xs[0].value[0]}`}</b><br>`
      + xs.filter((x) => x.value[1] != null).map((x) => `${x.marker} ${label(x.seriesName)}: <b>${pct(x.value[1], 0)}</b>`).join("<br>") },
    grid: { left: 48, right: 18, top: 16, bottom: 46 },
    xAxis: { type: "value", min: grid[0], axisPointer: { label: { formatter: (x: any) => (clock === "cga" ? wd(x.value) : `${Math.round(x.value)}`) } }, max: grid[grid.length - 1], name: clock === "cga" ? "corrected age (weeks)" : "day of life", nameLocation: "middle", nameGap: 28, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: names.map((n) => ({ name: n, type: "line", step: "end", showSymbol: false, data: grid.map((g, i) => [g, curves[n][i]]),
      lineStyle: { width: n === "All babies" ? 3 : 2.2, color: bandColor(n) }, itemStyle: { color: bandColor(n) } })),
  };
  const msRows = summary(milestone);

  // Feeding stage mix over age, for one GA band.
  const sb = (stageClock === "cga" ? f.stage_by_cga : f.stage_by_dol)[stageBand];
  const sc = STAGE_COLORS[mode];
  const stageChart = sb && {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 0) },
    grid: { left: 48, right: 18, top: 16, bottom: 46 },
    xAxis: { type: "category", data: sb.x.map((x: number) => (stageClock === "cga" ? `${x}` : `${x / 7}`)), name: stageClock === "cga" ? "corrected age (weeks)" : "week of life", nameLocation: "middle", nameGap: 28, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: f.stages.map((s: string, k: number) => ({ name: s, type: "bar", stack: "s", data: sb.series[k], barWidth: "72%",
      itemStyle: { color: sc[k], borderColor: p.surface, borderWidth: 1 } })),
  };

  // Growth velocity by week of life.
  const gv = f.growth_velocity as Record<string, number[][]>;
  const gvChart = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => `${num(v, 1)} g/kg/day` },
    grid: { left: 48, right: 18, top: 30, bottom: 46 },
    xAxis: { type: "value", name: "week of life", nameLocation: "middle", nameGap: 28, min: 0, max: 12, interval: 1, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", name: "g/kg/day", ...axis(mode), axisLine: { show: false } },
    series: bands.filter((b) => gv[b]?.length).map((b) => ({ name: b, type: "line", smooth: 0.3, symbolSize: 7, data: gv[b].map((r) => [r[0], r[1]]),
      lineStyle: { width: 2.2, color: bandColor(b) }, itemStyle: { color: bandColor(b), borderColor: p.surface, borderWidth: 2 } })),
  };

  // Corrected age when leaving: middle half and median per GA band.
  const ex = f.cga_at_exit as Record<string, any>;
  const exBands = bands.filter((b) => ex[b]);
  const exitChart = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => { const q = ex[exBands[x.dataIndex]]; return `<b>Born ${exBands[x.dataIndex]}</b><br>${q.n} stays<br>median ${wd(q.median)}<br>middle half ${wd(q.q1, "")} to ${wd(q.q3)}`; } },
    grid: { left: 90, right: 24, top: 10, bottom: 40 },
    xAxis: { type: "value", min: 32, max: 46, interval: 2, name: "corrected age when leaving (weeks)", nameLocation: "middle", nameGap: 26, ...axis(mode) },
    yAxis: { type: "category", data: exBands.map((b) => `born ${b}`), inverse: true, ...axis(mode), axisLine: { show: false } },
    series: [
      { type: "custom", renderItem: (_: any, api: any) => {
          const y = api.coord([0, api.value(0)])[1];
          const lo = api.coord([api.value(1), 0])[0], hi = api.coord([api.value(2), 0])[0];
          return { type: "rect", shape: { x: lo, y: y - 7, width: Math.max(hi - lo, 2), height: 14, r: 7 }, style: { fill: bandColor(exBands[api.value(0)]), opacity: 0.35 } };
        }, data: exBands.map((b, i) => [i, ex[b].q1, ex[b].q3]), encode: { x: [1, 2], y: 0 }, z: 2 },
      { type: "scatter", data: exBands.map((b, i) => [ex[b].median, i]), symbolSize: 13, itemStyle: { color: (x: any) => bandColor(exBands[x.dataIndex]), borderColor: p.surface, borderWidth: 2 }, z: 3 },
    ],
  };

  return (
    <>
      {!embedded && <PageHead eyebrow="Your data" title="Feeding & growth" lead="When babies of each gestational age start oral feeds, come off tube feeds and reach room air, how fast they grow, and how close feeding is to going home. Ages are read from the boards; babies are watched from their first board on the unit." />}
      <div className="kpis">
        {["28–31 wk", "32–36 wk"].filter((b) => off[b]?.median_cga).map((b) => (
          <Kpi key={b} label={`Off tube feeds, born ${b}`} value={wd(off[b].median_cga)} sub={`median corrected age; ${off[b].reached} of ${off[b].watched} babies watched got there on the unit`} />
        ))}
        <Kpi label="Back on a tube later" value={pct(all.back_share, 0)} sub="of babies who came off tube feeds on the unit" />
        <Kpi label="Left the unit on a tube" value={`${all.left_without ?? "–"}`} sub={`babies (home or transfer), of ${all.watched ?? "–"} watched while on a tube`} />
        <Kpi label="Off tube to going home" value={`${num(all.days_to_exit?.median, 0)} d`} sub={`median; middle half ${num(all.days_to_exit?.q1, 0)}–${num(all.days_to_exit?.q3, 0)} days`} />
      </div>
      <div className="grid">
        <Card n={(() => { const a = msRows.find((x) => x.band === "All babies"); return a ? `${cnt(a.watched, "babies watched")} · ${a.before} already there on their first board, left out` : undefined; })()} wide title="When babies reach each milestone" sub="Share of babies who have reached it by each age, by gestational age at birth. Leaving the unit first counts against it (a baby can go home on a tube); babies already there on their first board are left out."
          right={<div className="row"><Segmented value={milestone} onChange={setMilestone} options={Object.entries(f.milestones as Record<string, string>).map(([k, v]) => ({ key: k, label: v.replace(" (over half)", "") }))} />
            <Segmented value={clock} onChange={setClock} options={[{ key: "cga", label: "Corrected age" }, { key: "dol", label: "Day of life" }]} /></div>}>
          <Chart option={msChart} height={340} label={`Share reaching ${f.milestones[milestone]} by age`} />
          <Legend items={names.map((n) => ({ color: bandColor(n), label: label(n) }))} />
          {clock === "cga" && <div className="note">By corrected age the curves are by GA band only: babies born at different ages enter at different corrected ages, so a pooled curve would mix them.</div>}
          <TableView head={["Babies", "Watched", "Reached on the unit", "Already there at first board", "Left without", "Still on the unit", "Median corrected age", "Median day of life", "Went back later"]}
            rows={msRows.map((r) => [label(r.band), r.watched, r.reached, r.before, r.left_without, r.still_in_unit, r.median_cga ? wd(r.median_cga) : "not reached by half", r.median_dol != null ? `${r.median_dol} d` : "not reached by half", pct(r.back_share, 0)])} />
        </Card>
        <Card n={sb ? `${cnt(sb.n_boards, "boards")} from ${cnt(sb.n_stays, "babies")}` : undefined} wide title="How babies are fed, by age" sub="Share of boards at each feeding stage, read from the feeding label (ages with 5 or more babies)"
          right={<div className="row"><Segmented value={stageBand} onChange={setStageBand} options={Object.keys(f.stage_by_cga).map((b) => ({ key: b, label: b === "All babies" ? "All" : b }))} />
            <Segmented value={stageClock} onChange={setStageClock} options={[{ key: "cga", label: "Corrected age" }, { key: "dol", label: "Week of life" }]} /></div>}>
          {stageChart ? <Chart option={stageChart} height={320} label="Feeding stage by age" /> : <div className="empty">Too few babies.</div>}
          <Legend items={f.stages.map((s: string, k: number) => ({ color: sc[k], label: s }))} />
          {sb && <TableView head={[stageClock === "cga" ? "Corrected age" : "Week of life", "Babies", ...f.stages]} rows={sb.x.map((x: number, i: number) => [stageClock === "cga" ? x : x / 7, sb.stays[i], ...f.stages.map((_: string, k: number) => pct(sb.series[k][i], 0))])} />}
        </Card>
        <Card n={cnt(f.growth_velocity_n?.stay_weeks, "baby-weeks")} title="Growth velocity" sub="Median weight gain in g/kg/day in each week of life (exponential method, Patel et al.), by gestational age at birth">
          <Chart option={gvChart} height={300} label="Growth velocity by week of life" />
          <Legend items={bands.filter((b) => gv[b]?.length).map((b) => ({ color: bandColor(b), label: label(b) }))} />
          <TableView head={["Born", "Week of life", "Median g/kg/day", "Middle half", "Babies"]} rows={bands.flatMap((b) => (gv[b] || []).map((r) => [b, r[0], num(r[1], 1), `${num(r[2], 1)} to ${num(r[3], 1)}`, r[4]]))} />
        </Card>
        <Card n={cnt(exBands.reduce((a, b) => a + ex[b].n, 0), "completed stays")} title="Corrected age when leaving" sub="Median (dot) and middle half (bar) for stays that began and ended in the data">
          <Chart option={exitChart} height={300} label="Corrected age at leaving by GA band" />
          <TableView head={["Born", "Stays", "Median", "Middle half", "10th–90th"]} rows={exBands.map((b) => [b, ex[b].n, wd(ex[b].median), `${wd(ex[b].q1, "")} to ${wd(ex[b].q3)}`, `${wd(ex[b].p10, "")} to ${wd(ex[b].p90)}`])} />
        </Card>
      </div>
    </>
  );
}
