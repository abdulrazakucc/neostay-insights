import { useEffect, useRef, useState } from "react";
import { Card, PageHead } from "../ui";
import { loadFile } from "../files";
import type { Props } from "../App";

/* The plain-language guide (docs/neostay/insights-brief in acuity-models): every page of the app, why it is
   there and what it means for doctors and for hospital management, with screenshots. Shown in the page and
   offered as a download. On the hosted site it is encrypted like the data. */

/* A line under each part's title; the titles, sub-sections and pages come from guide_sections.json
   (docs/neostay/insights-brief/sections.py), so the jumps follow the guide when it changes. */
const ABOUT: Record<string, string> = {
  open: "Signing in, choosing a center, reading the n line.", words: "Gestational and corrected age, ratio, median, holdout.",
  overview: "The unit in five numbers.", part1: "Who the babies are, how long they stay, breathing, feeding and growth.",
  part2: "The bedside nurses the babies' ratios call for, shift by shift.", part3: "What sets a baby's ratio and which babies take most of the nursing.",
  part4: "Stays and their length, care, admissions and census, nursing by skill, nurse shifts.", part5: "Computer-made babies: how realistic and how safe they are.",
  part6: "The scorecard: how good each prediction is today, in plain scores.", part7: "Made-up what-if units and what they show about beds and staffing.",
  part8: "What the results cannot tell us, and what we ask of you.",
  bayes: "Draw how things relate, learn the chances from the data, and ask what-if questions.",
  metrics: "Every score and term used to judge the models and the synthetic data: plain words and technical definition.",
};
type Section = { key: string; level: number; title: string; page: number };

export default function Guide(_: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [page, setPage] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let made: string | null = null;
    loadFile("guide.pdf")
      .then((b) => { made = URL.createObjectURL(b); setUrl(made); })
      .catch(() => setErr("The guide could not be loaded. Reload the page, or sign out and sign in again."));
    loadFile("guide_sections.json").then((b) => b.text()).then((t) => setSections(JSON.parse(t).sections ?? [])).catch(() => setSections([]));
    return () => { if (made) URL.revokeObjectURL(made); };
  }, []);
  const at = url ? `${url}#page=${page}` : undefined;
  const go = (n: number) => { setPage(n); frame.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  // Group the sub-sections (level 1) under their part (level 0).
  const groups: { head: Section; subs: Section[] }[] = [];
  for (const sct of sections) {
    if (sct.level === 0 || !groups.length) groups.push({ head: sct, subs: [] });
    else groups[groups.length - 1].subs.push(sct);
  }
  return (
    <>
      <PageHead eyebrow="Start" title="Guide"
        lead="A plain-language guide to every page of this app: what each result shows, why it is here, what we found, and what it means for doctors and for hospital management and nurse managers, with screenshots. Click a title to open the guide at that section." />
      <div className="grid">
        <Card wide title="NeoStay Insights: the results guide" sub="PDF · for doctors, hospital management and nurse managers · planning support, not for decisions about one baby"
          right={url ? <div className="row">
            <a className="btn" href={at} target="_blank" rel="noopener">Open in a new tab</a>
            <a className="btn" href={url} download="NeoStay-Insights-Guide.pdf">Download PDF</a>
          </div> : undefined}>
          {groups.length > 0 && (
            <div className="guide-parts">
              {groups.map(({ head, subs }) => (
                <div key={head.key} className={page >= head.page && (groups.find((g) => g.head.page > head.page)?.head.page ?? 1e9) > page ? "on" : ""}>
                  <button className="guide-link head" onClick={() => go(head.page)} title={`Open the guide at page ${head.page}`}>
                    <b>{head.title}</b><em>p. {head.page}</em>
                  </button>
                  {ABOUT[head.key] && <span>{ABOUT[head.key]}</span>}
                  {subs.length > 0 && <ul>{subs.map((x) => (
                    <li key={x.key}><button className="guide-link" onClick={() => go(x.page)} title={`Open the guide at page ${x.page}`}>{x.title}<em>p. {x.page}</em></button></li>
                  ))}</ul>}
                </div>
              ))}
            </div>
          )}
          {err && <div className="empty">{err}</div>}
          {!url && !err && <div className="empty">Loading the guide…</div>}
          {url && <iframe key={page} ref={frame} className="guide-frame" src={at} title="NeoStay Insights guide" />}
          {url && <div className="note">If the guide does not show above (some browsers and tablets cannot show a PDF inside a page), use <b>Open in a new tab</b> or <b>Download PDF</b>. The PDF also has bookmarks for every section.</div>}
          <div className="note">The guide describes the data as it was when it was written; the pages of the app always show the latest numbers.
            Please do not forward it outside the team: it shows results from real babies.</div>
        </Card>
      </div>
    </>
  );
}
