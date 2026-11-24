import { useEffect, useState } from "react";
import { Card, PageHead } from "../ui";
import { loadFile } from "../files";
import type { Props } from "../App";

/* The plain-language guide (docs/neostay/insights-brief in acuity-models): every page of the app, why it is
   there and what it means for doctors and for hospital management, with screenshots. Shown in the page and
   offered as a download. On the hosted site it is encrypted like the data. */

const PARTS = [
  ["Start", "How to open the app, the words used, and the Overview page."],
  ["Part 1 · Babies", "Who the babies are, how long they stay, breathing, feeding and growth."],
  ["Part 2 · Nurses", "The bedside nurses the babies' ratios call for, shift by shift."],
  ["Part 3 · Babies & nurses", "What sets a baby's ratio and which babies take most of the nursing."],
  ["Part 4 · Counts", "Stays and their length, care, admissions and census, nursing by skill, nurse shifts."],
  ["Part 5 · Synthetic data", "Computer-made babies: how realistic and how safe they are."],
  ["Part 6 · Predictions", "The scorecard: how good each prediction is today, in plain scores."],
  ["Part 7 · Centers 1–5", "Made-up what-if units and what they show about beds and staffing."],
  ["Part 8 · Limits", "What the results cannot tell us, and what we ask of you."],
];

export default function Guide(_: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    loadFile("guide.pdf")
      .then((b) => { made = URL.createObjectURL(b); setUrl(made); })
      .catch(() => setErr("The guide could not be loaded. Reload the page, or sign out and sign in again."));
    return () => { if (made) URL.revokeObjectURL(made); };
  }, []);
  return (
    <>
      <PageHead eyebrow="Start" title="Guide"
        lead="A plain-language guide to every page of this app: what each result shows, why it is here, what we found, and what it means for doctors and for hospital management and nurse managers, with screenshots." />
      <div className="grid">
        <Card wide title="NeoStay Insights: the results guide" sub="PDF · for doctors, hospital management and nurse managers · planning support, not for decisions about one baby"
          right={url ? <div className="row">
            <a className="btn" href={url} target="_blank" rel="noopener">Open in a new tab</a>
            <a className="btn" href={url} download="NeoStay-Insights-Guide.pdf">Download PDF</a>
          </div> : undefined}>
          <div className="guide-parts">{PARTS.map(([t, d]) => <div key={t}><b>{t}</b><span>{d}</span></div>)}</div>
          {err && <div className="empty">{err}</div>}
          {!url && !err && <div className="empty">Loading the guide…</div>}
          {url && <iframe className="guide-frame" src={url} title="NeoStay Insights guide" />}
          {url && <div className="note">If the guide does not show above (some browsers and tablets cannot show a PDF inside a page), use <b>Open in a new tab</b> or <b>Download PDF</b>.</div>}
          <div className="note">The guide describes the data as it was when it was written; the pages of the app always show the latest numbers.
            Please do not forward it outside the team: it shows results from real babies.</div>
        </Card>
      </div>
    </>
  );
}
