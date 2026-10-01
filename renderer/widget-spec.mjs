/**
 * m_inline_show — `local.m_inline_show:widget` 的纯逻辑层（无 react / 无 DOM，可离线自测）。
 *
 * 与 html 块的区别：这个块**允许片段跑脚本**，换来真正的交互（缩放、切换、排序、内嵌图表库…）。
 * 代价是安全模型必须跟着变：
 *   - sandbox="allow-scripts" 且**不给 allow-same-origin** → 片段碰不到父窗口的 DOM / 存储 / 会话
 *   - CSP 里 connect-src 'none'、form-action 'none' → 能跑自己的脚本，但**连不出去**，数据外发无门
 *   - 代价之二：不能同源量 scrollHeight，高度只能由片段 postMessage 上报
 */

export const WIDGET_PROTOCOL = "local.m_inline_show:widget";

/** 高度钳制（宿主在 4000px 处兜底）。 */
export const MAX_WIDGET_HEIGHT_PX = 3600;
export const MIN_WIDGET_HEIGHT_PX = 48;
export const DEFAULT_WIDGET_HEIGHT_PX = 220;

/** widget iframe 的 CSP：可执行内联脚本与样式，但没有任何网络出口。 */
export const WIDGET_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function isWidgetBlank(source) {
  return typeof source !== "string" || source.trim() === "";
}

export function clampWidgetHeight(px, { min = MIN_WIDGET_HEIGHT_PX, max = MAX_WIDGET_HEIGHT_PX } = {}) {
  const value = Number(px);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_WIDGET_HEIGHT_PX;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * 解析片段发回来的消息。
 * @returns {{height: number} | {error: string} | null}
 */
export function parseWidgetMessage(data) {
  if (data === null || typeof data !== "object") return null;
  if (data.type !== WIDGET_PROTOCOL) return null;
  if (typeof data.error === "string" && data.error.trim()) {
    return { error: data.error.trim().slice(0, 300) };
  }
  const height = Number(data.height);
  if (!Number.isFinite(height) || height <= 0) return null;
  return { height: clampWidgetHeight(height) };
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * 生成 widget 的 srcdoc：样式 + 高度上报脚本 + 用户片段。
 * 脚本只做一件事：把自己有多高、以及有没有报错，告诉宿主。
 */
export function buildWidgetSrcDoc(source, colors = {}) {
  const fg = escapeAttr(colors.text ?? "#1f2328");
  const muted = escapeAttr(colors.muted ?? "#6b7280");
  const faint = escapeAttr(colors.faint ?? "#9aa1ab");
  const line = escapeAttr(colors.border ?? "#d8dbe0");
  const surface = escapeAttr(colors.surface ?? "#f6f7f9");
  const accent = escapeAttr(colors.accent ?? "#3b82f6");
  const code = escapeAttr(colors.code ?? "#eef1f4");
  const font = escapeAttr(
    colors.font ?? "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  );
  const series = Array.isArray(colors.series) ? colors.series : [];
  const seriesVars = series
    .slice(0, 8)
    .map((value, index) => `    --series-${index + 1}: ${escapeAttr(value)};`)
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">
<style>
  :root {
    color-scheme: light dark;
    --fg: ${fg};
    --muted: ${muted};
    --faint: ${faint};
    --line: ${line};
    --surface: ${surface};
    --accent: ${accent};
    --code: ${code};
${seriesVars}
  }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font-family: ${font};
    font-size: 13px;
    line-height: 1.6;
    color: var(--fg);
    overflow-wrap: anywhere;
  }
  .ldp-fragment > :first-child { margin-top: 0; }
  .ldp-fragment > :last-child { margin-bottom: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; }
  th { background: var(--surface); font-weight: 600; }
  code, kbd, samp {
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    background: var(--code);
    border-radius: 4px;
    padding: 1px 4px;
  }
</style>
</head>
<body>
<div class="ldp-fragment">${source ?? ""}</div>
<script>
(function () {
  var PROTOCOL = ${JSON.stringify(WIDGET_PROTOCOL)};
  function send(payload) {
    try { parent.postMessage(payload, "*"); } catch (error) { /* 忽略 */ }
  }
  function report() {
    try {
      var height = Math.max(
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0
      );
      send({ type: PROTOCOL, height: height });
    } catch (error) { /* 忽略 */ }
  }
  window.addEventListener("load", report);
  window.addEventListener("resize", report);
  document.addEventListener("DOMContentLoaded", report);
  window.onerror = function (message, source, line) {
    send({ type: PROTOCOL, error: String(message) + (line ? " @" + line : "") });
  };
  if (window.ResizeObserver) {
    try { new ResizeObserver(report).observe(document.documentElement); } catch (error) { /* 忽略 */ }
  }
  if (window.MutationObserver && document.documentElement) {
    try {
      new MutationObserver(report).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, characterData: true
      });
    } catch (error) { /* 忽略 */ }
  }
  [60, 240, 800].forEach(function (delay) { setTimeout(report, delay); });
})();
</script>
</body>
</html>`;
}
