/**
 * m_inline_show — `local.m_inline_show:chart` 的块组件。
 *
 * 契约要点：宿主把 { language, source } 一次性交给我们（props-once），
 * 整块 chrome 交给 BlockFrame。这一层额外做两件事：
 *   1. 交互：悬停数值提示 + 十字准线、图例联动、滚轮缩放 / 拖动平移 / 双击复位
 *      —— 全在应用窗口里用 SVG 做，不需要任何 iframe 脚本
 *   2. 导出：下载 SVG / PNG（把 token 解析成具体色值，脱离宿主 CSS 也能看）
 */
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AXIS_PADDING as PADDING,
  BLOCK_HEIGHT,
  MAX_AXIS_LABELS,
  SPARK_PADDING,
  buildBarGroups,
  buildLineGeometry,
  buildPieSlices,
  formatNumber,
  fullWindow,
  indexAtRatio,
  labelAt,
  labelIndices,
  niceScale,
  parseChartSpec,
  pieMidPoint,
  pointRows,
  preferredWidth,
  seriesSlot,
  sliceSpec,
  zoomWindow,
} from "./chart-spec.mjs";
import { ActionButton, BlockFrame, DownloadMenu, Segmented, downloadPng, downloadSvg, kindIcon, useBlockTheme } from "./chrome.mjs";
import { useCopyAction, useSourcePicker } from "./copy-hook.mjs";
import { hostCopy } from "./host-bridge.mjs";
import { useEventProbe, useStatusWriter } from "./probe.mjs";

/** 少于这么多点就不提供缩放（没意义，还容易误触）。 */
const MIN_ZOOM_POINTS = 9;
/** 点太多时不画圆点，避免糊成一片。 */
const MAX_DOTS = 40;

const round = (value) => Math.round(value * 100) / 100;

function truncate(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function useMeasuredWidth(fallback = 680) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** 多系列共用一个 y 轴（各画各的就没法比了）。 */
function domainFor(series) {
  const values = series.flatMap((entry) => entry.values).filter((value) => Number.isFinite(value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  return niceScale(min, max);
}

/** 网格线 + y 轴刻度文本。 */
function axisGrid(scale, { width, height }) {
  const innerH = height - PADDING.top - PADDING.bottom;
  const span = Math.max(1e-9, scale.max - scale.min);
  const yAt = (value) => PADDING.top + innerH - ((value - scale.min) / span) * innerH;
  const children = [];
  scale.ticks.forEach((tick) => {
    const y = round(yAt(tick));
    children.push(
      h("line", {
        key: `grid-${tick}`,
        className: "ldp-grid",
        x1: PADDING.left,
        x2: width - PADDING.right,
        y1: y,
        y2: y,
      }),
      h(
        "text",
        { key: `tick-${tick}`, className: "ldp-tick", x: PADDING.left - 8, y: y + 4, textAnchor: "end" },
        formatNumber(tick),
      ),
    );
  });
  return { children, yAt };
}

/* ────────────────────────────── 悬停提示 ────────────────────────────── */

function Tooltip({ x, y, title, rows }) {
  return h(
    "div",
    { className: "ldp-tip", style: { left: `${round(x)}px`, top: `${round(y - 10)}px` } },
    h("div", { className: "ldp-tip-title" }, title),
    rows.map((row) =>
      h(
        "div",
        { className: "ldp-tip-row", key: row.key },
        h("span", { className: `ldp-swatch ldp-s${row.slot}` }),
        h("span", { className: "ldp-tip-name" }, row.name),
        h("span", { className: "ldp-tip-value" }, row.text),
      ),
    ),
  );
}

function numberText(value, unit) {
  if (!Number.isFinite(value)) return "–";
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

/** 数据下标 → 提示内容（line / bar 共用）。 */
function rowsAtIndex(spec, index) {
  return pointRows(spec, index)
    .filter((row) => Number.isFinite(row.value))
    .map((row, order) => ({
      key: `${row.name}-${order}`,
      name: row.name,
      slot: row.slot,
      text: numberText(row.value, spec.unit),
    }));
}

/* ────────────────────────────── 交互外壳 ────────────────────────────── */

/**
 * 图表外壳：负责指针位置 → 数据下标、滚轮缩放、拖动平移、双击复位。
 * 子元素（svg + 提示）都放在这个 `position: relative` 的盒子里，所以提示可以用像素定位。
 */
function PlotShell({ height, count, view, zoomable, onZoomAction, onHover, onLeave, children }) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  const stateRef = useRef({ view, count, zoomable });
  stateRef.current = { view, count, zoomable };

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      const state = stateRef.current;
      if (!state.zoomable || !state.count) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
      const index = indexAtRatio(state.view, ratio, state.count);
      const span = Math.max(1, state.view.end - state.view.start);
      const anchor = (index - state.view.start) / span;
      onZoomAction({ type: "zoom", direction: event.deltaY < 0 ? "in" : "out", anchor });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [onZoomAction]);

  const local = (event) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, ratio: 0 };
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      ratio: rect.width ? (event.clientX - rect.left) / rect.width : 0,
      width: rect.width,
    };
  };

  return h(
    "div",
    {
      ref,
      className: `ldp-plot${zoomable ? " is-zoomable" : ""}`,
      style: { height: `${height}px` },
      onPointerDown: (event) => {
        if (!zoomable || event.button !== 0) return;
        const state = stateRef.current;
        dragRef.current = {
          startX: event.clientX,
          view: state.view,
          width: local(event).width || 1,
          moved: false,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event) => {
        const drag = dragRef.current;
        if (drag) {
          const dx = event.clientX - drag.startX;
          if (Math.abs(dx) > 2) drag.moved = true;
          if (drag.moved) {
            onZoomAction({ type: "pan", ratio: -(dx / drag.width), from: drag.view });
          }
          return;
        }
        const state = stateRef.current;
        if (!state.count) return;
        const point = local(event);
        onHover(point, indexAtRatio(state.view, point.ratio, state.count));
      },
      onPointerLeave: () => {
        dragRef.current = null;
        onLeave();
      },
      onPointerUp: () => {
        dragRef.current = null;
      },
      onPointerCancel: () => {
        dragRef.current = null;
      },
      onDoubleClick: () => {
        if (zoomable) onZoomAction({ type: "reset" });
      },
    },
    children,
  );
}

/* ────────────────────────────── 各类型 ────────────────────────────── */

function LinePlot({ spec, width, view, zoomable, onZoomAction, dimSlot, svgRef }) {
  const height = BLOCK_HEIGHT.line;
  const [hover, setHover] = useState(null);
  const sliced = useMemo(() => sliceSpec(spec, view), [spec, view.start, view.end]);
  const scale = useMemo(() => domainFor(sliced.series), [sliced]);
  const geometries = useMemo(
    () =>
      sliced.series.map((entry) =>
        buildLineGeometry(entry.values, { width, height, padding: PADDING, domain: scale }),
      ),
    [sliced, width, scale],
  );

  const { children } = axisGrid(scale, { width, height });
  const count = sliced.series[0]?.values.length ?? 0;
  const innerW = width - PADDING.left - PADDING.right;
  const xAt = (index) => round(PADDING.left + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW));
  labelIndices(count, MAX_AXIS_LABELS).forEach((index) => {
    children.push(
      h(
        "text",
        { key: `xlabel-${index}`, className: "ldp-tick", x: xAt(index), y: height - 6, textAnchor: "middle" },
        truncate(labelAt(sliced, index), 10),
      ),
    );
  });

  const single = sliced.series.length === 1;
  const seriesNodes = geometries.map((geometry, slot) => {
    const dim = dimSlot !== null && dimSlot !== slot;
    return h(
      "g",
      { key: `series-${slot}`, className: `ldp-series ldp-s${seriesSlot(slot)}${dim ? " is-dim" : ""}` },
      single ? h("path", { className: "ldp-area", d: geometry.area }) : null,
      h("path", { className: "ldp-line", d: geometry.line, pathLength: 1 }),
      count <= MAX_DOTS
        ? geometry.points.map((point) =>
            point ? h("circle", { key: `dot-${point.index}`, className: "ldp-dot", cx: point.x, cy: point.y, r: 2.5 }) : null,
          )
        : null,
    );
  });

  let overlay = null;
  let tip = null;
  if (hover && hover.index >= view.start && hover.index <= view.end) {
    const local = hover.index - view.start;
    const x = xAt(local);
    const rings = geometries.map((geometry, slot) => {
      const point = geometry.points[local];
      if (!point) return null;
      return h("circle", {
        key: `ring-${slot}`,
        className: `ldp-dot-ring ldp-s${seriesSlot(slot)}`,
        cx: point.x,
        cy: point.y,
        r: 4.5,
      });
    });
    overlay = h(
      "g",
      null,
      h("line", { className: "ldp-crosshair", x1: x, x2: x, y1: PADDING.top, y2: height - PADDING.bottom }),
      rings,
    );
    const rows = rowsAtIndex(spec, hover.index);
    if (rows.length) {
      tip = h(Tooltip, { x: hover.x, y: hover.y, title: labelAt(spec, hover.index), rows });
    }
  }

  return h(
    PlotShell,
    {
      height,
      count: spec.series[0]?.values.length ?? 0,
      view,
      zoomable,
      onZoomAction,
      onHover: (point, index) => setHover({ x: point.x, y: point.y, index }),
      onLeave: () => setHover(null),
    },
    h(
      "svg",
      {
        ref: svgRef,
        className: "ldp-svg",
        viewBox: `0 0 ${width} ${height}`,
        width: "100%",
        height,
        role: "img",
      },
      children,
      seriesNodes,
      overlay,
    ),
    tip,
  );
}

function BarPlot({ spec, width, view, zoomable, onZoomAction, dimSlot, svgRef }) {
  const height = BLOCK_HEIGHT.bar;
  const [hover, setHover] = useState(null);
  const sliced = useMemo(() => sliceSpec(spec, view), [spec, view.start, view.end]);
  const { scale, bars, groupWidth } = useMemo(
    () => buildBarGroups(sliced.series, { width, height, padding: PADDING, domain: domainFor(sliced.series) }),
    [sliced, width],
  );

  const { children, yAt } = axisGrid(scale, { width, height });
  const baseline = round(yAt(Math.max(scale.min, 0)));
  const slots = Math.max(...sliced.series.map((entry) => entry.values.length), 1);
  labelIndices(slots, MAX_AXIS_LABELS).forEach((index) => {
    children.push(
      h(
        "text",
        {
          key: `xlabel-${index}`,
          className: "ldp-tick",
          x: round(PADDING.left + index * groupWidth + groupWidth / 2),
          y: height - 6,
          textAnchor: "middle",
        },
        truncate(labelAt(sliced, index), 10),
      ),
    );
  });

  let highlight = null;
  let tip = null;
  if (hover && hover.index >= view.start && hover.index <= view.end) {
    const local = hover.index - view.start;
    highlight = h("rect", {
      className: "ldp-group-hl",
      x: round(PADDING.left + local * groupWidth + groupWidth * 0.06),
      y: PADDING.top,
      width: round(groupWidth * 0.88),
      height: round(height - PADDING.top - PADDING.bottom),
      rx: 4,
    });
    const rows = rowsAtIndex(spec, hover.index);
    if (rows.length) tip = h(Tooltip, { x: hover.x, y: hover.y, title: labelAt(spec, hover.index), rows });
  }

  const rects = bars.map((bar) => {
    const dim = dimSlot !== null && dimSlot !== bar.seriesIndex;
    return h("rect", {
      key: `bar-${bar.seriesIndex}-${bar.index}`,
      className: `ldp-series ldp-fill ldp-s${seriesSlot(bar.seriesIndex)}${dim ? " is-dim" : ""}`,
      x: bar.x,
      y: bar.y,
      width: bar.w,
      height: bar.h,
      rx: 3,
    });
  });

  return h(
    PlotShell,
    {
      height,
      count: Math.max(...spec.series.map((entry) => entry.values.length), 0),
      view,
      zoomable,
      onZoomAction,
      onHover: (point, index) => setHover({ x: point.x, y: point.y, index }),
      onLeave: () => setHover(null),
    },
    h(
      "svg",
      {
        ref: svgRef,
        className: "ldp-svg",
        viewBox: `0 0 ${width} ${height}`,
        width: "100%",
        height,
        role: "img",
      },
      children,
      highlight,
      h("line", { className: "ldp-axis", x1: PADDING.left, x2: width - PADDING.right, y1: baseline, y2: baseline }),
      rects,
    ),
    tip,
  );
}

function PiePlot({ spec, width, svgRef }) {
  const height = BLOCK_HEIGHT.pie;
  const [hover, setHover] = useState(null);
  const radius = Math.max(40, Math.min(height / 2 - 12, 96));
  const cx = radius + 10;
  const cy = height / 2;
  const innerRadius = radius * 0.58;
  const { slices, skipped } = useMemo(
    () => buildPieSlices(spec.series[0]?.values ?? [], { cx, cy, radius, innerRadius }),
    [spec, cx, cy, radius, innerRadius],
  );
  if (!slices.length) return h("div", { className: "ldp-empty" }, "饼图需要至少一个正数。");

  const labels = spec.x.length ? spec.x : spec.series[0].values.map((_, index) => `#${index + 1}`);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  const mark = (slice) => {
    if (!slice) return null;
    const point = pieMidPoint(cx, cy, radius, slice.midAngle, innerRadius);
    return h("circle", {
      className: `ldp-dot-ring ldp-s${seriesSlot(slice.index)}`,
      cx: point.x,
      cy: point.y,
      r: 4,
    });
  };

  return h(
    "div",
    { className: "ldp-pie" },
    h(
      "div",
      {
        className: "ldp-plot",
        style: { width: `${radius * 2 + 20}px`, height: `${height}px`, flex: "0 0 auto" },
      },
      h(
        "svg",
        {
          ref: svgRef,
          className: "ldp-svg",
          viewBox: `0 0 ${radius * 2 + 20} ${height}`,
          role: "img",
        },
        slices.map((slice) =>
          h("path", {
            key: `slice-${slice.index}`,
            className: `ldp-series ldp-fill ldp-s${seriesSlot(slice.index)}${hover && hover.index !== slice.index ? " is-dim" : ""}`,
            d: slice.path,
            onPointerMove: (event) => {
              const rect = event.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
              const point = rect
                ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
                : { x: cx, y: cy };
              setHover({ index: slice.index, ...point });
            },
            onPointerLeave: () => setHover(null),
          }),
        ),
        hover ? mark(slices.find((slice) => slice.index === hover.index)) : null,
      ),
      hover
        ? h(Tooltip, {
            x: hover.x,
            y: hover.y,
            title: truncate(labels[hover.index] ?? `#${hover.index + 1}`, 18),
            rows: [
              {
                key: "slice",
                name: slices.find((slice) => slice.index === hover.index)?.percent.toFixed(1) + "%",
                slot: seriesSlot(hover.index),
                text: numberText(slices.find((slice) => slice.index === hover.index)?.value, spec.unit),
              },
            ],
          })
        : null,
    ),
    h(
      "ul",
      { className: "ldp-legend" },
      slices.map((slice) =>
        h(
          "li",
          {
            key: `legend-${slice.index}`,
            className: hover && hover.index !== slice.index ? "is-dim" : "",
            onPointerEnter: () => setHover({ index: slice.index, x: radius + 10, y: height / 2 }),
            onPointerLeave: () => setHover(null),
          },
          h("span", { className: `ldp-swatch ldp-s${seriesSlot(slice.index)}` }),
          h("span", { className: "ldp-legend-name" }, truncate(labels[slice.index] ?? `#${slice.index + 1}`, 16)),
          h(
            "span",
            { className: "ldp-legend-value" },
            `${formatNumber(slice.value)} · ${slice.percent.toFixed(1)}%`,
          ),
        ),
      ),
      skipped ? h("li", { className: "ldp-legend-note" }, `已跳过 ${skipped} 个非正数`) : null,
      total <= 0 ? h("li", { className: "ldp-legend-note" }, "没有正值") : null,
    ),
  );
}

function SparkPlot({ spec, width, svgRef }) {
  const height = BLOCK_HEIGHT.spark;
  const geometry = buildLineGeometry(spec.series[0]?.values ?? [], {
    width,
    height,
    padding: SPARK_PADDING,
  });
  return h(
    "svg",
    { ref: svgRef, className: "ldp-svg", viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img" },
    h("path", { className: "ldp-area ldp-s1", d: geometry.area }),
    h("path", { className: "ldp-line ldp-s1", d: geometry.line, pathLength: 1 }),
  );
}

/* ────────────────────────────── 块 ────────────────────────────── */

function errorBlock(message, source) {
  return h(
    "div",
    { className: "ldp-error" },
    h("div", { className: "ldp-error-title" }, "图表规格无法渲染"),
    h("div", { className: "ldp-error-msg" }, message),
    h("details", null, h("summary", null, "查看原文"), h("pre", { className: "ldp-src" }, source)),
  );
}

export function ChartBlock({ language, source }) {
  const parsed = useMemo(() => parseChartSpec(source), [source]);
  const [containerRef, width] = useMeasuredWidth();
  const svgRef = useRef(null);
  const [mode, setMode] = useState("chart");
  const [view, setView] = useState(() => fullWindow(1));
  const [dimSlot, setDimSlot] = useState(null);
  const statusRef = useRef(null);
  const writeStatus = useStatusWriter(statusRef);
  const copy = useCopyAction(source, { host: hostCopy, report: writeStatus });
  const probe = useEventProbe(statusRef, writeStatus, copy.run);
  const picker = useSourcePicker(writeStatus);
  const theme = useBlockTheme();

  const spec = parsed.ok ? parsed.spec : null;
  const total = spec ? Math.max(...spec.series.map((entry) => entry.values.length), 0) : 0;
  const zoomable = Boolean(spec) && (spec.type === "line" || spec.type === "bar") && total >= MIN_ZOOM_POINTS;
  const plotWidth = Math.max(240, width);

  useEffect(() => {
    setView(fullWindow(total || 1));
    setDimSlot(null);
  }, [source, total]);

  const applyZoom = useCallback(
    (action) => {
      setView((prev) => {
        const next = zoomWindow(prev, action, total);
        return next.start === prev.start && next.end === prev.end ? prev : next;
      });
    },
    [total],
  );

  const zoomed = zoomable && (view.start > 0 || view.end < total - 1);

  const onDownload = (kind) => {
    try {
      const name = `chart-${spec?.type ?? "line"}.${kind}`;
      if (kind === "png") {
        writeStatus("导出 PNG…");
        void downloadPng(svgRef.current, { theme, filename: name })
          .then(() => writeStatus("已导出 PNG"))
          .catch((error) => writeStatus(`PNG 导出失败：${error?.message ?? error}`));
        return;
      }
      const bytes = downloadSvg(svgRef.current, { theme, filename: name });
      writeStatus(`已导出 SVG（${Math.round(bytes / 1024)} KB）`);
    } catch (error) {
      writeStatus(`导出失败：${error?.message ?? error}`);
    }
  };

  if (!parsed.ok) {
    return h(BlockFrame, {
      language,
      kind: "chart",
      icon: kindIcon("chart"),
      title: "图表",
      badge: "error",
      status: "就绪：等待点击",
      statusRef,
      children: errorBlock(parsed.error, source),
    });
  }

  const unit = spec.unit ? ` (${spec.unit})` : "";
  const badge = `${spec.type}${spec.series.length > 1 ? ` · ${spec.series.length} 条系列` : ""}${unit}`;
  const blockWidth =
    spec.width === "full" ? "100%" : typeof spec.width === "number" ? spec.width : preferredWidth(spec);

  const plot =
    spec.type === "pie"
      ? h(PiePlot, { spec, width: plotWidth, svgRef })
      : spec.type === "spark"
        ? h(SparkPlot, { spec, width: plotWidth, svgRef })
        : spec.type === "bar"
          ? h(BarPlot, { spec, width: plotWidth, view, zoomable, onZoomAction: applyZoom, dimSlot, svgRef })
          : h(LinePlot, { spec, width: plotWidth, view, zoomable, onZoomAction: applyZoom, dimSlot, svgRef });

  const legend =
    spec.series.length > 1 && spec.type !== "pie"
      ? h(
          "ul",
          { className: "ldp-legend ldp-legend-inline" },
          spec.series.map((entry, slot) =>
            h(
              "li",
              {
                key: `series-${slot}`,
                className: dimSlot !== null && dimSlot !== slot ? "is-dim" : "",
                onPointerEnter: () => setDimSlot(slot),
                onPointerLeave: () => setDimSlot(null),
              },
              h("span", { className: `ldp-swatch ldp-s${seriesSlot(slot)}` }),
              h("span", { className: "ldp-legend-name" }, truncate(entry.name || `系列 ${slot + 1}`, 20)),
              h(
                "span",
                { className: "ldp-legend-value" },
                formatNumber(entry.values.filter((value) => Number.isFinite(value)).slice(-1)[0] ?? NaN),
              ),
            ),
          ),
        )
      : null;

  const zoomBar = zoomable
    ? h(
        "div",
        { className: "ldp-zoombar" },
        h("span", { className: zoomed ? "ldp-zoom-range" : undefined }, zoomed ? `${view.start + 1}–${view.end + 1} / ${total}` : "滚轮缩放 · 拖动平移 · 双击复位"),
        h("span", { className: "ldp-spacer" }),
        zoomed ? h(ActionButton, { label: "复位", title: "恢复完整范围", onClick: () => applyZoom({ type: "reset" }) }) : null,
      )
    : null;

  const sourceView = h(
    "div",
    { className: "ldp-source-view" },
    h(
      "div",
      { className: "ldp-source-bar" },
      h("span", null, `${source.length} 字符`),
      h("span", { className: "ldp-spacer" }),
      h(ActionButton, {
        label: "选取",
        title: "选中原文，便于手动复制",
        onClick: () => picker.pick(),
      }),
    ),
    h("pre", { className: "ldp-src", ref: picker.preRef, tabIndex: 0 }, source),
  );

  return h(BlockFrame, {
    language,
    kind: "chart",
    type: spec.type,
    icon: kindIcon("chart"),
    title: spec.title || "图表",
    badge,
    width: blockWidth,
    bodyRef: containerRef,
    actions: [
      h(ActionButton, {
        key: "copy",
        label: copy.label,
        title: copy.title,
        active: copy.state !== "idle",
        buttonRef: probe.buttonRef,
        onClick: copy.run,
      }),
      spec.type === "spark" ? null : h(DownloadMenu, { key: "download", onPick: onDownload }),
      h(Segmented, {
        key: "mode",
        value: mode,
        options: [
          { value: "chart", label: "图", title: "显示图形" },
          { value: "source", label: "源码", title: "显示围栏原文" },
        ],
        onChange: setMode,
      }),
    ],
    children: mode === "source" ? sourceView : plot,
    status: "就绪：等待点击",
    statusRef,
    notes: [
      mode === "chart" ? legend : null,
      mode === "chart" ? zoomBar : null,
      spec.invalid ? h("div", { key: "invalid", className: "ldp-note" }, `已忽略 ${spec.invalid} 个非数值数据点`) : null,
    ],
  });
}
