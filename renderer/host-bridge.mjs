/**
 * 渲染块 → 插件进程的调用桥。
 *
 * manifest 里声明了：
 *   rendererActions: ["plugin.call"]
 *   rendererCallMethods: ["disp.copy", "disp.log"]
 *
 * 关键细节：宿主的 API **不是全局变量**，而是 `onLoad(pi)` 的参数。
 * 所以 index.mjs 会在 onLoad 里把它交给 setHostApi()；这里读全局只是兜底，
 * 免得某些宿主版本确实注入 globalThis.pi 时我们又不认。
 *
 * 走这条路的理由：应用窗口的 navigator.clipboard 可能被宿主的权限处理器整段拒绝，
 * 而插件进程调用宿主原生剪贴板（Electron 主进程 clipboard）不经过那层。
 */
let hostApi = null;

/** 由 index.mjs 在 onLoad(pi) 里调用一次。 */
export function setHostApi(api) {
  if (api && typeof api.dispatch === "function") hostApi = api;
}

function currentApi() {
  if (hostApi) return hostApi;
  return typeof globalThis !== "undefined" ? (globalThis.pi ?? null) : null;
}

function dispatch(method, args) {
  const api = currentApi();
  if (!api || typeof api.dispatch !== "function") {
    return Promise.reject(new Error("pi.dispatch 不可用（onLoad 没拿到宿主 API）"));
  }
  return api.dispatch({ action: "plugin.call", payload: { method, args } });
}

/** 复制文本到系统剪贴板（插件进程原生通道）。 */
export function hostCopy(text) {
  return dispatch("disp.copy", { text });
}

/** 把一行诊断日志交给插件进程（写进插件 settings，落盘为 settings.json）——失败时静默。 */
export function hostLog(text) {
  if (!currentApi()) return Promise.resolve(null);
  return dispatch("disp.log", { text: String(text ?? "") }).catch(() => null);
}

export function hostCopyAvailable() {
  const api = currentApi();
  return Boolean(api && typeof api.dispatch === "function");
}
