/**
 * m_inline_show — `local.m_inline_show:html` 的块组件。
 *
 * 片段跑在 sandbox="allow-same-origin"（**不给 allow-scripts**）的 iframe 里，
 * 文档内再叠一条 CSP：脚本、外链、表单全断。保留同源只为量尺寸做自适应
 * （scrollHeight 定高度、临时 max-content 定宽度）。
 *
 * 调色板来自 tokens.mjs，跟块自身的明暗主题一致 —— 不再去猜宿主的 --ds-* 变量。
 */
import { createElement as h, useEffect, useMemo, useRef, useState } from "react";
import { useCopyAction, useSourcePicker } from "./copy-hook.mjs";
import { hostCopy } from "./host-bridge.mjs";
import { useEventProbe, useStatusWriter } from "./probe.mjs";
import {
  BLANK_HTML_WIDTH_PX,
  BLOCK_CHROME_PX,
  DEFAULT_HTML_HEIGHT_PX,
  DEFAULT_HTML_WIDTH_PX,
  buildHtmlSrcDoc,
  clampHeight,
  clampWidth,
  isBlank,
  looksLikeMarkup,
} from "./html-spec.mjs";
import { ActionButton, BlockFrame, Segmented, kindIcon, useBlockTheme } from "./chrome.mjs";
import { palette } from "./tokens.mjs";

export function HtmlBlock({ language, source }) {
  const theme = useBlockTheme();
  const colors = useMemo(() => palette(theme), [theme]);
  const srcDoc = useMemo(() => buildHtmlSrcDoc(source, colors), [source, colors]);
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(DEFAULT_HTML_HEIGHT_PX);
  const [boxWidth, setBoxWidth] = useState(DEFAULT_HTML_WIDTH_PX);
  const [mode, setMode] = useState("view");
  const statusRef = useRef(null);
  const writeStatus = useStatusWriter(statusRef);
  const copy = useCopyAction(source, { host: hostCopy, report: writeStatus });
  const probe = useEventProbe(statusRef, writeStatus, copy.run);
  const picker = useSourcePicker(writeStatus);

  const blank = isBlank(source);

  useEffect(() => {
    setHeight(DEFAULT_HTML_HEIGHT_PX);
    setBoxWidth(DEFAULT_HTML_WIDTH_PX);
  }, [srcDoc]);

  const measure = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      const next = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight ?? 0;
      setHeight(clampHeight(next));
    } catch {
      setHeight(DEFAULT_HTML_HEIGHT_PX);
    }
  };

  /**
   * 量内容的内在宽度：临时把文档摊成 max-content，量完立刻摘掉样式。
   * 全在同一个任务里完成，浏览器不会在中间绘制，所以看不到跳动。
   * 注意用 getBoundingClientRect 而不是 scrollWidth —— 后者不会小于视口宽度，
   * 量不出「内容比当前块更窄」的情况。
   */
  const measureWidth = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      const root = doc?.documentElement;
      const body = doc?.body;
      if (!doc?.head || !root || !body) return;
      const probe_ = doc.createElement("style");
      probe_.textContent = "html,body{width:max-content !important;min-width:0 !important;}";
      doc.head.appendChild(probe_);
      const bodyStyle = doc.defaultView?.getComputedStyle(body);
      const bodyNatural =
        body.getBoundingClientRect().width +
        (Number.parseFloat(bodyStyle?.marginLeft) || 0) +
        (Number.parseFloat(bodyStyle?.marginRight) || 0);
      const natural = Math.max(root.getBoundingClientRect().width, bodyNatural);
      probe_.remove();
      if (natural > 0) setBoxWidth(clampWidth(natural + BLOCK_CHROME_PX));
    } catch {
      setBoxWidth(DEFAULT_HTML_WIDTH_PX);
    }
  };

  const onLoad = () => {
    measureWidth();
    measure();
    // 字体/图片落位后再量一次，避免高度偏小。
    setTimeout(measure, 160);
  };

  // 宽度变了 → iframe 重新折行 → 高度必须重测一次。
  useEffect(() => {
    measure();
    // measure 每次渲染都会重建，这里只关心宽度变化。
  }, [boxWidth]);

  const width = blank ? BLANK_HTML_WIDTH_PX : boxWidth;

  const sourceView = h(
    "div",
    { className: "ldp-source-view" },
    h(
      "div",
      { className: "ldp-source-bar" },
      h("span", null, `${source.length} 字符`),
      h("span", { className: "ldp-spacer" }),
      h(ActionButton, { label: "选取", title: "选中原文，便于手动复制", onClick: () => picker.pick() }),
    ),
    h("pre", { className: "ldp-src", ref: picker.preRef, tabIndex: 0 }, source),
  );

  const preview = blank
    ? h("div", { className: "ldp-empty" }, "空的 HTML 片段。")
    : h(
        "div",
        { className: "ldp-html-frame" },
        h("iframe", {
          ref: iframeRef,
          className: "ldp-html",
          title: "HTML 片段",
          sandbox: "allow-same-origin",
          referrerPolicy: "no-referrer",
          loading: "lazy",
          srcDoc,
          onLoad,
          style: { height: `${height}px` },
        }),
      );

  return h(BlockFrame, {
    language,
    kind: "html",
    icon: kindIcon("html"),
    title: "HTML 片段",
    badge: `${source.length} 字符`,
    width,
    actions: blank
      ? null
      : [
          h(ActionButton, {
            key: "copy",
            label: copy.label,
            title: copy.title,
            active: copy.state !== "idle",
            buttonRef: probe.buttonRef,
            onClick: copy.run,
          }),
          h(Segmented, {
            key: "mode",
            value: mode,
            options: [
              { value: "view", label: "预览", title: "显示渲染结果" },
              { value: "source", label: "源码", title: "显示围栏原文" },
            ],
            onChange: setMode,
          }),
        ],
    children: mode === "source" ? sourceView : preview,
    status: "就绪：等待点击",
    statusRef,
    notes: [
      !blank && !looksLikeMarkup(source)
        ? h("div", { key: "text", className: "ldp-note" }, "片段里没有明显的 HTML 标签，已按纯文本渲染。")
        : null,
      h(
        "div",
        { key: "csp", className: "ldp-note ldp-note-quiet" },
        "沙箱内脚本、外链与表单提交被阻止；可用内联样式、data: 图片与 --series-1…8 系列色。",
      ),
    ],
  });
}
