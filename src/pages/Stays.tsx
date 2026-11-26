import { useMemo, useState } from "react";
import Chart from "../Chart";
import { Card, cnt, Kpi, Legend, PageHead, Segmented, TableView } from "../ui";
import { axis, base, KEYS, NAMES, num, PALETTE, pct, tint, wd } from "../theme";
import type { Props } from "../App";
import { STAGE_COLORS } from "./Feeding";
import { TermLink } from "./Metrics";
import { compare, type Measure } from "../match";

/* One line per baby: from the first board to the last, for babies born at a chosen gestational
   age and weight; the real babies beside the synthetic ones. A line can be coloured along the
   stay by breathing support, feeding stage or nurse ratio. */

type Run = [number, number | null];
type Baby = [number /* GA in days */, number, number, number, number, number, Run[], Run[], Run[]];
const GA_WEEKS = Array.from({ length: 21 }, (_, i) => 22 + i);
const WEIGHTS = Array.from({ length: 21 }, (_, i) => 250 * i);
const MODE_NAMES = ["Ventilator", "NIPPV", "CPAP", "High-flow", "Nasal cannula", "Room air"];

function median(v: number[]) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(v: number[], q: number) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

const VERDICT: Record<Measure["verdict"], { word: string; cls: string }> = {
  match: { word: "as close as real to real", cls: "good" }, close: { word: "close", cls: "info" },
  different: { word: "different", cls: "bad" }, few: { word: "too few real babies", cls: "" } };

/* The whole real and synthetic sets, and the chosen range, compared on the same measures before any chart. */
function MatchPanel({ bs, gen, genName, gaFrom, gaTo, wFrom, wTo }: { bs: any; gen: string; genName: string; gaFrom: number; gaTo: number; wFrom: number; wTo: number }) {
  const names = { modes: MODE_NAMES, stages: bs.stages as string[], ratios: bs.ratios as string[] };
  const fmt = { days: (x: number) => (Number.isFinite(x) ? `${num(x, 1)} d` : "–"), ga: (x: number) => (Number.isFinite(x) ? wd(x / 7) : "–"),
    g: (x: number) => (Number.isFinite(x) ? `${num(x, 0)} g` : "–") };
  const R: Baby[] = bs.real ?? [], S: Baby[] = bs[gen] ?? [];
  const inRange = (b: Baby) => b[0] >= gaFrom * 7 && b[0] < (gaTo + 1) * 7 && b[1] >= wFrom && b[1] < wTo;
  const all = useMemo(() => compare(R, S, R, S, null, names, fmt), [bs, gen]);
  const sel = useMemo(() => compare(R.filter(inRange), S.filter(inRange), R, S, inRange, names, fmt), [bs, gen, gaFrom, gaTo, wFrom, wTo]);
  const head = (m: Measure[]) => { const ok = m.filter((x) => x.verdict !== "few"); return { match: ok.filter((x) => x.verdict === "match").length,
    close: ok.filter((x) => x.verdict === "close").length, diff: ok.filter((x) => x.verdict === "different").length, n: ok.length, few: m.length - ok.length }; };
  const ha = head(all), hs = head(sel);
  const byKey = Object.fromEntries(all.map((m) => [m.key, m]));
  const cell = (m?: Measure) => m ? (<>
    <td><small>{m.real}</small></td><td><small>{m.synth}</small></td>
    <td className="sc-val">{Number.isFinite(m.d) ? m.d.toFixed(3) : "–"}<small>chance up to {Number.isFinite(m.floor) ? m.floor.toFixed(3) : "–"}</small></td>
    <td><span className={`badge ${VERDICT[m.verdict].cls}`}>{VERDICT[m.verdict].word}</span></td></>) : <td colSpan={4}><small>only for a chosen range</small></td>;
  const range = `born ${gaFrom}–${gaTo}+6 wk, ${wFrom.toLocaleString()}–${(wTo - 1).toLocaleString()} g`;
  return (
    <Card wide id="stays-match" title="How closely the synthetic babies match the real ones"
      sub={`${genName} against the real babies: every baby, and the range you chose (${range}). Each measure is set against how far apart two samples of real babies of the same sizes would be by chance.`}>
      <div className="match-head">
        <div className={ha.diff ? "warn" : "good"}><span>All babies</span><b>{ha.match} of {ha.n}</b><small>measures as close as two samples of real babies{ha.close ? `; ${ha.close} close` : ""}{ha.diff ? `; ${ha.diff} different` : ""}</small><em>{R.length} real · {S.length} synthetic stays</em></div>
        <div className={hs.diff ? "warn" : "good"}><span>Your range</span><b>{hs.n ? `${hs.match} of ${hs.n}` : "–"}</b><small>{hs.n ? <>measures as close as two samples of real babies{hs.close ? `; ${hs.close} close` : ""}{hs.diff ? `; ${hs.diff} different` : ""}</> : "too few real babies to judge"}{hs.few ? ` (${hs.few} not judged: too few real babies)` : ""}</small>
          <em>{R.filter(inRange).length} real · {S.filter(inRange).length} synthetic stays</em></div>
      </div>
      <div className="table-scroll">
        <table className="sc-table match-table">
          <thead>
            <tr><th rowSpan={2}>Measure</th><th colSpan={4}>All babies</th><th colSpan={4}>Your range</th></tr>
            <tr><th>Real</th><th>Synthetic</th><th>Distance</th><th>Verdict</th><th>Real</th><th>Synthetic</th><th>Distance</th><th>Verdict</th></tr>
          </thead>
          <tbody>{sel.map((m) => (
            <tr key={m.key}><td><b>{m.label}</b><TermLink id={m.kind === "tvd" ? "tvd" : m.kind === "ks" ? "ks" : "chance-level"} /></td>
              {cell(byKey[m.key])}{cell(m)}</tr>))}
          </tbody>
        </table>
      </div>
      <small className="muted">Distances run from 0 (identical) to 1. Numbers (age, weight, day of life, stay): Kolmogorov–Smirnov distance, the largest gap between the
        "share below this value" curves. Care: total variation distance between the shares of boards in each category; the real and synthetic columns show the category with the largest gap. Chance level: the 95th percentile of the same distance
        between two sets drawn at random from the real stays, of the same sizes as the real and synthetic sets (400 draws). Day of life counts stays that began in the data;
        length of stay, stays that began and ended in it. A small range has few real babies, so its chance level is wide. <TermLink id="chance-level" text="What the chance level means" /></small>
    </Card>
  );
}

export default function Stays({ data, mode, embedded, source, synthLabel }: Props & { source?: any; synthLabel?: string }) {
  const p = PALETTE[mode];
  // source: a center's own stays (centers_build: "real" for Center 6 only, "ml" = its large-scale synthetic sample).
  const bs = source ?? data.baby_stays;
  const noReal = !bs?.real;
  const [gaFrom, setGaFrom] = useState(33);
  const [gaTo, setGaTo] = useState(35);
  const [wFrom, setWFrom] = useState(1500);
  const [wTo, setWTo] = useState(2750);
  const [clock, setClock] = useState("admission");
  const [colour, setColour] = useState("plain");
  const [sort, setSort] = useState("birth");
  const [gen, setGen] = useState("ml");
  if (!bs) return <div className="empty">No baby stays yet: run `make insights-data`.</div>;

  const pick = (k: string): Baby[] => {
    const rows = ((bs[k] || []) as Baby[]).filter((b) => b[0] >= gaFrom * 7 && b[0] < (gaTo + 1) * 7 && b[1] >= wFrom && b[1] < wTo);
    // Grouped by gestational age to the day; within a group by birth weight, or longest stay first.
    return [...rows].sort((a, b) => a[0] - b[0] || (sort === "birth" ? a[1] - b[1] : b[3] - a[3]));
  };
  const real = pick("real");
  const synth = pick(gen);
  const start = (b: Baby) => (clock === "dol" ? b[2] : 0);
  const xMax = Math.max(10, ...[...real, ...synth].map((b) => start(b) + b[3] / 2));
  const xCap = Math.ceil(xMax / 10) * 10;

  const runIndex = colour === "resp" ? 6 : colour === "feed" ? 7 : 8;
  // Breathing support, most to least: four distinct hues, then teal for nasal cannula and a quiet
  // grey for room air (the same validated hues as the GA bands, which this page does not use).
  const breathing = [...p.band, p.ramp[mode === "light" ? 1 : 3], mode === "light" ? "#cfd6e2" : "#4a5578"];
  const palette = colour === "resp" ? breathing
    : colour === "feed" ? STAGE_COLORS[mode] : p.ratio;
  const legendItems = colour === "resp" ? MODE_NAMES.map((n, i) => ({ color: palette[i], label: n }))
    : colour === "feed" ? (bs.stages as string[]).map((n, i) => ({ color: palette[i], label: n }))
    : colour === "ratio" ? (bs.ratios as string[]).map((n, i) => ({ color: palette[i], label: n })) : [];
  const blank = mode === "light" ? "#eef0f5" : "#1f2638";

  /* One colour per GA group: a hue for each completed week (the same in both charts), lighter for
     each later day of that week, so 33, 33+1 ... 33+6 read as one family. */
  const weekHues = [p.series[0], p.band[0], p.band[2], p.ratio[0], p.band[1], p.band[3]];
  const groupColor = (gaDays: number) => tint(weekHues[(Math.floor(gaDays / 7) - gaFrom) % weekHues.length], (gaDays % 7) * 0.075);

  const chart = (rows: Baby[], key: string) => {
    const plain = p.series[KEYS.indexOf(key)];
    const n = rows.length;
    // The middle row of each GA group carries the group's one label.
    const firstOf = new Set<number>(), middle = new Map<number, string>();
    rows.forEach((b, i) => {
      if (i === 0 || rows[i - 1][0] !== b[0]) {
        let j = i;
        while (j + 1 < n && rows[j + 1][0] === b[0]) j++;
        firstOf.add(i);
        middle.set(Math.floor((i + j) / 2), wd(b[0] / 7));
      }
    });
    return {
      ...base(mode), legend: { show: false }, animation: false,
      tooltip: { ...base(mode).tooltip, trigger: "item", formatter: (x: any) => {
        const b = rows[x.dataIndex];
        return `<b>GA ${wd(b[0] / 7)} · ${num(b[1], 0)} g</b><br>${num(b[3] / 2, 1)} days on the unit from day of life ${num(b[2], 0)}`
          + (b[4] ? "<br>already on the unit when the data began" : "") + (b[5] ? "<br>still on the unit when the data ended" : "");
      } },
      grid: { left: 74, right: n > 120 ? 34 : 18, top: 8, bottom: 40 },
      xAxis: { type: "value", min: 0, max: xCap, name: clock === "dol" ? "day of life" : "days since the first board on the unit", nameLocation: "middle", nameGap: 24, ...axis(mode) },
      yAxis: { type: "category", data: rows.map((_, i) => String(i)), inverse: true, ...axis(mode),
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: p.soft, fontSize: 11, fontWeight: 600, interval: 0, hideOverlap: true, margin: 14, formatter: (_: string, i: number) => middle.get(i) ?? "" } },
      dataZoom: n > 120 ? [{ type: "inside", yAxisIndex: 0 }, { type: "slider", yAxisIndex: 0, width: 12, right: 6, borderColor: "transparent", fillerColor: plain + "22", backgroundColor: p.grid, showDetail: false }] : undefined,
      series: [{
        type: "custom", encode: { x: [1, 2], y: 0 },
        data: rows.map((b, i) => [i, start(b), start(b) + b[3] / 2]),
        renderItem: (params: any, api: any) => {
          const b = rows[params.dataIndex];
          const i = api.value(0);
          const band = api.size([0, 1])[1];
          const h = Math.max(1.5, Math.min(9, band * 0.62));
          const y = api.coord([0, i])[1];
          const x0 = start(b);
          const seg = (from: number, to: number, fill: string) => {
            const a = api.coord([x0 + from / 2, i])[0];
            const z = api.coord([x0 + to / 2, i])[0];
            return { type: "rect", shape: { x: a, y: y - h / 2, width: Math.max(z - a, 1), height: h, r: h / 2 }, style: { fill } };
          };
          const children: any[] = [];
          const cs = params.coordSys;
          const gc = groupColor(b[0]);
          // The group's bracket at the left edge, and a hairline above each new group.
          const first = firstOf.has(params.dataIndex);
          children.push({ type: "rect", shape: { x: cs.x - 7, y: y - band / 2 + (first ? 1.5 : 0), width: 4, height: band - (first ? 1.5 : 0), r: 2 }, style: { fill: gc } });
          if (first && params.dataIndex > 0) children.push({ type: "line", shape: { x1: cs.x, y1: y - band / 2, x2: cs.x + cs.width, y2: y - band / 2 }, style: { stroke: p.grid, lineWidth: 1 } });
          if (colour === "plain") children.push(seg(0, b[3], gc));
          else {
            const runs = b[runIndex] as Run[];
            runs.forEach(([o, c], k) => {
              const end = k + 1 < runs.length ? runs[k + 1][0] : b[3];
              children.push(seg(o, end, c == null ? blank : palette[c]));
            });
          }
          const endX = api.coord([x0 + b[3] / 2, i])[0];
          const startX = api.coord([x0, i])[0];
          if (b[5]) children.push({ type: "polygon", shape: { points: [[endX + 1, y - h / 2 - 2], [endX + 1 + h, y], [endX + 1, y + h / 2 + 2]] }, style: { fill: p.ink, opacity: 0.6 } });
          if (b[4]) children.push({ type: "circle", shape: { cx: startX, cy: y, r: h / 2 + 1.5 }, style: { fill: p.surface, stroke: p.ink, lineWidth: 1.2, opacity: 0.8 } });
          return { type: "group", children };
        },
      }],
    };
  };
  const height = (n: number) => Math.min(820, Math.max(200, n * 14 + 60));
  const tallest = Math.max(height(real.length), height(synth.length));

  const stats = (rows: Baby[]) => {
    const done = rows.filter((b) => !b[4] && !b[5]).map((b) => b[3] / 2);
    return { n: rows.length, done: done.length, median: median(done), q1: quantile(done, 0.25), q3: quantile(done, 0.75),
      p90: quantile(done, 0.9), open: rows.filter((b) => b[4] || b[5]).length };
  };
  const all = KEYS.filter((k) => bs[k]).map((k) => ({ k, s: stats(pick(k)) }));
  const sr = stats(real), ss = stats(synth);

  // Share of babies gone by each day (stays that began and ended in the data), all three datasets.
  const ecdf = (() => {
    const days = Array.from({ length: Math.ceil(xCap) + 1 }, (_, i) => i);
    return {
      ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, valueFormatter: (v: number) => pct(v, 0) },
      grid: { left: 46, right: 14, top: 14, bottom: 40 },
      xAxis: { type: "value", min: 0, max: xCap, name: "days on the unit", nameLocation: "middle", nameGap: 24, ...axis(mode), splitLine: { show: false } },
      yAxis: { type: "value", min: 0, max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) }, axisLine: { show: false } },
      series: all.map(({ k }) => {
        const v = pick(k).filter((b) => !b[4] && !b[5]).map((b) => b[3] / 2);
        return { name: NAMES[KEYS.indexOf(k)], type: "line", step: "end", showSymbol: false,
          data: days.map((d) => [d, v.length ? v.filter((x) => x <= d).length / v.length : null]),
          lineStyle: { width: k === "real" ? 3 : 2, color: p.series[KEYS.indexOf(k)] }, itemStyle: { color: p.series[KEYS.indexOf(k)] } };
      }),
    };
  })();

  const sel = (v: number, set: (n: number) => void, opts: number[], fmt: (n: number) => string) => (
    <select value={v} onChange={(e) => set(+e.target.value)}>{opts.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}</select>
  );
  const marks = <span style={{ fontSize: 11.5, color: "var(--muted)" }}>○ already on the unit when the data began · ▸ still on the unit when it ended</span>;

  return (
    <>
      {!embedded && <PageHead eyebrow="Your data" title="Baby stays" lead="Every baby born at the gestational age and weight you choose, one line each from the first board to the last: how long they stayed, and how their care changed along the way. The real babies on the left, a synthetic unit's on the right." />}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 18 }}>
          <label className="row" style={{ gap: 6 }}><b style={{ fontSize: 13 }}>Born at</b>{sel(gaFrom, (n) => { setGaFrom(n); if (n > gaTo) setGaTo(n); }, GA_WEEKS, (w) => `${w} wk`)}<span>to</span>{sel(gaTo, (n) => { setGaTo(n); if (n < gaFrom) setGaFrom(n); }, GA_WEEKS, (w) => `${w}+6 wk`)}</label>
          <label className="row" style={{ gap: 6 }}><b style={{ fontSize: 13 }}>Weighing</b>{sel(wFrom, (n) => { setWFrom(n); if (n >= wTo) setWTo(n + 250); }, WEIGHTS, (w) => `${w.toLocaleString()} g`)}<span>to under</span>{sel(wTo, (n) => { setWTo(n); if (n <= wFrom) setWFrom(n - 250); }, WEIGHTS.slice(1).concat([5500]), (w) => `${w.toLocaleString()} g`)}</label>
          <Segmented value={clock} onChange={setClock} options={[{ key: "admission", label: "Days on the unit" }, { key: "dol", label: "Day of life" }]} />
          <Segmented value={colour} onChange={setColour} options={[{ key: "plain", label: "Stay only" }, { key: "resp", label: "Breathing" }, { key: "feed", label: "Feeding" }, { key: "ratio", label: "Nurse ratio" }]} />
          <Segmented value={sort} onChange={setSort} options={[{ key: "birth", label: "By weight in each group" }, { key: "length", label: "Longest first in each group" }]} />
        </div>
      </div>
      {!noReal && <MatchPanel bs={bs} gen={gen} genName={synthLabel ?? NAMES[KEYS.indexOf(gen)]} gaFrom={gaFrom} gaTo={gaTo} wFrom={wFrom} wTo={wTo} />}
      <div className="kpis">
        <Kpi label="Real babies" value={noReal ? "–" : `${sr.n}`} sub={noReal ? "No real data available for this center" : `${sr.done} began and ended in the data`} accent={p.series[0]} />
        <Kpi label="Real: median stay" value={Number.isFinite(sr.median) ? `${num(sr.median, 1)} d` : "–"} sub={Number.isFinite(sr.q1) ? `middle half ${num(sr.q1, 1)}–${num(sr.q3, 1)} d` : "no completed stays"} accent={p.series[0]} />
        <Kpi label={`${synthLabel ?? NAMES[KEYS.indexOf(gen)]} babies`} value={`${ss.n}`} sub={`${ss.done} began and ended in the data`} accent={p.series[KEYS.indexOf(gen)]} />
        <Kpi label={`${synthLabel ?? NAMES[KEYS.indexOf(gen)]}: median stay`} value={Number.isFinite(ss.median) ? `${num(ss.median, 1)} d` : "–"} sub={Number.isFinite(ss.q1) ? `middle half ${num(ss.q1, 1)}–${num(ss.q3, 1)} d` : "no completed stays"} accent={p.series[KEYS.indexOf(gen)]} />
      </div>
      <div className="grid">
        <Card n={cnt(real.length, "stays")} title="Real babies" sub={`Born ${gaFrom}–${gaTo}+6 wk, ${wFrom.toLocaleString()}–${(wTo - 1).toLocaleString()} g: ${real.length} stays`}>
          {noReal ? <div className="empty">No real data available for this center.</div>
            : real.length ? <Chart option={chart(real, "real")} height={tallest} label="Real baby stays" /> : <div className="empty">No real babies in this range.</div>}
        </Card>
        <Card n={cnt(synth.length, "stays")} title="Synthetic babies" sub={`The same range in the synthetic unit (${synthLabel ?? NAMES[KEYS.indexOf(gen)]}): ${synth.length} stays${source ? " (a sample of the large-scale dataset)" : ""}`}
          right={source ? undefined : <Segmented value={gen} onChange={setGen} options={[{ key: "ml", label: "Traditional ML" }, { key: "dl", label: "Deep learning" }]} />}>
          {synth.length ? <Chart option={chart(synth, gen)} height={tallest} label="Synthetic baby stays" /> : <div className="empty">No synthetic babies in this range.</div>}
        </Card>
        <div className="card wide" style={{ padding: "12px 18px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            {legendItems.length > 0 ? <Legend items={[...legendItems, { color: blank, label: "not recorded" }]} /> : <span style={{ fontSize: 12.5, color: "var(--soft)" }}>Babies grouped by gestational age to the day: one hue per week, lighter for each later day (bar at the left). Hover a line for the baby's weight and stay.</span>}
            {marks}
          </div>
        </div>
        <Card n={all.map(({ k, s }) => `${NAMES[KEYS.indexOf(k)]} ${s.done}`).join(" · ") + " completed stays"} title="How long these babies stayed" sub="Share gone from the unit by each day, stays that began and ended in the data">
          <Chart option={ecdf} height={280} label="Length of stay of the selection" />
          <Legend items={all.map(({ k }) => ({ color: p.series[KEYS.indexOf(k)], label: NAMES[KEYS.indexOf(k)] }))} />
        </Card>
        <Card n={all.map(({ k, s }) => `${NAMES[KEYS.indexOf(k)]} ${s.n}`).join(" · ") + " stays"} title="The selection in numbers" sub="Length of stay in days, stays that began and ended in the data">
          <table>
            <thead><tr><th></th><th>Babies</th><th>Completed</th><th>Median</th><th>Middle half</th><th>90th</th><th>Still or already on the unit</th></tr></thead>
            <tbody>{all.map(({ k, s }) => (
              <tr key={k}><td><span className="legend"><span><i style={{ background: p.series[KEYS.indexOf(k)] }} />{NAMES[KEYS.indexOf(k)]}</span></span></td>
                <td>{s.n}</td><td>{s.done}</td><td>{Number.isFinite(s.median) ? num(s.median, 1) : "–"}</td>
                <td>{Number.isFinite(s.q1) ? `${num(s.q1, 1)}–${num(s.q3, 1)}` : "–"}</td><td>{Number.isFinite(s.p90) ? num(s.p90, 1) : "–"}</td><td>{s.open}</td></tr>))}
            </tbody>
          </table>
          <div className="note">Synthetic units are simulated over the same months as the real one, so their babies in a range differ in number; the stays should look alike, not match one for one.</div>
          <TableView head={["Dataset", "GA (weeks+days)", "Birth weight (g)", "Day of life at first board", "Days on the unit", "Already on the unit", "Still on the unit"]}
            rows={all.flatMap(({ k }) => pick(k).map((b) => [NAMES[KEYS.indexOf(k)], wd(b[0] / 7, ""), num(b[1], 0), num(b[2], 0), num(b[3] / 2, 1), b[4] ? "yes" : "", b[5] ? "yes" : ""]))} />
        </Card>
      </div>
    </>
  );
}
