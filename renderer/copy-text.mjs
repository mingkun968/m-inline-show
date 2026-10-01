/**
 * 复制到剪贴板，三层兜底，按可靠性排序：
 *   1. 插件进程的原生剪贴板（pi.dispatch → plugin.call → pi.clipboard.writeText）
 *   2. navigator.clipboard.writeText（应用窗口里可能被权限/焦点限制拒绝）
 *   3. 临时 textarea + document.execCommand("copy")
 *
 * 依赖可注入，便于离线自测；失败时把三层的具体原因一起返回，界面不再静默。
 */

export function defaultClipboardDeps() {
  return {
    host: null,
    clipboard: typeof navigator !== "undefined" ? navigator.clipboard : undefined,
    doc: typeof document !== "undefined" ? document : null,
  };
}

function messageOf(error) {
  if (error && typeof error.message === "string") return error.message;
  return String(error);
}

/** 传统兜底：临时 textarea + execCommand("copy")。 */
export function execCommandCopy(text, doc) {
  if (!doc || typeof doc.createElement !== "function") throw new Error("document 不可用");
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.left = "-1000px";
  area.style.opacity = "0";
  doc.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange?.(0, area.value.length);
    return typeof doc.execCommand === "function" ? doc.execCommand("copy") === true : false;
  } finally {
    area.remove();
  }
}

/**
 * 依次尝试所有策略。
 * @returns {Promise<{ok: true, via: string} | {ok: false, error: string}>}
 */
export async function copyText(text, deps = defaultClipboardDeps()) {
  const value = typeof text === "string" ? text : String(text ?? "");
  if (!value) return { ok: false, error: "没有可复制的内容" };

  const reasons = [];

  const host = deps?.host;
  if (typeof host === "function") {
    try {
      await host(value);
      return { ok: true, via: "插件进程原生剪贴板" };
    } catch (error) {
      reasons.push(`插件进程：${messageOf(error)}`);
    }
  } else {
    reasons.push("插件进程通道未提供");
  }

  const clipboard = deps?.clipboard;
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(value);
      return { ok: true, via: "navigator.clipboard" };
    } catch (error) {
      reasons.push(`navigator.clipboard：${messageOf(error)}`);
    }
  } else {
    reasons.push("navigator.clipboard 不可用");
  }

  try {
    if (execCommandCopy(value, deps?.doc)) return { ok: true, via: 'execCommand("copy")' };
    reasons.push('execCommand("copy") 返回 false');
  } catch (error) {
    reasons.push(`execCommand：${messageOf(error)}`);
  }

  return { ok: false, error: reasons.join("；") };
}
