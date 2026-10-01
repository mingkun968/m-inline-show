/**
 * m_inline_show —— 三种块共用的外壳。
 *
 * 结构照主流 AI 工作台的做法：header（图标/标题/徽章/动作）+ body + foot（状态行/小字），
 * 主题写在块根节点 `data-ldp-theme` 上，样式表据此切换 token（不猜宿主的类名）。
 *
 * 只 import react，不碰 provider、不做网络请求。下载能力（SVG/PNG）在浏览器里跑。
 */
import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SERIES_HUES, THEME_ATTR, tokens } from "./tokens.mjs";

/* ────────────────────────────── 主题 ────────────────────────────── */

/** 读一次宿主主题：优先 data-theme / class，再退到 color-scheme，最后退到系统偏好。 */
export function detectTheme() {
  try {
    const root = document.documentElement;
    const attr = `${root.getAttribute("data-theme") ?? ""} ${root.getAttribute("data-color-scheme") ?? ""}`;
    if (/dark/i.test(attr)) return "dark";
    if (/light/i.test(attr)) return "light";
    if (root.classList.contains("dark")) return "dark";
    if (root.classList.contains("light")) return "light";
    const scheme = getComputedStyle(root).colorScheme ?? "";
    if (scheme.trim() === "dark") return "dark";
    if (scheme.trim() === "light") return "light";
    if (typeof matchMedia === "function") {
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {
    /* 取不到就当明色 */
  }
  return "light";
}

/** 跟随宿主主题切换：属性/类变化或系统偏好变化都会重算。 */
export function useBlockTheme() {
  const [theme, setTheme] = useState(detectTheme);
  useLayoutEffect(() => {
    const sync = () => setTheme((prev) => {
      const next = detectTheme();
      return next === prev ? prev : next;
    });
    const root = document.documentElement;
    let observer;
    if (root && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(sync);
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
      });
    }
    let media;
    if (typeof matchMedia === "function") {
      media = matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener?.("change", sync);
    }
    sync();
    return () => {
      observer?.disconnect();
      media?.removeEventListener?.("change", sync);
    };
  }, []);
  return theme;
}

/* ────────────────────────────── 动作件 ────────────────────────────── */

export function ActionButton({ label, title, active = false, onClick, buttonRef, ariaLabel }) {
  return h(
    "button",
    {
      ref: buttonRef,
      type: "button",
      className: `ldp-btn${active ? " is-active" : ""}`,
      title,
      "aria-label": ariaLabel ?? title ?? label,
      onClick,
    },
    label,
  );
}

/** 分段切换（图 / 源码 这种二选一）。 */
export function Segmented({ value, options, onChange }) {
  return h(
    "span",
    { className: "ldp-seg", role: "group" },
    options.map((option) =>
      h(
        "button",
        {
          key: option.value,
          type: "button",
          className: `ldp-btn${option.value === value ? " is-active" : ""}`,
          title: option.title,
          "aria-pressed": option.value === value,
          onClick: () => onChange(option.value),
        },
        option.label,
      ),
    ),
  );
}

/* ────────────────────────────── 外壳 ────────────────────────────── */

export function BlockFrame({
  language,
  kind,
  type = null,
  icon = null,
  title,
  badge = null,
  actions = null,
  children,
  statusRef = null,
  status = null,
  notes = null,
  bodyRef = null,
  bodyProps = null,
  width = null,
}) {
  const theme = useBlockTheme();
  const attrs = {
    className: "ldp-block",
    "data-ldp": kind,
    [THEME_ATTR]: theme,
    "data-ldp-language": language,
  };
  if (type) attrs["data-ldp-type"] = type;
  // 宽度统一走 CSS 变量：数字 → 像素，"100%" 之类原样透传。
  if (width !== null) {
    attrs.style = { "--ldp-w": typeof width === "number" ? `${width}px` : width };
  }

  return h(
    "div",
    attrs,
    h(
      "div",
      { className: "ldp-head" },
      icon ? h("span", { className: "ldp-icon" }, icon) : null,
      h("span", { className: "ldp-title" }, title),
      badge ? h("span", { className: "ldp-badge" }, badge) : null,
      h("span", { className: "ldp-spacer" }),
      actions,
    ),
    h(
      "div",
      { className: "ldp-body", ...(bodyProps ?? {}), ref: bodyRef },
      children,
    ),
    status || notes
      ? h(
          "div",
          { className: "ldp-foot" },
          status !== null ? h("div", { className: "ldp-status", ref: statusRef }, status) : null,
          notes,
        )
      : null,
  );
}

/** 10px 的通用小图标（当前只有图表 / 页面两种）。 */
export function kindIcon(kind) {
  const common = {
    viewBox: "0 0 16 16",
    width: 13,
    height: 13,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (kind === "html") {
    return h(
      "svg",
      common,
      h("path", { d: "M3 3h10v10H3z" }),
      h("path", { d: "M3 6.5h10M6.5 6.5V13" }),
    );
  }
  if (kind === "widget") {
    return h(
      "svg",
      common,
      h("path", { d: "M2.5 4.5h11v7h-11z" }),
      h("path", { d: "M5.5 7.5l2 2 3-3.5" }),
    );
  }
  return h(
    "svg",
    common,
    h("path", { d: "M2.5 12.5V5M6.2 12.5V8M9.9 12.5V4M13.6 12.5V9.5" }),
    h("path", { d: "M2 14h12" }),
  );
}

/* ────────────────────────────── 导出 ────────────────────────────── */

/** 导出用的独立样式（把 currentColor / token 解析成具体色值，脱离宿主 CSS 也好看）。 */
function exportCss(theme) {
  const t = tokens(theme);
  const series = SERIES_HUES.map((_, index) => `.ldp-s${index + 1}{color:${t[`series-${index + 1}`]}}`).join("");
  return [
    `.ldp-grid{stroke:${t["border-subtle"]};stroke-width:1;stroke-dasharray:3 3}`,
    `.ldp-axis{stroke:${t["border-default"]};stroke-width:1}`,
    `.ldp-tick{fill:${t["text-secondary"]};font:10px system-ui,sans-serif}`,
    ".ldp-line{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}",
    `.ldp-area{fill:currentColor;opacity:.14}`,
    ".ldp-dot{fill:currentColor}",
    ".ldp-fill{fill:currentColor}",
    series,
  ].join("");
}

/** 把屏幕上的图表 SVG 变成可独立打开的 SVG 文本。 */
export function serializeChartSvg(svgEl, { theme = "light", background = true } = {}) {
  if (!svgEl) return "";
  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = exportCss(theme);
  clone.insertBefore(style, clone.firstChild);
  if (background) {
    const pad = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    pad.setAttribute("x", "0");
    pad.setAttribute("y", "0");
    pad.setAttribute("width", "100%");
    pad.setAttribute("height", "100%");
    pad.setAttribute("fill", tokens(theme)["bg-inset"]);
    clone.insertBefore(pad, style.nextSibling);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 下载 SVG；返回是否成功（失败信息交给状态行）。 */
export function downloadSvg(svgEl, { theme = "light", filename = "chart.svg" } = {}) {
  const text = serializeChartSvg(svgEl, { theme });
  if (!text) throw new Error("没有可导出的图形");
  triggerDownload(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), filename);
  return text.length;
}

/** 下载 PNG（2 倍图，靠 canvas 重绘）。 */
export function downloadPng(svgEl, { theme = "light", filename = "chart.png", scale = 2 } = {}) {
  const text = serializeChartSvg(svgEl, { theme });
  if (!text) throw new Error("没有可导出的图形");
  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const image = new Image();
  const done = new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("图形解码失败"));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  return done.then(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前环境不支持 canvas");
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG 生成失败"));
          return;
        }
        triggerDownload(blob, filename);
        resolve(blob.size);
      }, "image/png");
    });
  });
}

/** 下载菜单（SVG / PNG）：点外部或按 Esc 关闭。 */
export function DownloadMenu({ onPick, label = "下载" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return h(
    "span",
    { className: "ldp-menu-wrap", ref: wrapRef },
    h(ActionButton, {
      label,
      title: "导出图形",
      active: open,
      onClick: () => setOpen((prev) => !prev),
    }),
    open
      ? h(
          "span",
          { className: "ldp-menu", role: "menu" },
          ["svg", "png"].map((kind) =>
            h(
              "button",
              {
                key: kind,
                type: "button",
                role: "menuitem",
                className: "ldp-menu-item",
                onClick: () => {
                  setOpen(false);
                  onPick(kind);
                },
              },
              kind === "svg" ? "下载 SVG" : "下载 PNG",
            ),
          ),
        )
      : null,
  );
}
