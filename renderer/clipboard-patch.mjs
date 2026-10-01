/**
 * 全局复制补丁 —— 接管应用界面里的 navigator.clipboard.writeText。
 *
 * 为什么需要它：应用自带的复制按钮（聊天消息上的复制、会话末尾的复制）直接调
 * navigator.clipboard.writeText()，而宿主给渲染会话装的权限策略会拒绝
 * clipboard-sanitized-write（预览窗 / 插件面板更是 `callback(false)` 全拒），
 * 于是这些按钮静默失败 —— 界面上只闪一句「Couldn't copy to the clipboard」。
 * 本模块把那个方法包一层，让应用自己的按钮也走我们验证过的兜底链。
 *
 * 顺序（先同步后异步：execCommand 必须在用户手势内同步执行，一旦 await 过就失效）：
 *   1. 临时 textarea + document.execCommand("copy")  —— 同步、不经过权限处理器
 *   2. 原 navigator.clipboard.writeText            —— 宿主将来修好权限策略即自动生效
 *   3. 插件进程原生剪贴板（disp.copy → Electron 主进程 clipboard）—— 不经过渲染层权限
 *
 * 替换点同时覆盖原型与实例（`navigator.clipboard.writeText(...)` 与解构后带接收者的
 * 调用都能命中）；幂等，重复安装只装一次；uninstallClipboardPatch() 逐项还原。
 */
import { execCommandCopy } from "./copy-text.mjs";
import { hostCopy, hostCopyAvailable, hostLog } from "./host-bridge.mjs";

const PATCH_FLAG = "__dispClipboardPatched";
/** 已替换的目标及其原始描述符，卸载时逐项还原。 */
let patchedTargets = [];

function messageOf(error) {
  if (error && typeof error.message === "string") return error.message;
  return String(error);
}

/** execCommand 会临时挪走焦点（textarea 选中），复制完把焦点还回去。 */
function copyViaExecCommand(value, doc) {
  const previous = doc?.activeElement ?? null;
  try {
    return execCommandCopy(value, doc);
  } finally {
    try {
      if (previous && typeof previous.focus === "function" && doc?.contains?.(previous)) previous.focus();
    } catch {
      /* 焦点还原失败不影响复制结果 */
    }
  }
}

function applyWriteText(clipboard, patched) {
  const proto = Object.getPrototypeOf(clipboard);
  const candidates = [];
  // 原型优先（只认真正带 writeText 的原型，避免动到 Object.prototype）。
  if (proto && typeof proto.writeText === "function") candidates.push(proto);
  candidates.push(clipboard);
  const done = [];
  for (const target of candidates) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(target, "writeText");
      if (descriptor && descriptor.configurable === false) continue;
      Object.defineProperty(target, "writeText", { configurable: true, writable: true, value: patched });
      done.push({ target, descriptor });
    } catch {
      /* 目标不可写就跳过 */
    }
  }
  return done;
}

/**
 * 安装补丁。
 * @param {{clipboard?: object, doc?: object, hostCopy?: Function, log?: Function}} [deps] 依赖可注入，便于离线自测
 * @returns {{installed: boolean, reason?: string}}
 */
export function installClipboardPatch(deps = {}) {
  const clipboard = deps.clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!clipboard) return { installed: false, reason: "navigator.clipboard 不可用" };
  if (clipboard[PATCH_FLAG]) return { installed: false, reason: "已安装过补丁（幂等）" };

  const original = typeof clipboard.writeText === "function" ? clipboard.writeText.bind(clipboard) : null;
  const doc = deps.doc ?? (typeof document !== "undefined" ? document : null);
  const copyViaHost = typeof deps.hostCopy === "function" ? deps.hostCopy : hostCopy;
  const hostAvailable = typeof deps.hostCopy === "function" ? () => true : hostCopyAvailable;
  const log = typeof deps.log === "function" ? deps.log : hostLog;
  if (!original && !hostAvailable()) return { installed: false, reason: "既没有 writeText 也没有插件进程通道" };

  const patched = async (text) => {
    const value = typeof text === "string" ? text : String(text ?? "");
    const reasons = [];

    try {
      if (copyViaExecCommand(value, doc)) {
        void log("clipboard-patch：复制成功（execCommand）");
        return;
      }
      reasons.push('execCommand("copy") 返回 false');
    } catch (error) {
      reasons.push(`execCommand：${messageOf(error)}`);
    }

    if (original) {
      try {
        await original(value);
        void log("clipboard-patch：复制成功（navigator.clipboard）");
        return;
      } catch (error) {
        reasons.push(`navigator.clipboard：${messageOf(error)}`);
      }
    } else {
      reasons.push("navigator.clipboard.writeText 不可用");
    }

    if (hostAvailable()) {
      try {
        await copyViaHost(value);
        void log("clipboard-patch：复制成功（插件进程原生通道）");
        return;
      } catch (error) {
        reasons.push(`插件进程：${messageOf(error)}`);
      }
    } else {
      reasons.push("插件进程通道不可用");
    }

    const message = `复制失败：${reasons.join("；")}`;
    void log(`clipboard-patch：${message}`);
    throw new Error(message);
  };

  const done = applyWriteText(clipboard, patched);
  if (!done.length) return { installed: false, reason: "writeText 不可写（原型与实例都被冻结）" };
  patchedTargets = done;
  try {
    Object.defineProperty(clipboard, PATCH_FLAG, { configurable: true, writable: true, value: original });
  } catch {
    /* 标记失败只影响幂等判断，不影响功能 */
  }
  void log("clipboard-patch：已接管 navigator.clipboard.writeText（execCommand → 原生 → 插件进程）");
  return { installed: true };
}

/** 还原原实现（onUnload 时调用）。 */
export function uninstallClipboardPatch(deps = {}) {
  const clipboard = deps.clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!clipboard || !patchedTargets.length) return false;
  for (const { target, descriptor } of patchedTargets) {
    try {
      if (descriptor) Object.defineProperty(target, "writeText", descriptor);
      else delete target.writeText;
    } catch {
      /* 还原失败忽略 */
    }
  }
  patchedTargets = [];
  try {
    delete clipboard[PATCH_FLAG];
  } catch {
    /* 忽略 */
  }
  return true;
}
