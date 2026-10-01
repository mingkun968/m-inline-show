/**
 * 复制按钮的状态机 + 保底选取。
 * 复制走三层兜底（插件进程原生剪贴板 → navigator.clipboard → execCommand），
 * 结果既反映到按钮文案，也通过 report 回写给状态行。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { copyText, defaultClipboardDeps } from "./copy-text.mjs";
import { hostLog } from "./host-bridge.mjs";

export const COPY_LABELS = {
  idle: "复制",
  pending: "复制中…",
  done: "已复制",
  failed: "复制失败",
};

const RESET_MS = { done: 1600, failed: 6000 };

export function useCopyAction(source, { host = null, report = null, hint = "复制到剪贴板" } = {}) {
  const [state, setState] = useState("idle");
  const [detail, setDetail] = useState("");
  const timer = useRef(null);
  const lastStart = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const run = useCallback(async () => {
    const now = Date.now();
    // mouseup 与 click 会各触发一次，这里去重。
    if (now - lastStart.current < 600) return;
    lastStart.current = now;
    if (timer.current) clearTimeout(timer.current);
    setState("pending");
    report?.("已收到点击，开始复制…");
    let result;
    try {
      result = await copyText(source, { ...defaultClipboardDeps(), host });
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    setState(result.ok ? "done" : "failed");
    const text = result.ok ? `已复制（${result.via}）` : `复制失败：${result.error}`;
    setDetail(text);
    report?.(text);
    void hostLog(text);
    timer.current = setTimeout(
      () => {
        setState("idle");
        setDetail("");
      },
      RESET_MS[result.ok ? "done" : "failed"],
    );
  }, [source, host, report]);

  return {
    state,
    detail,
    label: COPY_LABELS[state] ?? COPY_LABELS.idle,
    title: state === "idle" ? hint : detail || hint,
    busy: state === "pending",
    run,
  };
}

/**
 * 保底手段：展开源码并选中它，让用户自己按 Ctrl+C —— 完全不依赖剪贴板 API，
 * 所以在剪贴板被整体禁用时仍然可用。
 */
export function useSourcePicker(report = null) {
  const preRef = useRef(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return;
    setPending(false);
    const node = preRef.current;
    if (!node) {
      report?.("源码区还没就绪，请再点一次");
      return;
    }
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection?.removeAllRanges();
      selection?.addRange(range);
      report?.("已选中源码，按 Ctrl+C / Cmd+C 复制");
    } catch {
      report?.("无法自动选中，请手动拖选源码");
    }
  }, [pending, report]);

  return { preRef, pick: () => setPending(true) };
}
