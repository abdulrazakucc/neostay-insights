import Chart from "../Chart";
import { Card, cnt, Legend, PageHead, TableView } from "../ui";
import { axis, base, num, PALETTE, pct, wd } from "../theme";
import type { Props } from "../App";

const RATIOS = ["1:3-4", "1:3", "1:2-3", "1:2", "1:1"];

/* ------------------------------------------------------------------ Babies & stays */
export function Patients({ data, mode, embedded }: Props) {
  const p = PALETTE[mode];
  const r = data.real;
  const s = data.synthetic;
  const b = r.birth;
  const hist = (edges: number[], counts: number[], unit: string) => ({
    ...base(mode), grid: { left: 36, right: 12, top: 14, bottom: 34 },
    tooltip: { ...base(mode).tooltip, formatter: (x: any) => `${x[0].name} ${unit}<br><b>${x[0].value}</b> stays` },
    xAxis: { type: "category", data: edges.slice(0, -1).map(String), ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLine: { show: false } },
    series: [{ type: "bar", data: counts, barCategoryGap: "12%", itemStyle: { color: p.series[0], borderRadius: [4, 4, 0, 0] } }],
  });
  const scatter = s && {
    ...base(mode), grid: { left: 52, right: 16, top: 34, bottom: 40 },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `GA ${wd(x.value[0])} · ${num(x.value[1], 0)} g` },
    xAxis: { type: "value", name: "gestational age (weeks)", nameLocation: "middle", nameGap: 26, min: 22, max: 43, ...axis(mode) },
    yAxis: { type: "value", name: "birth weight (g)", ...axis(mode), axisLine: { show: false } },
    series: [{ type: "scatter", data: s.birth_scatter.real, symbolSize: 8, itemStyle: { color: p.series[0], opacity: 0.75, borderColor: p.surface, borderWidth: 1.5 } }],
  };
  const km = s && {
    ...base(mode), grid: { left: 44, right: 16, top: 16, bottom: 40 },
    tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v) },
    xAxis: { type: "category", data: s.km.real.map((_: number, i: number) => (i + 1) / 2), ...axis(mode), name: "days since admission", nameLocation: "middle", nameGap: 26,
      axisLabel: { color: p.muted, interval: 13 }, splitLine: { show: false } },
    yAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    legend: { show: false },
    series: [{ name: "Still in the unit", type: "line", step: "end", data: s.km.real, showSymbol: false, lineStyle: { color: p.series[0], width: 2 }, itemStyle: { color: p.series[0] },
      areaStyle: { color: p.series[0] + "1f" } }],
  };
  const los = r.los_by_ga;
  const box = {
    ...base(mode), grid: { left: 70, right: 20, top: 16, bottom: 36 },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => { const v = los[x.dataIndex]; return `${v.band} (${v.n} stays)<br>median <b>${v.median} d</b><br>middle half ${v.q1}–${v.q3} d<br>10–90%: ${v.p10}–${v.p90} d`; } },
    xAxis: { type: "value", name: "days", nameLocation: "middle", nameGap: 24, ...axis(mode) },
    yAxis: { type: "category", data: los.map((v: any) => v.band), ...axis(mode) },
    series: [{ type: "boxplot", data: los.map((v: any) => [v.p10, v.q1, v.median, v.q3, v.p90]), boxWidth: [10, 22],
      itemStyle: { color: p.series[0] + "33", borderColor: p.series[0], borderWidth: 2 } }],
  };
  const bands = Object.keys(r.growth);
  const growth = {
    ...base(mode), grid: { left: 52, right: 16, top: 34, bottom: 56 },
    tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => `${num(v, 0)} g` },
    xAxis: { type: "value", name: "week of life", nameLocation: "middle", nameGap: 26, ...axis(mode), max: 16 },
    yAxis: { type: "value", name: "median weight (g)", ...axis(mode), axisLine: { show: false } },
    series: bands.map((band, k) => ({ name: band, type: "line", data: r.growth[band], symbolSize: 7, smooth: 0.3,
      lineStyle: { width: 2, color: p.band[k] }, itemStyle: { color: p.band[k], borderColor: p.surface, borderWidth: 2 } })),
  };
  return (
    <>
      {!embedded && <PageHead eyebrow="Your data" title="Babies & stays" lead="Who the unit cares for: how premature and how small at birth, how long they stay, and how they grow." />}
      <div className="grid">
        <Card n={cnt(r.n?.ga, "stays")} title="Gestational age at birth" sub="Stays, by completed week">
          <Chart option={hist(b.ga_edges, b.ga_hist, "weeks")} height={240} label="Histogram of gestational age" />
        </Card>
        <Card n={cnt(r.n?.bw, "stays")} title="Birth weight" sub="Stays, by 300 g band">
          <Chart option={hist(b.bw_edges, b.bw_hist, "g")} height={240} label="Histogram of birth weight" />
        </Card>
        {scatter && <Card n={cnt(s?.birth_scatter?.real?.length, "stays")} title="Gestational age and birth weight together" sub="One dot per stay"><Chart option={scatter} height={280} label="Gestational age against birth weight" /></Card>}
        {km && <Card n={cnt(r.n?.all?.stays, "stays")} title="How long babies stay" sub="Chance of still being in the unit after each day (Kaplan–Meier; babies still there when the data ends count until then)"><Chart option={km} height={280} label="Kaplan-Meier curve of length of stay" /></Card>}
        <Card n={cnt(r.n?.los_by_ga, "completed stays")} title="Length of stay by gestational age" sub="Completed stays. Box: middle half; whiskers: 10th to 90th percentile">
          <Chart option={box} height={260} label="Length of stay by gestational age band" />
          <TableView head={["GA band", "Stays", "Median", "Middle half"]} rows={los.map((v: any) => [v.band, v.n, `${v.median} d`, `${v.q1}–${v.q3} d`])} />
        </Card>
        <Card n={`${cnt(r.n?.growth?.baby_shifts, "weights")} from ${cnt(r.n?.growth?.stays, "stays")}`} title="How babies grow" sub="Median weight by week of life, by gestational age at birth (more premature: lighter shade)">
          <Chart option={growth} height={260} label="Median weight by week of life and GA band" />
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Clinical journey */
export function Journey({ data, mode, section }: Props & { section: "babies" | "nurses" }) {
  const p = PALETTE[mode];
  const r = data.real;
  const s = data.synthetic;
  const view = section === "nurses" ? "ratio" : "resp";
  const rw = r.ratio_by_week;
  const rc = r.resp_by_cga;
  // Breathing support, most to least: the same colours as on Baby stays.
  const modeRamp = [...p.band, p.ramp[mode === "light" ? 1 : 3], mode === "light" ? "#cfd6e2" : "#4a5578"];
  const area = view === "ratio" ? {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v) },
    grid: { left: 44, right: 16, top: 16, bottom: 56 },
    xAxis: { type: "category", data: rw.weeks, name: "week of life", nameLocation: "middle", nameGap: 26, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: RATIOS.map((name, k) => ({ name, type: "line", stack: "s", data: rw.series[k], showSymbol: false, smooth: 0.3, lineStyle: { width: 0 },
      areaStyle: { color: p.ratio[k], opacity: 0.95 }, itemStyle: { color: p.ratio[k] } })),
  } : {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v) },
    grid: { left: 44, right: 16, top: 16, bottom: 56 },
    xAxis: { type: "category", data: rc.cga, name: "corrected gestational age (weeks)", nameLocation: "middle", nameGap: 26, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: rc.modes.map((name: string, k: number) => ({ name, type: "line", stack: "s", data: rc.series[k], showSymbol: false, smooth: 0.3, lineStyle: { width: 0 },
      areaStyle: { color: modeRamp[k], opacity: 0.95 }, itemStyle: { color: modeRamp[k] } })),
  };
  const fc = r.feeding_by_cga;
  const feeding = {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v) },
    grid: { left: 44, right: 16, top: 16, bottom: 56 },
    xAxis: { type: "category", data: fc.cga, name: "corrected gestational age (weeks)", nameLocation: "middle", nameGap: 26, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: [
      { name: "Fed by mouth (any)", type: "line", data: fc.oral, smooth: 0.3, symbolSize: 7, lineStyle: { color: p.ramp[3], width: 2.5 }, itemStyle: { color: p.ramp[3], borderColor: p.surface, borderWidth: 2 },
        areaStyle: { color: p.ramp[3] + "1a" } },
      { name: "Nil by mouth", type: "line", data: fc.npo, smooth: 0.3, symbolSize: 7, lineStyle: { color: p.ramp[0], width: 2, type: "solid" }, itemStyle: { color: p.ramp[0], borderColor: p.surface, borderWidth: 2 }, },
    ],
  };
  const ever = Object.entries(r.ever as Record<string, number>);
  const everChart = {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v) },
    grid: { left: 170, right: 44, top: 6, bottom: 10 },
    xAxis: { type: "value", show: false, max: 1 },
    yAxis: { type: "category", data: ever.map(([k]) => k), inverse: true, ...axis(mode), axisLine: { show: false } },
    series: [{ type: "bar", data: ever.map(([, v]) => v), barWidth: 12, showBackground: true, backgroundStyle: { color: p.grid, borderRadius: 4 },
      itemStyle: { color: p.series[0], borderRadius: 4 }, label: { show: true, position: "right", color: p.soft, formatter: (x: any) => pct(x.value) } }],
  };
  const tm = s?.transitions.real;
  const trans = tm && {
    ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `From ${RATIOS[x.value[1]]} to ${RATIOS[x.value[0]]}<br><b>${pct(x.value[2], 1)}</b> of next shifts` },
    grid: { left: 64, right: 16, top: 10, bottom: 56 },
    xAxis: { type: "category", data: RATIOS, name: "next shift", nameLocation: "middle", nameGap: 28, ...axis(mode) },
    yAxis: { type: "category", data: RATIOS, name: "this shift", ...axis(mode) },
    visualMap: { show: false, min: 0, max: 1, inRange: { color: p.seq } },
    series: [{ type: "heatmap", data: tm.flatMap((row: number[], i: number) => row.map((v: number, j: number) => [j, i, v])),
      label: { show: true, formatter: (x: any) => pct(x.value[2], 0), color: p.ink, fontSize: 11.5 }, itemStyle: { borderColor: p.surface, borderWidth: 3, borderRadius: 6 } }],
  };
  const proc = Object.entries(r.procedures as Record<string, number>);
  return (
    <>
      <div className="grid">
        <Card n={(() => { const c = view === "ratio" ? r.n?.ratio_by_week : r.n?.resp_by_cga; return `${cnt(c?.baby_shifts, "baby-shifts")} from ${cnt(c?.stays, "stays")}`; })()} wide id={section === "nurses" ? "sec-through" : undefined} title={view === "ratio" ? "Nurse:patient ratio through the stay" : "Breathing support by corrected age"}
          sub={view === "ratio" ? "Share of babies at each ratio, by week of life" : "Share of babies on each kind of support, from ventilator (violet) to room air (grey)"}
          right={view === "ratio" ? <Legend items={RATIOS.map((n, k) => ({ color: p.ratio[k], label: n }))} /> : <Legend items={rc.modes.map((n: string, k: number) => ({ color: modeRamp[k], label: n }))} />}>
          <Chart option={area} height={320} label="Stacked shares over the stay" />
        </Card>
        {section === "nurses" && trans && <Card n={`${cnt(data.babies_nurses?.transition_pairs, "shift-to-shift pairs")} from ${cnt(data.babies_nurses?.transition_stays, "stays")}`} id="sec-changes" title="How the ratio changes from one shift to the next" sub="Each row adds to 100%: most babies keep their ratio"><Chart option={trans} height={270} label="Shift-to-shift ratio changes" /></Card>}
        {section === "babies" && <>
        <Card n={`${cnt(r.n?.feeding_by_cga?.baby_shifts, "baby-shifts")} from ${cnt(r.n?.feeding_by_cga?.stays, "stays")}`} title="Learning to feed" sub="Share of babies fed by mouth, and nil by mouth, by corrected age"><Chart option={feeding} height={270} label="Feeding by corrected age" /></Card>
        <Card n={cnt(r.n?.all?.stays, "stays")} title="What happens during a stay" sub="Share of stays in which each is noted at least once"><Chart option={everChart} height={330} label="Share of stays with each event" /></Card>
        <Card n={`${cnt(r.n?.procedures?.baby_shifts, "baby-shifts")} from ${cnt(r.n?.procedures?.stays, "stays")}`} title="Procedures on the boards" sub="Baby-shifts with each procedure noted">
          <Chart option={{
            ...base(mode), grid: { left: 140, right: 40, top: 6, bottom: 10 },
            xAxis: { type: "value", show: false }, yAxis: { type: "category", data: proc.map(([k]) => k), inverse: true, ...axis(mode), axisLine: { show: false } },
            series: [{ type: "bar", data: proc.map(([, v]) => v), barWidth: 12, itemStyle: { color: p.series[0], borderRadius: 4 }, label: { show: true, position: "right", color: p.soft } }],
          }} height={330} label="Procedures noted" />
        </Card>
        </>}
      </div>
    </>
  );
}
