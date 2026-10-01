/**
 * 渲染块 → 插件进程的调用桥。
 *
 * manifest 里声明了：
 *   rendererActions: ["plugin.call"]
 *   rendererCallMethods: ["disp.copy", "disp.log"]
 *
 * 走这条路的理由：应用窗口的 navigator.clipboard 可能被宿主的权限处理器整段拒绝，
 * 而插件进程调用宿主原生剪贴板（Electron 主进程 clipboard）不经过那层。
 */

function dispatch(method, args) {
  const api = typeof globalThis !== "undefined" ? globalThis.pi : undefined;
  if (!api || typeof api.dispatch !== "function") {
    return Promise.reject(new Error("pi.dispatch 不可用（宿主未注入或版本过旧）"));
  }
  return api.dispatch({ action: "plugin.call", payload: { method, args } });
}

/** 复制文本到系统剪贴板（插件进程原生通道）。 */
export function hostCopy(text) {
  return dispatch("disp.copy", { text });
}

/** 把一行诊断日志交给插件进程（写进插件 settings，落盘为 settings.json）——失败时静默。 */
export function hostLog(text) {
  const api = typeof globalThis !== "undefined" ? globalThis.pi : undefined;
  if (!api || typeof api.dispatch !== "function") return Promise.resolve(null);
  return dispatch("disp.log", { text: String(text ?? "") }).catch(() => null);
}

export function hostCopyAvailable() {
  const api = typeof globalThis !== "undefined" ? globalThis.pi : undefined;
  return Boolean(api && typeof api.dispatch === "function");
}
