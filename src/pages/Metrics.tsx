import { useEffect, useState } from "react";
import { Card, PageHead } from "../ui";
import type { Props } from "../App";
import { byId, GROUPS, METRICS } from "../metrics";

/* Metrics explained: every evaluation term in the app, in plain words and in technical terms (metrics.ts).
   TermLink puts a small "?" next to a score that opens its definition; Terms lists the terms of one page. */

export function TermLink({ id, text }: { id: string; text?: string }) {
  const m = byId[id];
  if (!m) return text ? <>{text}</> : null;
  return text
    ? <a className="term-link text" href={`#metrics/${id}`} title={m.lay}>{text}</a>
    : <a className="term-link" href={`#metrics/${id}`} title={`${m.name}: ${m.lay}`} aria-label={`What is ${m.name}?`}>?</a>;
}

export function Terms({ ids, title = "Terms on this page", wide = true }: { ids: string[]; title?: string; wide?: boolean }) {
  const list = ids.map((i) => byId[i]).filter(Boolean);
  if (!list.length) return null;
  return (
    <Card wide={wide} title={title} sub="Plain-language meaning; the full definition, with the technical one, is on Metrics explained">
      <dl className="terms">{list.map((m) => (
        <div key={m.id}><dt>{m.name}{m.also && <small> ({m.also})</small>}</dt><dd>{m.lay} <a href={`#metrics/${m.id}`}>Full definition →</a></dd></div>
      ))}</dl>
    </Card>
  );
}

/* A folded "Terms on this page" box for the top of a page. */
export function TermsBox({ ids }: { ids: string[] }) {
  const list = ids.map((i) => byId[i]).filter(Boolean);
  if (!list.length) return null;
  return (
    <details className="terms-box">
      <summary>Terms on this page ({list.length}): what each score means</summary>
      <dl className="terms">{list.map((m) => (
        <div key={m.id}><dt>{m.name}{m.also && <small> ({m.also})</small>}</dt><dd>{m.lay} <a href={`#metrics/${m.id}`}>Full definition →</a></dd></div>
      ))}</dl>
    </details>
  );
}

export default function Metrics(_: Props) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const go = () => {
      const [p, id] = location.hash.slice(1).split("/");
      if (p !== "metrics" || !id) return;
      setQ("");
      window.setTimeout(() => {
        const el = document.getElementById(`m-${id}`);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); window.setTimeout(() => el.classList.remove("flash"), 1600); }
      }, 80);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);
  const words = q.trim().toLowerCase();
  const hit = (m: (typeof METRICS)[number]) => !words || [m.name, m.also, m.lay, m.technical, m.where].join(" ").toLowerCase().includes(words);
  return (
    <>
      <PageHead eyebrow="Models" title="Metrics explained"
        lead="Every score and statistical term used in this app to judge the prediction models and the synthetic data: what it means in plain words, its exact technical definition, what value is ideal, and where it appears. Click the small ? next to any score elsewhere in the app to come here." />
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="search" type="search" placeholder="Search a term, e.g. IBS, C-index, log loss, calibration" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the metrics" />
        <span className="badge">{METRICS.length} terms</span>
      </div>
      <div className="grid">
        {GROUPS.map((g) => {
          const list = METRICS.filter((m) => m.group === g && hit(m));
          if (!list.length) return null;
          return (
            <Card key={g} wide title={g}>
              <div className="metric-list">{list.map((m) => (
                <article key={m.id} id={`m-${m.id}`} className="metric">
                  <h4>{m.name}{m.also && <small>{m.also}</small>}</h4>
                  <div className="metric-grid">
                    <div><span>In plain words</span><p>{m.lay}</p></div>
                    <div><span>Technical definition</span><p>{m.technical}</p></div>
                    <div><span>Ideal value</span><p>{m.ideal}</p></div>
                    <div><span>Where it appears</span><p>{m.where}</p></div>
                  </div>
                </article>
              ))}</div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
