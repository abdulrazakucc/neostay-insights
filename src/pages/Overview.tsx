import Chart from "../Chart";
import { bySet, Card, Kpi, Legend, Ring } from "../ui";
import { axis, base, KEYS, NAMES, num, PALETTE, pct, wd } from "../theme";
import type { Props } from "../App";
import { TermLink } from "./Metrics";

export default function Overview({ data, mode, go }: Props) {
  const p = PALETTE[mode];
  const k = data.real.kpis;
  const s = data.synthetic;
  return (
    <>
      <div className="hero">
        <span className="eyebrow">NeoStay Insights · {k.period[0]} to {k.period[1]}</span>
        <h1>The unit's babies, their predictions and their synthetic twins</h1>
        <p>What the unit's own boards say about its babies: how premature and how small, how long they stay, how they
          breathe, feed and grow; how well the prediction models answer doctors' questions; and two synthetic datasets
          that behave like the real one without containing a single real baby.</p>
        <div className="hero-stats">
          <div><b>{num(k.stays, 0)}</b><span>stays</span></div>
          <div><b>{num(k.boards, 0)}</b><span>boards</span></div>
          <div><b>{num(k.baby_shifts, 0)}</b><span>baby-shifts</span></div>
          <div><b>{k.median_los_days} d</b><span>median stay</span></div>
          <div><b>{wd(k.median_ga)}</b><span>median gestational age</span></div>
        </div>
      </div>
      <div className="kpis">
        <Kpi label="Born preterm" value={pct(k.preterm_share)} sub="under 37 weeks" />
        <Kpi label="Very preterm" value={pct(k.very_preterm_share)} sub="under 32 weeks" />
        <Kpi label="Median birth weight" value={`${num(k.median_bw, 0)} g`} sub="of the babies admitted" />
        <Kpi label="Mean stay" value={`${k.mean_los_days} d`} sub={`median ${k.median_los_days} d, completed stays`} />
        <Kpi label="Ever ventilated" value={pct(k.ever_ventilated_share)} sub="of stays" />
      </div>
      <div className="grid">
        {s && (
          <Card n={`${data.counts?.train?.stays} training + ${data.counts?.holdout?.stays} held-out real stays · ${bySet(data.counts, "stays", "synthetic stays", ["ml", "dl"])}`} title="How realistic is the synthetic data?" sub="Fidelity score: 100 means every field is distributed exactly as in the real data">
            <div className="rings">
              <Ring value={s.fidelity.ml.score} color={p.series[1]} label="Traditional ML" sub="copula + gradient boosting" />
              <Ring value={s.fidelity.dl.score} color={p.series[2]} label="Deep learning" sub="VAE + recurrent network" />
              <Ring value={s.fidelity.holdout.score} color={p.muted} label="New real stays" sub="later real stays vs earlier ones: the natural ceiling" />
            </div>
            <div className="note">Both generators learned only from the boards before the last 75 days ({s.split.train_stays} stays first seen before the holdout); the {s.split.holdout_stays} stays admitted in the last 75 days judge them. No synthetic stay copies a real one (closest-record check). <TermLink id="fidelity" text="How the score is worked out" />.</div>
          </Card>
        )}
        {data.babies_compared && (
          <Card n={bySet(data.counts, "completed", "completed stays")} title="Length of stay by gestational age" sub="Median days of completed stays, by gestational age at birth: the real babies and the two synthetic units"
            right={<Legend items={NAMES.map((n, i) => ({ color: p.series[i], label: n }))} />}>
            <Chart option={losByBand(data, mode)} height={280} label="Length of stay by GA band" />
          </Card>
        )}
        <Card wide title="Explore">
          <div className="navtiles">
            {[
              ["babies/stays", "Babies", "Baby stays, birth and length of stay, care during the stay, feeding and growth."],
              ["nurses", "Nurses", "Bedside nurses the ratios call for, shift by shift, and the mix of ratios."],
              ["babies-nurses", "Babies & nurses", "What sets each baby's nurse ratio, and which babies take most of the nursing."],
              ["models", "Predictive models", "Every model compared, the chosen ones, calibration and what drives them."],
              ["synthetic", "Synthetic generators", "How the two generators work, step by step."],
              ["compare", "Real vs synthetic", "Fidelity, usefulness for models and privacy, side by side."],
            ].map(([key, t, d]) => (
              <button key={key} className="navtile" onClick={() => go(key)}><b>{t} →</b><span>{d}</span></button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function losByBand(data: any, mode: "light" | "dark") {
  const p = PALETTE[mode];
  const b = data.babies_compared;
  const bands = (b.bands as string[]).filter((x) => KEYS.every((k) => !b.los_by_band[k] || b.los_by_band[k][x]));
  return {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => `${num(v, 1)} d` },
    grid: { left: 44, right: 14, top: 14, bottom: 30 },
    xAxis: { type: "category", data: bands.map((x) => `born ${x}`), ...axis(mode), splitLine: { show: false } },
    yAxis: { type: "value", name: "median days", ...axis(mode), axisLine: { show: false } },
    series: KEYS.filter((k) => b.los_by_band[k]).map((k, i) => ({ name: NAMES[i], type: "bar", barMaxWidth: 18, barGap: "15%",
      data: bands.map((x) => b.los_by_band[k][x]?.median ?? null), itemStyle: { color: p.series[i], borderRadius: [4, 4, 0, 0] } })),
  };
}
