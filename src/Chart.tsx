import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/* One ECharts canvas: redrawn when its options change, resized with its card. */
export default function Chart({ option, height = 300, label }: { option: object; height?: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!el.current) return;
    chart.current = echarts.init(el.current, undefined, { renderer: "canvas" });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(option as echarts.EChartsOption, true);
  }, [option]);
  return <div ref={el} className="chart" style={{ height }} role="img" aria-label={label} />;
}
