/* How closely a synthetic set of baby stays matches the real one (Baby stays page), for all babies and for a
   chosen range of gestational age and birth weight.

   Each stay (acuity_insights/build.py: baby_stays) is one unit. Eight measures:
   - share of all babies inside the chosen range (case mix; the chosen range only), absolute difference;
   - gestational age, birth weight, day of life at the first board (stays that began in the data) and length of
     stay (stays that began and ended in the data): Kolmogorov–Smirnov distance, the largest gap between the two
     "share below this value" curves;
   - breathing support, feeding stage and nurse ratio, as shares of all boards of the stays: total variation
     distance, the share of boards that would have to change category for the two mixes to match.

   Chance level: how far apart the two sets could be by chance alone if the synthetic babies were drawn from the
   same population as the real ones. Two sets of the same sizes as the real and synthetic sets are drawn, with
   replacement, from the real stays, and the same distance is computed; 400 draws, seeded, so the numbers are the
   same every time. The 95th percentile is the chance level. A distance at or below it: as close as two samples of
   real babies; up to twice it: close; above: different. */

export type Run = [number, number | null];
export type Baby = [number, number, number, number, number, number, Run[], Run[], Run[]];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function ks(a: number[], b: number[]): number {
  if (!a.length || !b.length) return NaN;
  const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
  let i = 0, j = 0, d = 0;
  while (i < x.length && j < y.length) {
    const v = Math.min(x[i], y[j]);
    while (i < x.length && x[i] <= v) i++;
    while (j < y.length && y[j] <= v) j++;
    d = Math.max(d, Math.abs(i / x.length - j / y.length));
  }
  return d;
}

/* Boards spent in each category, from a stay's runs. */
function counts(b: Baby, which: 6 | 7 | 8, k: number): number[] {
  const out = new Array(k).fill(0), runs = b[which];
  runs.forEach(([o, c], r) => { const end = r + 1 < runs.length ? runs[r + 1][0] : b[3]; if (c != null && c >= 0 && c < k) out[c] += end - o; });
  return out;
}
function pooled(vs: number[][], k: number): number[] {
  const s = new Array(k).fill(0);
  vs.forEach((v) => v.forEach((x, i) => { s[i] += x; }));
  const z = s.reduce((a, b) => a + b, 0);
  return z ? s.map((x) => x / z) : s;
}
export const tvd = (p: number[], q: number[]) => p.reduce((a, x, i) => a + Math.abs(x - q[i]), 0) / 2;

export type Measure = { key: string; label: string; kind: "share" | "ks" | "tvd"; real: string; synth: string; d: number; floor: number;
  verdict: "match" | "close" | "different" | "few"; nReal: number; nSynth: number; detail?: string };

type Feats = { ga: number[]; bw: number[]; dol: number[]; los: number[]; resp: number[][]; feed: number[][]; ratio: number[][] };
const feats = (rows: Baby[], kResp: number, kFeed: number, kRatio: number): Feats => ({
  ga: rows.map((b) => b[0]), bw: rows.map((b) => b[1]),
  dol: rows.filter((b) => !b[4]).map((b) => b[2]),
  los: rows.filter((b) => !b[4] && !b[5]).map((b) => b[3] / 2),
  resp: rows.map((b) => counts(b, 6, kResp)), feed: rows.map((b) => counts(b, 7, kFeed)), ratio: rows.map((b) => counts(b, 8, kRatio)),
});

const med = (v: number[]) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const draw = (pool: Baby[], n: number, u: () => number) => Array.from({ length: n }, () => pool[Math.floor(u() * pool.length)]);
const verdictOf = (d: number, f: number, nReal: number): Measure["verdict"] => (nReal < 10 || !Number.isFinite(d) ? "few" : d <= f + 1e-12 ? "match" : d <= 2 * f ? "close" : "different");

/* Compare `synth` with `real` (both already filtered to the range), with the whole real and synthetic sets for the
   case-mix share. `inRange` tells whether a stay is in the chosen range (null for "all babies"). */
export function compare(real: Baby[], synth: Baby[], allReal: Baby[], allSynth: Baby[], inRange: ((b: Baby) => boolean) | null,
  names: { modes: string[]; stages: string[]; ratios: string[] }, fmt: { days: (x: number) => string; ga: (x: number) => string; g: (x: number) => string },
  draws = 400, seed = 7): Measure[] {
  const K = [names.modes.length, names.stages.length, names.ratios.length] as const;
  const R = feats(real, ...K), S = feats(synth, ...K);
  const u = rng(seed);
  const nulls: Record<string, number[]> = { share: [], ga: [], bw: [], dol: [], los: [], resp: [], feed: [], ratio: [] };
  for (let t = 0; t < draws; t++) {
    if (real.length) {
      const a = feats(draw(real, real.length, u), ...K), b = feats(draw(real, synth.length || real.length, u), ...K);
      nulls.ga.push(ks(a.ga, b.ga)); nulls.bw.push(ks(a.bw, b.bw)); nulls.dol.push(ks(a.dol, b.dol)); nulls.los.push(ks(a.los, b.los));
      nulls.resp.push(tvd(pooled(a.resp, K[0]), pooled(b.resp, K[0]))); nulls.feed.push(tvd(pooled(a.feed, K[1]), pooled(b.feed, K[1])));
      nulls.ratio.push(tvd(pooled(a.ratio, K[2]), pooled(b.ratio, K[2])));
    }
    if (inRange) {
      const a = draw(allReal, allReal.length, u), b = draw(allReal, allSynth.length, u);
      nulls.share.push(Math.abs(a.filter(inRange).length / a.length - b.filter(inRange).length / b.length));
    }
  }
  const q95 = (v: number[]) => { const s = v.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(0.95 * (s.length - 1))] : NaN; };
  const out: Measure[] = [];
  const add = (key: string, label: string, kind: Measure["kind"], real_: string, synth_: string, d: number, nR: number, nS: number, detail?: string) =>
    out.push({ key, label, kind, real: real_, synth: synth_, d, floor: q95(nulls[key]), verdict: verdictOf(d, q95(nulls[key]), nR), nReal: nR, nSynth: nS, detail });
  if (inRange) {
    const sr = real.length / Math.max(1, allReal.length), ss = synth.length / Math.max(1, allSynth.length);
    add("share", "Share of all babies in this range", "share", `${(100 * sr).toFixed(1)}%`, `${(100 * ss).toFixed(1)}%`, Math.abs(sr - ss), allReal.length, allSynth.length);
  }
  add("ga", "Gestational age at birth", "ks", `median ${fmt.ga(med(R.ga))}`, `median ${fmt.ga(med(S.ga))}`, ks(R.ga, S.ga), R.ga.length, S.ga.length);
  add("bw", "Birth weight", "ks", `median ${fmt.g(med(R.bw))}`, `median ${fmt.g(med(S.bw))}`, ks(R.bw, S.bw), R.bw.length, S.bw.length);
  add("dol", "Day of life at the first board", "ks", `median ${fmt.days(med(R.dol))}`, `median ${fmt.days(med(S.dol))}`, ks(R.dol, S.dol), R.dol.length, S.dol.length);
  add("los", "Length of stay", "ks", `median ${fmt.days(med(R.los))}`, `median ${fmt.days(med(S.los))}`, ks(R.los, S.los), R.los.length, S.los.length);
  const cat = (key: "resp" | "feed" | "ratio", label: string, k: number, labels: string[]) => {
    const p = pooled(R[key], k), q = pooled(S[key], k);
    let m = 0;
    p.forEach((x, i) => { if (Math.abs(x - q[i]) > Math.abs(p[m] - q[m])) m = i; });
    add(key, label, "tvd", `${labels[m]} ${(100 * p[m]).toFixed(0)}%`, `${labels[m]} ${(100 * q[m]).toFixed(0)}%`, tvd(p, q), real.length, synth.length,
      `largest gap: ${labels[m]}`);
  };
  cat("resp", "Breathing support (share of boards)", K[0], names.modes);
  cat("feed", "Feeding stage (share of boards)", K[1], names.stages);
  cat("ratio", "Nurse ratio (share of boards)", K[2], names.ratios);
  return out;
}
