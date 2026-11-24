import { useEffect, useState } from "react";
import Chart from "../Chart";
import { Card, Kpi, Legend, PageHead, Segmented, TableView } from "../ui";
import { axis, base, num, PALETTE, pct } from "../theme";
import type { Props } from "../App";
import { Banner } from "./Center";

/* Count analyses (acuity_insights/counts.py): how many stays, babies, shifts, nurses and care episodes,
   real beside synthetic for Center 6 and synthetic alone for Centers 1-5. Charts show shares so a
   unit observed for 8 months and one simulated for decades sit on one scale; every table gives the
   counts themselves. Written for hospital management and nurse managers. */

type Mode = "light" | "dark";
type Set = { key: string; name: string; color: string; block: any };
const MODE_NAMES: Record<string, string> = { VENT: "Ventilator", NIPPV: "NIPPV", CPAP: "CPAP", HFNC: "High-flow", NC: "Nasal cannula", RA: "Room air" };
const TIER_NAMES: Record<string, string> = { continuing: "Continuing care", intermediate: "Intermediate care", intensive: "Intensive care" };
const SKILL_NAMES: Record<string, string> = { continuing: "Continuing only", "continuing+intermediate": "Up to intermediate",
  "continuing+intermediate+intensive": "Up to intensive" };

const sum = (a: number[]) => a.reduce((x, y) => x + (y || 0), 0);
const shares = (a: number[]) => { const t = sum(a) || 1; return a.map((v) => (v || 0) / t); };

function useSection(page: string) {
  useEffect(() => {
    const go = () => {
      const [p, t] = location.hash.slice(1).split("/");
      if (p !== page) return;
      const el = t && document.getElementById(`sec-${t}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const id = window.setTimeout(go, 80);
    window.addEventListener("hashchange", go);
    return () => { window.clearTimeout(id); window.removeEventListener("hashchange", go); };
  }, [page]);
}

function barOption(mode: Mode, labels: string[], sets: { name: string; values: number[]; color: string; counts?: number[] }[], opts: { share?: boolean; horizontal?: boolean; yName?: string } = {}) {
  const p = PALETTE[mode];
  const share = opts.share !== false;
  const fmt = (v: number) => (share ? pct(v, v < 0.1 ? 1 : 0) : num(v, 1));
  const cat = { type: "category", data: labels, ...axis(mode), axisLabel: { color: p.muted, fontSize: 10.5, interval: 0, hideOverlap: true }, splitLine: { show: false } };
  const val = { type: "value", name: opts.yName, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => (share ? pct(v) : num(v, 1)) }, axisLine: { show: false } };
  return {
    ...base(mode), legend: { show: false },
    tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: any[]) => `<b>${ps[0].axisValue}</b><br/>` + ps.map((x) => {
        const c = sets[x.seriesIndex].counts?.[x.dataIndex];
        return `${x.marker}${x.seriesName}: ${fmt(x.value)}${c != null ? ` (${c.toLocaleString()})` : ""}`;
      }).join("<br/>") },
    grid: opts.horizontal ? { left: 178, right: 18, top: 8, bottom: 26 } : { left: 48, right: 12, top: 16, bottom: 34 },
    xAxis: opts.horizontal ? val : cat,
    yAxis: opts.horizontal ? { ...cat, inverse: true, axisLine: { show: false } } : val,
    series: sets.map((s) => ({ name: s.name, type: "bar", data: s.values, barMaxWidth: opts.horizontal ? 14 : 22, barGap: "12%",
      itemStyle: { color: s.color, borderRadius: opts.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] } })),
  };
}

/* One count distribution: shares in the chart, counts and shares in the table. */
function CountCard({ mode, sets, title, sub, pick, labels, names, wide, horizontal, height = 250, unit, note, share = true, of, missing, missingWhat }:
  { mode: Mode; sets: Set[]; title: string; sub: string; pick: (b: any) => number[] | undefined; labels: string[]; names?: Record<string, string>;
    wide?: boolean; horizontal?: boolean; height?: number; unit: string; note?: string; share?: boolean; of?: (b: any) => number;
    missing?: (b: any) => number | undefined; missingWhat?: string }) {
  const shown = sets.filter((s) => pick(s.block));
  if (!shown.length) return null;
  const lab = labels.map((l) => names?.[l] ?? l);
  // Shares of the total by default; with ``of``, shares of another count (such as all stays).
  const series = shown.map((s) => { const c = pick(s.block)!; const d = of ? of(s.block) || 1 : 0;
    return { name: s.name, color: s.color, counts: c, values: of ? c.map((v) => v / d) : share ? shares(c) : c }; });
  return (
    <Card wide={wide} title={title} sub={sub} n={shown.map((s) => `${s.name.toLowerCase()} ${(of ? of(s.block) : sum(pick(s.block)!)).toLocaleString()}`).join(" · ") + ` ${unit}`
      + (missing && shown.some((s) => missing(s.block)) ? ` · not recorded: ${shown.map((s) => `${s.name.split(" ")[0].toLowerCase()} ${(missing(s.block) ?? 0).toLocaleString()}`).join(", ")}` : "")}
      right={shown.length > 1 ? <Legend items={shown.map((s) => ({ color: s.color, label: s.name }))} /> : undefined}>
      <Chart option={barOption(mode, lab, series, { share: share || !!of, horizontal })} height={height} label={title} />
      {note && <div className="note">{note}</div>}
      {missing && shown.some((s) => missing(s.block)) && <div className="note">Left out because {missingWhat ?? "the field is blank on the board"}: {shown.map((s) => `${(missing(s.block) ?? 0).toLocaleString()} ${s.name.toLowerCase()}`).join(", ")} {unit}. Shares are of the {unit} where it is recorded.</div>}
      <TableView head={["", ...shown.flatMap((s) => share || of ? [`${s.name}: count`, of ? `share of ${unit}` : "share"] : [s.name])]}
        rows={lab.map((l, i) => [l, ...series.flatMap((s) => share || of ? [s.counts[i].toLocaleString(), pct(s.values[i], 1)] : [num(s.counts[i], 1)])])} />
    </Card>
  );
}

function SectionHead({ id, title, lead }: { id: string; title: string; lead: string }) {
  return (<div id={`sec-${id}`} className="count-sec"><h2>{title}</h2><p>{lead}</p></div>);
}

export default function Counts({ mode, center }: Props & { center: any }) {
  useSection("counts");
  const p = PALETTE[mode];
  const [band, setBand] = useState("all");
  const [measure, setMeasure] = useState("done");
  const [tier, setTier] = useState("intensive");
  if (!center) return <div className="empty">Loading the center…</div>;
  const c = center.counts;
  if (!c) return <div className="empty">No count analyses for {center.name} yet: run `make insights-data` in acuity-models.</div>;
  const sets: Set[] = [
    ...(c.real ? [{ key: "real", name: "Real (observed)", color: p.series[0], block: c.real }] : []),
    ...(c.synthetic ? [{ key: "synthetic", name: "Synthetic (simulated)", color: p.series[1], block: c.synthetic }] : []),
  ];
  const first = sets[0].block;
  const per30 = (b: any, v: number) => (v / Math.max(b.flow.days, 1)) * 30;
  const bands = Object.keys(first.stays.los_by_band);
  const pickL = (b: any) => (measure === "seen" ? b.stays.los_seen_all : band === "all" ? b.stays.los : b.stays.los_by_band[band]);
  const kpiPair = (f: (b: any) => string) => sets.map((s) => f(s.block)).join(" / ");
  const who = sets.length > 1 ? "real / synthetic" : "synthetic";
  const staff = c.synthetic?.staff;
  const skillColor = (i: number) => p.ramp[[0, 2, 4][i] ?? i];  // an ordered scale: more skills, darker
  return (
    <>
      <PageHead eyebrow={center.name} title="Counts" lead="How many: stays and how long they lasted, babies at each kind of care, admissions and census, the nurse-shifts the babies' ratios call for, and the shifts each nurse works. Real beside synthetic where both exist. Charts show shares so that 8 real months and decades of simulation sit on one scale; every table gives the counts." />
      <Banner center={center} />
      <div className="count-jump">
        {[["stays", "Stays"], ["care", "Care"], ["unit", "Admissions & census"], ["nursing", "Nursing by skill"], ["staff", "Nurse shifts"]].map(([id, l]) =>
          <a key={id} href={`#counts/${id}`}>{l}</a>)}
      </div>

      <div className="note"><b>Why the n changes from chart to chart.</b> Each chart counts what it is about, and says so in its n line:
        stays (every baby's stay, {kpiPair((b) => b.stays.n.toLocaleString())}); completed stays (true length known, {kpiPair((b) => b.stays.completed.toLocaleString())});
        baby-shifts (one baby on one board, {kpiPair((b) => b.care.baby_shifts.toLocaleString())}); boards (one per shift, {kpiPair((b) => b.flow.boards.toLocaleString())});
        days with boards ({kpiPair((b) => b.flow.days.toLocaleString())}); or only the babies who ever had a given care (for example days on CPAP).
        Where a field is blank on some boards, the chart says how many were left out.</div>
      <SectionHead id="stays" title="Stays" lead="How many babies came, how long each stay lasted, and how sick they were at their worst. Length of stay counts completed stays only (admitted and discharged inside the data)." />
      <div className="kpis">
        <Kpi label="Stays" value={kpiPair((b) => b.stays.n.toLocaleString())} sub={`${kpiPair((b) => (b.stays.completeness?.completed ?? b.stays.completed).toLocaleString())} completed (${who})`} />
        <Kpi label="Admissions per 30 days" value={kpiPair((b) => num(per30(b, b.stays.completeness?.admitted ?? b.stays.n), 1))} sub={`${who}; babies admitted over ${kpiPair((b) => b.flow.days.toLocaleString())} days with boards`} />
        <Kpi label="Median stay" value={kpiPair((b) => `${num(b.stays.los.median, 1)} d`)} sub={`completed stays (${who})`} />
        <Kpi label="Mean stay" value={kpiPair((b) => `${num(b.stays.los.mean, 1)} d`)} sub="pulled up by the long stays" />
        <Kpi label="Longest stay" value={kpiPair((b) => `${num(b.stays.los.max, 0)} d`)} sub={who} />
      </div>
      <div className="grid">
        <Card wide title="How long each stay lasted" sub="True length: completed stays only. Days in the data: every stay, counting only the days it was on the unit while the boards were kept"
          n={sets.map((s) => `${s.name.toLowerCase()} ${pickL(s.block).n.toLocaleString()}`).join(" · ") + (measure === "done" ? " completed stays" : " stays (all)")}
          right={<div className="seg-stack"><Segmented options={[{ key: "done", label: "True length (completed)" }, { key: "seen", label: "Days in the data (all stays)" }]} value={measure} onChange={setMeasure} />
            {measure === "done" && <Segmented options={[{ key: "all", label: "All babies" }, ...bands.map((b) => ({ key: b, label: `born ${b}` }))]} value={band} onChange={setBand} />}</div>}>
          {(() => {
            const series = sets.map((s) => ({ name: s.name, color: s.color, counts: pickL(s.block).counts as number[], values: shares(pickL(s.block).counts) }));
            return (<>
              <Legend items={sets.map((s) => ({ color: s.color, label: `${s.name}: median ${num(pickL(s.block).median, 1)} d` }))} />
              <Chart option={barOption(mode, first.stays.los.labels, series)} height={270} label="Length of stay" />
              <div className="note">{sets.map((s) => { const c = s.block.stays.completeness; return c ? (
                <span key={s.key} style={{ display: "block" }}><b>{s.name}: {c.all.toLocaleString()} stays.</b> {c.completed.toLocaleString()} began and ended while the boards were kept, so their true length is known.
                  {" "}{c.already_on_unit.toLocaleString()} were already on the unit on the first board and {c.still_on_unit.toLocaleString()} were still there on the last
                  {c.both ? ` (${c.both} both)` : ""}: their true length is unknown, so {measure === "done" ? "they are left out here" : "they count with the days seen, which is less than their true length"}.</span>) : null; })}
              </div>
              <TableView head={["Length of stay", ...sets.flatMap((s) => [`${s.name}: stays`, "share"])]}
                rows={first.stays.los.labels.map((l: string, i: number) => [l, ...series.flatMap((s) => [s.counts[i].toLocaleString(), pct(s.values[i], 1)])])} />
            </>);
          })()}
        </Card>
        <CountCard mode={mode} sets={sets} title="Stays by gestational age at birth" sub="How many babies of each maturity were admitted" pick={(b) => b.stays.by_ga_band.counts} labels={first.stays.by_ga_band.labels} unit="stays" />
        <CountCard mode={mode} sets={sets} title="Stays by birth weight" sub="WHO bands: extremely low (<1,000 g), very low (<1,500 g) and low (<2,500 g) birth weight" pick={(b) => b.stays.by_bw_band.counts} labels={first.stays.by_bw_band.labels} unit="stays" missing={(b) => b.stays.by_bw_band.not_recorded} missingWhat="no birth weight is recorded" />
        <CountCard mode={mode} sets={sets} title="Bed-days by gestational age" sub="Who uses the beds: share of all bed-days (one baby in a bed for one day)" pick={(b) => b.stays.bed_days_by_band.days} labels={first.stays.bed_days_by_band.labels} unit="bed-days" note="The table gives bed-days." />
        <CountCard mode={mode} sets={sets} title="Highest nurse ratio during the stay" sub="Stays by the most nursing they ever needed" pick={(b) => b.stays.worst_ratio.counts} labels={first.stays.worst_ratio.labels} unit="stays" />
        <CountCard mode={mode} sets={sets} title="Ratio changes per stay" sub="How many times a baby's ratio changed from one shift to the next during the stay" pick={(b) => b.stays.ratio_changes.counts} labels={first.stays.ratio_changes.labels} unit="stays" />
      </div>

      <SectionHead id="care" title="Care" lead="How much of each kind of care the unit gives: baby-shifts (one baby on one shift) by ratio, skill tier, breathing support and feeding; how many babies ever needed each; and for how many days." />
      <div className="kpis">
        <Kpi label="Baby-shifts" value={kpiPair((b) => b.care.baby_shifts.toLocaleString())} sub={who} />
        <Kpi label="At 1:2 or 1:1" value={kpiPair((b) => pct((b.care.by_ratio.counts[3] + b.care.by_ratio.counts[4]) / b.care.baby_shifts, 0))} sub="share of baby-shifts" />
        <Kpi label="On CPAP or more" value={kpiPair((b) => pct((b.care.by_mode.counts[0] + b.care.by_mode.counts[1] + b.care.by_mode.counts[2]) / b.care.baby_shifts, 0))} sub="ventilator, NIPPV or CPAP" />
        <Kpi label="Stays ever ventilated" value={kpiPair((b) => pct(b.care.stays_ever_mode.counts[0] / b.stays.n, 1))} sub="share of stays (ventilator or HFOV)" />
      </div>
      <div className="grid">
        <CountCard mode={mode} sets={sets} title="Baby-shifts by nurse ratio" sub="How often each ratio was needed" pick={(b) => b.care.by_ratio.counts} labels={first.care.by_ratio.labels} unit="baby-shifts" />
        <CountCard mode={mode} sets={sets} title="Baby-shifts by skill tier of the care" sub="The acuity tool's tier: continuing (1:3-4, 1:3), intermediate (1:2-3), intensive (1:2, 1:1)" pick={(b) => b.care.by_tier.counts} labels={first.care.by_tier.labels} names={TIER_NAMES} unit="baby-shifts" missing={(b) => b.care.by_tier.not_recorded} />
        <CountCard mode={mode} sets={sets} title="Baby-shifts by breathing support" sub="From the most support (ventilator, HFOV counted with it) to room air" pick={(b) => b.care.by_mode.counts} labels={first.care.by_mode.labels} names={MODE_NAMES} unit="baby-shifts" missing={(b) => b.care.by_mode.not_recorded} missingWhat="the breathing support is blank on the board" />
        <CountCard mode={mode} sets={sets} title="Baby-shifts by feeding stage" sub="Read from the feeding label on the board" pick={(b) => b.care.by_feed_stage.counts} labels={first.care.by_feed_stage.labels} unit="baby-shifts" horizontal height={260} missing={(b) => b.care.by_feed_stage.not_recorded} missingWhat="the feeding label is blank or cannot be read as a stage" />
        <CountCard mode={mode} sets={sets} title="Babies ever on each breathing support" sub="Share of stays with at least one board on it" pick={(b) => b.care.stays_ever_mode.counts} labels={first.care.stays_ever_mode.labels} names={MODE_NAMES} unit="stays" of={(b) => b.stays.n} note="Share of all stays; a baby can count under several supports." />
        <CountCard mode={mode} sets={sets} title="Days on CPAP or more, per baby" sub="Babies who ever needed ventilator, NIPPV or CPAP, by days on it (seen on the boards)" pick={(b) => b.care.days_cpap_or_more.counts} labels={first.care.days_cpap_or_more.labels} unit="babies" />
        <CountCard mode={mode} sets={sets} title="Days at the intensive tier, per baby" sub="Babies who ever needed 1:2 or 1:1, by days at that tier" pick={(b) => b.care.days_intensive_tier.counts} labels={first.care.days_intensive_tier.labels} unit="babies" />
        <CountCard mode={mode} sets={sets} title="Days with a central line, per baby" sub="Babies who ever had a PICC, UVC or UAC, by days with it" pick={(b) => b.care.days_central_line.counts} labels={first.care.days_central_line.labels} unit="babies" />
        <CountCard mode={mode} sets={sets} title="Days nil by mouth, per baby" sub="Babies ever nil by mouth, by days so" pick={(b) => b.care.days_npo.counts} labels={first.care.days_npo.labels} unit="babies" />
        <CountCard mode={mode} sets={sets} wide title="Babies with each event noted" sub="Share of stays in which the board's notes mention it at least once (a mention is not a diagnosis)" pick={(b) => b.care.stays_with_event.counts} labels={first.care.stays_with_event.labels} unit="stays" of={(b) => b.stays.n} horizontal height={330} />
      </div>

      <SectionHead id="unit" title="Admissions and census" lead="How busy the unit is: admissions and discharges per day and weekday, how many babies were on each board, and how many of them needed intensive care or breathing support." />
      <div className="kpis">
        <Kpi label="Admissions per day" value={kpiPair((b) => num(b.flow.admissions_per_day.mean, 2))} sub={`average (${who})`} />
        <Kpi label="Days with no admission" value={kpiPair((b) => pct(b.flow.admissions_per_day.counts[0] / b.flow.admissions_per_day.n, 0))} sub="share of days" />
        <Kpi label="Boards at full beds" value={kpiPair((b) => pct(b.flow.full_boards / b.flow.boards, 1))} sub="every bed taken" />
        <Kpi label="Boards observed" value={kpiPair((b) => b.flow.boards.toLocaleString())} sub="one per shift" />
      </div>
      <div className="grid">
        <CountCard mode={mode} sets={sets} title="Admissions per day" sub="Days by how many babies were admitted" pick={(b) => b.flow.admissions_per_day.counts} labels={first.flow.admissions_per_day.labels} unit="days" />
        <CountCard mode={mode} sets={sets} title="Discharges per day" sub="Days by how many babies left the unit (home, transfer or death are not told apart)" pick={(b) => b.flow.discharges_per_day.counts} labels={first.flow.discharges_per_day.labels} unit="days" />
        <Card title="Admissions by weekday" sub="Average admissions per week on each weekday, AM and PM shifts together"
          right={sets.length > 1 ? <Legend items={sets.map((s) => ({ color: s.color, label: s.name }))} /> : undefined}
          n={sets.map((s) => `${s.name.toLowerCase()} ${num(s.block.flow.weeks, 0)}`).join(" · ") + " weeks"}>
          {(() => {
            const w = first.flow.admissions_per_week_by_day;
            const series = sets.map((s) => { const x = s.block.flow.admissions_per_week_by_day; return { name: s.name, color: s.color, values: x.AM.map((a: number, i: number) => (a || 0) + (x.PM[i] || 0)) }; });
            return (<>
              <Chart option={barOption(mode, w.days, series, { share: false, yName: "per week" })} height={240} label="Admissions by weekday" />
              <TableView head={["Day", ...sets.flatMap((s) => [`${s.name}: AM`, "PM"])]}
                rows={w.days.map((d: string, i: number) => [d, ...sets.flatMap((s) => [num(s.block.flow.admissions_per_week_by_day.AM[i], 2), num(s.block.flow.admissions_per_week_by_day.PM[i], 2)])])} />
            </>);
          })()}
        </Card>
        <CountCard mode={mode} sets={sets} title="How full the unit was" sub="Boards by occupancy (babies on the board ÷ beds)" pick={(b) => b.flow.occupancy.counts} labels={first.flow.occupancy.labels} unit="boards" />
        <CountCard mode={mode} sets={sets} wide title="Babies on the unit" sub="Boards by the number of babies on them" pick={(b) => b.flow.census.counts} labels={first.flow.census.labels} unit="boards" height={240} />
        <CountCard mode={mode} sets={sets} title="Babies at 1:2 or 1:1 on a board" sub="Boards by how many babies needed intensive-tier nursing" pick={(b) => b.flow.intensive_babies_per_board.counts} labels={first.flow.intensive_babies_per_board.labels} unit="boards" />
        <CountCard mode={mode} sets={sets} title="Babies on CPAP or more on a board" sub="Boards by how many babies were on ventilator, NIPPV or CPAP: the best single sign of nursing need" pick={(b) => b.flow.cpap_or_more_per_board.counts} labels={first.flow.cpap_or_more_per_board.labels} unit="boards" />
      </div>

      <SectionHead id="nursing" title="Nursing by skill tier" lead="The bedside nurse-shifts the babies' ratios call for (one nurse for one shift; a 1:2 baby counts half, a 1:3 baby a third; the more-nurse end of ranged ratios), split by the skill tier of the care. This is the need, not the nurses rostered." />
      <div className="kpis">
        {first.nursing.nurse_shifts_by_tier.labels.map((t: string, i: number) => (
          <Kpi key={t} label={`${TIER_NAMES[t]} per 30 days`} value={kpiPair((b) => num(per30(b, b.nursing.nurse_shifts_by_tier.nurse_shifts[i]), 0))} sub={`nurse-shifts (${who})`} />))}
        <Kpi label="Intensive share" value={kpiPair((b) => pct(b.nursing.nurse_shifts_by_tier.nurse_shifts[2] / sum(b.nursing.nurse_shifts_by_tier.nurse_shifts), 0))} sub="of all nurse-shifts needed" />
      </div>
      <div className="grid">
        <CountCard mode={mode} sets={sets} title="Nurse-shifts needed, by skill tier" sub="Share of all bedside nurse-shifts the ratios called for" pick={(b) => b.nursing.nurse_shifts_by_tier.nurse_shifts} labels={first.nursing.nurse_shifts_by_tier.labels} names={TIER_NAMES} unit="nurse-shifts" />
        <Card title="Nurses of each tier needed on a shift" sub="Boards by the nurses the babies of one tier needed (1 = one full nurse)"
          right={<Segmented options={first.nursing.nurse_shifts_by_tier.labels.map((t: string) => ({ key: t, label: t[0].toUpperCase() + t.slice(1) }))} value={tier} onChange={setTier} />}
          n={sets.map((s) => `${s.name.toLowerCase()} ${s.block.nursing.boards.toLocaleString()}`).join(" · ") + " boards"}>
          {(() => {
            const series = sets.map((s) => { const h = s.block.nursing.per_board_by_tier[tier]; return { name: s.name, color: s.color, counts: h.counts as number[], values: shares(h.counts) }; });
            const labels = first.nursing.per_board_by_tier[tier].labels.map((l: string) => l.replace(" nurses", ""));
            return (<>
              <Legend items={sets.map((s) => ({ color: s.color, label: `${s.name}: average ${num(s.block.nursing.per_board_by_tier[tier].mean, 1)}, 9 in 10 boards ≤ ${num(s.block.nursing.per_board_by_tier[tier].p90, 1)}` }))} />
              <Chart option={barOption(mode, labels, series)} height={230} label="Nurses per tier" />
              <TableView head={["Nurses", ...sets.flatMap((s) => [`${s.name}: boards`, "share"])]}
                rows={labels.map((l: string, i: number) => [l, ...series.flatMap((s) => [s.counts[i].toLocaleString(), pct(s.values[i], 1)])])} />
            </>);
          })()}
        </Card>
      </div>

      <SectionHead id="staff" title="Nurse shifts" lead="The shifts each nurse worked, by skill: how many shifts, in which role, how they came in, and how many babies each looked after." />
      {c.real && !c.real.staff.recorded && <div className="note warn-note"><b>Real unit: not recorded.</b> {c.real.staff.why}</div>}
      {staff?.recorded ? (<>
        <div className="note">Synthetic (simulated) nurses: the pool size, skills and rota are <b>assumed</b> scenario settings (see Center configuration), not the hospital's staff. Counts cover {num(staff.days, 0)} simulated days.</div>
        <div className="kpis">
          <Kpi label="Simulated nurses" value={staff.nurses.toLocaleString()} sub={staff.skills.map((s: string, i: number) => `${staff.nurses_by_skill[i]} ${SKILL_NAMES[s].toLowerCase()}`).join(" · ")} />
          {staff.skills.map((s: string) => <Kpi key={s} label={`Shifts per 28 days: ${SKILL_NAMES[s].toLowerCase()}`} value={num(staff.shifts_per_28_days[s].median, 1)}
            sub={`median; range ${num(staff.shifts_per_28_days[s].min, 1)}–${num(staff.shifts_per_28_days[s].max, 1)}`} />)}
        </div>
        <div className="grid">
          <Card title="Nurse-shifts by skill and role" sub="Bedside shifts on the rota, bedside call-ins, and charge-nurse shifts"
            n={`${sum(staff.skills.map((s: string) => sum(Object.values(staff.nurse_shifts_by_skill[s]) as number[]))).toLocaleString()} simulated nurse-shifts`}
            right={<Legend items={[{ color: p.ramp[3], label: "Bedside, rota" }, { color: p.warn, label: "Bedside, call-in" }, { color: p.series[2], label: "Charge" }]} />}>
            <Chart height={220} label="Nurse-shifts by skill" option={{
              ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => v.toLocaleString() },
              grid: { left: 130, right: 18, top: 8, bottom: 26 },
              xAxis: { type: "value", ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => num(v / 1000, 0) + "k" } },
              yAxis: { type: "category", inverse: true, data: staff.skills.map((s: string) => SKILL_NAMES[s]), ...axis(mode), axisLine: { show: false } },
              series: [["bedside_rostered", "Bedside, rota", p.ramp[3]], ["bedside_call_in", "Bedside, call-in", p.warn], ["charge", "Charge", p.series[2]]].map(([key, name, color]) => ({
                name, type: "bar", stack: "s", barWidth: 18, itemStyle: { color, borderColor: p.surface, borderWidth: 1 },
                data: staff.skills.map((s: string) => staff.nurse_shifts_by_skill[s][key]) })),
            }} />
            <TableView head={["Skill", "Nurses", "Bedside, rota", "Bedside, call-in", "Charge", "Median shifts per 28 days"]}
              rows={staff.skills.map((s: string, i: number) => [SKILL_NAMES[s], staff.nurses_by_skill[i], staff.nurse_shifts_by_skill[s].bedside_rostered.toLocaleString(),
                staff.nurse_shifts_by_skill[s].bedside_call_in.toLocaleString(), staff.nurse_shifts_by_skill[s].charge.toLocaleString(), num(staff.shifts_per_28_days[s].median, 1)])} />
          </Card>
          <Card title="Babies per nurse on a shift" sub="Bedside nurse-shifts by how many babies the nurse was assigned"
            n={`${sum(staff.skills.map((s: string) => staff.babies_per_nurse_shift[s].n)).toLocaleString()} assigned nurse-shifts`}
            right={<Legend items={staff.skills.map((s: string, i: number) => ({ color: skillColor(i), label: SKILL_NAMES[s] }))} />}>
            {(() => {
              const labels = staff.babies_per_nurse_shift[staff.skills[0]].labels;
              const series = staff.skills.map((s: string, i: number) => ({ name: SKILL_NAMES[s], color: skillColor(i), counts: staff.babies_per_nurse_shift[s].counts, values: shares(staff.babies_per_nurse_shift[s].counts) }));
              return (<>
                <Chart option={barOption(mode, labels.map((l: string) => (l === "1" ? "1 baby" : `${l} babies`)), series)} height={220} label="Babies per nurse" />
                <TableView head={["Babies", ...staff.skills.flatMap((s: string) => [`${SKILL_NAMES[s]}: nurse-shifts`, "share"])]}
                  rows={labels.map((l: string, i: number) => [l, ...series.flatMap((x: any) => [x.counts[i].toLocaleString(), pct(x.values[i], 1)])])} />
              </>);
            })()}
          </Card>
          <Card wide title="Which nurses cared for each tier of care" sub="Baby-shifts of each tier by the skill of the assigned nurse: intensive care must go to nurses skilled up to intensive"
            n={`${sum(staff.care_tier_by_skill.counts.flat()).toLocaleString()} assigned baby-shifts`}
            right={<Legend items={staff.skills.map((s: string, i: number) => ({ color: skillColor(i), label: SKILL_NAMES[s] }))} />}>
            <Chart height={190} label="Care tier by nurse skill" option={{
              ...base(mode), legend: { show: false }, tooltip: { ...base(mode).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => pct(v, 1) },
              grid: { left: 130, right: 18, top: 8, bottom: 26 },
              xAxis: { type: "value", max: 1, ...axis(mode), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
              yAxis: { type: "category", inverse: true, data: staff.care_tier_by_skill.tiers.map((t: string) => TIER_NAMES[t]), ...axis(mode), axisLine: { show: false } },
              series: staff.skills.map((s: string, j: number) => ({ name: SKILL_NAMES[s], type: "bar", stack: "s", barWidth: 18,
                itemStyle: { color: skillColor(j), borderColor: p.surface, borderWidth: 1 },
                data: staff.care_tier_by_skill.counts.map((row: number[]) => row[j] / (sum(row) || 1)) })),
            }} />
            <TableView head={["Tier of care", ...staff.skills.map((s: string) => SKILL_NAMES[s])]}
              rows={staff.care_tier_by_skill.tiers.map((t: string, i: number) => [TIER_NAMES[t], ...staff.care_tier_by_skill.counts[i].map((v: number) => v.toLocaleString())])} />
          </Card>
        </div>
      </>) : !c.real && <div className="empty">No simulated nurses for this center yet.</div>}
    </>
  );
}
