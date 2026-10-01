/**
 * m_inline_show — chart 的纯逻辑层。
 *
 * 这里只做「规格解析 + SVG 几何计算」，不 import react，也不碰 DOM，
 * 所以可以直接用 node 跑离线自测（见 README「自测」一节）。
 * 组件层在 ./chart.mjs。
 */

export const CHART_TYPES = ["line", "bar", "pie", "spark"];

/** 宿主在 4000px 处把插件块判为渲染失败；我们自己留出余量。 */
export const MAX_BLOCK_HEIGHT_PX = 3600;
export const MAX_SERIES = 8;
export const MAX_POINTS = 5000;
/** 调色板槽位数：与 tokens.mjs 的 SERIES_HUES 数量一致（最多 8 条系列各一色）。 */
export const PALETTE_SLOTS = 8;

/** 各类型默认绘制高度（固定高度，不触发宿主的高度兜底）。 */
export const BLOCK_HEIGHT = { line: 240, bar: 240, pie: 220, spark: 64 };

/** 各类型绘制时的水平留白与轴标签上限（几何与宽度估算共用）。 */
export const AXIS_PADDING = { left: 52, right: 14, top: 10, bottom: 24 };
export const SPARK_PADDING = { left: 6, right: 6, top: 6, bottom: 6 };
export const MAX_AXIS_LABELS = 8;

/** 块宽度：下限保证坐标轴与标题放得下，上限避免小图也拉满聊天栏。 */
export const MIN_CHART_WIDTH_PX = 260;
export const MAX_CHART_WIDTH_PX = 560;
/** sparkline 是窄条趋势线，宽度恒定，不参与自适应。 */
export const SPARK_WIDTH_PX = 240;
/** 围栏里 width 字段的档位写法。 */
export const WIDTH_PRESETS = { sm: 320, md: 440, lg: 560 };

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function label(value) {
  if (typeof value === "string") return value;
  if (isFiniteNumber(value)) return formatNumber(value);
  if (value === null || value === undefined) return "";
  return String(value);
}

function errorMessage(error) {
  return error && typeof error.message === "string" ? error.message : String(error);
}

/** "12"、"1,234"、"45%" → 数字；其余 → null。 */
export function toNumber(value) {
  if (isFiniteNumber(value)) return value;
  if (typeof value === "string") {
    const raw = value.trim().replace(/[,%\s]/g, "");
    if (raw === "") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** 一张图里第 n 条系列用的调色板槽位（1..6）。 */
export function seriesSlot(index) {
  return (Math.abs(index) % PALETTE_SLOTS) + 1;
}

function toValues(input) {
  const list = Array.isArray(input) ? input : [];
  let invalid = 0;
  const values = list.map((item) => {
    const parsed = toNumber(item);
    if (parsed === null) {
      invalid += 1;
      return null;
    }
    return parsed;
  });
  return { values, invalid };
}

/**
 * 收集系列数据。支持四种写法：
 *   series: [{ name, values: [...] }]
 *   values: [...]                     （单系列）
 *   data:   [{ label, value }] 或 [12, 18]
 *   根级数组 [...]                    （单系列）
 * 返回 null 表示完全找不到数据。
 */
function collectSeries(raw) {
  if (Array.isArray(raw?.series)) {
    const series = raw.series.map((entry, index) => {
      const name = text(entry?.name) || `系列 ${index + 1}`;
      const source = Array.isArray(entry) ? entry : entry?.values ?? entry?.data ?? [];
      return { name, ...toValues(source) };
    });
    return series.length ? series : null;
  }
  if (Array.isArray(raw?.values)) {
    const single = toValues(raw.values);
    return [{ name: "值", ...single }];
  }
  if (Array.isArray(raw?.data)) {
    const values = raw.data.map((entry) => (entry && typeof entry === "object" ? entry.value : entry));
    const single = toValues(values);
    return [{ name: "值", ...single }];
  }
  if (Array.isArray(raw)) {
    const single = toValues(raw);
    return [{ name: "值", ...single }];
  }
  return null;
}

function labelsFrom(root) {
  if (Array.isArray(root?.x)) return root.x.map(label);
  if (Array.isArray(root?.data)) {
    return root.data.map((entry) => (entry && typeof entry === "object" ? label(entry.label ?? entry.name) : ""));
  }
  return [];
}

/** 宽字符（CJK、全角）按 1em 估，其余按 0.55em —— 只用来挑宽度，不要求精确。 */
const WIDE_CHAR = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

export function estimateTextWidth(value, fontSize = 12) {
  const str = typeof value === "string" ? value : "";
  let em = 0;
  for (const char of str) em += WIDE_CHAR.test(char) ? 1 : 0.55;
  return em * fontSize;
}

function clampWidthPx(px) {
  return Math.round(Math.max(MIN_CHART_WIDTH_PX, Math.min(MAX_CHART_WIDTH_PX, px)));
}

/**
 * 围栏里的 `width` 字段。
 * @returns {"auto" | "full" | number | null} null 表示写法不认识（由调用方报错）
 */
export function parseWidth(value) {
  if (value === undefined || value === null) return "auto";
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? clampWidthPx(value) : null;
  }
  const raw = text(value).toLowerCase();
  if (!raw || raw === "auto") return "auto";
  if (raw === "full") return "full";
  if (Object.prototype.hasOwnProperty.call(WIDTH_PRESETS, raw)) return WIDTH_PRESETS[raw];
  const numeric = toNumber(raw);
  return numeric !== null && numeric > 0 ? clampWidthPx(numeric) : null;
}

/** 块头部（标题 + 徽标 + 三个动作按钮）至少要放得下多宽。 */
function headWidth(spec) {
  const title = estimateTextWidth(text(spec?.title) || "图表", 12);
  const badge = estimateTextWidth("spark · 8 条系列 (ms)", 10.5);
  const actions = 3 * 37 + 3 * 6;
  return 20 + title + 6 + badge + 6 + actions;
}

function pieWidth(spec) {
  const radius = Math.max(40, Math.min(BLOCK_HEIGHT.pie / 2 - 12, 96));
  const longest = (spec?.x ?? []).reduce(
    (max, name) => Math.max(max, estimateTextWidth(String(name ?? "").slice(0, 16), 12)),
    0,
  );
  const value = estimateTextWidth("0 · 100.0%", 12);
  return 20 + (radius * 2 + 20) + 12 + 9 + 6 + longest + 8 + value;
}

/**
 * 按内容估算「贴合」的块宽度：数据少就窄，数据多才放宽到上限。
 * 纯观感参数，不影响任何取值正确性。
 */
export function preferredWidth(spec, { min = MIN_CHART_WIDTH_PX, max = MAX_CHART_WIDTH_PX } = {}) {
  const type = spec?.type ?? "line";
  if (type === "spark") return SPARK_WIDTH_PX;

  const series = Array.isArray(spec?.series) ? spec.series : [];
  const slots = Math.max(1, series.length);
  const points = series.reduce((most, entry) => Math.max(most, (entry?.values ?? []).length), 0);

  let body;
  if (type === "pie") {
    body = pieWidth(spec);
  } else if (type === "bar") {
    const perBar = slots > 1 ? 40 : 54;
    body = AXIS_PADDING.left + AXIS_PADDING.right + perBar * Math.max(1, points) * (slots > 1 ? slots : 1);
  } else {
    body = AXIS_PADDING.left + AXIS_PADDING.right + 52 * Math.max(0, points - 1);
  }

  const wanted = Math.max(body, headWidth(spec));
  return Math.round(Math.max(min, Math.min(max, wanted)));
}

/**
 * 解析围栏正文。
 * @returns {{ok: true, spec: object} | {ok: false, error: string}}
 */
export function parseChartSpec(source) {
  const raw = typeof source === "string" ? source.trim() : "";
  if (!raw) return { ok: false, error: "空的 chart 规格：围栏里需要一段 JSON。" };

  let root;
  try {
    root = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${errorMessage(error)}` };
  }

  const type = text(root?.type).toLowerCase() || "line";
  if (!CHART_TYPES.includes(type)) {
    return { ok: false, error: `不支持的 type「${type}」；可用：${CHART_TYPES.join(" / ")}。` };
  }

  const width = parseWidth(root?.width);
  if (width === null) {
    return {
      ok: false,
      error: `不支持的 width「${label(root?.width)}」；可用 auto / full / sm / md / lg，或像素数（${MIN_CHART_WIDTH_PX}–${MAX_CHART_WIDTH_PX}）。`,
    };
  }

  const series = collectSeries(root);
  if (!series) {
    return {
      ok: false,
      error: "找不到数据：请给出 series:[{name,values:[…]}]、values:[…] 或 data:[{label,value}]。",
    };
  }
  if (series.length > MAX_SERIES) {
    return { ok: false, error: `系列过多（${series.length} 条），最多 ${MAX_SERIES} 条。` };
  }

  const points = series.reduce(
    (total, entry) => total + entry.values.filter(isFiniteNumber).length,
    0,
  );
  if (points === 0) return { ok: false, error: "没有可绘制的数值（所有值都不是有限数字）。" };
  if (points > MAX_POINTS) {
    return { ok: false, error: `数据点过多（${points}），上限 ${MAX_POINTS}。` };
  }

  const invalid = series.reduce((total, entry) => total + entry.invalid, 0);
  return {
    ok: true,
    spec: {
      type,
      title: text(root?.title),
      unit: text(root?.unit),
      x: labelsFrom(root),
      series: series.map(({ name, values }) => ({ name, values })),
      invalid,
      width,
    },
  };
}

/** 轴刻度：取「好看」的步长，并保证 0 在范围内。 */
export function niceScale(min, max, count = 4) {
  let lo = isFiniteNumber(min) ? min : 0;
  let hi = isFiniteNumber(max) ? max : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.5;
    lo -= pad;
    hi += pad;
  }
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);

  const span = hi - lo || 1;
  let step = niceStep(span / Math.max(1, count));
  let ticks = Math.floor(span / step) + 1;
  for (let guard = 0; ticks > 10 && guard < 8; guard += 1) {
    step = niceStep(step * 2);
    ticks = Math.floor(span / step) + 1;
  }

  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step))));
  const out = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    out.push(Number(value.toFixed(decimals)));
  }
  return { min: niceMin, max: niceMax, step, ticks: out };
}

function niceStep(raw) {
  if (!isFiniteNumber(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exponent;
  const multiple = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return multiple * 10 ** exponent;
}

/** 轴标签/图例用的紧凑数字文本。 */
export function formatNumber(value) {
  if (!isFiniteNumber(value)) return "–";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trimZero(value / 1e9)}B`;
  if (abs >= 1e6) return `${trimZero(value / 1e6)}M`;
  if (abs >= 1e4) return `${trimZero(value / 1e3)}k`;
  if (abs >= 100) return String(Math.round(value));
  if (abs >= 1) return trimZero(Math.round(value * 100) / 100);
  if (abs === 0) return "0";
  return trimZero(Number(value.toPrecision(3)));
}

function trimZero(value) {
  return String(Number(value.toFixed(3)));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function scaleOf(values, domain) {
  const finite = values.filter(isFiniteNumber);
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 0;
  return domain ?? niceScale(min, max);
}

function valueRange(series) {
  const all = series.flatMap((entry) => entry.values).filter(isFiniteNumber);
  return { min: all.length ? Math.min(...all) : 0, max: all.length ? Math.max(...all) : 0 };
}

/** 折线几何（同时给出面积路径与点坐标；null 值断线）。 */
export function buildLineGeometry(values, { width, height, padding, domain }) {
  const pad = padding;
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const scale = scaleOf(values, domain);
  const span = Math.max(1e-9, scale.max - scale.min);
  const count = values.length;
  const xAt = (index) => pad.left + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW);
  const yAt = (value) => pad.top + innerH - ((value - scale.min) / span) * innerH;

  const segments = [];
  const points = [];
  let current = null;
  values.forEach((value, index) => {
    if (!isFiniteNumber(value)) {
      current = null;
      points.push(null);
      return;
    }
    const point = { x: round2(xAt(index)), y: round2(yAt(value)), value, index };
    points.push(point);
    if (!current) {
      current = [];
      segments.push(current);
    }
    current.push(point);
  });

  const line = segments
    .map((segment) => `M${segment.map((point) => `${point.x} ${point.y}`).join(" L")}`)
    .join(" ");
  const area = segments
    .filter((segment) => segment.length > 1)
    .map((segment) => {
      const baseline = round2(yAt(Math.max(scale.min, 0)));
      const first = segment[0];
      const last = segment[segment.length - 1];
      return `M${first.x} ${baseline} L${segment.map((point) => `${point.x} ${point.y}`).join(" L")} L${last.x} ${baseline} Z`;
    })
    .join(" ");

  return { scale, line, area, points, segments: segments.length };
}

/** 柱状几何（多系列并排分组）。 */
export function buildBarGroups(series, { width, height, padding, domain }) {
  const pad = padding;
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const { min, max } = valueRange(series);
  const scale = domain ?? niceScale(min, max);
  const span = Math.max(1e-9, scale.max - scale.min);
  const slots = Math.max(...series.map((entry) => entry.values.length), 1);
  const groupWidth = innerW / slots;
  const barWidth = Math.max(1, (groupWidth * 0.7) / series.length);
  const baseline = pad.top + innerH - ((Math.max(scale.min, 0) - scale.min) / span) * innerH;
  const yAt = (value) => pad.top + innerH - ((value - scale.min) / span) * innerH;

  const bars = [];
  series.forEach((entry, seriesIndex) => {
    entry.values.forEach((value, index) => {
      if (!isFiniteNumber(value)) return;
      const groupStart = pad.left + index * groupWidth + groupWidth * 0.15;
      const x = groupStart + seriesIndex * barWidth;
      const y = Math.min(yAt(value), baseline);
      const h = Math.max(1, Math.abs(baseline - yAt(value)));
      bars.push({
        seriesIndex,
        index,
        x: round2(x),
        y: round2(y),
        w: round2(Math.max(1, barWidth - Math.min(2, barWidth * 0.15))),
        h: round2(h),
        value,
      });
    });
  });

  return { scale, bars, baseline: round2(baseline), groupWidth: round2(groupWidth) };
}

function polar(cx, cy, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

/** 环形扇区路径。 */
export function pieSlicePath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const sweep = Math.min(359.999, Math.max(0, endAngle - startAngle));
  const end = startAngle + sweep;
  const outerStart = polar(cx, cy, outerRadius, startAngle);
  const outerEnd = polar(cx, cy, outerRadius, end);
  const innerEnd = polar(cx, cy, innerRadius, end);
  const innerStart = polar(cx, cy, innerRadius, startAngle);
  const large = sweep > 180 ? 1 : 0;
  return [
    `M${round2(outerStart.x)} ${round2(outerStart.y)}`,
    `A${outerRadius} ${outerRadius} 0 ${large} 1 ${round2(outerEnd.x)} ${round2(outerEnd.y)}`,
    `L${round2(innerEnd.x)} ${round2(innerEnd.y)}`,
    `A${innerRadius} ${innerRadius} 0 ${large} 0 ${round2(innerStart.x)} ${round2(innerStart.y)}`,
    "Z",
  ].join(" ");
}

/** 饼/环图切片；非正数被跳过并计数。 */
export function buildPieSlices(values, { cx, cy, radius, innerRadius }) {
  const entries = values
    .map((value, index) => ({ index, value }))
    .filter((entry) => isFiniteNumber(entry.value) && entry.value > 0);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const slices = [];
  let angle = 0;
  entries.forEach((entry) => {
    const sweep = total > 0 ? (entry.value / total) * 360 : 0;
    slices.push({
      index: entry.index,
      value: entry.value,
      percent: total > 0 ? (entry.value / total) * 100 : 0,
      startAngle: angle,
      endAngle: angle + sweep,
      midAngle: angle + sweep / 2,
      path: pieSlicePath(cx, cy, radius, innerRadius, angle, angle + sweep),
    });
    angle += sweep;
  });
  return { slices, total, skipped: values.length - entries.length };
}

/** 只显示有限个 x 轴标签，避免重叠。 */
export function labelIndices(count, maxLabels = 8) {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil(count / maxLabels);
  const out = [];
  for (let index = 0; index < count; index += step) out.push(index);
  const last = count - 1;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/* ────────────── 交互（缩放 / 悬停）纯逻辑 ────────────── */

/** 完整可见窗口。 */
export function fullWindow(count) {
  return { start: 0, end: Math.max(0, (Number(count) || 1) - 1) };
}

function clampWindow(start, end, count, minSpan) {
  const last = Math.max(0, count - 1);
  const maxSpan = Math.max(1, last);
  const min = Math.min(Math.max(1, minSpan), maxSpan);
  let lo = Math.round(start);
  let hi = Math.round(end);
  if (hi - lo > maxSpan) hi = lo + maxSpan;
  if (hi - lo < min) hi = lo + min;
  if (lo < 0) {
    hi -= lo;
    lo = 0;
  }
  if (hi > last) {
    lo -= hi - last;
    hi = last;
  }
  return { start: Math.max(0, lo), end: Math.min(last, hi) };
}

/**
 * 按动作算出新的可见窗口（下标闭区间）。
 * action: {type:"zoom", direction:"in"|"out", anchor:0..1} | {type:"pan", ratio} | {type:"reset"}
 */
export function zoomWindow(window, action, count, { minSpan = 2 } = {}) {
  const last = Math.max(0, (Number(count) || 1) - 1);
  if (last < 1) return { start: 0, end: last };
  const base = action?.from ?? window;
  const current = clampWindow(base?.start ?? 0, base?.end ?? last, count, minSpan);
  const type = action?.type;
  if (type === "reset") return { start: 0, end: last };

  const span = current.end - current.start;
  const anchor = Math.min(1, Math.max(0, Number(action?.anchor ?? 0.5)));

  if (type === "zoom") {
    const factor = action?.direction === "out" ? 2 : 0.5;
    const nextSpan = Math.max(Math.min(minSpan, last), Math.round(span * factor));
    const focus = current.start + span * anchor;
    const start = Math.round(focus - nextSpan * anchor);
    return clampWindow(start, start + nextSpan, count, minSpan);
  }
  if (type === "pan") {
    const shift = Math.round(span * (Number(action?.ratio) || 0));
    if (!shift) return current;
    return clampWindow(current.start + shift, current.end + shift, count, minSpan);
  }
  return current;
}

/** 鼠标横向比例 → 窗口内的数据下标（绝对下标）。 */
export function indexAtRatio(window, ratio, count) {
  const last = Math.max(0, (Number(count) || 1) - 1);
  const win = clampWindow(window?.start ?? 0, window?.end ?? last, count, 1);
  const span = Math.max(1, win.end - win.start);
  const clamped = Math.min(1, Math.max(0, Number(ratio) || 0));
  return Math.min(win.end, Math.max(win.start, win.start + Math.round(span * clamped)));
}

/** 某一下标处所有系列的取值（悬停提示用）。 */
export function pointRows(spec, index) {
  return (spec?.series ?? []).map((entry, slot) => ({
    name: entry.name || `系列 ${slot + 1}`,
    value: Array.isArray(entry.values) ? entry.values[index] : undefined,
    slot: seriesSlot(slot),
  }));
}

/** 某一下标的 x 轴标签。 */
export function labelAt(spec, index) {
  const label = Array.isArray(spec?.x) ? spec.x[index] : undefined;
  if (label !== undefined && label !== null && String(label) !== "") return String(label);
  return `#${index + 1}`;
}

/** 按可见窗口切出子规格（只影响绘制，系列名保留）。 */
export function sliceSpec(spec, window) {
  const all = Math.max(1, ...(spec?.series ?? []).map((entry) => entry.values.length), 1);
  const win = clampWindow(window?.start ?? 0, window?.end ?? all - 1, all, 1);
  const series = (spec?.series ?? []).map((entry) => ({
    name: entry.name,
    values: entry.values.slice(win.start, win.end + 1),
  }));
  const x = Array.isArray(spec?.x) ? spec.x.slice(win.start, win.end + 1) : [];
  return { ...spec, series, x, window: win };
}

/** 环形扇区上某个角度的中点坐标（悬停提示定位用）。 */
export function pieMidPoint(cx, cy, radius, midAngle, innerRadius = 0) {
  const mid = (radius + innerRadius) / 2;
  const point = polar(cx, cy, mid, midAngle);
  return { x: round2(point.x), y: round2(point.y) };
}
