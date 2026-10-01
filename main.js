/**
 * 插件进程侧（headless entry）。
 *
 * 渲染块里所有界面都在 renderer/；这一侧只负责两件事：
 * 1. 一条帮助命令，便于确认插件已加载；
 * 2. 渲染块请求的 `disp.copy` —— 走宿主进程的原生剪贴板
 *    （`pi.clipboard.writeText`，权限 clipboard.write）。
 *
 * 为什么要绕这一圈：应用窗口里的 `navigator.clipboard` 可能在权限/焦点限制下
 * 直接 reject（连宿主自己的复制按钮都会失败），而插件进程这条通道不经过它。
 */

const HELP = [
  "m_inline_show 已加载。三种围栏：",
  "```local.m_inline_show:chart   → JSON，type: line | bar | pie | spark（可悬停 / 缩放 / 导出）",
  "```local.m_inline_show:html    → HTML 片段（无脚本沙箱：脚本、外链都被阻止）",
  "```local.m_inline_show:widget  → 可跑内联脚本的交互片段（断网、读不到本页）",
].join("\n");

/** 单次复制的内容上限，避免把超大正文塞进 IPC。 */
const MAX_COPY_BYTES = 64 * 1024;

async function onLoad() {
  await pi.commands.register({
    id: "local.m_inline_show.help",
    title: "m_inline_show: 用法提示",
    keywords: ["chart", "html", "display", "图表", "围栏"],
    run: async () => {
      await pi.ui.showToast(HELP);
    },
  });

  // 开机自证：证明插件进程 + setSettings 落盘这条链路是通的（不依赖渲染侧）。
  try {
    const current = (await pi.plugin.getSettings()) ?? {};
    const previous = typeof current.diag === "string" ? current.diag : "";
    const line = `${new Date().toISOString()} plugin.onLoad（插件进程已加载）`;
    await pi.plugin.setSettings({ diag: [line, previous].filter(Boolean).join("\n").slice(0, 8000) });
  } catch {
    /* 落盘失败也不影响插件功能，交给排查 */
  }
}

async function onUnload() {
  await pi.commands.unregister("local.m_inline_show.help");
}

async function onRendererCall(method, args) {
  switch (method) {
    case "disp.copy": {
      const text = typeof args?.text === "string" ? args.text : "";
      if (!text) throw Object.assign(new Error("没有可复制的内容"), { code: "DISP_EMPTY" });
      const bytes = Buffer.byteLength(text, "utf8");
      if (bytes > MAX_COPY_BYTES) {
        throw Object.assign(new Error(`内容过大（${bytes} 字节 > ${MAX_COPY_BYTES}）`), { code: "DISP_TOO_LARGE" });
      }
      await pi.clipboard.writeText(text);
      return { ok: true, bytes };
    }
    // 诊断日志：写进插件自己的 settings（宿主落盘到 plugins/data/<id>/settings.json），
    // 这样排查时不需要用户手抄状态行。
    case "disp.log": {
      const text = typeof args?.text === "string" ? args.text.slice(0, 2000) : "";
      if (!text) throw Object.assign(new Error("空日志"), { code: "DISP_EMPTY_LOG" });
      const current = (await pi.plugin.getSettings()) ?? {};
      const previous = typeof current.diag === "string" ? current.diag : "";
      const line = `${new Date().toISOString()} ${text}`;
      const next = [line, previous]
        .filter(Boolean)
        .join("\n")
        .split("\n")
        .slice(0, 80)
        .join("\n");
      await pi.plugin.setSettings({ diag: next });
      return { ok: true, lines: next.split("\n").length };
    }
    default:
      throw Object.assign(new Error(`未知方法：${method}`), { code: "DISP_UNKNOWN_METHOD" });
  }
}

module.exports = { onLoad, onUnload, onRendererCall };
