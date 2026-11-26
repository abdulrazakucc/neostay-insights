import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, ConnectionMode, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type ConnectionLineComponentProps, type Edge as FlowEdge, type Node as FlowNode, type NodeChange, type NodeProps, applyNodeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, PageHead, Segmented } from "../ui";
import { num, PALETTE, pct } from "../theme";
import type { Props } from "../App";
import { loadFile } from "../files";
import { decode, distances, edgeProblem, fitCheck, influence, learn, makesCycle, observed, query, strengthWord, suggest,
  type Dataset, type Decoded, type Edge, type Evidence, type Model, type Suggestion } from "../bn";
import { TermsBox } from "./Metrics";

/* Bayesian network: draw how the babies' facts and care relate, let the data fill in the probabilities, then
   ask "what if" questions and see the answer as chances. Learning and reasoning run in the browser (bn.ts) on
   the dataset files from acuity_insights/bayes.py; nothing is sent anywhere. */

type Net = { nodes: string[]; edges: Edge[]; pos: Record<string, { x: number; y: number }>; seen?: string[] };
type Tab = "design" | "learn" | "reason";
type NodeData = { v: Dataset["variables"][number]; tab: Tab; post?: Float64Array; prior?: Float64Array; ev?: number; target?: boolean;
  learned: boolean; onPick: (id: string, s: number) => void; onTarget: (id: string) => void; mode: "light" | "dark" };

/* Ready-made questions (shown only when their variables are in the network). */
const PRESETS: { q: string; ev: Evidence; t: string[] }[] = [
  { q: "A baby on CPAP: which nurse ratio, and will the baby leave within a week?", ev: { resp: 2 }, t: ["ratio", "leave7"] },
  { q: "Born before 28 weeks: what care, and how soon home?", ev: { ga: 0 }, t: ["resp", "ratio", "leave7"] },
  { q: "Born before 28 weeks and under 1,000 g: how long is the whole stay?", ev: { ga: 0, bw: 0 }, t: ["los"] },
  { q: "Off tube feeds: will the baby leave within 7 days?", ev: { feed: 5 }, t: ["leave7", "ratio"] },
  { q: "At 1:2 today: the ratio tomorrow?", ev: { ratio: 3 }, t: ["ratio_next"] },
  { q: "Babies needing 1:1 — what are they like? (reasoning backwards)", ev: { ratio: 4 }, t: ["resp", "ga", "line", "dol"] },
  { q: "In the first week of life with a central line: breathing and ratio?", ev: { dol: 0, line: 1 }, t: ["resp", "ratio"] },
];

/* One soft colour per variable (OKLCH, two lightness tiers, chroma 0.105–0.11), chosen so that boxes linked or
   side by side in the starting drawing differ clearly; checked with the data-visualisation validator for
   lightness band and chroma in both themes. The name is always shown, so colour is never the only cue. */
export const VAR_COLORS: Record<"light" | "dark", Record<string, string>> = {
  light: { ga: "#376fa6", bw: "#a88fd6", dol: "#bc994c", cga: "#167f5c", wt: "#8d5489", resp: "#38b1bd", feed: "#975b23", line: "#d282a2",
    spells: "#82ad6a", sepsis: "#a0514c", ratio: "#5a66a8", ratio_next: "#49accf", leave7: "#bc89c7", los: "#d58966" },
  dark: { ga: "#3a75af", bw: "#a78dd7", dol: "#bc9744", cga: "#158561", wt: "#955890", resp: "#2ab0bd", feed: "#a06024", line: "#d27fa0",
    spells: "#7fac65", sepsis: "#a85550", ratio: "#5f6bb1", ratio_next: "#40abd0", leave7: "#bb86c7", los: "#d58662" },
};
export const colorOf = (id: string, mode: "light" | "dark") => VAR_COLORS[mode][id] ?? PALETTE[mode].series[0];

const STORE = (center: string) => `insights-bn-${center}`;   // one drawing per center, shared by its real and synthetic data
const ADDED_LATER = ["los"];   // variables added to the network data after the first release (Length of stay, 2026-11-26)
const KIND_NAME: Record<string, string> = { real: "Real", synthetic: "Synthetic" };
const W = 305, H = 275;
const defaultNet = (ds: Dataset): Net => ({
  nodes: ds.variables.map((v) => v.id), seen: ds.variables.map((v) => v.id), edges: ds.default_edges.map((e) => [e[0], e[1]] as Edge),
  pos: Object.fromEntries(ds.variables.map((v) => [v.id, { x: (ds.layout[v.id]?.[0] ?? 0) * W + 40, y: (ds.layout[v.id]?.[1] ?? 0) * H + 20 }])) });
const sig = (n: Net) => JSON.stringify([n.nodes.slice().sort(), n.edges.map((e) => e.join(">")).sort()]);

/* ------------------------------------------------------------------ a node on the canvas */
function BnNode({ id, data, selected }: NodeProps<FlowNode<NodeData>>) {
  const { v, tab, post, prior, ev, target, learned, mode } = data;
  const c = colorOf(id, mode);
  const show = tab !== "design" && learned && post;
  return (
    <div className={`bn-node${ev != null ? " ev" : ""}${target ? " target" : ""}${selected ? " sel" : ""}`} title={v.desc}
      style={{ "--c": c } as React.CSSProperties}>
      <Handle type="target" position={Position.Top} className="bn-handle" />
      <div className="bn-node-head">
        <b>{v.label}</b>
        {tab === "reason" && ev != null && <span className="bn-role known">I know</span>}
        {tab === "reason" && ev == null && (
          <button className={`bn-role ask${target ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); data.onTarget(id); }}
            title={target ? "Stop asking about this" : "Ask: show how this variable's chances change"}>{target ? "✓ Asking" : "Ask"}</button>)}
      </div>
      {!show && <div className="bn-node-states">{v.states.join(" · ")}</div>}
      {show && (
        <div className="bn-bars">
          {v.states.map((st, k) => {
            const val = post![k], pr = prior?.[k] ?? val, on = ev === k;
            return (
              <button key={st} className={`bn-bar${on ? " on" : ""}`} disabled={tab !== "reason"}
                onClick={(e) => { e.stopPropagation(); data.onPick(id, k); }} title={tab === "reason" ? (on ? "Click to forget this" : `I know: ${v.label} = ${st}`) : st}>
                <span className="bn-bar-label">{st}</span>
                <span className="bn-bar-track">
                  <i className="prior" style={{ width: `${pr * 100}%` }} />
                  <i className="post" style={{ width: `${val * 100}%` }} />
                </span>
                <span className="bn-bar-val">{pct(val, val < 0.1 && val > 0 ? 1 : 0)}</span>
              </button>
            );
          })}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="bn-handle" />
    </div>
  );
}
const nodeTypes = { bn: BnNode };

/* The line drawn while dragging a new arrow: straight, so it never depends on which side the pointer is on. */
function DragLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  return (<g><path d={`M${fromX},${fromY} L${toX},${toY}`} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="6 4" />
    <circle cx={toX} cy={toY} r={5} fill="var(--accent)" /></g>);
}

/* Move an arrow by choosing where it starts and where it points. */
function MoveArrow({ from, to, nodes, label, onMove }: { from: string; to: string; nodes: string[]; label: (s: string) => string; onMove: (a: string, b: string) => boolean }) {
  const [a, setA] = useState(from), [b, setB] = useState(to);
  const opts = nodes.map((n) => <option key={n} value={n}>{label(n)}</option>);
  return (
    <div className="bn-move">
      <span>Move it: from</span>
      <select value={a} onChange={(e) => setA(e.target.value)} aria-label="Arrow starts at">{opts}</select>
      <span>to</span>
      <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Arrow points to">{opts}</select>
      <button className="btn" disabled={a === from && b === to} onClick={() => onMove(a, b)}>Move</button>
    </div>
  );
}

/* ------------------------------------------------------------------ the page */
function BayesInner({ mode, center }: Props & { center: any }) {
  const p = PALETTE[mode];
  const kinds = center?.has_real_data ? ["real", "synthetic"] : ["synthetic"];
  const [kind, setKind] = useState(kinds[0]);
  const [sets, setSets] = useState<Record<string, Dataset>>({});
  const [err, setErr] = useState<string | null>(null);
  const [net, setNet] = useState<Net | null>(null);
  const [past, setPast] = useState<Net[]>([]);
  const [models, setModels] = useState<Record<string, Model>>({});
  const [modelSig, setModelSig] = useState("");
  const [tab, setTab] = useState<Tab>("design");
  const [msg, setMsg] = useState<{ text: string; cls: string } | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [cptNode, setCptNode] = useState<string>("ratio");
  const [evidence, setEvidence] = useState<Evidence>({});
  const [targets, setTargets] = useState<string[]>(["ratio", "leave7"]);  // a starting question; the viewer changes it
  const [sugs, setSugs] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  // How the answers' values are ordered: highest chance first unless the viewer chooses otherwise.
  const [order, setOrder] = useState<Order>(() => { try { const o = localStorage.getItem("insights-bn-order"); return o === "asc" || o === "natural" ? o : "desc"; } catch { return "desc"; } });
  const chooseOrder = (o: string) => { setOrder(o as Order); try { localStorage.setItem("insights-bn-order", o); } catch { /* storage unavailable */ } };
  const fileRef = useRef<HTMLInputElement>(null);
  const flow = useReactFlow();
  const fitFrame = useCallback(() => window.setTimeout(() => flow.fitView({ padding: 0.06, duration: 450 }), 80), [flow]);
  const cid = center?.center ?? "center-6";

  useEffect(() => { if (!kinds.includes(kind)) setKind(kinds[0]); }, [cid]);
  // Every dataset of the center (real and synthetic for Center 6): one drawing, learned on each.
  useEffect(() => {
    let live = true;
    setSets({}); setErr(null); setModels({}); setEvidence({}); setSugs(null); setPast([]);
    Promise.all(kinds.map((k) => loadFile(`bn/${cid}-${k}.json`).then((b) => b.text()).then((t) => [k, JSON.parse(t) as Dataset] as const))).then((loaded) => {
      if (!live) return;
      const d = loaded[0][1];
      setSets(Object.fromEntries(loaded));
      let n: Net | null = null;
      try { const raw = localStorage.getItem(STORE(cid)) ?? localStorage.getItem(`${STORE(cid)}-${kinds[0]}`); if (raw) n = JSON.parse(raw); } catch { /* storage unavailable */ }
      const ids = new Set(d.variables.map((v) => v.id));
      if (!n || !n.nodes.every((x) => ids.has(x)) || !n.edges.every(([a, b]) => ids.has(a) && ids.has(b))) n = defaultNet(d);
      // Variables added to the data since the drawing was saved join it with our starting arrows, once.
      // Drawings saved before this record existed knew every variable except those added later.
      const seen = new Set<string>(n.seen ?? d.variables.map((v) => v.id).filter((x) => !ADDED_LATER.includes(x))), fresh = d.variables.map((v) => v.id).filter((x) => !seen.has(x) && !n!.nodes.includes(x));
      if (fresh.length) {
        const def = defaultNet(d), nodes = [...n.nodes, ...fresh], edges = [...n.edges];
        for (const [a, b] of def.edges) if ((fresh.includes(a) || fresh.includes(b)) && nodes.includes(a) && nodes.includes(b) && !edgeProblem(edges, a, b)) edges.push([a, b]);
        n = { nodes, edges, pos: { ...def.pos, ...n.pos }, seen: d.variables.map((v) => v.id) } as Net;
      }
      setNet(n);
    }).catch(() => live && setErr("The network data could not be loaded. Reload the page (on this computer: run `make insights-data`)."));
    return () => { live = false; };
  }, [cid]);
  const ds: Dataset | null = sets[kind] ?? null;
  const decs = useMemo(() => Object.fromEntries(Object.entries(sets).map(([k, d]) => [k, decode(d)])), [sets]) as Record<string, Decoded>;
  const dec: Decoded | null = decs[kind] ?? null;
  const model: Model | null = models[kind] ?? null;
  const other = kinds.find((k) => k !== kind && sets[k]);
  const V = useMemo(() => Object.fromEntries((ds?.variables ?? []).map((v) => [v.id, v])), [ds]);
  const label = (id: string) => V[id]?.label ?? id;

  const commit = useCallback((n: Net, note?: { text: string; cls: string }) => {
    setNet((cur) => { if (cur) setPast((h) => [...h.slice(-40), cur]); return n; });
    try { localStorage.setItem(STORE(cid), JSON.stringify(n)); } catch { /* storage unavailable */ }
    setSugs(null);
    if (note) setMsg(note);
  }, [cid]);
  const stale = !!model && !!net && sig(net) !== modelSig;
  // Boxes grow when they show chances: fit the whole network into the frame whenever that changes.
  useEffect(() => { if (net && ds) fitFrame(); }, [tab, modelSig, net?.nodes.length, ds, fitFrame]);
  const learned = !!model && !stale;

  // ---------------------------------------------------------------- reasoning results
  const prior = useMemo(() => (learned && ds ? Object.fromEntries(model!.nodes.map((n) => [n, query(model!, ds, n, {})])) : {}), [learned, model, ds]);
  const post = useMemo(() => (learned && ds ? Object.fromEntries(model!.nodes.map((n) => [n, query(model!, ds, n, evidence)])) : {}), [learned, model, ds, evidence]);
  const fit = useMemo(() => (learned && ds && dec ? fitCheck(model!, ds, dec) : []), [learned, model, ds, dec]);
  // The other dataset's answers to the same question, on the same drawing (Center 6: real against synthetic).
  const otherModel = other && learned ? models[other] : undefined;
  const otherPrior = useMemo(() => (otherModel && other ? Object.fromEntries(otherModel.nodes.map((n) => [n, query(otherModel, sets[other], n, {})])) : {}), [otherModel, other, sets]);
  const otherPost = useMemo(() => (otherModel && other ? Object.fromEntries(otherModel.nodes.map((n) => [n, query(otherModel, sets[other], n, evidence)])) : {}), [otherModel, other, sets, evidence]);

  const pick = useCallback((id: string, s: number) => {
    setEvidence((e) => { const n = { ...e }; if (n[id] === s) delete n[id]; else n[id] = s; return n; });
    setTargets((t) => t.filter((x) => x !== id));
  }, []);
  const toggleTarget = useCallback((id: string) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id])), []);

  // ---------------------------------------------------------------- canvas
  // React Flow keeps its own node objects (with measured sizes); we refresh their data and positions from the
  // network without recreating them, so measuring never loops.
  const [rfNodes, setRfNodes] = useState<FlowNode<NodeData>[]>([]);
  useEffect(() => {
    if (!net || !ds) { setRfNodes([]); return; }
    setRfNodes((prev) => net.nodes.map((id) => {
      const old = prev.find((n) => n.id === id);
      return { ...(old ?? { id, type: "bn" }), id, type: "bn", deletable: false, position: net.pos[id] ?? old?.position ?? { x: 0, y: 0 },
        data: { v: V[id], tab, learned, post: post[id], prior: prior[id], ev: evidence[id], target: targets.includes(id), onPick: pick, onTarget: toggleTarget, mode } };
    }));
  }, [net, ds, V, tab, learned, post, prior, evidence, targets, pick, toggleTarget, mode]);
  const flowEdges: FlowEdge[] = useMemo(() => (!net ? [] : net.edges.map(([a, b]) => {
    const key = `${a}>${b}`, st = learned ? model!.edgeStrength[key] : undefined, w = strengthWord(st);
    const color = !learned ? p.soft : w.cls === "bad" ? p.bad : w.cls === "warn" ? p.warn : p.series[0];
    const width = !learned || st == null ? 1.8 : Math.max(1.2, Math.min(6, 1.2 + Math.log10(Math.max(1, 2 * st))));
    return { id: key, source: a, target: b, selected: selEdge === key, animated: tab === "reason" && evidence[a] != null,
      style: { stroke: color, strokeWidth: selEdge === key ? width + 1.5 : width, strokeDasharray: w.cls === "bad" ? "6 4" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 26 / width, height: 26 / width } };
  })), [net, learned, model, selEdge, tab, evidence, p]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds) as FlowNode<NodeData>[]);
    const done = changes.filter((c): c is Extract<NodeChange, { type: "position" }> => c.type === "position" && !c.dragging && !!c.position);
    if (done.length) setNet((cur) => {
      if (!cur) return cur;
      const n = { ...cur, pos: { ...cur.pos, ...Object.fromEntries(done.map((c) => [c.id, c.position!])) } };
      try { localStorage.setItem(STORE(cid), JSON.stringify(n)); } catch { /* storage unavailable */ }
      return n;
    });
  }, [cid]);
  const problemText = (prob: string, a: string, b: string) => ({
    self: { text: "An arrow needs two different variables.", cls: "bad" },
    exists: { text: `${label(a)} → ${label(b)} is already in the network.`, cls: "warn" },
    opposite: { text: `${label(b)} → ${label(a)} already links these two. Click that arrow and choose "Reverse" to turn it round.`, cls: "warn" },
    loop: { text: `Not possible: ${label(a)} → ${label(b)} would make a loop (a variable would end up influencing itself). Remove or reverse another arrow first.`, cls: "bad" },
  } as Record<string, { text: string; cls: string }>)[prob];
  const onConnect = useCallback((c: Connection) => {
    if (!net || !c.source || !c.target) return;
    const a = c.source, b = c.target, prob = edgeProblem(net.edges, a, b);
    if (prob) return setMsg(problemText(prob, a, b));
    commit({ ...net, edges: [...net.edges, [a, b]] }, { text: `Added ${label(a)} → ${label(b)}.`, cls: "good" });
  }, [net, commit, V]);
  /* Move an arrow: keep it, but change where it starts and/or where it points. */
  const moveEdge = useCallback((key: string, a: string, b: string) => {
    if (!net) return false;
    const [oa, ob] = key.split(">");
    if (oa === a && ob === b) return false;
    const rest = net.edges.filter((e) => !(e[0] === oa && e[1] === ob));
    const prob = edgeProblem(rest, a, b);
    if (prob) { setMsg(problemText(prob, a, b)); return false; }
    commit({ ...net, edges: [...rest, [a, b]] }, { text: `Moved: ${label(oa)} → ${label(ob)} is now ${label(a)} → ${label(b)}.`, cls: "good" });
    setSelEdge(`${a}>${b}`);
    return true;
  }, [net, commit, V]);
  // Dropping an arrow's end anywhere on a box counts, not only on its small dot; a drop that misses every box
  // says so instead of doing nothing.
  const reconnectDone = useRef(false);
  const boxUnder = (e: MouseEvent | TouchEvent) => {
    const pt = "changedTouches" in e ? e.changedTouches[0] : e;
    return (document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node") as HTMLElement | null)?.dataset.id ?? null;
  };
  const onReconnect = useCallback((old: FlowEdge, c: Connection) => {
    reconnectDone.current = true;
    if (c.source && c.target) moveEdge(old.id, c.source, c.target);
  }, [moveEdge]);
  const onReconnectEnd = useCallback((e: MouseEvent | TouchEvent, old: FlowEdge, end: string) => {
    if (reconnectDone.current) { reconnectDone.current = false; return; }
    const box = boxUnder(e);
    if (!box) return setMsg({ text: "Not moved: drop the end of the arrow on a box.", cls: "warn" });
    const [a, b] = old.id.split(">");
    moveEdge(old.id, end === "source" ? box : a, end === "source" ? b : box);
  }, [moveEdge]);
  const onConnectEnd = useCallback((e: MouseEvent | TouchEvent, st: any) => {
    if (st?.isValid || !st?.fromNode) return;
    const box = boxUnder(e);
    if (box && box !== st.fromNode.id) onConnect({ source: st.fromHandle?.type === "target" ? box : st.fromNode.id, target: st.fromHandle?.type === "target" ? st.fromNode.id : box, sourceHandle: null, targetHandle: null });
  }, [onConnect]);
  const removeEdge = (key: string) => {
    if (!net) return;
    const [a, b] = key.split(">");
    commit({ ...net, edges: net.edges.filter((e) => !(e[0] === a && e[1] === b)) }, { text: `Removed ${label(a)} → ${label(b)}.`, cls: "good" });
    setSelEdge(null);
  };
  const reverseEdge = (key: string) => {
    if (!net) return;
    const [a, b] = key.split(">");
    const rest = net.edges.filter((e) => !(e[0] === a && e[1] === b));
    if (makesCycle(rest, b, a)) return setMsg({ text: `Cannot reverse: ${label(b)} → ${label(a)} would make a loop.`, cls: "bad" });
    void makesCycle;
    commit({ ...net, edges: [...rest, [b, a]] }, { text: `Reversed: now ${label(b)} → ${label(a)}.`, cls: "good" });
    setSelEdge(`${b}>${a}`);
  };
  const toggleVar = (id: string) => {
    if (!net || !ds) return;
    if (net.nodes.includes(id)) {
      if (net.nodes.length <= 2) return setMsg({ text: "Keep at least two variables in the network.", cls: "warn" });
      commit({ ...net, nodes: net.nodes.filter((x) => x !== id), edges: net.edges.filter((e) => e[0] !== id && e[1] !== id) }, { text: `Took ${label(id)} out of the network (and its arrows).`, cls: "good" });
      setEvidence((e) => { const n = { ...e }; delete n[id]; return n; });
      setTargets((t) => t.filter((x) => x !== id));
    } else {
      commit({ ...net, nodes: [...net.nodes, id], pos: { ...net.pos, [id]: net.pos[id] ?? defaultNet(ds).pos[id] } }, { text: `Added ${label(id)}. Draw arrows to and from it.`, cls: "good" });
    }
  };
  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1)); setNet(prev); setSugs(null); setSelEdge(null);
    try { localStorage.setItem(STORE(cid), JSON.stringify(prev)); } catch { /* storage unavailable */ }
    setMsg({ text: "Undone.", cls: "" });
  };

  const doLearn = () => {
    if (!ds || !dec || !net) return;
    setBusy(true);
    window.setTimeout(() => {
      const t0 = performance.now();
      const ms = Object.fromEntries(Object.keys(sets).map((k) => [k, learn(sets[k], decs[k], net.nodes, net.edges, 1)]));
      setModels(ms); setModelSig(sig(net)); setBusy(false); setTab("learn");
      setTargets((t) => t.filter((x) => net.nodes.includes(x)));
      setEvidence((e) => Object.fromEntries(Object.entries(e).filter(([k]) => net.nodes.includes(k))));
      setMsg({ text: `Probabilities learned for the same drawing from ${Object.keys(sets).map((k) => `${num(sets[k].n, 0)} ${k} baby-shifts`).join(" and ")} in ${num(performance.now() - t0, 0)} ms.`, cls: "good" });
    }, 30);
  };
  const askData = () => {
    if (!ds || !dec || !net) return;
    setBusy(true);
    window.setTimeout(() => { setSugs(suggest(ds, dec, net.nodes, net.edges, ds.tiers ?? {})); setBusy(false); }, 30);
  };
  const exportNet = () => {
    if (!net) return;
    const blob = new Blob([JSON.stringify({ app: "NeoStay Insights", center: cid, dataset: kind, ...net }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `neostay-network-${cid}-${kind}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importNet = (f: File) => f.text().then((t) => {
    const j = JSON.parse(t), ids = new Set(ds!.variables.map((v) => v.id));
    if (!Array.isArray(j.nodes) || !Array.isArray(j.edges) || !j.nodes.every((x: string) => ids.has(x))) throw new Error();
    const edges: Edge[] = [];
    for (const [a, b] of j.edges) if (j.nodes.includes(a) && j.nodes.includes(b) && !makesCycle(edges, a, b)) edges.push([a, b]);
    commit({ nodes: j.nodes, edges, pos: { ...defaultNet(ds!).pos, ...(j.pos || {}) } }, { text: "Network loaded.", cls: "good" });
  }).catch(() => setMsg({ text: "That file is not a NeoStay network.", cls: "bad" }));

  const presets = PRESETS.filter((x) => net && Object.keys(x.ev).every((k) => net.nodes.includes(k)) && x.t.some((k) => net.nodes.includes(k)));

  if (err) return <div className="empty">{err}</div>;
  if (!ds || !net || !dec) return <div className="empty">Loading the network data…</div>;
  const realSet = kind === "real";
  const se = selEdge && net.edges.some((e) => `${e[0]}>${e[1]}` === selEdge) ? selEdge.split(">") : null;

  return (
    <>
      <PageHead eyebrow={center?.name ?? "Center 6"} title="Bayesian network: reasoning with chances"
        lead="Draw how the babies' facts and care relate to each other, let the data fill in the probabilities, then ask 'what if' questions: tell the network what you know about a baby, and see how the chances of everything else change." />
      <div className="row" style={{ marginBottom: 12 }}>
        {kinds.length > 1 && <><span className="bn-show">Show in the boxes:</span><Segmented value={kind} onChange={setKind} options={[{ key: "real", label: "Real boards (observed)" }, { key: "synthetic", label: "Synthetic unit (simulated)" }]} /></>}
        <span className={`badge ${realSet ? "good" : "warn"}`}>{realSet ? "Real Center 6 data" : center?.has_real_data ? "Synthetic Center 6" : `${center?.name}: synthetic scenario, assumed settings`}</span>
        <span className="badge">{num(ds.n, 0)} baby-shifts · {num(ds.stays, 0)} stays</span>
        {other && <span className="badge info">Both datasets are learned on the same drawing; answers compare them</span>}
      </div>
      <div className="bn-steps">
        {([["design", "1", "Design the network", "Choose the variables and draw the arrows"], ["learn", "2", "Learn the probabilities", "The data fills in every chance"], ["reason", "3", "Ask questions", "Set what you know; see the chances change"]] as [Tab, string, string, string][]).map(([k, n, t, d]) => (
          <button key={k} className={`bn-step${tab === k ? " on" : ""}${k !== "design" && !learned ? " locked" : ""}`} onClick={() => { setSelEdge(null); if (k === "design" || learned) setTab(k); else doLearn(); }}>
            <i>{n}</i><b>{t}</b><span>{k !== "design" && !learned ? (stale ? "The network changed: learn again" : "Learn the probabilities first") : d}</span>
          </button>
        ))}
      </div>
      {msg && <div className={`note bn-msg ${msg.cls === "bad" ? "warn-note" : msg.cls === "good" ? "good-note" : ""}`} role="status">{msg.text}<button className="link" onClick={() => setMsg(null)} aria-label="Close">×</button></div>}
      {stale && <div className="note warn-note">The network has changed since the probabilities were learned. <button className="link" onClick={doLearn}>Learn again</button> to update every chance.</div>}

      <div className="bn-layout">
        <div className="bn-main">
        <div className="bn-canvas-card">
          <div className="bn-toolbar">
            {tab === "design" && <>
              <button className="btn ghost" onClick={undo} disabled={!past.length} title="Undo the last change">↶ Undo</button>
              <button className="btn ghost" onClick={() => commit(defaultNet(ds), { text: "Back to our starting network.", cls: "good" })}>Start from our network</button>
              <button className="btn ghost" onClick={() => commit({ ...net, edges: [] }, { text: "All arrows removed: draw your own.", cls: "good" })}>Remove all arrows</button>
              <button className="btn ghost" onClick={askData} disabled={busy}>Ask the data for suggestions</button>
              <span className="grow" />
              <button className="btn" onClick={doLearn} disabled={busy}>{busy ? "Working…" : learned ? "Learn again" : "Confirm structure and learn →"}</button>
            </>}
            {tab !== "design" && <>
              <span className="bn-hint">{tab === "reason" ? "Click a value inside a box = \"I know this\" (it turns solid). Click Ask on a box = show how its chances change. Or use the panel on the right." : "Each box shows the chance of each value across all babies. Arrow colour and width: how strongly the data support it."}</span>
              <span className="grow" />
              {tab === "reason" && Object.keys(evidence).length > 0 && <button className="btn ghost" onClick={() => setEvidence({})}>Clear what you know</button>}
            </>}
          </div>
          <div className="bn-zoom" role="group" aria-label="Zoom">
            <button className="btn" onClick={fitFrame} title="Show the whole network in the frame">⤢ Fit to frame</button>
            <button className="btn ghost" onClick={() => flow.zoomIn({ duration: 200 })} aria-label="Zoom in" title="Zoom in">＋</button>
            <button className="btn ghost" onClick={() => flow.zoomOut({ duration: 200 })} aria-label="Zoom out" title="Zoom out">－</button>
            <span>Scrolling moves the page, not the drawing. Zoom with these buttons (or pinch); drag empty space to move the drawing.</span>
          </div>
          <div className="bn-canvas">
            <ReactFlow nodes={rfNodes} edges={flowEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={tab === "design" ? onConnect : undefined}
              onReconnect={tab === "design" ? onReconnect : undefined} onReconnectStart={() => { reconnectDone.current = false; }} onReconnectEnd={tab === "design" ? onReconnectEnd : undefined}
              onConnectEnd={tab === "design" ? onConnectEnd : undefined} connectionMode={ConnectionMode.Loose} edgesReconnectable={tab === "design"} reconnectRadius={24}
              nodesConnectable={tab === "design"} edgesFocusable elementsSelectable
              onEdgeClick={(_, e) => setSelEdge(e.id)} onPaneClick={() => setSelEdge(null)}
              onEdgesDelete={(es) => tab === "design" && es.forEach((e) => removeEdge(e.id))} deleteKeyCode={tab === "design" ? ["Backspace", "Delete"] : null}
              connectionLineComponent={DragLine} connectionRadius={70} connectOnClick colorMode={mode} fitView fitViewOptions={{ padding: 0.06 }} minZoom={0.15} maxZoom={2}
              zoomOnScroll={false} preventScrolling={false} zoomOnDoubleClick={false} panOnScroll={false}>
              <Background gap={22} size={1} color={p.grid} />
            </ReactFlow>
            {se && (
              <div className="bn-edge-pop">
                <b>{label(se[0])} → {label(se[1])}</b>
                {learned && model!.edgeStrength[selEdge!] != null && <span className={`badge ${strengthWord(model!.edgeStrength[selEdge!]).cls}`}>{strengthWord(model!.edgeStrength[selEdge!]).word}</span>}
                {tab === "design" ? <>
                  <div className="row"><button className="btn ghost" onClick={() => reverseEdge(selEdge!)}>⇅ Reverse</button><button className="btn ghost danger" onClick={() => removeEdge(selEdge!)}>✕ Remove</button></div>
                  <MoveArrow key={selEdge} from={se[0]} to={se[1]} nodes={net.nodes} label={label} onMove={(a, b) => moveEdge(selEdge!, a, b)} />
                  <small>Or drag either end of the arrow onto another box.</small>
                </> : <small>Go to step 1 to move, reverse or remove it.</small>}
                {learned && model!.edgeStrength[selEdge!] != null && <small>Without this arrow the network's fit (BIC) would {model!.edgeStrength[selEdge!] >= 0 ? `drop by ${num(2 * model!.edgeStrength[selEdge!], 0)}` : `improve by ${num(-2 * model!.edgeStrength[selEdge!], 0)}`}.</small>}
                {!learned && tab === "design" && <small>Learn the probabilities to see how strongly the data support it.</small>}
              </div>
            )}
          </div>
        </div>

        {tab === "reason" && learned && targets.length > 0 && (
          <div className="bn-order"><span>Order of the values in each answer:</span>
            <Segmented value={order} onChange={chooseOrder} options={[{ key: "desc", label: "Highest chance first" }, { key: "asc", label: "Lowest chance first" }, { key: "natural", label: "Original order" }]} />
          </div>)}
        {tab === "reason" && learned && <Answers order={order} ds={ds} dec={dec} model={model!} evidence={evidence} targets={targets.filter((t) => model!.nodes.includes(t))} prior={prior} post={post} label={label} realSet={realSet} mode={mode}
          cmp={otherModel && other ? { kind: other, ds: sets[other], dec: decs[other], prior: otherPrior, post: otherPost } : undefined} mainKind={kind} />}
        </div>
        <aside className="bn-side">
          {tab === "design" && <>
            <Card title="Variables" sub="Tick to include; hover for its meaning">
              <div className="bn-vars">{ds.variables.map((v) => (
                <label key={v.id} title={`${v.desc} Source: ${v.source}.${v.missing ? ` Unknown on ${num(v.missing, 0)} baby-shifts.` : ""}`}>
                  <input type="checkbox" checked={net.nodes.includes(v.id)} onChange={() => toggleVar(v.id)} />
                  <span><b>{v.label}</b><small>{v.states.join(" · ")}</small></span>
                </label>))}
              </div>
            </Card>
            <Card title="How to edit" sub="No mouse skills needed beyond drag and click">
              <ul className="bn-how">
                <li><b>Move</b> a box: drag it.</li>
                <li><b>Add</b> an arrow: drag from the dot at the bottom of one box onto another box (or click the dot, then the other box's top dot).</li>
                <li><b>Reverse or remove</b> an arrow: click it, then choose.</li>
                <li>An arrow means "directly influences". A loop is not allowed.</li>
                <li>When the drawing matches your understanding, press <b>Confirm structure and learn</b>.</li>
              </ul>
              <div className="row"><button className="link" onClick={exportNet}>Save my network (file)</button><button className="link" onClick={() => fileRef.current?.click()}>Open a saved network</button>
                <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importNet(e.target.files[0])} /></div>
            </Card>
            {sugs && <Card title="What the data suggest" sub="Single changes that make the network fit the data better, strongest first. The data can show that two things are linked, rarely which way: you decide.">
              {sugs.length === 0 ? <div className="note">No single change improves the fit clearly: the data support your network as it is.</div> :
                <ul className="bn-sugs">{sugs.map((s) => (
                  <li key={`${s.op}${s.from}${s.to}`}>
                    <span><b>{s.op === "add" ? "Add" : s.op === "remove" ? "Remove" : "Reverse"}</b> {label(s.from)} → {label(s.to)}{s.op === "reverse" ? ` (to ${label(s.to)} → ${label(s.from)})` : ""}
                      <small>{s.op === "remove" ? "the data do not need this arrow" : "the data support this link"} · fit (BIC) +{num(2 * s.gain, 0)}</small></span>
                    <button className="btn ghost" onClick={() => commit({ ...net, edges: s.edges }, { text: "Suggestion applied. Learn again to update the chances.", cls: "good" })}>Apply</button>
                  </li>))}
                </ul>}
            </Card>}
          </>}

          {tab === "learn" && learned && <>
            <Card title="What was learned" sub={`From ${num(ds.n, 0)} baby-shifts (${realSet ? "real boards" : "synthetic unit"}), learned ${model!.learnedAt}`}>
              <div className="bn-kpis">
                <div><span>Variables</span><b>{model!.nodes.length}</b></div>
                <div><span>Arrows</span><b>{model!.edges.length}</b></div>
                <div><span>Probabilities</span><b>{num(model!.nodes.reduce((a, n) => a + model!.cpts[n].probs.length, 0), 0)}</b></div>
                <div><span>Fit (BIC)</span><b>{num(2 * model!.bic, 0)}</b></div>
              </div>
              <small className="muted">Fit (BIC): higher is better. Use it to compare networks drawn on the same data.</small>
            </Card>
            <Card title="Does the network reproduce the data?" sub="For each variable: the share of each value the network predicts against the share seen in the data">
              <ul className="bn-fit">{fit.map((f) => (
                <li key={f.node} className={f.tvd > 0.05 ? "off" : f.tvd >= 0.005 ? "near" : ""}><span>{label(f.node)}</span><b>{f.tvd < 0.005 ? "matches" : `off by ${num(f.tvd * 100, 1)} points`}</b></li>))}
              </ul>
              <small className="muted">Points = total variation distance × 100. A large gap means the arrows leave out a link the data need.</small>
            </Card>
            {otherModel && other && <Card title={`${KIND_NAME[kind]} against ${KIND_NAME[other].toLowerCase()}: the same drawing`} sub="For each variable, how far apart the two networks' shares are for all babies (total variation distance, points out of 100)">
              <ul className="bn-fit">{model!.nodes.map((n) => { const dd = distances(prior[n], otherPrior[n]); return (
                <li key={n} className={dd.tvd > 0.1 ? "off" : dd.tvd >= 0.005 ? "near" : ""}><span>{label(n)}</span><b>{dd.tvd < 0.005 ? "same" : `${num(dd.tvd * 100, 1)} points apart`}</b></li>); })}
              </ul>
              <small className="muted">Same structure, learned separately on {num(sets[kind].n, 0)} {kind} and {num(sets[other].n, 0)} {other} baby-shifts.</small>
            </Card>}
            <Card title="How the probabilities are learned" sub="All in this browser, from the dataset file; nothing is sent anywhere">
              <ol className="bn-how">
                <li>The data file holds every baby-shift as a pattern of values (no names, dates or notes), with how many baby-shifts share it. On the hosted site it is decrypted after you sign in.</li>
                <li>For each variable, it counts how often each of its values occurs for every combination of the variables pointing into it, using only baby-shifts where all of them are recorded.</li>
                <li>Each count gets a tiny equal starting share (a Dirichlet prior with equivalent sample size 1), so a combination never seen gets equal chances, not 0%.</li>
                <li>Count ÷ total for the combination = the chance in the table. Each row adds to 100%.</li>
              </ol>
              <small className="muted">{otherModel && other ? `Done twice, on the same drawing: ${num(sets[kind].n, 0)} ${kind} and ${num(sets[other].n, 0)} ${other} baby-shifts.` : `From ${num(ds.n, 0)} baby-shifts.`} Questions are then answered by exact calculation from these tables (variable elimination).</small>
            </Card>
            <Card title="Probability tables" sub="Pick a variable to see its chances for every combination of its parents">
              <select value={cptNode} onChange={(e) => setCptNode(e.target.value)} aria-label="Variable">{model!.nodes.map((n) => <option key={n} value={n}>{label(n)}</option>)}</select>
            </Card>
          </>}

          {tab === "reason" && learned && <>
            <Card title="① What you know (evidence)" sub="Set the facts you know about a baby: click a value below, or a bar inside a box on the drawing. Click it again to forget it."
              right={Object.keys(evidence).length > 0 ? <button className="link" onClick={() => setEvidence({})}>Clear all</button> : undefined}>
              <div className="bn-evlist">{net.nodes.map((id) => {
                const v = V[id], on = evidence[id];
                return (
                  <details key={id} className={`bn-ev${on != null ? " set" : ""}`} open={on != null || undefined} style={{ "--c": colorOf(id, mode) } as React.CSSProperties}>
                    <summary><i />{v.label}<em>{on != null ? v.states[on] : "not known"}</em></summary>
                    <div className="bn-ev-states">{v.states.map((st, k) => (
                      <button key={st} className={on === k ? "on" : ""} onClick={() => pick(id, k)}>{st}</button>))}
                    </div>
                  </details>);
              })}</div>
            </Card>
            <Card title="② What you want to know" sub="Pick the variables whose chances you want to see. Their answers appear below the drawing."
              right={targets.length > 0 ? <button className="link" onClick={() => setTargets([])}>Clear</button> : undefined}>
              <div className="bn-targets">{net.nodes.map((id) => {
                const known = evidence[id] != null, on = targets.includes(id);
                return (
                  <button key={id} className={`${on ? "on" : ""}`} disabled={known} onClick={() => toggleTarget(id)} style={{ "--c": colorOf(id, mode) } as React.CSSProperties}
                    title={known ? "You have set this as known" : on ? "Stop asking" : "Ask about this"}>
                    <i />{V[id].label}{known ? <small> known</small> : on ? <small> ✓</small> : null}
                  </button>);
              })}</div>
            </Card>
            <Card title="Ready-made questions" sub="Each sets what you know and what you want to know">
              <div className="bn-presets">{presets.map((x) => (
                <button key={x.q} className="bn-preset" onClick={() => { setEvidence(x.ev); setTargets(x.t.filter((k) => net.nodes.includes(k))); }}>{x.q}</button>))}
              </div>
            </Card>
          </>}
        </aside>
      </div>

      {tab === "learn" && learned && <CptView ds={ds} model={model!} node={model!.nodes.includes(cptNode) ? cptNode : model!.nodes[0]} label={label} mode={mode} />}

      <TermsBox ids={["bayes-net", "arrow", "cpt", "prior-posterior", "evidence", "bdeu", "bic", "bic-scale", "available-case", "inference", "baby-shift-unit", "tvd", "jsd", "hellinger", "same-drawing"]} />
      <div className="note">Planning support, not for decisions about one baby. Every chance counts baby-shifts (one baby on one board), so babies with long stays weigh more; the network shows how things go together in the {realSet ? "unit's boards" : "simulated unit"}, not proof of cause.</div>
    </>
  );
}

/* ------------------------------------------------------------------ probability table of one variable */
function CptView({ ds, model, node, label, mode }: { ds: Dataset; model: Model; node: string; label: (s: string) => string; mode: "light" | "dark" }) {
  const p = PALETTE[mode];
  const c = model.cpts[node], v = ds.variables.find((x) => x.id === node)!;
  const ps = c.parents.map((x) => ds.variables.find((y) => y.id === x)!);
  const r = v.states.length, q = c.rowN.length;
  const [all, setAll] = useState(false);
  const rows = Array.from({ length: q }, (_, j) => {
    const st: string[] = []; let rem = j;
    for (let k = ps.length - 1; k >= 0; k--) { const n = ps[k].states.length; st.unshift(ps[k].states[rem % n]); rem = Math.floor(rem / n); }
    return { j, st, n: c.rowN[j] };
  }).sort((a, b) => b.n - a.n);
  const shown = all ? rows : rows.filter((x) => x.n > 0).slice(0, 40);
  return (
    <Card wide title={`Chances of "${label(node)}"${ps.length ? ` given ${ps.map((x) => `"${x.label}"`).join(", ")}` : ""}`}
      sub={`${num(q, 0)} combination${q > 1 ? "s" : ""} of its parents; learned from ${num(c.used, 0)} baby-shifts where all of them are recorded. Each row adds to 100%. Rows seen rarely in the data rest on few cases: see n.`}
      right={q > 40 || rows.some((x) => x.n === 0) ? <button className="link" onClick={() => setAll(!all)}>{all ? "Show the 40 most common" : `Show all ${num(q, 0)}`}</button> : undefined}>
      <div className="table-scroll">
        <table className="sc-table cpt">
          <thead><tr>{ps.map((x) => <th key={x.id}>{x.label}</th>)}{v.states.map((s) => <th key={s}>{s}</th>)}<th>n</th></tr></thead>
          <tbody>{shown.map((row) => (
            <tr key={row.j} className={row.n < 20 ? "rare" : ""}>
              {row.st.map((s, k) => <td key={k}>{s}</td>)}
              {v.states.map((_, k) => { const val = c.probs[row.j * r + k]; return <td key={k} className="sc-val" style={{ background: `color-mix(in srgb, ${p.series[0]} ${Math.round(val * 70)}%, transparent)` }}>{pct(val, val < 0.1 ? 1 : 0)}</td>; })}
              <td className="sc-val">{num(row.n, 0)}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <small className="muted">n = baby-shifts with that combination. Combinations never seen (n = 0) get equal chances from the prior; rows with n under 20 are shaded lighter.</small>
    </Card>
  );
}

/* ------------------------------------------------------------------ the answers */
type Order = "desc" | "asc" | "natural";
/* The order of a variable's values for display: by chance (highest or lowest first, ties in original order) or as defined. */
const orderOf = (p: ArrayLike<number>, order: Order) => {
  const idx = Array.from({ length: p.length }, (_, k) => k);
  return order === "natural" ? idx : idx.sort((x, y) => (order === "desc" ? p[y] - p[x] : p[x] - p[y]) || x - y);
};
type Cmp = { kind: string; ds: Dataset; dec: Decoded; prior: Record<string, Float64Array>; post: Record<string, Float64Array> };
function Answers({ order, ds, dec, model, evidence, targets, prior, post, label, realSet, mode, cmp, mainKind }: { order: Order; ds: Dataset; dec: Decoded; model: Model; evidence: Evidence; targets: string[];
  prior: Record<string, Float64Array>; post: Record<string, Float64Array>; label: (s: string) => string; realSet: boolean; mode: "light" | "dark"; cmp?: Cmp; mainKind: string }) {
  const hasEv = Object.keys(evidence).length > 0;
  if (!targets.length) return <Card wide title="Your answers"><div className="note">Choose at least one variable under <b>② What you want to know</b> (or click <b>Ask</b> on a box).</div></Card>;
  const evText = Object.entries(evidence).map(([k, s]) => `${label(k)} = ${ds.variables.find((v) => v.id === k)!.states[s]}`).join("; ");
  return (
    <div className="grid">
      {targets.map((t) => {
        const v = ds.variables.find((x) => x.id === t)!, a = prior[t], b = post[t];
        if (!a || !b) return null;
        const top = b.indexOf(Math.max(...b));
        const moves = v.states.map((s, k) => ({ s, k, d: b[k] - a[k] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
        const big = moves[0];
        const obs = observed(dec, ds, t, evidence);
        const inf = hasEv ? influence(model, ds, t, evidence, big.k) : [];
        return (
          <Card key={t} wide={!!cmp} title={label(t)} sub={hasEv ? `Given: ${evText}` : "For all babies (nothing known yet)"}>
            <div style={{ "--c": colorOf(t, mode) } as React.CSSProperties}>
            <div className="bn-answer">
              {orderOf(b, order).map((k) => [v.states[k], k] as const).map(([s, k]) => (
                <div key={s} className={`bn-ans-row${k === top ? " top" : ""}`}>
                  <span>{s}</span>
                  <span className="bn-ans-track"><i className="before" style={{ width: `${a[k] * 100}%` }} /><i className="after" style={{ width: `${b[k] * 100}%` }} /></span>
                  <b>{pct(b[k], b[k] < 0.1 ? 1 : 0)}</b>
                  <small className={b[k] - a[k] > 0.005 ? "up" : b[k] - a[k] < -0.005 ? "down" : ""}>{hasEv ? `${b[k] - a[k] >= 0 ? "+" : "−"}${num(Math.abs(b[k] - a[k]) * 100, 1)}` : ""}</small>
                </div>))}
            </div>
            <div className="bn-legend"><span><i className="before" />all babies</span>{hasEv && <span><i className="after" />given what you know</span>}</div>
            </div>
            <p className="bn-say">
              {hasEv
                ? <>Most likely: <b>{v.states[top]}</b> ({pct(b[top], 0)}). The biggest change is <b>{big.s}</b>: from {pct(a[big.k], 1)} for all babies to {pct(b[big.k], 1)}
                  {a[big.k] > 0 ? (b[big.k] >= a[big.k] ? <> ({num(b[big.k] / a[big.k], 1)} times as likely)</> : <> ({pct(1 - b[big.k] / a[big.k], 0)} less likely)</>) : null}.</>
                : <>Most likely: <b>{v.states[top]}</b> ({pct(b[top], 0)}). Tell the network something about a baby to see how this changes.</>}
            </p>
            {hasEv && inf.length > 1 && <div className="bn-inf"><span>What drives this answer</span>{inf.map((x) => (
              <div key={x.variable}><small>without "{label(x.variable)}"</small><b>{pct(x.without, 1)}</b><small>→ with it {pct(x.withIt, 1)}</small></div>))}</div>}
            <div className="bn-obs">
              {hasEv ? (obs.match > 0
                ? <><b>Check against the data:</b> {num(obs.match, 0)} {realSet ? "real" : "synthetic"} baby-shifts match what you know{obs.known < obs.match ? ` (${num(obs.known, 0)} with ${label(t).toLowerCase()} recorded)` : ""};
                  among them {v.states[big.k]} was {obs.known ? pct(obs.dist[big.k], 1) : "—"}.{obs.known < 30 ? " Few cases: read the network's answer with care." : ""}</>
                : <><b>No baby-shift in the data matches all of this.</b> The answer is the network's reasoning from the arrows and the parts it has seen, not from babies exactly like this one.</>)
                : <><b>Check against the data:</b> share seen in the data for {v.states[top]}: {pct(obs.dist[top], 1)}.</>}
            </div>
            {cmp && cmp.post[t] && (() => {
              // Real first, synthetic second, whichever is shown in the boxes.
              const sides = [{ kind: mainKind, b, a, ds, dec }, { kind: cmp.kind, b: cmp.post[t], a: cmp.prior[t], ds: cmp.ds, dec: cmp.dec }]
                .sort((x, y) => (x.kind === "real" ? -1 : y.kind === "real" ? 1 : 0));
              const [R, S] = sides;
              const dq = distances(R.b, S.b), d0 = distances(R.a, S.a);
              const oR = observed(R.dec, R.ds, t, evidence), oS = observed(S.dec, S.ds, t, evidence);
              return (
                <div className="bn-cmp" style={{ "--c": colorOf(t, mode) } as React.CSSProperties}>
                  <h4>Real and synthetic, same question</h4>
                  <table>
                    <thead><tr><th>{label(t)}</th><th>Real</th><th>Synthetic</th><th>Synthetic − real (points)</th></tr></thead>
                    <tbody>{orderOf(R.b, order).map((k) => [v.states[k], k] as const).map(([st, k]) => (
                      <tr key={st} className={k === dq.maxState ? "max" : ""}>
                        <td>{st}</td>
                        <td><span className="bn-cmp-bar"><i className="r" style={{ width: `${R.b[k] * 100}%` }} /></span>{pct(R.b[k], 1)}</td>
                        <td><span className="bn-cmp-bar"><i className="s" style={{ width: `${S.b[k] * 100}%` }} /></span>{pct(S.b[k], 1)}</td>
                        <td className="sc-val">{(S.b[k] - R.b[k]) >= 0 ? "+" : "−"}{(Math.abs(S.b[k] - R.b[k]) * 100).toFixed(1)}</td>
                      </tr>))}
                    </tbody>
                  </table>
                  <div className="bn-cmp-metrics">
                    <div><span>Total variation distance</span><b>{dq.tvd.toFixed(3)}</b><small>{num(dq.tvd * 100, 1)} in 100 baby-shifts would need another value to make them match</small></div>
                    <div><span>Jensen–Shannon distance</span><b>{dq.jsd.toFixed(3)}</b><small>0 = identical, 1 = no overlap</small></div>
                    <div><span>Hellinger distance</span><b>{dq.hellinger.toFixed(3)}</b><small>0 = identical, 1 = no overlap</small></div>
                  </div>
                  <p className="bn-say">{dq.tvd < 0.005 ? <>The two networks give practically the same answer.</> : <>The largest gap is <b>{v.states[dq.maxState]}</b>: {pct(R.b[dq.maxState], 1)} real against {pct(S.b[dq.maxState], 1)} synthetic.</>}
                    {hasEv && <> For all babies (nothing known) the two are {num(d0.tvd * 100, 1)} points apart{dq.tvd > d0.tvd + 0.005 ? ", so this question pulls them further apart" : dq.tvd + 0.005 < d0.tvd ? ", so this question brings them closer" : ", about the same"}.</>}</p>
                  {hasEv && <small className="muted">Baby-shifts matching what you know: real {num(oR.match, 0)}, synthetic {num(oS.match, 0)}.{oR.match < 30 || oS.match < 30 ? " Few in one dataset: read the comparison with care." : ""}</small>}
                </div>);
            })()}
          </Card>
        );
      })}
    </div>
  );
}

export default function BayesNet(props: Props & { center: any }) {
  return <ReactFlowProvider><BayesInner {...props} /></ReactFlowProvider>;
}
