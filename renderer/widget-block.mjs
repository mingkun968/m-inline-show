/**
 * m_inline_show — `local.m_inline_show:widget` 的块组件。
 *
 * 片段跑在 sandbox="allow-scripts"（**不给 allow-same-origin**）的 iframe 里：
 * 能跑自己的脚本做交互，但碰不到父窗口、也连不出去（CSP connect-src 'none'）。
 * 高度不能同源测量，所以由片段 postMessage 上报（协议见 widget-spec.mjs）。
 */
import { createElement as h, useEffect, useMemo, useRef, useState } from "react";
import { useCopyAction, useSourcePicker } from "./copy-hook.mjs";
import { hostCopy } from "./host-bridge.mjs";
import { useEventProbe, useStatusWriter } from "./probe.mjs";
import { palette } from "./tokens.mjs";
import {
  DEFAULT_WIDGET_HEIGHT_PX,
  buildWidgetSrcDoc,
  clampWidgetHeight,
  isWidgetBlank,
  parseWidgetMessage,
} from "./widget-spec.mjs";
import { ActionButton, BlockFrame, Segmented, kindIcon, useBlockTheme } from "./chrome.mjs";

export function WidgetBlock({ language, source }) {
  const theme = useBlockTheme();
  const colors = useMemo(() => palette(theme), [theme]);
  const srcDoc = useMemo(() => buildWidgetSrcDoc(source, colors), [source, colors]);
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(DEFAULT_WIDGET_HEIGHT_PX);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("view");
  const statusRef = useRef(null);
  const writeStatus = useStatusWriter(statusRef);
  const copy = useCopyAction(source, { host: hostCopy, report: writeStatus });
  const probe = useEventProbe(statusRef, writeStatus, copy.run);
  const picker = useSourcePicker(writeStatus);

  const blank = isWidgetBlank(source);

  useEffect(() => {
    setReady(false);
    setError("");
    setHeight(DEFAULT_WIDGET_HEIGHT_PX);
  }, [srcDoc]);

  useEffect(() => {
    const onMessage = (event) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const parsed = parseWidgetMessage(event.data);
      if (!parsed) return;
      setReady(true);
      if (parsed.error) {
        setError(parsed.error);
        writeStatus(`片段脚本报错：${parsed.error}`);
        return;
      }
      setHeight(clampWidgetHeight(parsed.height));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [writeStatus]);

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

  const view = blank
    ? h("div", { className: "ldp-empty" }, "空的 widget 片段。")
    : h(
        "div",
        { className: "ldp-widget-frame" },
        h("iframe", {
          ref: iframeRef,
          className: "ldp-widget",
          title: "交互片段",
          sandbox: "allow-scripts",
          referrerPolicy: "no-referrer",
          srcDoc,
          style: { height: `${height}px` },
        }),
        ready
          ? null
          : h(
              "div",
              { className: "ldp-pending", role: "status", "aria-live": "polite" },
              h("span", { className: "ldp-spinner" }),
              "片段加载中…",
            ),
        error
          ? h(
              "div",
              { className: "ldp-error" },
              h("div", { className: "ldp-error-title" }, "片段脚本报错"),
              h("div", { className: "ldp-error-msg" }, error),
            )
          : null,
      );

  return h(BlockFrame, {
    language,
    kind: "widget",
    icon: kindIcon("widget"),
    title: "交互片段",
    badge: `${source.length} 字符`,
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
              { value: "view", label: "运行", title: "运行片段" },
              { value: "source", label: "源码", title: "显示围栏原文" },
            ],
            onChange: setMode,
          }),
        ],
    children: mode === "source" ? sourceView : view,
    status: "就绪：等待点击",
    statusRef,
    notes: [
      h(
        "div",
        { key: "security", className: "ldp-note ldp-note-quiet" },
        "片段可跑内联脚本做交互，但沙箱不给同源、CSP 禁网络：读不到本页数据，也发不出去；高度由片段自行上报。",
      ),
    ],
  });
}
