/**
 * m_inline_show 的样式表。
 *
 * 颜色全部来自 tokens.mjs（Radix 色阶 → 语义别名），明暗两套由块根节点的
 * `data-ldp-theme` 切换 —— 不依赖宿主用哪个类名做主题。`pi.ui.injectStyle`
 * 会把规则注入到应用窗口，所以普通类名即可（ldp- 前缀防撞）。
 */
import { TOKEN_CSS } from "./tokens.mjs";

export const DISP_CSS = `
${TOKEN_CSS}

/* ────────────── 骨架 ────────────── */

.ldp-block {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--ldp-w, 560px);
  margin-left: auto;
  margin-right: auto;
  align-self: center;
  box-sizing: border-box;
  border: 1px solid var(--ldp-border-default);
  border-radius: 12px;
  background: var(--ldp-bg-canvas);
  color: var(--ldp-text-primary);
  font-size: 12.5px;
  line-height: 1.55;
  overflow: hidden;
  box-shadow: var(--ldp-shadow-panel);
  animation: ldp-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes ldp-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: none; }
}
.ldp-block[data-ldp-type="spark"] {
  max-width: var(--ldp-w, 240px);
}
.ldp-block[data-ldp="html"] {
  max-width: var(--ldp-w, 680px);
}
.ldp-block :focus-visible {
  outline: 2px solid var(--ldp-focus-ring);
  outline-offset: 1px;
  border-radius: 6px;
}

.ldp-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 34px;
  padding: 5px 8px 5px 12px;
  border-bottom: 1px solid var(--ldp-border-subtle);
  background: var(--ldp-bg-secondary);
}
.ldp-icon {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--ldp-accent-solid);
}
.ldp-title {
  font-weight: 600;
  letter-spacing: 0.01em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ldp-badge {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--ldp-bg-tertiary);
  color: var(--ldp-text-tertiary);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ldp-spacer {
  flex: 1 1 auto;
  min-width: 4px;
}
.ldp-btn {
  flex: none;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 2px 8px;
  background: transparent;
  color: var(--ldp-text-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 1.6;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.ldp-btn:hover {
  background: var(--ldp-bg-hover);
  border-color: var(--ldp-border-subtle);
  color: var(--ldp-text-primary);
}
.ldp-btn:active {
  background: var(--ldp-bg-active);
}
.ldp-btn.is-active {
  background: var(--ldp-accent-soft);
  border-color: var(--ldp-accent-border);
  color: var(--ldp-accent-text);
}
.ldp-btn[disabled] {
  color: var(--ldp-text-disabled);
  cursor: default;
}
.ldp-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--ldp-bg-tertiary);
}
.ldp-seg .ldp-btn {
  border-radius: 7px;
  border-color: transparent;
}
.ldp-seg .ldp-btn.is-active {
  background: var(--ldp-bg-elevated);
  border-color: var(--ldp-border-subtle);
  color: var(--ldp-text-primary);
  box-shadow: var(--ldp-shadow-panel);
}

.ldp-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
}
.ldp-body > .ldp-body-flush {
  margin: -12px -14px;
  padding: 12px 14px;
}
.ldp-foot {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 14px 10px;
  font-size: 10.5px;
  color: var(--ldp-text-tertiary);
}
.ldp-status {
  overflow-wrap: anywhere;
  color: var(--ldp-text-tertiary);
}
.ldp-status:empty {
  display: none;
}

/* ────────────── 图表 ────────────── */

.ldp-plot {
  position: relative;
  width: 100%;
  min-width: 0;
}
.ldp-svg {
  display: block;
  width: 100%;
  overflow: visible;
  animation: ldp-fade 0.3s ease-out both;
}
@keyframes ldp-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.ldp-grid {
  stroke: var(--ldp-border-subtle);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.ldp-axis {
  stroke: var(--ldp-border-default);
  stroke-width: 1;
}
.ldp-tick {
  fill: var(--ldp-text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.ldp-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  stroke-dasharray: 1;
  animation: ldp-draw 0.85s cubic-bezier(0.4, 0, 0.2, 1) both;
}
@keyframes ldp-draw {
  from { stroke-dashoffset: 1; }
  to { stroke-dashoffset: 0; }
}
.ldp-area {
  fill: currentColor;
  opacity: 0.14;
  stroke: none;
}
.ldp-dot {
  fill: currentColor;
}
.ldp-fill {
  fill: currentColor;
}
.ldp-series {
  transition: opacity 0.14s ease;
}
.ldp-series.is-dim {
  opacity: 0.2;
}
.ldp-crosshair {
  stroke: var(--ldp-border-strong);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.ldp-dot-ring {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  opacity: 0.85;
}
.ldp-hit {
  fill: transparent;
  cursor: crosshair;
}
.ldp-s1 { color: var(--ldp-series-1); }
.ldp-s2 { color: var(--ldp-series-2); }
.ldp-s3 { color: var(--ldp-series-3); }
.ldp-s4 { color: var(--ldp-series-4); }
.ldp-s5 { color: var(--ldp-series-5); }
.ldp-s6 { color: var(--ldp-series-6); }
.ldp-s7 { color: var(--ldp-series-7); }
.ldp-s8 { color: var(--ldp-series-8); }

.ldp-tip {
  position: absolute;
  z-index: 3;
  min-width: 96px;
  padding: 6px 8px;
  border: 1px solid var(--ldp-border-subtle);
  border-radius: 8px;
  background: var(--ldp-bg-elevated);
  color: var(--ldp-text-primary);
  box-shadow: var(--ldp-shadow-popover);
  font-size: 11px;
  line-height: 1.5;
  pointer-events: none;
  transform: translate(-50%, -100%);
  animation: ldp-pop 0.12s ease-out both;
}
@keyframes ldp-pop {
  from { opacity: 0; transform: translate(-50%, -96%) scale(0.97); }
  to { opacity: 1; transform: translate(-50%, -100%) scale(1); }
}
.ldp-tip-title {
  color: var(--ldp-text-tertiary);
  margin-bottom: 3px;
  font-variant-numeric: tabular-nums;
}
.ldp-tip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.ldp-tip-name {
  color: var(--ldp-text-secondary);
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
.ldp-tip-value {
  color: var(--ldp-text-primary);
  font-weight: 600;
}

.ldp-pie {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.ldp-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ldp-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border-radius: 6px;
  transition: opacity 0.14s ease;
}
.ldp-legend li.is-dim {
  opacity: 0.45;
}
.ldp-legend-name {
  color: var(--ldp-text-secondary);
}
/*
 * 多系列图例：一行排布，每项按自己的字数占位（不压缩、不截断）。
 * 只有整行真的放不下时才出现横向滚动条 —— 这就是「字特别多」的那种情况。
 */
.ldp-legend-inline {
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 14px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 3px;
  scrollbar-width: thin;
  scrollbar-color: var(--ldp-border-strong) transparent;
}
.ldp-legend-inline li {
  flex: 0 0 auto;
}
.ldp-legend-inline .ldp-legend-name {
  white-space: nowrap;
}
.ldp-legend-inline::-webkit-scrollbar {
  height: 6px;
}
.ldp-legend-inline::-webkit-scrollbar-thumb {
  background: var(--ldp-border-strong);
  border-radius: 3px;
}
.ldp-legend-inline::-webkit-scrollbar-track {
  background: transparent;
}
.ldp-legend-value {
  color: var(--ldp-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.ldp-legend-note {
  color: var(--ldp-text-tertiary);
}
.ldp-swatch {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  background: currentColor;
  flex: none;
}

.ldp-empty,
.ldp-note {
  color: var(--ldp-text-secondary);
}
.ldp-note-quiet {
  color: var(--ldp-text-tertiary);
  font-size: 10.5px;
}
.ldp-error {
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-left: 3px solid var(--ldp-error-solid);
  border-radius: 0 6px 6px 0;
  background: var(--ldp-error-soft);
  padding: 7px 9px;
}
.ldp-error-title {
  color: var(--ldp-error-text);
  font-weight: 600;
}
.ldp-error-msg {
  color: var(--ldp-text-secondary);
  overflow-wrap: anywhere;
}
.ldp-src {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  padding: 9px 10px;
  border: 1px solid var(--ldp-border-subtle);
  border-radius: 8px;
  background: var(--ldp-bg-code);
  color: var(--ldp-text-secondary);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.ldp-zoombar {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ldp-text-tertiary);
  font-size: 10.5px;
}
.ldp-zoom-range {
  font-variant-numeric: tabular-nums;
  color: var(--ldp-text-secondary);
}

/* ────────────── HTML 片段 / widget ────────────── */

.ldp-html-frame {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}
.ldp-html {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color-scheme: light dark;
}
.ldp-block[data-ldp="widget"] {
  max-width: var(--ldp-w, 680px);
}
.ldp-widget-frame {
  position: relative;
  width: 100%;
  border: 1px solid var(--ldp-border-subtle);
  border-radius: 10px;
  background: var(--ldp-bg-inset);
  overflow: hidden;
}
.ldp-widget {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
}
.ldp-pending {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  color: var(--ldp-text-tertiary);
  font-size: 11px;
}
.ldp-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--ldp-border-strong);
  border-top-color: var(--ldp-accent-solid);
  animation: ldp-spin 0.7s linear infinite;
}
@keyframes ldp-spin {
  to { transform: rotate(360deg); }
}

/* ────────────── 图表交互态 ────────────── */

.ldp-group-hl {
  fill: var(--ldp-bg-hover);
}
.ldp-plot.is-zoomable {
  cursor: crosshair;
  touch-action: none;
}
.ldp-plot.is-zoomable:active {
  cursor: grabbing;
}
.ldp-source-view {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ldp-source-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ldp-text-tertiary);
  font-size: 10.5px;
}

/* ────────────── 下拉菜单 ────────────── */

.ldp-menu-wrap {
  position: relative;
  display: inline-flex;
}
.ldp-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  min-width: 104px;
  padding: 4px;
  border: 1px solid var(--ldp-border-subtle);
  border-radius: 9px;
  background: var(--ldp-bg-elevated);
  box-shadow: var(--ldp-shadow-popover);
  animation: ldp-pop 0.12s ease-out both;
}
.ldp-menu-item {
  border: 0;
  border-radius: 6px;
  padding: 5px 8px;
  background: transparent;
  color: var(--ldp-text-secondary);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.ldp-menu-item:hover {
  background: var(--ldp-bg-hover);
  color: var(--ldp-text-primary);
}
`;

export default DISP_CSS;
