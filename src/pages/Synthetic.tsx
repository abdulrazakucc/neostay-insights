import { useMemo, useState } from "react";
import Chart from "../Chart";
import { bySet, Card, cnt, Kpi, Legend, PageHead, Ring, Segmented, TableView } from "../ui";
import { axis, base, KEYS, NAMES, num, PALETTE, pct, wd } from "../theme";
import type { Props } from "../App";
import { TermsBox } from "./Metrics";

const RATIOS = ["1:3-4", "1:3", "1:2-3", "1:2", "1:1"];
const LABEL: Record<string, string> = {
  acuity_level: "Nurse ratio", resp_status: "Breathing support", resp_mode: "Breathing mode", feeds: "Feeds", feed_volume: "Feed volume",
  feed_oral_share: "Share by mouth", care_area: "Care area", bed: "Bed", resp_flow_lpm: "Oxygen flow", resp_peep: "PEEP", spells: "Spells", procedure: "Procedure", nas_band: "NAS score", shift: "Shift",
};
const pretty = (f: string) => LABEL[f] || f.replace(/^stay: /, "stay · ").replace(/^txt_/, "note: ").replace(/^iv_/, "line: ").replace(/_/g, " ");

/* ------------------------------------------------------------------ The generators */
export function Synthetic({ data, mode }: Props) {
  const p = PALETTE[mode];
  const s = data.synthetic;
  if (!s) return <div className="empty">No synthetic data yet: run `make synthetic` in acuity-models.</div>;
  const g = s.generators;
  const st = s.settings;
  const rates = st.arrival_rates;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <>
      <PageHead eyebrow="Synthetic data" title="Two ways to make a synthetic unit"
        lead="Both generators learn from the earliest real stays only, then write new babies from nothing: their birth facts, and every board of their stay until they go home. The same unit simulation admits them." />
      <div className="kpis">
        {KEYS.map((k, i) => (
          <Kpi key={k} accent={p.series[i]} label={NAMES[i]} value={num(s.datasets[k].stays, 0)} sub={`stays · ${num(s.datasets[k].shifts, 0)} baby-shifts · median ${s.datasets[k].median_los_days} d`} />
        ))}
        <Kpi label="Window" value={`${st.window[0].slice(5)} → ${st.window[1].slice(5)}`} sub={`${st.burn_in_days}-day warm-up first, ${st.beds} beds`} />
      </div>
      <div className="grid three">
        <Card n={`fitted on ${cnt(data.counts?.train?.fit_baby_shifts ?? data.counts?.train?.baby_shifts, "baby-shifts")} before the holdout (${cnt(data.counts?.train?.fit_stays ?? data.counts?.train?.stays, "stays")})`} title="Traditional machine learning" sub={`${g.ml?.label} · fitted in ${g.ml?.fit_seconds}s`} right={<span className="badge" style={{ background: p.series[1] + "22" }}>ML</span>}>
          <div className="steps" style={{ ["--step" as any]: p.series[1] }}>
            <div className="step"><div><b>Birth facts: Gaussian copula</b><span>Gestational age, birth weight and day of admission each keep their real distribution; their dependence is the correlation of their normal scores.</span></div></div>
            <div className="step"><div><b>Each board: gradient-boosted transitions</b><span>For every field in turn (ratio, breathing, feeds, care area, spells, procedure, NAS), a boosted classifier gives the chance of each label given the board before and what is already written.</span></div></div>
            <div className="step"><div><b>Lines and notes</b><span>Twenty yes/no models: each line type and each keyword in the notes, sticky from board to board.</span></div></div>
            <div className="step"><div><b>Growth and going home</b><span>A boosted regression moves the weight (plus a real residual drawn at random); a boosted classifier decides whether the baby leaves after the board.</span></div></div>
          </div>
        </Card>
        <Card n={`fitted on ${cnt(data.counts?.train?.fit_baby_shifts ?? data.counts?.train?.baby_shifts, "baby-shifts")} before the holdout (${cnt(data.counts?.train?.fit_stays ?? data.counts?.train?.stays, "stays")})`} title="Deep learning" sub={`${g.dl?.label} · ${g.dl?.epochs} epochs, ${g.dl?.fit_seconds}s`} right={<span className="badge" style={{ background: p.series[2] + "22" }}>DL</span>}>
          <div className="steps" style={{ ["--step" as any]: p.series[2] }}>
            <div className="step"><div><b>Birth facts: variational autoencoder</b><span>A VAE learns the joint shape of the birth facts in a small latent space; new babies are decoded from random points in it.</span></div></div>
            <div className="step"><div><b>The stay: a recurrent network (GRU)</b><span>Reads the board before (labels as learned embeddings, flags, weight) and the birth facts, and keeps a memory of the whole stay so far.</span></div></div>
            <div className="step"><div><b>Writes the next board</b><span>Ratio first, then breathing given the ratio, then feeds given both, then the rest; lines and notes; whether the weight changed and by how much.</span></div></div>
            <div className="step"><div><b>Until the baby goes home</b><span>A discharge head decides after each board. Trained by teacher forcing with early stopping on 15% of the stays.</span></div></div>
          </div>
        </Card>
        <Card n={`admission rates from ${cnt(data.counts?.real?.boards, "real boards")}`} title="The unit simulation" sub="Shared by both generators, so they are compared on equal terms">
          <div className="steps">
            <div className="step"><div><b>Admissions</b><span>{`Per shift and weekday at the unit's own rate; bursts like the real ones (variance ${st.arrival_overdispersion}× the mean).`}</span></div></div>
            <div className="step"><div><b>A bed must be free</b><span>{`A baby is admitted only while one of the ${st.beds} beds is free.`}</span></div></div>
            <div className="step"><div><b>The same window</b><span>{`${st.burn_in_days} days of warm-up, then the same dates as the real data: stays crossing the edges are censored the same way.`}</span></div></div>
          </div>
          <Chart option={{
            ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `${days[x.value[0]]} ${x.value[1] ? "PM" : "AM"}: <b>${x.value[2]}</b> admissions` },
            grid: { left: 36, right: 6, top: 14, bottom: 22 },
            xAxis: { type: "category", data: days, ...axis(mode) }, yAxis: { type: "category", data: ["AM", "PM"], ...axis(mode) },
            visualMap: { show: false, min: 0, max: Math.max(...rates.flat()), inRange: { color: p.seq } },
            series: [{ type: "heatmap", data: rates.flatMap((row: number[], si: number) => row.map((v: number, di: number) => [di, si, +v.toFixed(2)])),
              label: { show: true, color: p.ink, fontSize: 10.5 }, itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 5 } }],
          }} height={130} label="Admission rates by weekday and shift" />
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Babies and stays, real against synthetic */
function BabiesCompared({ data, mode }: { data: any; mode: "light" | "dark" }) {
  const p = PALETTE[mode];
  const b = data.babies_compared;
  const sc = data.synthetic?.birth_scatter;
  if (!b) return null;
  const keys: string[] = b.datasets;
  const color = (k: string) => p.series[KEYS.indexOf(k)];
  const name = (k: string) => NAMES[KEYS.indexOf(k)];
  const fieldChart = (c: string) => {
    const f = b.fields[c];
    return {
      ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) },
      grid: { left: 40, right: 10, top: 10, bottom: 34 },
      xAxis: { type: "category", data: f.edges.slice(0, -1).map((e: number) => num(e, 0)), name: f.unit, nameLocation: "middle", nameGap: 22, ...axis(mode), axisLabel: { color: p.muted, fontSize: 10 }, splitLine: { show: false } },
      yAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, fontSize: 10, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
      series: keys.map((k) => ({ name: name(k), type: "line", step: "middle", data: f.hist[k], showSymbol: false, lineStyle: { width: k === "real" ? 2.6 : 1.8, color: color(k) }, itemStyle: { color: color(k) },
        areaStyle: k === "real" ? { color: color(k) + "1f" } : undefined })),
    };
  };
  const bandChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => pct(v, 1) },
    grid: { left: 44, right: 10, top: 14, bottom: 30 },
    xAxis: { type: "category", data: b.bands.map((x: string) => `born ${x}`), ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: keys.map((k) => ({ name: name(k), type: "bar", data: b.band_mix[k], barMaxWidth: 18, barGap: "15%", itemStyle: { color: color(k), borderRadius: [4, 4, 0, 0] } })),
  };
  const otChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 0) },
    grid: { left: 44, right: 12, top: 14, bottom: 40 },
    xAxis: { type: "value", name: "day of life", nameLocation: "middle", nameGap: 24, min: 0, max: 90, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: keys.map((k) => ({ name: name(k), type: "line", step: "end", showSymbol: false, data: b.off_tube_grid.map((g: number, i: number) => [g, b.off_tube[k][i]]), lineStyle: { width: k === "real" ? 3 : 2, color: color(k) }, itemStyle: { color: color(k) } })),
  };
  const losBands = b.bands.filter((x: string) => keys.every((k) => b.los_by_band[k][x]));
  const losChart = {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => { const [k, bd] = x.data._id; const q = b.los_by_band[k][bd]; return `<b>${name(k)}, born ${bd}</b><br>median ${num(q.median, 1)} d · middle half ${num(q.q1, 1)}–${num(q.q3, 1)} d · ${q.n} stays`; } },
    grid: { left: 90, right: 20, top: 8, bottom: 36 },
    xAxis: { type: "value", name: "length of stay (days)", nameLocation: "middle", nameGap: 24, min: 0, ...axis(mode) },
    yAxis: { type: "category", data: losBands.map((x: string) => `born ${x}`), inverse: true, ...axis(mode), axisLine: { show: false } },
    series: keys.map((k, j) => ({ type: "custom", renderItem: (_: any, api: any) => {
        const y = api.coord([0, api.value(0)])[1] + (j - 1) * 9;
        const lo = api.coord([api.value(1), 0])[0], hi = api.coord([api.value(2), 0])[0], md = api.coord([api.value(3), 0])[0];
        return { type: "group", children: [
          { type: "rect", shape: { x: lo, y: y - 3, width: Math.max(hi - lo, 2), height: 6, r: 3 }, style: { fill: color(k), opacity: 0.45 } },
          { type: "circle", shape: { cx: md, cy: y, r: 4.5 }, style: { fill: color(k), stroke: p.surface, lineWidth: 1.5 } }] };
      }, encode: { x: [1, 2, 3], y: 0 }, data: losBands.map((bd: string, i: number) => ({ value: [i, b.los_by_band[k][bd].q1, b.los_by_band[k][bd].q3, b.los_by_band[k][bd].median], _id: [k, bd] })) })),
  };
  const scatter = sc && {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `${x.seriesName}<br>${wd(x.value[0])} · ${num(x.value[1], 0)} g` },
    grid: { left: 54, right: 12, top: 12, bottom: 40 },
    xAxis: { type: "value", name: "gestational age (weeks)", nameLocation: "middle", nameGap: 24, min: 22, max: 43, ...axis(mode) },
    yAxis: { type: "value", name: "birth weight (g)", ...axis(mode) },
    series: KEYS.filter((k) => sc[k]).map((k) => ({ name: name(k), type: "scatter", data: sc[k], symbolSize: k === "real" ? 6 : 5, itemStyle: { color: color(k), opacity: k === "real" ? 0.75 : 0.5 } })),
  };
  const legend = <Legend items={keys.map((k) => ({ color: color(k), label: name(k) }))} />;
  const fields = Object.keys(b.fields);
  return (
    <>
      <Card n={bySet(data.counts, "stays", "stays")} wide title="Babies and stays: real against synthetic" sub="Share of stays in each band, one panel per measure. Number in each corner: Kolmogorov–Smirnov distance to the real data (0 = identical). Length of stay and age when leaving: stays that began and ended in the data." right={legend}>
        <div className="grid three">
          {fields.map((c) => (
            <div key={c}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
                <b style={{ fontSize: 13 }}>{b.fields[c].label}</b>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{keys.filter((k) => k !== "real").map((k) => `${k.toUpperCase()} ${num(b.fields[c].ks[k], 2)}`).join(" · ")}</span>
              </div>
              <Chart option={fieldChart(c)} height={190} label={b.fields[c].label} />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -4 }}>n = {keys.map((k) => `${name(k).replace("Traditional ", "")} ${b.fields[c].quantiles[k]?.n ?? 0}`).join(" · ")} stays</div>
            </div>
          ))}
        </div>
        <TableView head={["Measure", ...keys.flatMap((k) => [`${name(k)} median`, `${name(k)} middle half`]), ...keys.filter((k) => k !== "real").map((k) => `KS ${k.toUpperCase()}`)]}
          rows={fields.map((c) => [b.fields[c].label, ...keys.flatMap((k) => { const q = b.fields[c].quantiles[k] || {}; const f = c === "ga_weeks" || c === "cga_exit" ? (v: number) => wd(v, "") : (v: number) => num(v, 1); return [f(q.median), `${f(q.q1)} to ${f(q.q3)}`]; }), ...keys.filter((k) => k !== "real").map((k) => num(b.fields[c].ks[k], 3))])} />
      </Card>
      {scatter && <Card n={KEYS.filter((k) => sc?.[k]).map((k) => `${name(k)} ${sc[k].length}`).join(" · ") + " stays (sampled)"} title="Gestational age and birth weight together" sub="Each dot a stay (a sample of up to 300 per dataset): the joint shape should match, not only each measure alone"><Chart option={scatter} height={300} label="GA and birth weight" />{legend}</Card>}
      <Card n={bySet(data.counts, "stays", "stays")} title="Mix of babies by gestational age" sub="Share of stays in each GA band"><Chart option={bandChart} height={300} label="GA band mix" />{legend}</Card>
      <Card n={bySet(data.counts, "completed", "completed stays")} title="Length of stay by gestational age" sub="Median (dot) and middle half (bar), stays that began and ended in the data"><Chart option={losChart} height={300} label="Length of stay by GA band" />{legend}</Card>
      <Card n={keys.map((k) => `${name(k)} ${b.off_tube_n?.[k]?.watched ?? "–"}`).join(" · ") + " babies watched"} title="Coming off tube feeds" sub="Share of babies off tube feeds by day of life (leaving on a tube counts against it), real and synthetic">
        <Chart option={otChart} height={280} label="Off tube feeds by day of life" />{legend}
        <TableView head={["Dataset", "Already off tube at first board", "Came off on the unit", "Left on a tube", "Still on the unit"]} rows={keys.map((k) => [name(k), pct(b.off_tube_status[k].before, 0), pct(b.off_tube_status[k].reached, 0), pct(b.off_tube_status[k].left, 0), pct(b.off_tube_status[k].censored, 0)])} />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Real vs synthetic */
export function Compare({ data, mode }: Props) {
  const p = PALETTE[mode];
  const s = data.synthetic;
  const [field, setField] = useState("acuity_level");
  const [num_, setNum] = useState("los_days");
  const [heat, setHeat] = useState("ml");
  if (!s) return <div className="empty">No synthetic data yet: run `make synthetic` in acuity-models.</div>;
  const legend = <Legend items={NAMES.map((n, i) => ({ color: p.series[i], label: n }))} />;
  const neutral = mode === "light" ? "#b6bfd0" : "#4a5573";

  // Field distances: held-out real (reference), ML, DL.
  const fields = s.fidelity.ml.fields.map((f: any) => f.field);
  const distOf = (k: string) => Object.fromEntries(s.fidelity[k].fields.map((f: any) => [f.field, f.distance]));
  const dm = distOf("ml"), dd = distOf("dl"), dh = distOf("holdout");
  const order = [...fields].sort((a, b) => Math.max(dm[b], dd[b]) - Math.max(dm[a], dd[a])).slice(0, 18);
  const distChart = useMemo(() => ({
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => num(v, 3) },
    legend: { show: false },
    grid: { left: 170, right: 20, top: 8, bottom: 40 },
    xAxis: { type: "value", name: "distance to the real data (0 = identical)", nameLocation: "middle", nameGap: 24, ...axis(mode) },
    yAxis: { type: "category", data: order.map(pretty), inverse: true, ...axis(mode), axisLabel: { color: p.soft, fontSize: 11 } },
    series: [
      { name: "New real stays (reference)", type: "bar", data: order.map((f) => dh[f]), barWidth: 5, itemStyle: { color: neutral, borderRadius: [0, 3, 3, 0] } },
      { name: "Traditional ML", type: "bar", data: order.map((f) => dm[f]), barWidth: 5, itemStyle: { color: p.series[1], borderRadius: [0, 3, 3, 0] } },
      { name: "Deep learning", type: "bar", data: order.map((f) => dd[f]), barWidth: 5, itemStyle: { color: p.series[2], borderRadius: [0, 3, 3, 0] } },
    ],
  }), [mode, data]);

  // One field's distribution, three datasets.
  const dist = s.distributions[field];
  const cats = Object.keys(dist.real).slice(0, 12);
  const share = (k: string) => cats.map((c) => (k === "real" ? dist.real[c]?.[0] : dist[k]?.[c]?.[1]) ?? 0);
  const catLabel = (c: string) => (field === "acuity_level" ? RATIOS[+c] : c);
  const fieldChart = {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) }, legend: { show: false },
    grid: { left: 44, right: 12, top: 16, bottom: 64 },
    xAxis: { type: "category", data: cats.map(catLabel), ...axis(mode), axisLabel: { color: p.muted, rotate: cats.length > 6 ? 30 : 0, fontSize: 10.5 }, splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: KEYS.map((k, i) => ({ name: NAMES[i], type: "bar", data: share(k), barMaxWidth: 16, barGap: "15%", itemStyle: { color: p.series[i], borderRadius: [4, 4, 0, 0] } })),
  };

  // Numbers: histograms as lines.
  const numSrc = { ...s.stay_numbers, ...s.numbers };
  const nh = numSrc[num_];
  const numChart = {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) }, legend: { show: false },
    grid: { left: 44, right: 12, top: 16, bottom: 40 },
    xAxis: { type: "category", data: nh.edges.slice(0, -1), ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: KEYS.map((k, i) => ({ name: NAMES[i], type: "line", data: nh[k], smooth: 0.35, showSymbol: false, lineStyle: { width: i === 0 ? 3 : 2, color: p.series[i] },
      itemStyle: { color: p.series[i] }, areaStyle: i === 0 ? { color: p.series[0] + "1c" } : undefined })),
  };

  const kmChart = {
    ...base(mode), tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) }, legend: { show: false },
    grid: { left: 44, right: 12, top: 16, bottom: 40 },
    xAxis: { type: "category", data: s.km.real.map((_: number, i: number) => (i + 1) / 2), ...axis(mode), name: "days since admission", nameLocation: "middle", nameGap: 26, axisLabel: { color: p.muted, interval: 13 }, splitLine: { show: false } },
    yAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: KEYS.map((k, i) => ({ name: NAMES[i], type: "line", step: "end", data: s.km[k], showSymbol: false, lineStyle: { width: i === 0 ? 3 : 2, color: p.series[i] }, itemStyle: { color: p.series[i] } })),
  };

  const censusChart = {
    ...base(mode), legend: { show: false }, grid: { left: 40, right: 12, top: 16, bottom: 70 },
    xAxis: { type: "category", data: s.slot_labels, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: string) => v.slice(5, 10) }, splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLine: { show: false } },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 26, borderColor: "transparent", fillerColor: p.series[0] + "22", backgroundColor: p.grid, handleStyle: { color: p.series[0] } }],
    series: KEYS.map((k, i) => ({ name: NAMES[i], type: "line", data: s.unit_series[k].census, showSymbol: false, smooth: 0.3, lineStyle: { width: i === 0 ? 2.5 : 1.6, color: p.series[i] }, itemStyle: { color: p.series[i] } })),
  };

  // Transition matrices and correlation differences.
  const tm = (m: number[][]) => m.flatMap((row, i) => row.map((v, j) => [j, i, v]));
  const transChart = (k: string) => ({
    ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `From ${RATIOS[x.value[1]]} to ${RATIOS[x.value[0]]}: <b>${pct(x.value[2], 1)}</b>` },
    grid: { left: 52, right: 8, top: 8, bottom: 30 },
    xAxis: { type: "category", data: RATIOS, ...axis(mode), axisLabel: { color: p.muted, fontSize: 10 } },
    yAxis: { type: "category", data: RATIOS, ...axis(mode), axisLabel: { color: p.muted, fontSize: 10 } },
    visualMap: { show: false, min: 0, max: 1, inRange: { color: p.seq } },
    series: [{ type: "heatmap", data: tm(s.transitions[k]), label: { show: true, formatter: (x: any) => (x.value[2] >= 0.005 ? Math.round(x.value[2] * 100) : ""), color: p.ink, fontSize: 10 },
      itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 4 } }],
  });
  const cf = s.correlation_fields;
  const corrDiff = (k: string) => {
    const a = s.correlations[k], r = s.correlations.real;
    return {
      ...base(mode), tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => `${cf[x.value[1]]} × ${cf[x.value[0]]}<br>real ${num(r[x.value[1]][x.value[0]], 2)} · synthetic ${num(a[x.value[1]][x.value[0]], 2)}` },
      grid: { left: 120, right: 10, top: 8, bottom: 96 },
      xAxis: { type: "category", data: cf.map((c: string) => c.replace(/_/g, " ")), ...axis(mode), axisLabel: { color: p.muted, rotate: 45, fontSize: 10 } },
      yAxis: { type: "category", data: cf.map((c: string) => c.replace(/_/g, " ")), ...axis(mode), axisLabel: { color: p.muted, fontSize: 10 } },
      visualMap: { min: -0.4, max: 0.4, orient: "horizontal", left: "center", bottom: 0, itemHeight: 140, itemWidth: 10, inRange: { color: p.div }, textStyle: { color: p.muted }, text: ["+0.4", "−0.4"] },
      series: [{ type: "heatmap", data: a.flatMap((row: number[], i: number) => row.map((v: number, j: number) => [j, i, +(v - r[i][j]).toFixed(3)])),
        itemStyle: { borderColor: p.surface, borderWidth: 1.5, borderRadius: 3 } }],
    };
  };

  // Detectability, utility, privacy.
  const det = { holdout: s.detectability.holdout, ml: s.detectability.ml, dl: s.detectability.dl };
  const detChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => num(v, 3) },
    grid: { left: 150, right: 40, top: 8, bottom: 30 },
    xAxis: { type: "value", min: 0.4, max: 1, ...axis(mode) },
    yAxis: { type: "category", data: ["New real stays", "Traditional ML", "Deep learning"], inverse: true, ...axis(mode), axisLabel: { color: p.soft } },
    series: [{ type: "bar", data: [det.holdout, det.ml, det.dl].map((v, i) => ({ value: v, itemStyle: { color: [neutral, p.series[1], p.series[2]][i], borderRadius: [0, 4, 4, 0] } })), barWidth: 14,
      label: { show: true, position: "right", color: p.soft, formatter: (x: any) => num(x.value, 2) },
      markLine: { symbol: "none", data: [{ xAxis: 0.5 }], lineStyle: { color: p.ink, type: "solid", width: 1 }, label: { formatter: "0.5: can't tell apart", position: "insideEndTop", color: p.muted, fontSize: 10 } } }],
  };
  const u = s.utility;
  const uKeys = Object.keys(u);
  const uLabel = (k: string) => (k.startsWith("real") ? "Real data" : k === "ml" ? "Traditional ML" : "Deep learning");
  const uColor = (k: string) => (k.startsWith("real") ? p.series[0] : k === "ml" ? p.series[1] : p.series[2]);
  const utilChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) },
    grid: { left: 44, right: 12, top: 20, bottom: 40 },
    xAxis: { type: "category", data: ["Discharge within 24 h (AUC)", "Next shift's ratio (accuracy)"], ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", min: 0.5, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: uKeys.map((k) => ({ name: `Trained on ${uLabel(k)}`, type: "bar", barMaxWidth: 26, data: [u[k].discharge_24h_auc, u[k].next_ratio_accuracy],
      itemStyle: { color: uColor(k), borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", color: p.soft, fontSize: 11, formatter: (x: any) => pct(x.value, 1) } })),
  };
  const pv = s.privacy;
  const dcr = pv.ml.dcr_hist;
  const dcrChart = {
    ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 1) },
    grid: { left: 44, right: 12, top: 16, bottom: 40 },
    xAxis: { type: "category", data: dcr.edges.slice(0, -1).map((v: number) => v.toFixed(1)), name: "distance to the closest real training stay", nameLocation: "middle", nameGap: 26, ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
    series: [
      { name: "New real stays", type: "line", data: dcr.holdout, smooth: 0.4, showSymbol: false, lineStyle: { color: neutral, width: 2.5 }, itemStyle: { color: neutral }, areaStyle: { color: neutral + "33" } },
      { name: "Traditional ML", type: "line", data: pv.ml.dcr_hist.synthetic, smooth: 0.4, showSymbol: false, lineStyle: { color: p.series[1], width: 2 }, itemStyle: { color: p.series[1] } },
      { name: "Deep learning", type: "line", data: pv.dl.dcr_hist.synthetic, smooth: 0.4, showSymbol: false, lineStyle: { color: p.series[2], width: 2 }, itemStyle: { color: p.series[2] } },
    ],
  };
  const tone = (v: number, good: number, ok: number) => (v <= good ? "good" : v <= ok ? "warn" : "bad");
  const allFields = ["acuity_level", "resp_status", "resp_mode", "feeds", "feed_volume", "feed_oral_share", "care_area", "bed", "spells", "procedure", "nas_band", "shift"];
  const numFields = [["los_days", "Length of stay (days)"], ["ga_weeks", "Gestational age (weeks)"], ["bw_g", "Birth weight (g)"], ["weight_gain_g_per_day", "Weight gain (g/day)"], ["weight_g", "Weight on each board (g)"], ["cga_weeks", "Corrected age (weeks)"], ["dol", "Day of life"], ["resp_flow_lpm", "Oxygen flow (L/min, where recorded)"], ["resp_peep", "PEEP (cm H₂O, where recorded)"]];
  return (
    <>
      <PageHead eyebrow="Synthetic data" title="Real vs synthetic" lead="How faithful each synthetic dataset is, field by field and over time; whether models trained on it work on real babies; and whether it gives away anything about the real ones." />
      <TermsBox ids={["fidelity", "ks", "tvd", "corr-gap", "detectability", "auc", "utility", "mia", "dcr", "exact-copies", "km", "median"]} />
      <div className="grid">
        <BabiesCompared data={data} mode={mode} />
        <Card n={`${bySet(data.counts, "baby_shifts", "baby-shifts")}; reference: ${cnt(data.counts?.holdout?.baby_shifts, "held-out")} vs ${cnt(data.counts?.train?.baby_shifts, "training baby-shifts")}`} title="Fidelity score" sub="100 minus the average distance over every field: 100 means identical distributions">
          <div className="rings">
            <Ring value={s.fidelity.ml.score} color={p.series[1]} label="Traditional ML" sub={`correlation gap ${num(s.fidelity.ml.correlation_gap, 3)}`} />
            <Ring value={s.fidelity.dl.score} color={p.series[2]} label="Deep learning" sub={`correlation gap ${num(s.fidelity.dl.correlation_gap, 3)}`} />
            <Ring value={s.fidelity.holdout.score} color={neutral} label="New real stays" sub="the natural ceiling: later real stays vs earlier ones" />
          </div>
        </Card>
        <Card n={`${bySet(data.counts, "stays", "stays")}; ${cnt(data.counts?.holdout?.stays, "held-out real stays")}`} title="At a glance" sub="Green: as good as new real data; amber: close; red: needs work">
          <table>
            <thead><tr><th></th><th>Traditional ML</th><th>Deep learning</th></tr></thead>
            <tbody>
              <tr><td>Classifier can tell it from real (AUC)</td>{["ml", "dl"].map((k) => <td key={k}><span className={`badge ${tone(s.detectability[k], s.detectability.holdout + 0.02, 0.75)}`}>{num(s.detectability[k], 2)}</span></td>)}</tr>
              <tr><td>Membership inference (AUC, 0.5 = no leak)</td>{["ml", "dl"].map((k) => <td key={k}><span className={`badge ${tone(pv[k].membership_inference_auc, 0.55, 0.65)}`}>{num(pv[k].membership_inference_auc, 2)}</span></td>)}</tr>
              <tr><td>Exact copies of real stays</td>{["ml", "dl"].map((k) => <td key={k}><span className={`badge ${pv[k].exact_copies ? "bad" : "good"}`}>{pv[k].exact_copies}</span></td>)}</tr>
              <tr><td>Discharge model trained on it (AUC on real)</td>{["ml", "dl"].map((k) => <td key={k}><span className={`badge ${tone(u[uKeys[0]].discharge_24h_auc - u[k].discharge_24h_auc, 0.02, 0.06)}`}>{pct(u[k].discharge_24h_auc, 1)}</span></td>)}</tr>
              <tr><td>Ratio changes (mean gap)</td>{["ml", "dl"].map((k) => <td key={k}><span className={`badge ${tone(s.fidelity[k].transition_gap, 0.02, 0.05)}`}>{num(s.fidelity[k].transition_gap, 3)}</span></td>)}</tr>
            </tbody>
          </table>
          <div className="note">Reference: a classifier tells the later real stays from the earlier ones with AUC {num(s.detectability.holdout, 2)}, because the unit changes over time.</div>
        </Card>
        <Card n={bySet(data.counts, "baby_shifts", "baby-shifts")} wide title="Field by field" sub="Distance of each field's distribution to the real data (labels: total variation; yes/no: difference in share; numbers: Kolmogorov–Smirnov). The 18 hardest fields."
          right={<Legend items={[{ color: neutral, label: "New real stays (reference)" }, { color: p.series[1], label: "Traditional ML" }, { color: p.series[2], label: "Deep learning" }]} />}>
          <Chart option={distChart} height={470} label="Distance of each field to the real data" />
          <TableView head={["Field", "New real stays", "Traditional ML", "Deep learning"]} rows={fields.map((f: string) => [pretty(f), num(dh[f], 3), num(dm[f], 3), num(dd[f], 3)])} />
        </Card>
        <Card n={bySet(data.counts, "baby_shifts", "baby-shifts")} title="One field, three datasets" sub="Share of baby-shifts with each value" right={<select value={field} onChange={(e) => setField(e.target.value)}>{allFields.map((f) => <option key={f} value={f}>{pretty(f)}</option>)}</select>}>
          <Chart option={fieldChart} height={290} label={`Distribution of ${pretty(field)}`} />{legend}
        </Card>
        <Card n={["los_days", "ga_weeks", "bw_g", "weight_gain_g_per_day"].includes(num_) ? bySet(data.counts, "stays", "stays") : bySet(data.counts, "baby_shifts", "baby-shifts")} title="Numbers, three datasets" sub="Share in each band" right={<select value={num_} onChange={(e) => setNum(e.target.value)}>{numFields.map(([f, l]) => <option key={f} value={f}>{l}</option>)}</select>}>
          <Chart option={numChart} height={290} label="Distribution of a number" />{legend}
        </Card>
        <Card n={bySet(data.counts, "stays", "stays")} title="Length of stay" sub="Chance of still being in the unit, by day since admission (Kaplan–Meier)"><Chart option={kmChart} height={290} label="Kaplan-Meier curves" />{legend}</Card>
        <Card n={bySet(data.counts, "boards", "boards")} title="Census over the same eight months" sub="Each synthetic unit runs on its own random admissions, so the days differ; the level and spread should match">
          <Chart option={censusChart} height={290} label="Census over time" />
          <div className="mini-stats">{KEYS.map((k, i) => <div key={k}><b style={{ color: p.series[i] }}>{num(s.unit[k].census.mean, 1)}</b><span>{NAMES[i]}: mean census, spread {num(s.unit[k].census.sd, 1)}</span></div>)}</div>
        </Card>
        <Card n={bySet(data.counts, "transition_pairs", "shift-to-shift pairs")} wide title="How the ratio changes from one shift to the next" sub="Each row adds to 100%: real data and the two generators side by side">
          <div className="grid three">
            {KEYS.map((k, i) => <div key={k}><div className="legend" style={{ marginBottom: 4 }}><span><i style={{ background: p.series[i] }} />{NAMES[i]}</span></div><Chart option={transChart(k)} height={230} label={`Ratio transitions, ${NAMES[i]}`} /></div>)}
          </div>
        </Card>
        <Card n={bySet(data.counts, "baby_shifts", "baby-shifts")} title="Do fields move together as in real data?" sub="Correlation in the synthetic data minus correlation in the real data (white: the same)" right={<Segmented value={heat} onChange={setHeat} options={[{ key: "ml", label: "ML" }, { key: "dl", label: "DL" }]} />}>
          <Chart option={corrDiff(heat)} height={380} label="Correlation differences" />
        </Card>
        <Card n={`${bySet(data.counts, "stays", "stays")}; utility tested on ${cnt(data.counts?.holdout?.stays, "held-out real stays")} (${cnt(data.counts?.holdout?.baby_shifts, "baby-shifts")})`} title="Can a classifier tell them apart?" sub="Cross-validated AUC of a model trained to separate synthetic from real stays (0.5: it can't)">
          <Chart option={detChart} height={190} label="Detectability" />
          <h3 style={{ margin: "18px 0 4px", fontSize: 15 }}>Train on synthetic, test on real</h3>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12.5 }}>Models trained on each dataset, scored on the {s.split.holdout_stays} held-out real stays</p>
          <Chart option={utilChart} height={240} label="Utility of each dataset" />
          <Legend items={uKeys.map((k) => ({ color: uColor(k), label: `Trained on ${uLabel(k)}` }))} />
        </Card>
        <Card n={`${bySet(data.counts, "stays", "synthetic stays", ["ml", "dl"])} against ${cnt(data.counts?.train?.stays, "training")} and ${cnt(data.counts?.holdout?.stays, "held-out real stays")}`} wide title="Privacy: how close do synthetic babies come to real ones?" sub="Distance from each stay to the closest real training stay. Synthetic stays should be no closer than new real stays are; none should be a copy.">
          <div className="grid">
            <div><Chart option={dcrChart} height={260} label="Distance to closest record" /><Legend items={[{ color: neutral, label: "New real stays" }, { color: p.series[1], label: "Traditional ML" }, { color: p.series[2], label: "Deep learning" }]} /></div>
            <div className="stack" style={{ gap: 10 }}>
              {(["ml", "dl"] as const).map((k, i) => (
                <div key={k} className="kpi" style={{ ["--accent" as any]: p.series[i + 1] }}>
                  <span className="kpi-label">{NAMES[i + 1]}</span>
                  <span className="kpi-value">{num(pv[k].membership_inference_auc, 2)}</span>
                  <span className="kpi-sub">membership-inference AUC · {pv[k].exact_copies} copies · nearest real stay in the training set for {pct(pv[k].share_nearest_in_train)} (50% = no preference) · closest 5% at {num(pv[k].dcr_synthetic.p05, 2)} vs {num(pv[k].dcr_holdout.p05, 2)} for new real stays</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
