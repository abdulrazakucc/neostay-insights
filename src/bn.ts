/* Discrete Bayesian network: learning and exact reasoning in the browser (Bayesian network page).

   Data: a dataset file from acuity_insights/bayes.py — distinct patterns of states (one character per
   variable, "." = unknown) with their counts; each counted unit is one baby-shift.
   Learning: for each variable, a conditional probability table P(variable | its parents), counted over the
   baby-shifts where the variable and all its parents are known, with a Dirichlet (BDeu) prior of equivalent
   sample size ESS spread evenly over the table, so no probability is exactly 0 or 1.
   Scoring: log-likelihood and BIC with the maximum-likelihood estimates; the strength of an arrow is how much
   the BIC of its child gets worse when the arrow is removed.
   Reasoning: exact inference by variable elimination (no sampling), so every answer is reproducible.
   Also: per-baby counting (each stay weighs 1, from the file's weights), 95% plausible ranges (Dirichlet
   posterior draws of every table, each answered exactly), how much of an answer rests on parent combinations
   never seen in the data, the most likely full picture (max-product variable elimination with backtracking),
   and a test on held-out rows (accuracy, log loss, Brier score, AUC against simple baselines). */

export type Variable = { id: string; label: string; states: string[]; desc: string; source: string; missing: number };
export type Preset = { role: "doctor" | "manager"; q: string; ev: Record<string, string>; t: string[] };
export type TeamNet = { nodes: string[]; edges: [string, string][]; pos?: Record<string, { x: number; y: number }>; note?: string; agreed?: string };
export type Dataset = { network?: "baby" | "unit"; kind: string; center: string; center_name: string; generated: string; unit: string; n: number; stays: number;
  variables: Variable[]; default_edges: [string, string][]; default_nodes?: string[]; layout: Record<string, [number, number]>; tiers?: Record<string, number>;
  presets?: Preset[]; team?: TeamNet | null; test?: { days: number; first_date: string; dev_n: number; test_n: number; dev_stays?: number; test_stays?: number } | null;
  test_targets?: string[]; persist?: Record<string, string>;
  patterns: string[]; counts: number[]; weights?: number[]; counts_dev?: number[]; counts_test?: number[] };
export type Edge = [string, string];
export type Cpt = { node: string; parents: string[]; probs: Float64Array; counts: Float64Array; rowN: Float64Array; used: number; alpha: number };
export type Model = { nodes: string[]; edges: Edge[]; cpts: Record<string, Cpt>; ess: number; bic: number; logLik: number;
  nodeBic: Record<string, number>; edgeStrength: Record<string, number>; learnedAt: string };
export type Evidence = Record<string, number>;

const DIG = "0123456789abcdefghijklmnopqrstuvwxyz";

export type CountBy = "counts" | "weights" | "counts_dev" | "counts_test";

/* Decode the patterns once: a row-major Int8Array (-1 = unknown) and the counts. */
export function decode(ds: Dataset) {
  const V = ds.variables.length, P = ds.patterns.length;
  const rows = new Int8Array(P * V);
  for (let p = 0; p < P; p++) {
    const s = ds.patterns[p];
    for (let v = 0; v < V; v++) rows[p * V + v] = s[v] === "." ? -1 : DIG.indexOf(s[v]);
  }
  return { rows, counts: Float64Array.from(ds.counts), V, P, index: Object.fromEntries(ds.variables.map((v, i) => [v.id, i])) as Record<string, number> };
}
export type Decoded = ReturnType<typeof decode>;

/* The same decoded rows with another count per pattern: each baby-shift (counts), each baby equally (weights:
   1 / the stay's baby-shifts), or the development / test part of the holdout split. */
export function withCounts(d: Decoded, ds: Dataset, by: CountBy): Decoded {
  const arr = ds[by];
  if (by === "counts" || !arr) return d;
  return { ...d, counts: Float64Array.from(arr) };
}

export const parentsOf = (node: string, edges: Edge[]) => edges.filter((e) => e[1] === node).map((e) => e[0]);

/* Would adding from -> to close a loop? (Is `from` reachable from `to`?) */
export function makesCycle(edges: Edge[], from: string, to: string): boolean {
  if (from === to) return true;
  const out: Record<string, string[]> = {};
  for (const [a, b] of edges) (out[a] ||= []).push(b);
  const seen = new Set<string>(), stack = [to];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === from) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    for (const y of out[x] || []) stack.push(y);
  }
  return false;
}

/* Counts of node x parent configurations (row = parent configuration in mixed radix, last parent fastest). */
function countTable(d: Decoded, ds: Dataset, node: string, parents: string[]) {
  const vi = d.index[node], r = ds.variables[vi].states.length;
  const pi = parents.map((p) => d.index[p]);
  const pr = pi.map((i) => ds.variables[i].states.length);
  const q = pr.reduce((a, b) => a * b, 1);
  const counts = new Float64Array(q * r);
  let used = 0;
  outer: for (let p = 0; p < d.P; p++) {
    const base = p * d.V;
    const x = d.rows[base + vi];
    if (x < 0) continue;
    let j = 0;
    for (let k = 0; k < pi.length; k++) {
      const s = d.rows[base + pi[k]];
      if (s < 0) continue outer;
      j = j * pr[k] + s;
    }
    counts[j * r + x] += d.counts[p];
    used += d.counts[p];
  }
  return { counts, q, r, used };
}

function scoreOf(counts: Float64Array, q: number, r: number, used: number) {
  let ll = 0;
  for (let j = 0; j < q; j++) {
    let nj = 0;
    for (let k = 0; k < r; k++) nj += counts[j * r + k];
    if (!nj) continue;
    for (let k = 0; k < r; k++) { const c = counts[j * r + k]; if (c) ll += c * Math.log(c / nj); }
  }
  const bic = ll - 0.5 * q * (r - 1) * Math.log(Math.max(used, 1));
  return { ll, bic };
}

export function learn(ds: Dataset, d: Decoded, nodes: string[], edges: Edge[], ess = 1): Model {
  const cpts: Record<string, Cpt> = {}, nodeBic: Record<string, number> = {}, edgeStrength: Record<string, number> = {};
  let bic = 0, logLik = 0;
  for (const node of nodes) {
    const parents = parentsOf(node, edges);
    const { counts, q, r, used } = countTable(d, ds, node, parents);
    const a = ess / (q * r);
    const probs = new Float64Array(q * r), rowN = new Float64Array(q);
    for (let j = 0; j < q; j++) {
      let nj = 0;
      for (let k = 0; k < r; k++) nj += counts[j * r + k];
      rowN[j] = nj;
      for (let k = 0; k < r; k++) probs[j * r + k] = (counts[j * r + k] + a) / (nj + a * r);
    }
    cpts[node] = { node, parents, probs, counts, rowN, used, alpha: a };
    const sc = scoreOf(counts, q, r, used);
    nodeBic[node] = sc.bic; bic += sc.bic; logLik += sc.ll;
    for (const p of parents) {
      // BIC with and without this parent, on the same baby-shifts (those where the removed parent is known too).
      edgeStrength[`${p}>${node}`] = sc.bic - scoreOfSameRows(d, ds, node, parents.filter((x) => x !== p), p);
    }
  }
  return { nodes, edges, cpts, ess, bic, logLik, nodeBic, edgeStrength, learnedAt: new Date().toLocaleString() };
}

/* BIC of node | rest, counted on the rows where `also` is known too (so both scores use the same rows). */
function scoreOfSameRows(d: Decoded, ds: Dataset, node: string, rest: string[], also: string) {
  const vi = d.index[node], r = ds.variables[vi].states.length;
  const pi = rest.map((p) => d.index[p]), pr = pi.map((i) => ds.variables[i].states.length), ai = d.index[also];
  const q = pr.reduce((a, b) => a * b, 1);
  const counts = new Float64Array(q * r);
  let used = 0;
  outer: for (let p = 0; p < d.P; p++) {
    const base = p * d.V;
    const x = d.rows[base + vi];
    if (x < 0 || d.rows[base + ai] < 0) continue;
    let j = 0;
    for (let k = 0; k < pi.length; k++) { const s = d.rows[base + pi[k]]; if (s < 0) continue outer; j = j * pr[k] + s; }
    counts[j * r + x] += d.counts[p];
    used += d.counts[p];
  }
  return scoreOf(counts, q, r, used).bic;
}

// ---------------------------------------------------------------- exact inference (variable elimination)
type Factor = { vars: number[]; card: number[]; vals: Float64Array };

function cptFactor(m: Model, ds: Dataset, idx: Record<string, number>, node: string): Factor {
  const c = m.cpts[node];
  const vars = [...c.parents.map((p) => idx[p]), idx[node]];
  const card = vars.map((v) => ds.variables[v].states.length);
  return { vars, card, vals: Float64Array.from(c.probs) };   // layout: parents (last fastest), then node fastest
}

function strides(card: number[]) {
  const s = new Array(card.length).fill(1);
  for (let i = card.length - 2; i >= 0; i--) s[i] = s[i + 1] * card[i + 1];
  return s;
}

function reduce(f: Factor, ev: Map<number, number>): Factor {
  const keep = f.vars.map((v, i) => [v, i] as const).filter(([v]) => !ev.has(v));
  if (keep.length === f.vars.length) return f;
  const st = strides(f.card);
  const card = keep.map(([, i]) => f.card[i]);
  const out = new Float64Array(card.reduce((a, b) => a * b, 1));
  const nst = strides(card);
  for (let o = 0; o < out.length; o++) {
    let off = 0, rem = o;
    keep.forEach(([, i], k) => { const s = Math.floor(rem / nst[k]); rem -= s * nst[k]; off += s * st[i]; });
    f.vars.forEach((v, i) => { if (ev.has(v)) off += ev.get(v)! * st[i]; });
    out[o] = f.vals[off];
  }
  return { vars: keep.map(([v]) => v), card, vals: out };
}

function multiply(a: Factor, b: Factor): Factor {
  const vars = [...a.vars];
  const card = [...a.card];
  b.vars.forEach((v, i) => { if (!vars.includes(v)) { vars.push(v); card.push(b.card[i]); } });
  const st = strides(card), sa = strides(a.card), sb = strides(b.card);
  const ia = a.vars.map((v) => vars.indexOf(v)), ib = b.vars.map((v) => vars.indexOf(v));
  const out = new Float64Array(card.reduce((x, y) => x * y, 1));
  const asg = new Array(vars.length).fill(0);
  for (let o = 0; o < out.length; o++) {
    let rem = o;
    for (let k = 0; k < vars.length; k++) { asg[k] = Math.floor(rem / st[k]); rem -= asg[k] * st[k]; }
    let oa = 0, ob = 0;
    for (let k = 0; k < ia.length; k++) oa += asg[ia[k]] * sa[k];
    for (let k = 0; k < ib.length; k++) ob += asg[ib[k]] * sb[k];
    out[o] = a.vals[oa] * b.vals[ob];
  }
  return { vars, card, vals: out };
}

function sumOut(f: Factor, v: number): Factor {
  const i = f.vars.indexOf(v);
  const vars = f.vars.filter((_, k) => k !== i), card = f.card.filter((_, k) => k !== i);
  const st = strides(f.card), nst = strides(card);
  const out = new Float64Array(card.reduce((a, b) => a * b, 1));
  for (let o = 0; o < f.vals.length; o++) {
    let rem = o, off = 0, kk = 0;
    for (let k = 0; k < f.vars.length; k++) {
      const s = Math.floor(rem / st[k]); rem -= s * st[k];
      if (k !== i) { off += s * nst[kk]; kk++; }
    }
    out[off] += f.vals[o];
  }
  return { vars, card, vals: out };
}

function maxOut(f: Factor, v: number): { f: Factor; arg: Int32Array } {
  const i = f.vars.indexOf(v);
  const vars = f.vars.filter((_, k) => k !== i), card = f.card.filter((_, k) => k !== i);
  const st = strides(f.card), nst = strides(card);
  const out = new Float64Array(card.reduce((a, b) => a * b, 1)).fill(-1), arg = new Int32Array(out.length);
  for (let o = 0; o < f.vals.length; o++) {
    let rem = o, off = 0, kk = 0, sv = 0;
    for (let k = 0; k < f.vars.length; k++) {
      const s = Math.floor(rem / st[k]); rem -= s * st[k];
      if (k !== i) { off += s * nst[kk]; kk++; } else sv = s;
    }
    if (f.vals[o] > out[off]) { out[off] = f.vals[o]; arg[off] = sv; }
  }
  return { f: { vars, card, vals: out }, arg };
}

const indexOfVars = (ds: Dataset): Record<string, number> => Object.fromEntries(ds.variables.map((v, i) => [v.id, i]));

/* The variables an answer about `keep` given the evidence can depend on: those and their ancestors. Every other
   variable's table sums to 1 when it is summed out, so it is left out (this changes nothing in the answer). */
function relevant(m: Model, keep: string[], evidence: Evidence): string[] {
  const need = new Set<string>(), stack = [...keep, ...Object.keys(evidence).filter((k) => m.nodes.includes(k))];
  while (stack.length) {
    const x = stack.pop()!;
    if (need.has(x)) continue;
    need.add(x);
    for (const p of m.cpts[x]?.parents ?? []) stack.push(p);
  }
  return m.nodes.filter((n) => need.has(n));
}

function evidenceMap(m: Model, idx: Record<string, number>, evidence: Evidence) {
  return new Map<number, number>(Object.entries(evidence).filter(([k]) => m.nodes.includes(k)).map(([k, s]) => [idx[k], s]));
}

/* Variable elimination with a greedy smallest-factor order. mode "sum" marginalises; "max" maximises and keeps,
   per eliminated variable, its best value for every setting of the variables it was combined with. */
function eliminate(factors: Factor[], elim: Set<number>, ds: Dataset, mode: "sum" | "max") {
  const trace: { v: number; vars: number[]; card: number[]; arg: Int32Array }[] = [];
  while (elim.size) {
    let best = -1, bestSize = Infinity;
    for (const v of elim) {
      const vs = new Set<number>();
      for (const f of factors) if (f.vars.includes(v)) f.vars.forEach((x) => vs.add(x));
      let size = 1; vs.forEach((x) => { size *= ds.variables[x].states.length; });
      if (size < bestSize) { bestSize = size; best = v; }
    }
    const touch = factors.filter((f) => f.vars.includes(best)), rest = factors.filter((f) => !f.vars.includes(best));
    elim.delete(best);
    if (!touch.length) continue;
    let prod = touch[0];
    for (let k = 1; k < touch.length; k++) prod = multiply(prod, touch[k]);
    if (mode === "sum") factors = [...rest, sumOut(prod, best)];
    else { const r = maxOut(prod, best); trace.push({ v: best, vars: r.f.vars, card: r.f.card, arg: r.arg }); factors = [...rest, r.f]; }
  }
  let res: Factor = { vars: [], card: [], vals: Float64Array.of(1) };
  for (const f of factors) res = multiply(res, f);
  return { res, trace };
}

/* P(keep | evidence) as one table over the variables in `keep` that are not evidence (normalised). */
export function posterior(m: Model, ds: Dataset, keep: string[], evidence: Evidence): Factor & { pe: number } {
  const idx = indexOfVars(ds);
  const ev = evidenceMap(m, idx, evidence);
  const nodes = relevant(m, keep, evidence);
  const factors = nodes.map((n) => reduce(cptFactor(m, ds, idx, n), ev));
  const keepIds = new Set(keep.map((k) => idx[k]).filter((v) => !ev.has(v)));
  const { res } = eliminate(factors, new Set(nodes.map((n) => idx[n]).filter((v) => !keepIds.has(v) && !ev.has(v))), ds, "sum");
  // Reorder to the order of `keep` (variables missing from the result, e.g. not in the network, are uniform).
  const vars = [...keepIds], card = vars.map((v) => ds.variables[v].states.length), nst = strides(card);
  const out = new Float64Array(card.reduce((a, b) => a * b, 1));
  const st = strides(res.card);
  for (let o = 0; o < out.length; o++) {
    let rem = o, off = 0;
    for (let k = 0; k < vars.length; k++) {
      const s = Math.floor(rem / nst[k]); rem -= s * nst[k];
      const j = res.vars.indexOf(vars[k]);
      if (j >= 0) off += s * st[j];
    }
    out[o] = res.vals[off];
  }
  const z = out.reduce((a, b) => a + b, 0);
  for (let o = 0; o < out.length; o++) out[o] = z > 0 ? out[o] / z : 1 / out.length;
  return { vars, card, vals: out, pe: z };
}

/* P(target | evidence) by variable elimination with a greedy smallest-factor order. */
export function query(m: Model, ds: Dataset, target: string, evidence: Evidence): Float64Array {
  const idx = indexOfVars(ds), t = idx[target], r = ds.variables[t].states.length;
  if (target in evidence && m.nodes.includes(target)) { const o = new Float64Array(r); o[evidence[target]] = 1; return o; }
  if (!m.nodes.includes(target)) return new Float64Array(r).fill(1 / r);
  return Float64Array.from(posterior(m, ds, [target], evidence).vals);
}

/* The most likely full picture: the single combination of every unknown variable in the network with the
   highest probability given the evidence (max-product variable elimination, then backtracking), and that
   probability. Ties go to the first state. */
export function mostLikely(m: Model, ds: Dataset, evidence: Evidence): { assign: Record<string, number>; prob: number } {
  const idx = indexOfVars(ds);
  const ev = evidenceMap(m, idx, evidence);
  const factors = m.nodes.map((n) => reduce(cptFactor(m, ds, idx, n), ev));
  const free = m.nodes.map((n) => idx[n]).filter((v) => !ev.has(v));
  const { res, trace } = eliminate(factors, new Set(free), ds, "max");
  const best = res.vals[0];
  const val = new Map<number, number>();
  for (let k = trace.length - 1; k >= 0; k--) {
    const t = trace[k], st = strides(t.card);
    let off = 0;
    t.vars.forEach((v, i) => { off += (val.get(v) ?? 0) * st[i]; });
    val.set(t.v, t.arg[off]);
  }
  const pe = probabilityOf(m, ds, evidence);
  const assign: Record<string, number> = {};
  for (const v of free) assign[ds.variables[v].id] = val.get(v) ?? 0;
  return { assign, prob: pe > 0 ? best / pe : 0 };
}

/* P(evidence) under the network (1 with no evidence). */
export function probabilityOf(m: Model, ds: Dataset, evidence: Evidence): number {
  const idx = indexOfVars(ds);
  const ev = evidenceMap(m, idx, evidence);
  const nodes = relevant(m, [], evidence);
  const factors = nodes.map((n) => reduce(cptFactor(m, ds, idx, n), ev));
  return eliminate(factors, new Set(nodes.map((n) => idx[n]).filter((v) => !ev.has(v))), ds, "sum").res.vals[0];
}

/* How much of an answer rests on table rows with no data (or fewer than `thin` cases): for every variable the
   answer depends on, the chance, given the evidence, that its parents are in such a combination. Those rows hold
   the prior's equal chances (no data) or few cases. Returns the variables with any such share, largest first. */
export function gaps(m: Model, ds: Dataset, targets: string[], evidence: Evidence, thin = 20) {
  const idx = indexOfVars(ds);
  const out: { node: string; unseen: number; few: number }[] = [];
  for (const node of relevant(m, targets, evidence)) {
    const c = m.cpts[node];
    if (!c.parents.length) continue;
    const pr = c.parents.map((p) => ds.variables[idx[p]].states.length);
    const free = c.parents.filter((p) => !(p in evidence));
    const post = free.length ? posterior(m, ds, free, evidence) : { vars: [] as number[], card: [] as number[], vals: Float64Array.of(1) };
    const nst = strides(post.card);
    let unseen = 0, few = 0;
    for (let o = 0; o < post.vals.length; o++) {
      if (!post.vals[o]) continue;
      const val: Record<string, number> = {};
      let rem = o;
      post.vars.forEach((v, k) => { const s = Math.floor(rem / nst[k]); rem -= s * nst[k]; val[ds.variables[v].id] = s; });
      let j = 0;
      c.parents.forEach((p, k) => { j = j * pr[k] + (p in evidence ? evidence[p] : val[p]); });
      if (c.rowN[j] === 0) unseen += post.vals[o];
      if (c.rowN[j] < thin) few += post.vals[o];
    }
    if (few > 0.0005) out.push({ node, unseen, few });
  }
  return out.sort((a, b) => b.unseen - a.unseen || b.few - a.few);
}

/* ---------------------------------------------------------------- 95% plausible ranges */
/* A seeded random number generator (mulberry32), so the ranges are the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normal(u: () => number) {
  let x = 0;
  while (!x) x = u();
  return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u());
}
/* Gamma(shape, 1) by Marsaglia and Tsang (2000); shapes below 1 use the boost Gamma(a+1)·U^(1/a). */
function gamma(a: number, u: () => number): number {
  if (a < 1) { const g = gamma(a + 1, u); let x = 0; while (!x) x = u(); return g * Math.pow(x, 1 / a); }
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(u); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const w = u();
    if (w < 1 - 0.0331 * x * x * x * x || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/* One draw of every table from its posterior Dirichlet(counts + prior). */
function drawModel(m: Model, u: () => number, only: string[]): Model {
  const cpts: Record<string, Cpt> = { ...m.cpts };
  for (const n of only) {
    const c = m.cpts[n], r = c.probs.length / c.rowN.length, probs = new Float64Array(c.probs.length);
    for (let j = 0; j < c.rowN.length; j++) {
      let z = 0;
      for (let k = 0; k < r; k++) { const g = gamma(c.counts[j * r + k] + c.alpha, u); probs[j * r + k] = g; z += g; }
      for (let k = 0; k < r; k++) probs[j * r + k] = z > 0 ? probs[j * r + k] / z : 1 / r;
    }
    cpts[n] = { ...c, probs };
  }
  return { ...m, cpts };
}

/* 95% plausible range of every chance of each target: the 2.5th and 97.5th percentiles over `draws` networks
   whose tables are drawn from their posteriors; each draw is answered exactly. The ranges show how much the
   chances could move with other data of the same size; they assume the counted units are independent. */
export function ranges(m: Model, ds: Dataset, targets: string[], evidence: Evidence, draws = 200, seed = 1) {
  const u = rng(seed), need = relevant(m, targets, evidence);
  const vals: Record<string, number[][]> = Object.fromEntries(targets.map((t) => [t, ds.variables[indexOfVars(ds)[t]].states.map(() => [] as number[])]));
  for (let s = 0; s < draws; s++) {
    const dm = drawModel(m, u, need);
    for (const t of targets) query(dm, ds, t, evidence).forEach((p, k) => vals[t][k].push(p));
  }
  const pct = (a: number[], q: number) => { const b = a.slice().sort((x, y) => x - y); const i = (b.length - 1) * q, lo = Math.floor(i); return b[lo] + (b[Math.min(lo + 1, b.length - 1)] - b[lo]) * (i - lo); };
  return Object.fromEntries(targets.map((t) => [t, { lo: vals[t].map((a) => pct(a, 0.025)), hi: vals[t].map((a) => pct(a, 0.975)) }]));
}

/* ---------------------------------------------------------------- test on held-out rows */
export type TestResult = { n: number; rows: number; accuracy: number; logLoss: number; brier: number; auc: number | null;
  base: { accuracy: number; logLoss: number; brier: number; auc: number | null }; persist: { accuracy: number } | null };

/* Weighted AUC: the chance that a random positive scores above a random negative (ties count half). */
export function auc(scores: number[], pos: boolean[], w: number[]): number | null {
  const ord = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  let P = 0, N = 0;
  for (let i = 0; i < pos.length; i++) { if (pos[i]) P += w[i]; else N += w[i]; }
  if (!P || !N) return null;
  let below = 0, sum = 0;
  for (let i = 0; i < ord.length;) {
    let j = i, p = 0, n = 0;
    while (j < ord.length && scores[ord[j]] === scores[ord[i]]) { if (pos[ord[j]]) p += w[ord[j]]; else n += w[ord[j]]; j++; }
    sum += p * (below + n / 2);
    below += n;
    i = j;
  }
  return sum / (P * N);
}

/* Score the network's chances for `target` on the test rows (counts_test). The evidence for each row is what
   was known at the time: the variables in the network with an earlier time tier than the target, where
   recorded. Baselines: the development rows' shares of the target (base rate), and, where the data file names
   one, "the same as now" (e.g. tomorrow's ratio = today's ratio). Binary targets also get the AUC for state 1. */
export function evaluate(m: Model, ds: Dataset, dTest: Decoded, target: string, base: ArrayLike<number>): TestResult {
  const idx = indexOfVars(ds), ti = idx[target], r = ds.variables[ti].states.length, tiers = ds.tiers ?? {};
  const evVars = m.nodes.filter((n) => n !== target && (tiers[n] ?? 0) < (tiers[target] ?? 0)).map((n) => idx[n]);
  const nowVar = ds.persist?.[target] != null ? idx[ds.persist[target]] : -1;
  const cache = new Map<string, Float64Array>();
  let n = 0, rows = 0, acc = 0, ll = 0, br = 0, bAcc = 0, bLl = 0, bBr = 0, pAcc = 0, pN = 0;
  const bArg = Array.from(base).indexOf(Math.max(...Array.from(base)));
  const sc: number[] = [], bs: number[] = [], ps: boolean[] = [], ws: number[] = [];
  for (let p = 0; p < dTest.P; p++) {
    const w = dTest.counts[p];
    if (!w) continue;
    const off = p * dTest.V, y = dTest.rows[off + ti];
    if (y < 0) continue;
    const ev: Evidence = {};
    let key = "";
    for (const v of evVars) { const s = dTest.rows[off + v]; if (s >= 0) { ev[ds.variables[v].id] = s; key += `${v}:${s},`; } }
    let pr = cache.get(key);
    if (!pr) { pr = query(m, ds, target, ev); cache.set(key, pr); }
    let arg = 0;
    for (let k = 1; k < r; k++) if (pr[k] > pr[arg]) arg = k;
    n += w; rows++;
    acc += w * (arg === y ? 1 : 0);
    ll += -w * Math.log(Math.max(pr[y], 1e-15));
    bAcc += w * (bArg === y ? 1 : 0);
    bLl += -w * Math.log(Math.max(base[y], 1e-15));
    let b1 = 0, b2 = 0;
    for (let k = 0; k < r; k++) { b1 += (pr[k] - (k === y ? 1 : 0)) ** 2; b2 += (base[k] - (k === y ? 1 : 0)) ** 2; }
    br += w * b1; bBr += w * b2;
    if (nowVar >= 0) { const now = dTest.rows[off + nowVar]; if (now >= 0) { pAcc += w * (now === y ? 1 : 0); pN += w; } }
    if (r === 2) { sc.push(pr[1]); bs.push(base[1]); ps.push(y === 1); ws.push(w); }
  }
  return { n, rows, accuracy: acc / n, logLoss: ll / n, brier: br / n, auc: r === 2 ? auc(sc, ps, ws) : null,
    base: { accuracy: bAcc / n, logLoss: bLl / n, brier: bBr / n, auc: r === 2 ? 0.5 : null },
    persist: nowVar >= 0 && pN ? { accuracy: pAcc / pN } : null };
}

/* How many baby-shifts in the data match the evidence, and how the target was spread among them. */
export function observed(d: Decoded, ds: Dataset, target: string, evidence: Evidence) {
  const ti = d.index[target], r = ds.variables[ti].states.length;
  const ev = Object.entries(evidence).map(([k, s]) => [d.index[k], s] as const);
  const dist = new Float64Array(r);
  let match = 0, known = 0;
  for (let p = 0; p < d.P; p++) {
    const base = p * d.V;
    if (!ev.every(([i, s]) => d.rows[base + i] === s)) continue;
    match += d.counts[p];
    const x = d.rows[base + ti];
    if (x >= 0) { dist[x] += d.counts[p]; known += d.counts[p]; }
  }
  if (known) for (let k = 0; k < r; k++) dist[k] /= known;
  return { match, known, dist };
}

/* Plain-language strength of an arrow, from the change in BIC when it is removed. The conventional BIC
   difference (2 × our log-scale difference) is read on Kass & Raftery's (1995) scale: 0–2 barely worth a
   mention, 2–6 positive, 6–10 strong, above 10 very strong; below 0 the data prefer the network without it. */
export function strengthWord(s: number | undefined): { word: string; cls: string } {
  if (s == null) return { word: "not learned yet", cls: "" };
  const b = 2 * s;
  if (b < 0) return { word: "not supported by the data", cls: "bad" };
  if (b < 2) return { word: "barely supported", cls: "warn" };
  if (b < 6) return { word: "positive support", cls: "info" };
  if (b < 10) return { word: "strong support", cls: "good" };
  return { word: "very strong support", cls: "good" };
}

export type Suggestion = { op: "add" | "remove" | "reverse"; from: string; to: string; gain: number; edges: Edge[] };

/* Single changes to the current network that the data favour (higher BIC), best first. Arrows never point
   back in time (tiers from the data file) and a variable gets at most `maxParents` parents. */
export function suggest(ds: Dataset, d: Decoded, nodes: string[], edges: Edge[], tiers: Record<string, number>, maxParents = 3, top = 6): Suggestion[] {
  const base = learn(ds, d, nodes, edges, 1);
  const nodeScore = (E: Edge[], n: string) => learn(ds, d, [n], E, 1).bic;   // the BIC is a sum over nodes: only changed nodes move
  const out: Suggestion[] = [];
  const has = (a: string, b: string) => edges.some((e) => e[0] === a && e[1] === b);
  for (const a of nodes) for (const b of nodes) {
    if (a === b) continue;
    if (has(a, b)) {
      const E = edges.filter((e) => !(e[0] === a && e[1] === b));
      out.push({ op: "remove", from: a, to: b, gain: nodeScore(E, b) - base.nodeBic[b], edges: E });
      const R = [...E];
      if ((tiers[b] ?? 0) <= (tiers[a] ?? 0) && !makesCycle(E, b, a) && parentsOf(a, E).length < maxParents) {
        R.push([b, a]);
        out.push({ op: "reverse", from: a, to: b, gain: nodeScore(R, b) - base.nodeBic[b] + nodeScore(R, a) - base.nodeBic[a], edges: R });
      }
    } else if (!has(b, a) && (tiers[a] ?? 0) <= (tiers[b] ?? 0) && !makesCycle(edges, a, b) && parentsOf(b, edges).length < maxParents) {
      const E: Edge[] = [...edges, [a, b]];
      out.push({ op: "add", from: a, to: b, gain: nodeScore(E, b) - base.nodeBic[b], edges: E });
    }
  }
  return out.filter((s) => 2 * s.gain > 2).sort((x, y) => y.gain - x.gain).slice(0, top);
}

/* For each piece of evidence: how the target's chances would look without it (what drives the answer). */
export function influence(m: Model, ds: Dataset, target: string, evidence: Evidence, state: number) {
  const full = query(m, ds, target, evidence)[state];
  return Object.keys(evidence).filter((k) => k !== target).map((k) => {
    const rest = { ...evidence }; delete rest[k];
    return { variable: k, without: query(m, ds, target, rest)[state], withIt: full };
  }).sort((a, b) => Math.abs(b.withIt - b.without) - Math.abs(a.withIt - a.without));
}

/* How closely the network reproduces each variable's spread in the data (total variation distance between
   the network's marginal and the observed shares, among baby-shifts where the variable is known). */
export function fitCheck(m: Model, ds: Dataset, d: Decoded) {
  return m.nodes.map((n) => {
    const model = query(m, ds, n, {}), obs = observed(d, ds, n, {}).dist;
    let tvd = 0;
    for (let k = 0; k < model.length; k++) tvd += Math.abs(model[k] - obs[k]);
    return { node: n, tvd: tvd / 2, model, obs };
  });
}

/* How far apart two distributions over the same states are (real against synthetic answers):
   - total variation distance: ½ Σ |p − q|, the share of babies that would have to change category (0–1);
   - Jensen–Shannon distance: √(½ KL(p‖m) + ½ KL(q‖m)) with m = (p + q)/2 and base-2 logarithms (0–1);
   - Hellinger distance: √(1 − Σ √(p·q)) (0–1);
   - the state with the largest difference. All are 0 for identical distributions. */
export function distances(p: ArrayLike<number>, q: ArrayLike<number>) {
  let tvd = 0, bc = 0, js = 0, maxK = 0, maxD = -1;
  for (let k = 0; k < p.length; k++) {
    const a = p[k], b = q[k], m = (a + b) / 2;
    tvd += Math.abs(a - b);
    bc += Math.sqrt(a * b);
    if (a > 0) js += 0.5 * a * Math.log2(a / m);
    if (b > 0) js += 0.5 * b * Math.log2(b / m);
    if (Math.abs(a - b) > maxD) { maxD = Math.abs(a - b); maxK = k; }
  }
  return { tvd: tvd / 2, jsd: Math.sqrt(Math.max(0, js)), hellinger: Math.sqrt(Math.max(0, 1 - bc)), maxState: maxK, maxDiff: maxD };
}

/* Why an arrow from a to b cannot be added to `edges` (null if it can). */
export function edgeProblem(edges: Edge[], a: string, b: string): "self" | "exists" | "opposite" | "loop" | null {
  if (a === b) return "self";
  if (edges.some((e) => e[0] === a && e[1] === b)) return "exists";
  if (edges.some((e) => e[0] === b && e[1] === a)) return "opposite";
  if (makesCycle(edges, a, b)) return "loop";
  return null;
}
