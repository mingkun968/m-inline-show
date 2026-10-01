/**
 * 离线自测：只跑纯逻辑层（chart-spec / html-spec），不需要 app、不需要 react。
 *
 *   node selftest.mjs
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { CHART_TYPES, MAX_CHART_WIDTH_PX, MIN_CHART_WIDTH_PX, SPARK_WIDTH_PX, WIDTH_PRESETS, buildBarGroups, buildLineGeometry, buildPieSlices, estimateTextWidth, formatNumber, fullWindow, indexAtRatio, labelAt, labelIndices, legendWidth, naturalWidth, niceScale, parseChartSpec, parseWidth, pieMidPoint, pointRows, preferredWidth, seriesSlot, sliceSpec, toNumber, zoomWindow } =
  await import(path.join(here, "renderer/chart-spec.mjs"));
const { DEFAULT_HTML_WIDTH_PX, MAX_HTML_HEIGHT_PX, MAX_HTML_WIDTH_PX, MIN_HTML_WIDTH_PX, buildHtmlSrcDoc, clampHeight, clampWidth, hostPalette, isBlank, looksLikeMarkup } =
  await import(path.join(here, "renderer/html-spec.mjs"));
const { copyText } = await import(path.join(here, "renderer/copy-text.mjs"));
const { TOKEN_CSS, palette, tokens } = await import(path.join(here, "renderer/tokens.mjs"));
const { MAX_WIDGET_HEIGHT_PX, MIN_WIDGET_HEIGHT_PX, WIDGET_CSP, WIDGET_PROTOCOL, buildWidgetSrcDoc, clampWidgetHeight, parseWidgetMessage } =
  await import(path.join(here, "renderer/widget-spec.mjs"));

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = typeof expected === "function" ? expected(actual) : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(`${name} → got ${JSON.stringify(actual)}`);
    console.log(`  FAIL ${name} → ${JSON.stringify(actual)}`);
  }
}

const line = parseChartSpec(
  JSON.stringify({
    type: "line",
    title: "p50",
    unit: "ms",
    x: ["a", "b", "c"],
    series: [{ name: "p50", values: [128, 143, 131] }, { name: "p95", values: [310, 352, 336] }],
  }),
);

check("合法多系列解析成功", line.ok, true);
check("系列条数", line.spec.series.length, 2);
check("标题/单位", [line.spec.title, line.spec.unit], ["p50", "ms"]);
check("x 轴标签", line.spec.x, ["a", "b", "c"]);
check("type 缺省为 line", parseChartSpec('{"values":[1,2]}').spec.type, "line");
check("根级数组可用", parseChartSpec("[1,2,3]").spec.series[0].values, [1, 2, 3]);
check("data[{label,value}] 可用", parseChartSpec('{"data":[{"label":"x","value":3}]}').spec.x, ["x"]);
check("字符串数字可用", parseChartSpec('{"values":["1,234","45%"]}').spec.series[0].values, [1234, 45]);
check("null 计为无效点", parseChartSpec('{"values":[1,null,3]}').spec.invalid, 1);
check("null 保留为断线", parseChartSpec('{"values":[1,null,3]}').spec.series[0].values, [1, null, 3]);
check("非法 JSON 报错", parseChartSpec('{"type":"line","values":[1,2,').ok, false);
check("空正文报错", parseChartSpec("   ").ok, false);
check("无数据报错", parseChartSpec('{"type":"line"}').ok, false);
check("全非数字报错", parseChartSpec('{"values":["a","b"]}').ok, false);
check("未知 type 报错", parseChartSpec('{"type":"donut","values":[1]}').ok, false);
check("超过 8 条系列报错", parseChartSpec(JSON.stringify({ series: Array.from({ length: 9 }, () => ({ values: [1] })) })).ok, false);
check("数据点上限生效", parseChartSpec(JSON.stringify({ values: Array.from({ length: 5001 }, () => 1) })).ok, false);
check("单点可用", parseChartSpec('{"values":[7]}').ok, true);
check("支持的类型表", CHART_TYPES, ["line", "bar", "pie", "spark"]);
check("toNumber 非数字", toNumber("12abc"), null);
check("调色板槽位循环（8 槽）", [seriesSlot(0), seriesSlot(7), seriesSlot(8)], [1, 8, 1]);

check("niceScale 全零", niceScale(0, 0).ticks.length >= 2, true);
check("niceScale 单值", niceScale(5, 5).ticks.length >= 2, true);
check("niceScale 含 0", niceScale(-10, 10).ticks.includes(0), true);
check("niceScale 刻度不超过 12 个", niceScale(0, 127345).ticks.length <= 12, true);
check("niceScale 递增", niceScale(0, 999).ticks.every((v, i, arr) => i === 0 || v > arr[i - 1]), true);

const pad = { left: 50, right: 12, top: 8, bottom: 22 };
const geo = buildLineGeometry([1, null, 3, 4], { width: 600, height: 240, padding: pad });
check("折线路径非空", geo.line.startsWith("M"), true);
check("断点分成两段", geo.segments, 2);
check("面积路径存在", geo.area.length > 0, true);
check("单点几何不炸", buildLineGeometry([5], { width: 600, height: 240, padding: pad }).line.startsWith("M"), true);
check("全 null 几何不炸", buildLineGeometry([null, null], { width: 600, height: 240, padding: pad }).line, "");

const bars = buildBarGroups([{ name: "a", values: [1, 2, 3] }, { name: "b", values: [3, 2, 1] }], { width: 600, height: 240, padding: pad });
check("柱状条数", bars.bars.length, 6);
check("柱高非负", bars.bars.every((bar) => bar.h >= 1 && bar.w >= 1), true);
check("柱状负值不炸", buildBarGroups([{ name: "n", values: [-5, 5] }], { width: 600, height: 240, padding: pad }).bars.length, 2);

// ── 块宽度：按内容自适应（纯估算，只断言方向与边界） ──────────────────────
const widthOf = (spec) => preferredWidth(parseChartSpec(JSON.stringify(spec)).spec);
const linePoints = (count) => widthOf({ type: "line", values: Array.from({ length: count }, () => 1) });

check("宽度：spark 是恒定窄条", widthOf({ type: "spark", values: [1, 2, 3] }), SPARK_WIDTH_PX);
check("宽度：不低于下限", linePoints(2) >= MIN_CHART_WIDTH_PX, true);
check("宽度：不超过上限", [linePoints(2), linePoints(12), widthOf({ type: "bar", values: [1, 2, 3, 4] })].every((w) => w <= MAX_CHART_WIDTH_PX), true);
check("宽度：点越多越宽", linePoints(12) > linePoints(3), true);
check("宽度：字特别多时顶到上限", linePoints(40), MAX_CHART_WIDTH_PX);
check("宽度：数据少时不铺满", linePoints(4) < MAX_CHART_WIDTH_PX, true);
check("宽度：多系列更宽", widthOf({ type: "bar", series: [{ name: "a", values: [1, 2, 3, 4] }, { name: "b", values: [1, 2, 3, 4] }] }) > widthOf({ type: "bar", values: [1, 2, 3, 4] }), true);
check("宽度：饼图给图例留位", widthOf({ type: "pie", x: ["A", "B"], values: [3, 2] }) >= 300, true);
check("宽度：长标签的饼图更宽", widthOf({ type: "pie", x: ["这是一个很长的分类标签", "B"], values: [3, 2] }) > widthOf({ type: "pie", x: ["A", "B"], values: [3, 2] }), true);
check("宽度：中文比拉丁宽", estimateTextWidth("中文") > estimateTextWidth("ab"), true);
check("图例：名字越长预留越宽", legendWidth(parseChartSpec(JSON.stringify({ series: [{ name: "一个很长的系列名字", values: [1, 2] }, { name: "b", values: [1, 2] }] })).spec) > legendWidth(parseChartSpec(JSON.stringify({ series: [{ name: "s", values: [1, 2] }, { name: "b", values: [1, 2] }] })).spec), true);
check("图例：单系列不预留宽度", legendWidth(parseChartSpec(JSON.stringify({ values: [1, 2] })).spec), 0);
check("宽度：长系列名把块撑宽", widthOf({ type: "line", x: ["a", "b"], series: [{ name: "这是一条名字特别长的系列", values: [1, 2] }, { name: "另一条同样很长的系列", values: [2, 1] }] }) > widthOf({ type: "line", x: ["a", "b"], series: [{ name: "s1", values: [1, 2] }, { name: "s2", values: [2, 1] }] }), true);
check("naturalWidth 本身不封顶", naturalWidth(parseChartSpec(JSON.stringify({ type: "line", values: Array.from({ length: 60 }, () => 1) })).spec) > MAX_CHART_WIDTH_PX, true);

// ── 围栏里的 width 字段（显式覆盖自适应） ────────────────────────────────
check("width：缺省即 auto", parseChartSpec('{"values":[1]}').spec.width, "auto");
check("width：full 表示占满", parseChartSpec('{"values":[1],"width":"full"}').spec.width, "full");
check("width：sm/md/lg 档位", [parseWidth("sm"), parseWidth("md"), parseWidth("lg")], [WIDTH_PRESETS.sm, WIDTH_PRESETS.md, WIDTH_PRESETS.lg]);
check("width：数字", parseWidth(420), 420);
check("width：字符串数字", parseWidth("420"), 420);
check("width：超上限被钳制", parseWidth(9999), MAX_CHART_WIDTH_PX);
check("width：低于下限被钳制", parseWidth(10), MIN_CHART_WIDTH_PX);
check("width：大小写不敏感", parseWidth("FULL"), "full");
check("width：非法写法报错", parseChartSpec('{"values":[1],"width":"huge"}').ok, false);
check("width：负数报错", parseChartSpec('{"values":[1],"width":-5}').ok, false);

// ── HTML 片段宽度：贴合内容，钳在范围内 ─────────────────────────────────
check("HTML 宽度：低于下限抬到下限", clampWidth(10), MIN_HTML_WIDTH_PX);
check("HTML 宽度：超过上限压到上限", clampWidth(9999), MAX_HTML_WIDTH_PX);
check("HTML 宽度：范围内原样保留", clampWidth(430), 430);
check("HTML 宽度：量不到时用默认值", clampWidth(NaN), DEFAULT_HTML_WIDTH_PX);
check("HTML 宽度：默认值本身在范围内", DEFAULT_HTML_WIDTH_PX >= MIN_HTML_WIDTH_PX && DEFAULT_HTML_WIDTH_PX <= MAX_HTML_WIDTH_PX, true);

const pie = buildPieSlices([520, 310, 170, -2, null], { cx: 100, cy: 100, radius: 80, innerRadius: 46 });
check("饼图跳过非正数", [pie.slices.length, pie.skipped], [3, 2]);
check("饼图占比合计 100", Math.abs(pie.slices.reduce((sum, s) => sum + s.percent, 0) - 100) < 0.001, true);
check("饼图路径成对", pie.slices.every((s) => s.path.startsWith("M") && s.path.endsWith("Z")), true);
check("饼图全零不炸", buildPieSlices([0, 0], { cx: 10, cy: 10, radius: 5, innerRadius: 3 }).slices.length, 0);

check("labelIndices 少量全给", labelIndices(3), [0, 1, 2]);
check("labelIndices 抽样含末位", labelIndices(100, 8).includes(99), true);
check("labelIndices 不超过上限+1", labelIndices(100, 8).length <= 9, true);
check("formatNumber 零", formatNumber(0), "0");
check("formatNumber 大数", formatNumber(2_500_000), "2.5M");
check("formatNumber 非法", formatNumber(NaN), "–");

check("高度钳制上限", clampHeight(99_999), MAX_HTML_HEIGHT_PX);
check("高度钳制非法值", clampHeight(0), 220);
check("高度钳制负值", clampHeight(-3), 220);
check("高度正常值透传", clampHeight(180), 180);
check("调色板拒绝注入", hostPalette({ text: "#fff; } body { display:none" }).text !== "#fff; } body { display:none", true);
check("调色板接受合法色", hostPalette({ text: "#1f2328" }).text, "#1f2328");
check("调色板空输入有回退", typeof hostPalette({}).accent, "string");
const doc = buildHtmlSrcDoc("<table><tr><td>1</td></tr></table>", { text: "#111" });
check("srcdoc 带 CSP", doc.includes("Content-Security-Policy"), true);
check("srcdoc 禁脚本", doc.includes("default-src 'none'"), true);
check("srcdoc 含片段", doc.includes("<table><tr><td>1</td></tr></table>"), true);
check("恶意片段仍带 CSP", buildHtmlSrcDoc("</div><script>alert(1)</script>").includes("Content-Security-Policy"), true);
check("looksLikeMarkup 判定", [looksLikeMarkup("<b>hi</b>"), looksLikeMarkup("纯文本")], [true, false]);
check("isBlank 判定", [isBlank("  "), isBlank("<p>x</p>")], [true, false]);

console.log("== 剪贴板复制 ==");

function fakeDoc({ execResult = true } = {}) {
  const calls = { created: 0, selected: 0, exec: 0, removed: 0, value: "" };
  const area = {
    style: {},
    set value(next) { calls.value = next; },
    get value() { return calls.value; },
    setAttribute() {},
    select() { calls.selected += 1; },
    setSelectionRange() {},
    remove() { calls.removed += 1; },
  };
  return {
    calls,
    doc: {
      createElement() { calls.created += 1; return area; },
      body: { appendChild() {} },
      execCommand() { calls.exec += 1; return execResult; },
    },
  };
}

const navOk = await copyText("hello", { clipboard: { async writeText() {} }, doc: fakeDoc().doc });
check("navigator 成功即返回", [navOk.ok, navOk.via], [true, "navigator.clipboard"]);

const fallbackDoc = fakeDoc({ execResult: true });
const navFail = await copyText("hello", {
  clipboard: { async writeText() { throw new Error("NotAllowedError: Document is not focused"); } },
  doc: fallbackDoc.doc,
});
check("navigator 被拒后退回 execCommand", [navFail.ok, navFail.via], [true, 'execCommand("copy")']);
check("兜底时写入了正确内容", fallbackDoc.calls.value, "hello");
check("兜底时选中并清理了 textarea", [fallbackDoc.calls.selected, fallbackDoc.calls.removed], [1, 1]);

const bothFail = await copyText("hello", {
  clipboard: { async writeText() { throw new Error("NotAllowedError"); } },
  doc: fakeDoc({ execResult: false }).doc,
});
check("两条路径都失败时返回 ok:false", bothFail.ok, false);
check("失败原因包含两条尝试", bothFail.error.includes("NotAllowedError") && bothFail.error.includes("execCommand"), true);

const noClipboard = await copyText("hi", { clipboard: undefined, doc: fakeDoc().doc });
check("clipboard 缺失时仍能兜底", [noClipboard.ok, noClipboard.via], [true, 'execCommand("copy")']);
check("空内容直接失败", (await copyText("", { clipboard: { async writeText() {} }, doc: fakeDoc().doc })).ok, false);

const hostOk = await copyText("hello", { host: async () => ({ ok: true }), clipboard: { async writeText() { throw new Error("不该走到这层"); } }, doc: fakeDoc().doc });
check("插件进程通道成功即返回", [hostOk.ok, hostOk.via], [true, "插件进程原生剪贴板"]);

const hostFail = await copyText("hello", {
  host: async () => { throw new Error("PLUGIN_UNLOADED"); },
  clipboard: { async writeText() {} },
  doc: fakeDoc().doc,
});
check("插件进程失败后退回 navigator", [hostFail.ok, hostFail.via], [true, "navigator.clipboard"]);

const hostAndNavFail = await copyText("hello", {
  host: async () => { throw new Error("插件进程不可用"); },
  clipboard: { async writeText() { throw new Error("NotAllowedError"); } },
  doc: fakeDoc().doc,
});
check("前两层失败后退回 execCommand", [hostAndNavFail.ok, hostAndNavFail.via], [true, 'execCommand("copy")']);

const allFail = await copyText("hello", {
  host: async () => { throw new Error("插件进程不可用"); },
  clipboard: { async writeText() { throw new Error("NotAllowedError"); } },
  doc: fakeDoc({ execResult: false }).doc,
});
check(
  "失败原因列出三层",
  allFail.error.includes("插件进程") && allFail.error.includes("NotAllowedError") && allFail.error.includes("execCommand"),
  true,
);
check("未提供插件进程通道时仍能复制", (await copyText("hi", { clipboard: { async writeText() {} }, doc: fakeDoc().doc })).ok, true);

console.log("== 全局复制补丁（clipboard-patch）==");

const { installClipboardPatch, uninstallClipboardPatch } = await import(path.join(here, "renderer/clipboard-patch.mjs"));

function patchEnv({ execResult = true, nativeOk = false, hostOk = false } = {}) {
  const calls = { exec: 0, native: 0, host: 0 };
  const fake = fakeDoc({ execResult });
  const clipboard = {
    async writeText() {
      calls.native += 1;
      if (!nativeOk) throw new Error("NotAllowedError: Document is not focused");
    },
  };
  return {
    calls,
    fake,
    clipboard,
    deps: {
      clipboard,
      doc: fake.doc,
      hostCopy: async () => {
        calls.host += 1;
        if (!hostOk) throw new Error("插件进程不可用");
      },
      log: async () => null,
    },
  };
}

// 1) execCommand 优先：同步、在手势内、不经过权限处理器 —— 成功即返回，不再碰后两层
const execEnv = patchEnv({ execResult: true });
check("补丁安装成功", installClipboardPatch(execEnv.deps).installed, true);
check("重复安装是幂等的", installClipboardPatch(execEnv.deps).reason, (reason) => typeof reason === "string" && reason.includes("已安装"));
await execEnv.clipboard.writeText("hello");
check("补丁：execCommand 优先且一次成功", [execEnv.fake.calls.exec, execEnv.calls.native, execEnv.calls.host], [1, 0, 0]);
check("补丁：写入了正确内容", execEnv.fake.calls.value, "hello");
check("补丁：卸载后还原", [uninstallClipboardPatch({ clipboard: execEnv.clipboard }), execEnv.clipboard.__dispClipboardPatched], [true, undefined]);

// 2) execCommand 失手 → 原 API 顶上
const nativeEnv = patchEnv({ execResult: false, nativeOk: true });
installClipboardPatch(nativeEnv.deps);
await nativeEnv.clipboard.writeText("hello");
check("补丁：execCommand 失败后退回原 API", [nativeEnv.fake.calls.exec, nativeEnv.calls.native, nativeEnv.calls.host], [1, 1, 0]);
uninstallClipboardPatch({ clipboard: nativeEnv.clipboard });

// 3) 前两层都失败 → 插件进程原生剪贴板
const hostEnv = patchEnv({ execResult: false, nativeOk: false, hostOk: true });
installClipboardPatch(hostEnv.deps);
await hostEnv.clipboard.writeText("hello");
check("补丁：前两层失败后退回插件进程", [hostEnv.fake.calls.exec, hostEnv.calls.native, hostEnv.calls.host], [1, 1, 1]);
uninstallClipboardPatch({ clipboard: hostEnv.clipboard });

// 4) 三层全废 → 抛出、且原因写全（界面不再静默）
const deadEnv = patchEnv({ execResult: false, nativeOk: false, hostOk: false });
installClipboardPatch(deadEnv.deps);
let deadError = "";
try {
  await deadEnv.clipboard.writeText("hello");
} catch (error) {
  deadError = String(error?.message ?? error);
}
check(
  "补丁：三层全废时抛错并列出原因",
  deadError.includes("execCommand") && deadError.includes("NotAllowedError") && deadError.includes("插件进程"),
  true,
);
uninstallClipboardPatch({ clipboard: deadEnv.clipboard });

// 5) 没有 writeText 也没有插件进程通道 → 明确拒绝安装
check("补丁：无 writeText 且无宿主通道时不安装", installClipboardPatch({ clipboard: {}, doc: fakeDoc().doc, log: async () => null }).installed, false);


// ── 设计 token（Radix 色阶 → 语义别名） ────────────────────────────────
check("token 明暗键一致", JSON.stringify(Object.keys(tokens("light"))), JSON.stringify(Object.keys(tokens("dark"))));
check("token 无空值", Object.values(tokens("dark")).every((v) => typeof v === "string" && v.length > 0), true);
check("明暗底色不同", tokens("light")["bg-inset"] !== tokens("dark")["bg-inset"], true);
check("未知主题退回明色", tokens("nope")["text-primary"], tokens("light")["text-primary"]);
check("8 个系列色齐备", Array.from({ length: 8 }, (_, i) => tokens("light")[`series-${i + 1}`]).every(Boolean), true);
check("palette 给片段 8 系列色", palette("light").series.length, 8);
check("TOKEN_CSS 含明暗两套", TOKEN_CSS.includes("--ldp-bg-inset") && TOKEN_CSS.includes('data-ldp-theme="dark"'), true);

// ── 缩放窗口（纯逻辑） ────────────────────────────────────────────────
check("满窗", zoomWindow(fullWindow(20), { type: "none" }, 20), { start: 0, end: 19 });
check("放大一半（中点锚定）", zoomWindow({ start: 0, end: 19 }, { type: "zoom", direction: "in", anchor: 0.5 }, 20), { start: 5, end: 15 });
check("缩回满窗", zoomWindow({ start: 5, end: 14 }, { type: "zoom", direction: "out", anchor: 0.5 }, 20).end, 19);
check("平移越界被钳制", zoomWindow({ start: 5, end: 14 }, { type: "pan", ratio: -1 }, 20), { start: 0, end: 9 });
check("from 基准平移", zoomWindow({ start: 0, end: 19 }, { type: "pan", ratio: 0.5, from: { start: 0, end: 9 } }, 20), { start: 5, end: 14 });
check("单点不出错", zoomWindow({ start: 0, end: 0 }, { type: "zoom", direction: "in" }, 1), { start: 0, end: 0 });
check("比例→下标", indexAtRatio({ start: 10, end: 20 }, 0.5, 100), 15);
check("切片保留标签", sliceSpec({ x: ["a", "b", "c"], series: [{ name: "s", values: [1, 2, 3] }] }, { start: 1, end: 2 }).series[0].values, [2, 3]);
check("点行给系列名兜底", pointRows({ series: [{ values: [1, 2] }] }, 1)[0].name, "系列 1");
check("标签兜底", labelAt({ x: [] }, 2), "#3");
check("饼图中点在半径内", (() => { const p = pieMidPoint(100, 100, 80, 0, 40); return Math.round(p.x) === 100 && p.y < 100; })(), true);

// ── widget 围栏（允许脚本但断网） ─────────────────────────────────────
check("widget 高度消息", parseWidgetMessage({ type: WIDGET_PROTOCOL, height: 300 }), { height: 300 });
check("widget 高度钳上限", parseWidgetMessage({ type: WIDGET_PROTOCOL, height: 99999 }).height, MAX_WIDGET_HEIGHT_PX);
check("widget 高度钳下限", parseWidgetMessage({ type: WIDGET_PROTOCOL, height: 1 }).height, MIN_WIDGET_HEIGHT_PX);
check("widget 忽略外来消息", parseWidgetMessage({ type: "evil", height: 10 }), null);
check("widget 传递脚本错误", parseWidgetMessage({ type: WIDGET_PROTOCOL, error: "boom" }).error, "boom");
check("widget CSP 无网络出口", WIDGET_CSP.includes("connect-src 'none'") && WIDGET_CSP.includes("default-src 'none'"), true);
check("widget CSP 允许内联脚本", WIDGET_CSP.includes("script-src 'unsafe-inline'"), true);
check("widget srcdoc 带上报脚本", buildWidgetSrcDoc("<b>hi</b>", palette("dark")).includes("parent.postMessage"), true);
check("widget srcdoc 保留片段原文", buildWidgetSrcDoc("<b>hi</b>", palette("light")).includes("<b>hi</b>"), true);
check("widget srcdoc 注入系列色", buildWidgetSrcDoc("x", palette("light")).includes("--series-8"), true);
check("widget 高度钳制函数", clampWidgetHeight(NaN), 220);

// ── 片段调色板（html / widget 共用） ──────────────────────────────────
check("hostPalette 透传系列色", hostPalette(palette("light")).series.length, 8);
check("hostPalette 挡住 CSS 注入", hostPalette({ accent: "red; } body { display:none" }).accent, palette("light").accent);
check("html srcdoc 注入系列色", buildHtmlSrcDoc("<i>x</i>", palette("light")).includes("--series-8"), true);
check("html srcdoc 带 CSP", buildHtmlSrcDoc("x", palette("light")).includes("default-src 'none'"), true);
console.log(`离线自测：${pass} 通过 / ${fail} 失败`);
if (failures.length) {
  console.log("失败明细：");
  failures.forEach((line) => console.log(` - ${line}`));
}
process.exit(fail ? 1 : 0);
