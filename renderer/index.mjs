/**
 * m_inline_show — renderer 入口。
 *
 * 宿主持有 `renderer.extension` 授权时，会在应用窗口里执行本模块，
 * 并把宿主 API 作为 `pi` 传进 onLoad。语言标签必须是 `<pluginId>:<lang>`，
 * 且 `<lang>` 只允许 [A-Za-z0-9_-]，所以这里直接用 pi.plugin.id 拼前缀。
 */
import { ChartBlock } from "./chart.mjs";
import { HtmlBlock } from "./html-block.mjs";
import { WidgetBlock } from "./widget-block.mjs";
import { hostLog, setHostApi } from "./host-bridge.mjs";
import { DISP_CSS } from "./styles.mjs";
import { installClipboardPatch, uninstallClipboardPatch } from "./clipboard-patch.mjs";

export function onLoad(pi) {
  // 宿主 API **不是全局变量**，而是这里的入参：先交给桥，后续 disp.copy / disp.log 才有通道。
  setHostApi(pi);
  pi.ui.injectStyle(DISP_CSS);

  const prefix = pi.plugin?.id ?? "local.m_inline_show";
  pi.slots.register({
    slot: "blockRenderer",
    language: `${prefix}:chart`,
    component: ChartBlock,
  });
  pi.slots.register({
    slot: "blockRenderer",
    language: `${prefix}:html`,
    component: HtmlBlock,
  });
  // widget：允许片段跑脚本的交互块（沙箱不给同源、CSP 禁网络），详见 widget-spec.mjs。
  pi.slots.register({
    slot: "blockRenderer",
    language: `${prefix}:widget`,
    component: WidgetBlock,
  });
  // 全局复制补丁：应用自带的复制按钮（消息复制 / 会话末尾复制）走的是被宿主拒绝的
  // navigator.clipboard.writeText，这里接管它，让那些按钮也走兜底链。
  const patch = installClipboardPatch();
  // 开机自证：证明渲染模块确实求值了、并且 pi.dispatch → plugin.call 这条链通。
  void hostLog(
    `renderer.onLoad（已注册 ${prefix}:chart / ${prefix}:html / ${prefix}:widget；复制补丁：${
      patch.installed ? "已安装" : `未安装（${patch.reason}）`
    }）`,
  );
  // 【临时·清完即删】清掉早期探针写进应用窗口 localStorage 的验证残留键。
  void (() => {
    try {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith("LAYOUTPROBE"));
      keys.forEach((key) => localStorage.removeItem(key));
      void hostLog(`renderer 清理验证残留：删除 ${keys.length} 个键`);
    } catch (error) {
      void hostLog(`renderer 清理验证残留失败：${String(error)}`);
    }
  })();
}

export function onUnload() {
  uninstallClipboardPatch();
  /* 注册返回的 disposer 由宿主在卸载时统一释放。 */
}
