/* Discrete Bayesian network: learning and exact reasoning in the browser (Bayesian network page).

   Data: a dataset file from acuity_insights/bayes.py — distinct patterns of states (one character per
   variable, "." = unknown) with their counts; each counted unit is one baby-shift.
   Learning: for each variable, a conditional probability table P(variable | its parents), counted over the
   baby-shifts where the variable and all its parents are known, with a Dirichlet (BDeu) prior of equivalent
   sample size ESS spread evenly over the table, so no probability is exactly 0 or 1.
   Scoring: log-likelihood and BIC with the maximum-likelihood estimates; the strength of an arrow is how much
   the BIC of its child gets worse when the arrow is removed.
   Reasoning: exact inference by variable elimination (no sampling), so every answer is reproducible. */

export type Variable = { id: string; label: string; states: string[]; desc: string; source: string; missing: number };
export type Dataset = { kind: string; center: string; center_name: string; generated: string; unit: string; n: number; stays: number;
  variables: Variable[]; default_edges: [string, string][]; layout: Record<string, [number, number]>; tiers?: Record<string, number>; patterns: string[]; counts: number[] };
export type Edge = [string, string];
export type Cpt = { node: string; parents: string[]; probs: Float64Array; counts: Float64Array; rowN: Float64Array; used: number };
export type Model = { nodes: string[]; edges: Edge[]; cpts: Record<string, Cpt>; ess: number; bic: number; logLik: number;
  nodeBic: Record<string, number>; edgeStrength: Record<string, number>; learnedAt: string };
export type Evidence = Record<string, number>;

const DIG = "0123456789abcdefghijklmnopqrstuvwxyz";

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
    cpts[node] = { node, parents, probs, counts, rowN, used };
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

/* P(target | evidence) by variable elimination with a greedy smallest-factor order. */
export function query(m: Model, ds: Dataset, target: string, evidence: Evidence): Float64Array {
  const idx: Record<string, number> = Object.fromEntries(ds.variables.map((v, i) => [v.id, i]));
  const ev = new Map<number, number>(Object.entries(evidence).filter(([k]) => m.nodes.includes(k)).map(([k, s]) => [idx[k], s]));
  const t = idx[target];
  if (ev.has(t)) { const r = new Float64Array(ds.variables[t].states.length); r[ev.get(t)!] = 1; return r; }
  let factors = m.nodes.map((n) => reduce(cptFactor(m, ds, idx, n), ev));
  const elim = new Set(m.nodes.map((n) => idx[n]).filter((v) => v !== t && !ev.has(v)));
  while (elim.size) {
    let best = -1, bestSize = Infinity;
    for (const v of elim) {
      const vs = new Set<number>();
      for (const f of factors) if (f.vars.includes(v)) f.vars.forEach((x) => vs.add(x));
      let size = 1; vs.forEach((x) => { size *= ds.variables[x].states.length; });
      if (size < bestSize) { bestSize = size; best = v; }
    }
    const touch = factors.filter((f) => f.vars.includes(best)), rest = factors.filter((f) => !f.vars.includes(best));
    let prod = touch[0];
    for (let k = 1; k < touch.length; k++) prod = multiply(prod, touch[k]);
    factors = [...rest, sumOut(prod, best)];
    elim.delete(best);
  }
  let res = factors[0];
  for (let k = 1; k < factors.length; k++) res = multiply(res, factors[k]);
  // Only the target remains (factors without variables are constants).
  const r = ds.variables[t].states.length, out = new Float64Array(r);
  if (res.vars.length === 0) { out.fill(1 / r); return out; }
  const ti = res.vars.indexOf(t), st = strides(res.card);
  for (let o = 0; o < res.vals.length; o++) out[Math.floor(o / st[ti]) % r] += res.vals[o];
  const z = out.reduce((a, b) => a + b, 0);
  for (let k = 0; k < r; k++) out[k] = z > 0 ? out[k] / z : 1 / r;
  return out;
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
