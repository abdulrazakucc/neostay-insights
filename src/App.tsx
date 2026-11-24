import { useEffect, useState } from "react";
import { Mode } from "./theme";
import { loadData } from "./vault";
import Overview from "./pages/Overview";
import { Babies, Nurses, BabiesNurses } from "./pages/YourData";
import Models from "./pages/Models";
import Predictive from "./pages/Predictive";
import Counts from "./pages/Counts";
import Scorecard from "./pages/Scorecard";
import { Synthetic, Compare } from "./pages/Synthetic";
import { CenterConfig, Evaluation, Generation, Longitudinal, Operations, Staffing, SynthInsights, useCenterData, Validation } from "./pages/Center";

export type Props = { data: any; mode: Mode; go: (page: string) => void; embedded?: boolean; center?: any };

type Page = { key: string; label: string; group: string; icon: string; el?: (p: any) => JSX.Element; subs?: string[][]; disabled?: string };

/* Real vs synthetic (Center 6 only): the evidence page and the detailed comparison, as sub-tabs. */
function RealVsSynth(props: any) {
  const sub = location.hash.slice(1).split("/")[1] || "evidence";
  return sub === "detail" ? <Compare {...props} /> : <Evaluation {...props} />;
}

function pagesFor(center: any): Page[] {
  if (!center) return [{ key: "overview", label: "Overview", group: "Start", icon: "◎", el: Overview }];
  const name = center.name;
  if (center.has_real_data) {
    const g1 = `${name} · real data insights`, g2 = `${name} · synthetic and evaluation`;
    return [
      { key: "overview", label: "Overview", group: "Start", icon: "◎", el: Overview },
      { key: "babies", label: "Babies", group: g1, icon: "◐", el: Babies,
        subs: [["stays", "Baby stays"], ["birth", "Birth & length of stay"], ["care", "Care during the stay"], ["feeding", "Feeding & growth"]] },
      { key: "nurses", label: "Nurses", group: g1, icon: "✚", el: Nurses,
        subs: [["ratio", "Babies by ratio"], ["needed", "Nurses needed"], ["levels", "Staffing levels"], ["week", "Weekday & ratio mix"]] },
      { key: "babies-nurses", label: "Babies & nurses", group: g1, icon: "⇋", el: BabiesNurses,
        subs: [["sets", "What sets the ratio"], ["at-ratio", "Babies at each ratio"], ["per-baby", "Nursing per baby"], ["through", "Ratio through the stay"], ["changes", "Shift-to-shift changes"]] },
      { key: "counts", label: "Counts: real & synthetic", group: g1, icon: "#", el: Counts,
        subs: [["stays", "Stays"], ["care", "Care"], ["unit", "Admissions & census"], ["nursing", "Nursing by skill"], ["staff", "Nurse shifts"]] },
      { key: "c-synthetic", label: "Synthetic data insights", group: g2, icon: "✦", el: SynthInsights },
      { key: "c-compare", label: "Real vs synthetic", group: g2, icon: "⇄", el: RealVsSynth, subs: [["evidence", "Evidence and decision"], ["detail", "Detailed comparison"]] },
      { key: "c-longitudinal", label: "Longitudinal patient analysis", group: g2, icon: "↗", el: Longitudinal },
      { key: "c-operations", label: "NICU operational analysis", group: g2, icon: "▦", el: Operations },
      { key: "c-quality", label: "Data quality and validation", group: g2, icon: "✓", el: Validation },
      { key: "c-generation", label: "Generation and reports", group: g2, icon: "⚙", el: (pp: any) => <Generation {...pp} generatorsPage={<Synthetic {...pp} />} /> },
      { key: "scorecard", label: "How good are the predictions?", group: "Models", icon: "★", el: Scorecard },
      { key: "predictive", label: "Predictive modeling & evaluation", group: "Models", icon: "◆", el: Predictive,
        subs: [["overview", "Forecasting overview"], ["experiments", "Training and experiments"], ["architectures", "Model architectures"], ["comparison", "Model comparison"],
          ["journey", "Patient journey evaluation"], ["calibration", "Calibration and reliability"], ["explain", "Explainability"], ["errors", "Error analysis"], ["registry", "Model registry"]] },
      { key: "models", label: "Journey study (earlier)", group: "Models", icon: "◇", el: Models },
    ];
  }
  const g = `${name} · synthetic scenario`;
  return [
    { key: "c-config", label: "Center configuration", group: g, icon: "⚑", el: CenterConfig },
    { key: "c-synthetic", label: "Synthetic data insights", group: g, icon: "✦", el: SynthInsights },
    { key: "c-longitudinal", label: "Longitudinal patient analysis", group: g, icon: "↗", el: Longitudinal },
    { key: "c-operations", label: "NICU operational analysis", group: g, icon: "▦", el: Operations },
    { key: "c-staffing", label: "Staffing and care requirements", group: g, icon: "✚", el: Staffing },
    { key: "counts", label: "Counts", group: g, icon: "#", el: Counts,
      subs: [["stays", "Stays"], ["care", "Care"], ["unit", "Admissions & census"], ["nursing", "Nursing by skill"], ["staff", "Nurse shifts"]] },
    { key: "c-validation", label: "Scenario and constraint validation", group: g, icon: "✓", el: Validation },
    { key: "c-generation", label: "Generation and reports", group: g, icon: "⚙", el: Generation },
    { key: "c-compare-off", label: "Real vs synthetic", group: g, icon: "⇄", disabled: "No real data available for this center: real-versus-synthetic comparison exists for Center 6 only." },
    { key: "scorecard", label: "How good are the predictions?", group: "Models (evaluated on Center 6)", icon: "★", el: Scorecard },
    { key: "predictive", label: "Predictive modeling & evaluation", group: "Models (evaluated on Center 6)", icon: "◆", el: Predictive,
        subs: [["overview", "Forecasting overview"], ["experiments", "Training and experiments"], ["architectures", "Model architectures"], ["comparison", "Model comparison"],
          ["journey", "Patient journey evaluation"], ["calibration", "Calibration and reliability"], ["explain", "Explainability"], ["errors", "Error analysis"], ["registry", "Model registry"]] },
  ];
}

function initialMode(): Mode {
  try {
    const saved = localStorage.getItem("insights-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [page, setPage] = useState(() => location.hash.slice(1) || "overview");
  const [index, setIndex] = useState<any>(null);
  const [centerId, setCenterId] = useState<string>(() => { try { return localStorage.getItem("insights-center") || "center-6"; } catch { return "center-6"; } });
  const { data: center } = useCenterData(centerId);
  useEffect(() => {
    loadData("centers/index.json").then(setIndex).catch(() => setIndex(null));
  }, []);
  useEffect(() => {
    loadData("insights.json")
      .then(setData)
      .catch(() => setError("The data could not be loaded. Sign out and sign in again, or reload the page."));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try { localStorage.setItem("insights-theme", mode); } catch { /* storage unavailable */ }
  }, [mode]);
  useEffect(() => {
    const on = () => setPage(location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (p: string) => {
    location.hash = p;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Older links (#stays, #patients, #journey, #feeding, #compare, #synthetic) open the matching page.
  const ALIAS: Record<string, string> = { stays: "babies/stays", patients: "babies/birth", journey: "babies/care", feeding: "babies/feeding", unit: "nurses",
    compare: "c-compare/detail", synthetic: "c-generation" };
  const route = ALIAS[page] || page;
  const PAGES = pagesFor(center);
  const current = PAGES.find((p) => p.key === route.split("/")[0] && !p.disabled) || PAGES.find((p) => !p.disabled)!;
  const Page = current.el!;
  const chooseCenter = (id: string) => {
    setCenterId(id);
    try { localStorage.setItem("insights-center", id); } catch { /* storage unavailable */ }
    location.hash = id === "center-6" ? "overview" : "c-config";
  };
  const groups = [...new Set(PAGES.map((p) => p.group))];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3fd0c9" /><stop offset="1" stopColor="#8b80ea" /></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)" /><path d="M8 20c3-8 6-8 8-2s5 6 8-4" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>
          </span>
          <div><b>NeoStay</b><small>Insights</small></div>
        </div>
        <label className="center-pick">
          <span>Center</span>
          <select value={centerId} onChange={(e) => chooseCenter(e.target.value)} aria-label="Choose a center">
            {(index?.centers || [1, 2, 3, 4, 5, 6].map((i) => ({ id: `center-${i}`, name: `Center ${i}` }))).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}{c.has_real_data ? " · real + synthetic" : " · synthetic scenario"}</option>))}
          </select>
          {center && <small className={center.has_real_data ? "real" : "scenario"}>{center.has_real_data ? "Real data available" : "Synthetic scenario: no real data"}</small>}
        </label>
        <nav>
          {groups.map((g) => (
            <div key={g} className="nav-group">
              <span className="nav-title">{g}</span>
              {PAGES.filter((p) => p.group === g).map((p) => p.disabled ? (
                <span key={p.key} className="nav-disabled" title={p.disabled}><span className="nav-icon" aria-hidden="true">{p.icon}</span>{p.label}<em>no real data</em></span>
              ) : (
                <div key={p.key}>
                  <a href={p.subs ? `#${p.key}/${p.subs[0][0]}` : `#${p.key}`} className={p.key === current.key ? "on" : ""}>
                    <span className="nav-icon" aria-hidden="true">{p.icon}</span>{p.label}
                  </a>
                  {p.subs && p.key === current.key && (
                    <div className="nav-subs">
                      {p.subs.map(([k, l], i) => {
                        const on = (route.split("/")[1] || p.subs![0][0]) === k || (!route.includes("/") && i === 0);
                        return <a key={k} href={`#${p.key}/${k}`} className={on ? "on" : ""}>{l}</a>;
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button className="theme-toggle" onClick={() => setMode(mode === "light" ? "dark" : "light")}>
            {mode === "light" ? "☾ Dark theme" : "☀ Light theme"}
          </button>
          <button className="theme-toggle" onClick={onSignOut}>⎋ Sign out</button>
          <small>{data ? `Data built ${data.generated}` : ""}</small>
          <small>Aggregates only · groups under {data?.min_stays ?? 5} stays left out</small>
        </div>
      </aside>
      <main className="main">
        {error && <div className="empty">{error}</div>}
        {!data && !error && <div className="empty">Loading…</div>}
        {data && (current.key.startsWith("c-") && !center ? <div className="empty">Loading the center…</div>
          : <Page data={data} mode={mode} go={go} center={center} />)}
        <footer className="foot">NeoStay Insights · decision support for planning, not for individual care · data encrypted at rest</footer>
      </main>
    </div>
  );
}
