/**
 * m_inline_show — html 块的纯逻辑层（无 react / 无 DOM 依赖，可直接用 node 自测）。
 *
 * 安全模型：片段渲染在 iframe 里，沙箱只给 allow-same-origin（不给脚本），
 * 文档头再压一条 CSP —— 外链、字体、脚本一律加载不到，图片只允许 data: / blob:。
 * 这样既不需要引 DOMPurify，也不会把宿主的网络与 DOM 暴露给片段。
 */
import { palette as tokenPalette } from "./tokens.mjs";

export const MAX_HTML_HEIGHT_PX = 3600;
export const MIN_HTML_HEIGHT_PX = 36;
export const DEFAULT_HTML_HEIGHT_PX = 220;

/** 块宽度：贴合内容，但不小于一个可读下限，也不超过上限（避免长段落拉满聊天栏）。 */
export const MIN_HTML_WIDTH_PX = 220;
export const MAX_HTML_WIDTH_PX = 680;
export const DEFAULT_HTML_WIDTH_PX = 560;
/** 空片段的提示很短，不给它留一整行。 */
export const BLANK_HTML_WIDTH_PX = 320;
/** 块自身左右内边距 + 边框，量到的内容宽度要加回这一段。 */
export const BLOCK_CHROME_PX = 24;

const CSP = [
  "default-src 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** 兜底调色板：直接用明色 token，脱离组件时也有一致观感。 */
const FALLBACK_PALETTE = { ...tokenPalette("light") };

/** 只允许安全的颜色/字体子串进入 <style>，避免片段外的 CSS 注入。 */
function safeToken(value, fallback, pattern) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 190) return fallback;
  return pattern.test(trimmed) ? trimmed : fallback;
}

const COLOR_PATTERN = /^[#a-zA-Z0-9(),.%\s/-]+$/;
const FONT_PATTERN = /^[#a-zA-Z0-9(),.%\s'"/-]+$/;

/** 片段能用的调色板：来自 tokens.mjs，逐项校验后注入 srcdoc（系列色最多 8 个）。 */
export function hostPalette(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const fallbackSeries = Array.isArray(FALLBACK_PALETTE.series) ? FALLBACK_PALETTE.series : [];
  const series = Array.isArray(source.series) ? source.series : [];
  return {
    text: safeToken(source.text, FALLBACK_PALETTE.text, COLOR_PATTERN),
    muted: safeToken(source.muted, FALLBACK_PALETTE.muted, COLOR_PATTERN),
    faint: safeToken(source.faint, FALLBACK_PALETTE.faint, COLOR_PATTERN),
    border: safeToken(source.border, FALLBACK_PALETTE.border, COLOR_PATTERN),
    surface: safeToken(source.surface, FALLBACK_PALETTE.surface, COLOR_PATTERN),
    accent: safeToken(source.accent, FALLBACK_PALETTE.accent, COLOR_PATTERN),
    code: safeToken(source.code, FALLBACK_PALETTE.code, COLOR_PATTERN),
    font: safeToken(source.font, FALLBACK_PALETTE.font, FONT_PATTERN),
    series: fallbackSeries.map((fallback, index) =>
      safeToken(series[index], fallback, COLOR_PATTERN),
    ),
  };
}

/** 高度钳制：给测量值一个合理范围，并保证低于宿主 4000px 的兜底线。 */
export function clampHeight(px, { min = MIN_HTML_HEIGHT_PX, max = MAX_HTML_HEIGHT_PX } = {}) {
  const value = Number(px);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_HTML_HEIGHT_PX;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** 宽度钳制：量到的内容宽度落进 [下限, 上限]，测不到就用默认值。 */
export function clampWidth(px, { min = MIN_HTML_WIDTH_PX, max = MAX_HTML_WIDTH_PX } = {}) {
  const value = Number(px);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_HTML_WIDTH_PX;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** 片段里看不出 HTML 标签时给个提示（但仍然照原样渲染）。 */
export function looksLikeMarkup(source) {
  return /<\s*[a-zA-Z][\w:-]*(\s|\/|>)/.test(typeof source === "string" ? source : "");
}

export function isBlank(source) {
  return typeof source !== "string" || source.trim() === "";
}

/**
 * 生成 iframe 的 srcdoc。
 * @param {string} source 围栏正文（HTML 片段）
 * @param {object} palette hostPalette() 结果
 */
export function buildHtmlSrcDoc(source, palette = {}) {
  const colors = hostPalette(palette);
  const fragment = typeof source === "string" ? source : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>
  :root {
    color-scheme: light dark;
    --fg: ${colors.text};
    --muted: ${colors.muted};
    --faint: ${colors.faint};
    --line: ${colors.border};
    --surface: ${colors.surface};
    --accent: ${colors.accent};
    --code: ${colors.code};
    --series-1: ${colors.series[0]};
    --series-2: ${colors.series[1]};
    --series-3: ${colors.series[2]};
    --series-4: ${colors.series[3]};
    --series-5: ${colors.series[4]};
    --series-6: ${colors.series[5]};
    --series-7: ${colors.series[6]};
    --series-8: ${colors.series[7]};
  }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font-family: ${colors.font};
    font-size: 13px;
    line-height: 1.6;
    color: var(--fg);
    overflow-wrap: anywhere;
  }
  .ldp-fragment > :first-child { margin-top: 0; }
  .ldp-fragment > :last-child { margin-bottom: 0; }
  h1, h2, h3, h4 { margin: 12px 0 6px; line-height: 1.3; }
  h1 { font-size: 18px; }
  h2 { font-size: 16px; }
  h3 { font-size: 14px; }
  p, ul, ol, blockquote, pre, table { margin: 0 0 10px; }
  ul, ol { padding-left: 20px; }
  a { color: var(--accent); text-decoration: none; }
  code, kbd, samp {
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    background: var(--code);
    border-radius: 4px;
    padding: 1px 4px;
  }
  pre {
    background: var(--code);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 8px 10px;
    overflow: auto;
  }
  pre code { background: none; padding: 0; }
  blockquote {
    border-left: 3px solid var(--line);
    color: var(--muted);
    padding: 2px 0 2px 10px;
  }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; }
  th { background: var(--surface); font-weight: 600; }
  img, svg, video, canvas { max-width: 100%; height: auto; }
  hr { border: none; border-top: 1px solid var(--line); margin: 12px 0; }
</style>
</head>
<body>
<div class="ldp-fragment">${fragment}</div>
</body>
</html>`;
}
