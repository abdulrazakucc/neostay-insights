/* Colours and chart look. Every series palette here was checked with the data-visualisation
   validator (lightness band, chroma floor, colour-blind separation of all pairs, contrast) on
   the card surface of its theme: light #ffffff, dark #121829. */

export type Mode = "light" | "dark";

export const PALETTE = {
  light: {
    // Real data, traditional ML, deep learning: fixed order, all pairs pass.
    series: ["#009096", "#eb6834", "#6250d6"],
    // The five nurse:patient ratios, one hue each as in NeoStay, 1:3-4 to 1:1: blue, green, amber,
    // orange, crimson (calm to the most care). Amber, orange and crimson re-stepped slightly from
    // NeoStay's so neighbours in a stack pass the validator.
    ratio: ["#4e9ee6", "#23a36b", "#e8a50f", "#fa5e17", "#d22a60"],
    // An ordered teal scale for charts that are not about ratios (breathing modes, feeding).
    ramp: ["#7cc3c0", "#4fa9a8", "#2b8f91", "#11767b", "#0a5458"],
    // Gestational age bands at birth, <28 / 28-31 / 32-36 / >=37 wk: violet, magenta, rust, gold.
    band: ["#5e2ec3", "#c2509c", "#ae3a14", "#b38913"],
    seq: ["#eef7f7", "#c9e8e6", "#8fcfcb", "#4fa9a8", "#11767b", "#0a4a4d"],
    div: ["#2a78d6", "#8fb6e8", "#f0efec", "#ef9a99", "#e34948"],
    good: "#0ca30c", warn: "#fab219", bad: "#d03b3b",
    surface: "#ffffff", ink: "#0f1a2e", soft: "#4b5873", muted: "#8590a6", grid: "#eef1f6", axis: "#d5dbe6",
  },
  dark: {
    series: ["#22a6a8", "#d95926", "#8b80ea"],
    // The same five hues stepped for the dark card (narrower lightness band): crimson reads rose.
    ratio: ["#4c92d3", "#25a677", "#ba851a", "#bc411b", "#e25e88"],
    ramp: ["#1a5f5e", "#227a77", "#2e9690", "#4bb2a9", "#79cdc2"],
    band: ["#8171d5", "#d1419f", "#bb5128", "#b58e03"],
    seq: ["#172036", "#1a3a48", "#1f5a5e", "#2e8a87", "#4bb2a9", "#8fe0d4"],
    div: ["#3987e5", "#2f4f7a", "#383835", "#8a4040", "#e66767"],
    good: "#0ca30c", warn: "#fab219", bad: "#d03b3b",
    surface: "#121829", ink: "#eef1f8", soft: "#b4bdd1", muted: "#7c879e", grid: "#1f2740", axis: "#2c3654",
  },
};

export const NAMES = ["Real data", "Traditional ML", "Deep learning"];
export const KEYS = ["real", "ml", "dl"];

export function axis(mode: Mode, extra: object = {}) {
  const p = PALETTE[mode];
  return {
    axisLine: { show: true, lineStyle: { color: p.axis } },
    axisTick: { show: false },
    axisLabel: { color: p.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: p.grid } },
    nameTextStyle: { color: p.muted, fontSize: 11 },
    ...extra,
  };
}

export function base(mode: Mode) {
  const p = PALETTE[mode];
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: p.soft },
    grid: { left: 48, right: 18, top: 28, bottom: 42, containLabel: false },
    tooltip: {
      trigger: "axis",
      backgroundColor: mode === "light" ? "rgba(255,255,255,0.97)" : "rgba(18,24,41,0.97)",
      borderColor: p.axis, borderWidth: 1, padding: [10, 12],
      textStyle: { color: p.ink, fontSize: 12 },
      extraCssText: "border-radius:12px;box-shadow:0 10px 30px rgba(10,20,40,0.18);",
      axisPointer: { type: "line", lineStyle: { color: p.axis } },
    },
    legend: { bottom: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: p.soft, fontSize: 12 } },
    animationDuration: 600,
  };
}

/* Gestational and corrected age in the NICU's weeks+days notation (33+6 = 33 weeks 6 days; the
   week turns over on the 7th day; a whole week is written 33, not 33+0). Ages are stored as
   decimal weeks (weeks + days / 7). */
export const wd = (w: number | null | undefined, unit = " wk") => {
  if (w == null || !Number.isFinite(w)) return "–";
  const t = Math.round(w * 7);
  return `${Math.floor(t / 7)}${t % 7 ? `+${t % 7}` : ""}${unit}`;
};

/* Mix a colour towards white (t = 0: unchanged, 1: white). */
export const tint = (hex: string, t: number) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("");
};

export const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
export const num = (v: number | null | undefined, d = 1) => (v == null ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
