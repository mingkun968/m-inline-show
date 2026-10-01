/**
 * 点击探针：给按钮挂**原生**监听，把事件计数直接写进状态行（绕过 React 状态），
 * 并在 `mouseup` 时触发一次复制。
 *
 * 为什么要 mouseup：宿主对渲染侧派发的动作会校验"可信手势"，它认的列表是
 * mouseup / touchend / touchstart / input / change / submit —— **不含 click**。
 * 所以 click 那条路（React onClick）只在不需要手势时才有用，mouseup 才是主路径。
 *
 * 若原生计数一直是 0，说明事件没到按钮，问题在宿主而不在复制逻辑。
 */
import { useCallback, useLayoutEffect, useRef } from "react";
import { hostLog } from "./host-bridge.mjs";

const EVENTS = ["pointerdown", "mousedown", "mouseup", "click"];
const ACTIVATE_ON = "mouseup";

export function useEventProbe(statusRef, write, onActivate = null) {
  const buttonRef = useRef(null);
  const counts = useRef({ native: 0, last: "" });
  const activateRef = useRef(onActivate);
  activateRef.current = onActivate;

  useLayoutEffect(() => {
    const node = buttonRef.current;
    if (!node) {
      write("未找到按钮节点");
      return undefined;
    }
    write("就绪：等待点击");
    const onAny = (event) => {
      counts.current.native += 1;
      counts.current.last = event.type;
      write(`原生事件 ${counts.current.native} 次 · 最近 ${event.type}`);
      if (counts.current.native === 1) void hostLog(`native-event ${event.type}`);
      if (event.type !== ACTIVATE_ON) return;
      try {
        const pending = activateRef.current?.();
        if (pending && typeof pending.catch === "function") pending.catch(() => {});
      } catch {
        /* 复制链自己会回报失败 */
      }
    };
    EVENTS.forEach((type) => node.addEventListener(type, onAny, true));
    // 挂载即自检：还没点过任何东西时，把环境状态（含 clipboard-write 权限）写进状态行。
    probeClipboardEnvironment()
      .then((text) => {
        if (counts.current.native === 0) write(text);
        void hostLog(`mount ${text}`);
      })
      .catch(() => {});
    return () => EVENTS.forEach((type) => node.removeEventListener(type, onAny, true));
  }, [statusRef, write]);

  return { buttonRef, counts };
}

/**
 * 不写剪贴板、也不需要点击：直接查环境状态 —— 安全上下文、文档焦点、
 * 以及 clipboard-write 权限的真实状态（granted / denied / prompt）。
 * 权限被宿主整段拒绝时这里会直接显示 denied，一次就能定性。
 */
export async function probeClipboardEnvironment() {
  const parts = [];
  parts.push(`安全上下文: ${typeof window !== "undefined" && window.isSecureContext ? "是" : "否"}`);
  parts.push(`文档焦点: ${typeof document !== "undefined" && document.hasFocus() ? "有" : "无"}`);
  try {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "clipboard-write" });
      parts.push(`clipboard-write 权限: ${status.state}`);
    } else {
      parts.push("Permissions API 不可用");
    }
  } catch (error) {
    const reason = error && typeof error === "object" && "name" in error ? String(error.name) : String(error);
    parts.push(`clipboard-write 查询失败: ${reason}`);
  }
  parts.push("（本块按钮走插件通道，与宿主复制按钮不同）");
  return parts.join(" · ");
}

/** 一个稳定的状态行写入器（直接改 DOM，不受 React 渲染影响）。 */
export function useStatusWriter(statusRef) {
  return useCallback(
    (text) => {
      const node = statusRef.current;
      if (node) node.textContent = String(text ?? "");
    },
    [statusRef],
  );
}
