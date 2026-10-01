/**
 * m_inline_show 设计 token —— 色阶取自 Radix Colors v3.0.0（MIT，© WorkOS / Modulz），
 * 语义别名按 Radix 的十二级色阶惯例自己映射：1-2 页面底、3-5 组件底、6-8 边框、
 * 9-10 实心、11-12 文本。色值由脚本从官方 CSS 抽出，**不要手改**。
 *
 * 主题不靠宿主的类名猜测：组件把探测到的主题写成 data-ldp-theme，
 * 样式表用 .ldp-block[data-ldp-theme="dark"] 覆盖，所见即所得。
 *
 * 这个模块不 import react / 不碰 DOM，可直接用 node 自测。
 */

export const THEMES = ["light", "dark"];

/** 主题写在块根节点上的属性名。 */
export const THEME_ATTR = "data-ldp-theme";

/** 数据系列用到的 8 个色相（顺序即 seriesSlot 的配色顺序）。 */
export const SERIES_HUES = ["blue", "grass", "orange", "violet", "red", "cyan", "amber", "gray"];

/** 12 级色阶原始值。 */
const RAMP = {
    light: {
      gray: ["#fcfcfc", "#f9f9f9", "#f0f0f0", "#e8e8e8", "#e0e0e0", "#d9d9d9", "#cecece", "#bbbbbb", "#8d8d8d", "#838383", "#646464", "#202020"],
      blue: ["#fbfdff", "#f4faff", "#e6f4fe", "#d5efff", "#c2e5ff", "#acd8fc", "#8ec8f6", "#5eb1ef", "#0090ff", "#0588f0", "#0d74ce", "#113264"],
      grass: ["#fbfefb", "#f5fbf5", "#e9f6e9", "#daf1db", "#c9e8ca", "#b2ddb5", "#94ce9a", "#65ba74", "#46a758", "#3e9b4f", "#2a7e3b", "#203c25"],
      orange: ["#fefcfb", "#fff7ed", "#ffefd6", "#ffdfb5", "#ffd19a", "#ffc182", "#f5ae73", "#ec9455", "#f76b15", "#ef5f00", "#cc4e00", "#582d1d"],
      violet: ["#fdfcfe", "#faf8ff", "#f4f0fe", "#ebe4ff", "#e1d9ff", "#d4cafe", "#c2b5f5", "#aa99ec", "#6e56cf", "#654dc4", "#6550b9", "#2f265f"],
      red: ["#fffcfc", "#fff7f7", "#feebec", "#ffdbdc", "#ffcdce", "#fdbdbe", "#f4a9aa", "#eb8e90", "#e5484d", "#dc3e42", "#ce2c31", "#641723"],
      cyan: ["#fafdfe", "#f2fafb", "#def7f9", "#caf1f6", "#b5e9f0", "#9ddde7", "#7dcedc", "#3db9cf", "#00a2c7", "#0797b9", "#107d98", "#0d3c48"],
      amber: ["#fefdfb", "#fefbe9", "#fff7c2", "#ffee9c", "#fbe577", "#f3d673", "#e9c162", "#e2a336", "#ffc53d", "#ffba18", "#ab6400", "#4f3422"],
    },
    dark: {
      gray: ["#111111", "#191919", "#222222", "#2a2a2a", "#313131", "#3a3a3a", "#484848", "#606060", "#6e6e6e", "#7b7b7b", "#b4b4b4", "#eeeeee"],
      blue: ["#0d1520", "#111927", "#0d2847", "#003362", "#004074", "#104d87", "#205d9e", "#2870bd", "#0090ff", "#3b9eff", "#70b8ff", "#c2e6ff"],
      grass: ["#0e1511", "#141a15", "#1b2a1e", "#1d3a24", "#25482d", "#2d5736", "#366740", "#3e7949", "#46a758", "#53b365", "#71d083", "#c2f0c2"],
      orange: ["#17120e", "#1e160f", "#331e0b", "#462100", "#562800", "#66350c", "#7e451d", "#a35829", "#f76b15", "#ff801f", "#ffa057", "#ffe0c2"],
      violet: ["#14121f", "#1b1525", "#291f43", "#33255b", "#3c2e69", "#473876", "#56468b", "#6958ad", "#6e56cf", "#7d66d9", "#baa7ff", "#e2ddfe"],
      red: ["#191111", "#201314", "#3b1219", "#500f1c", "#611623", "#72232d", "#8c333a", "#b54548", "#e5484d", "#ec5d5e", "#ff9592", "#ffd1d9"],
      cyan: ["#0b161a", "#101b20", "#082c36", "#003848", "#004558", "#045468", "#12677e", "#11809c", "#00a2c7", "#23afd0", "#4ccce6", "#b6ecf7"],
      amber: ["#16120c", "#1d180f", "#302008", "#3f2700", "#4d3000", "#5c3d05", "#714f19", "#8f6424", "#ffc53d", "#ffd60a", "#ffca16", "#ffe7b3"],
    },
};

/** 语义 token → [明色 [色相, 步进], 暗色 [色相, 步进]]。 */
const SEMANTIC = {
  "bg-canvas": [["gray", 1], ["gray", 1]],
  "bg-inset": [["gray", 2], ["gray", 2]],
  "bg-secondary": [["gray", 3], ["gray", 3]],
  "bg-tertiary": [["gray", 4], ["gray", 4]],
  "bg-hover": [["gray", 4], ["gray", 4]],
  "bg-active": [["gray", 5], ["gray", 5]],
  "bg-elevated": [["gray", 1], ["gray", 2]],
  "bg-code": [["gray", 3], ["gray", 3]],
  "bg-code-header": [["gray", 4], ["gray", 4]],
  "border-subtle": [["gray", 5], ["gray", 5]],
  "border-default": [["gray", 6], ["gray", 6]],
  "border-strong": [["gray", 8], ["gray", 8]],
  "text-primary": [["gray", 12], ["gray", 12]],
  "text-secondary": [["gray", 11], ["gray", 11]],
  "text-tertiary": [["gray", 10], ["gray", 10]],
  "text-disabled": [["gray", 8], ["gray", 8]],
  "text-link": [["blue", 11], ["blue", 11]],
  "text-error": [["red", 11], ["red", 11]],
  "text-success": [["grass", 11], ["grass", 11]],
  "icon-primary": [["gray", 11], ["gray", 11]],
  "icon-disabled": [["gray", 8], ["gray", 8]],
  "accent-soft": [["blue", 3], ["blue", 3]],
  "accent-soft-hover": [["blue", 4], ["blue", 4]],
  "accent-border": [["blue", 7], ["blue", 7]],
  "accent-solid": [["blue", 9], ["blue", 9]],
  "accent-solid-hover": [["blue", 10], ["blue", 10]],
  "accent-text": [["blue", 11], ["blue", 11]],
  "focus-ring": [["blue", 8], ["blue", 8]],
  "error-soft": [["red", 3], ["red", 3]],
  "error-border": [["red", 7], ["red", 7]],
  "error-text": [["red", 11], ["red", 11]],
  "error-solid": [["red", 9], ["red", 9]],
  "success-soft": [["grass", 3], ["grass", 3]],
  "success-border": [["grass", 7], ["grass", 7]],
  "success-text": [["grass", 11], ["grass", 11]],
  "success-solid": [["grass", 9], ["grass", 9]],
  "warning-soft": [["amber", 3], ["amber", 3]],
  "warning-border": [["amber", 7], ["amber", 7]],
  "warning-text": [["amber", 11], ["amber", 11]],
  "warning-solid": [["amber", 9], ["amber", 9]],
  "info-soft": [["cyan", 3], ["cyan", 3]],
  "info-border": [["cyan", 7], ["cyan", 7]],
  "info-text": [["cyan", 11], ["cyan", 11]],
  "info-solid": [["cyan", 9], ["cyan", 9]],
};

/** 阴影不走色阶，直接给值。 */
const SHADOWS = {
  "shadow-popover": ["0 10px 38px -10px rgba(22, 23, 24, 0.35), 0 10px 20px -15px rgba(22, 23, 24, 0.2)", "0 10px 38px -10px rgba(0, 0, 0, 0.6), 0 10px 20px -15px rgba(0, 0, 0, 0.45)"],
  "shadow-panel": ["0 1px 2px rgba(22, 23, 24, 0.06), 0 8px 24px -12px rgba(22, 23, 24, 0.18)", "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -12px rgba(0, 0, 0, 0.4)"],
};

const SHADOW_NAMES = Object.keys(SHADOWS);

/** 该主题下所有语义 token 的解析值（不含 --ldp- 前缀）。 */
export function tokens(theme = "light") {
  const mode = THEMES.includes(theme) ? theme : "light";
  const out = {};
  for (const [name, [light, dark]] of Object.entries(SEMANTIC)) {
    const [hue, step] = mode === "dark" ? dark : light;
    out[name] = RAMP[mode][hue][step - 1];
  }
  SERIES_HUES.forEach((hue, index) => {
    out[`series-${index + 1}`] = RAMP[mode][hue][8];
  });
  SHADOW_NAMES.forEach((name) => {
    out[name] = SHADOWS[name][mode === "dark" ? 1 : 0];
  });
  return out;
}

/**
 * 片段（沙箱 iframe 里的 HTML）能用的调色板。
 * 名字与旧版 srcdoc 注入的变量保持一致，老片段不用改。
 */
export function palette(theme = "light") {
  const t = tokens(theme);
  return {
    text: t["text-primary"],
    muted: t["text-secondary"],
    faint: t["text-tertiary"],
    border: t["border-default"],
    surface: t["bg-secondary"],
    accent: t["accent-solid"],
    code: t["bg-code"],
    font: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    series: SERIES_HUES.map((_, index) => t[`series-${index + 1}`]),
  };
}

/** 生成两组自定义属性（明/暗）。 */
export const TOKEN_CSS = (() => {
  const lines = [];
  for (const theme of THEMES) {
    const selector =
      theme === "dark"
        ? `.ldp-block[${THEME_ATTR}="dark"]`
        : "/* 默认即明色；暗色在下面的选择器里覆盖 */\n.ldp-block";
    const resolved = tokens(theme);
    lines.push(`${theme === "dark" ? "" : "\n"}${selector} {`);
    for (const [name, value] of Object.entries(resolved)) {
      lines.push(`  --ldp-${name}: ${value};`);
    }
    lines.push("}");
  }
  return lines.filter((line) => line !== "").join("\n");
})();
