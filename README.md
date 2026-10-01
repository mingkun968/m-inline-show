# m_inline_show (`local.m_inline_show`)

PI-Desktop 内联显示插件：在**回复正文里**直接渲染小图表、结构化片段与可交互小工具，不弹窗口。

- `local.m_inline_show:chart` — 折线 / 柱状 / 饼图 / sparkline，手写 SVG；自带悬停提示、图例联动、缩放与 SVG/PNG 导出
- `local.m_inline_show:html` — 小段 HTML，跑在**无脚本**沙箱 iframe 里（脚本、外链、表单都被阻止），尺寸贴内容
- `local.m_inline_show:widget` — 能跑内联脚本的交互片段（沙箱不给同源、CSP 断网），适合要点击 / 联动的自绘图形

零第三方依赖、无构建步骤、不改 PI-Desktop 源码 → 升级 app 时只需重新加载插件目录。

## 目录结构

```
m_inline_show/
├── manifest.json          # 身份 / 入口 / 权限 / 技能声明
├── main.js                # 插件进程：一条帮助命令（可省）
├── README.md
├── selftest.mjs           # 纯逻辑离线自测（node selftest.mjs）
├── renderer/
│   ├── tokens.mjs         # 设计 token：Radix Colors 色阶 → 语义别名（明暗两套）
│   ├── chrome.mjs         # 三种块共用的外壳：header/body/foot、主题探测、SVG/PNG 导出
│   ├── styles.mjs         # 样式表（token 化 + 骨架 + 动效 + 交互态）
│   ├── index.mjs          # onLoad(pi)：注入样式 + 注册三个 blockRenderer
│   ├── chart-spec.mjs     # 图表纯逻辑（解析 + SVG 几何 + 缩放/悬停，可用 node 自测）
│   ├── chart.mjs          # ChartBlock：悬停提示 / 十字准线 / 图例联动 / 缩放 / 导出
│   ├── html-spec.mjs      # HTML 块纯逻辑（srcdoc / 尺寸钳制 / 调色板）
│   ├── html-block.mjs     # HtmlBlock：沙箱预览 + 内容自适应尺寸
│   ├── widget-spec.mjs    # widget 纯逻辑（srcdoc / CSP / postMessage 协议）
│   ├── widget-block.mjs   # WidgetBlock：允许片段跑脚本的交互块（断网沙箱）
│   ├── copy-text.mjs      # 复制链：插件进程 → navigator.clipboard → execCommand
│   ├── clipboard-patch.mjs # 全局复制补丁：接管 navigator.clipboard.writeText
│   ├── copy-hook.mjs      # 复制按钮状态机 + 源码选取兜底
│   ├── host-bridge.mjs    # 渲染块 → 插件进程的 disp.copy 调用
│   └── probe.mjs          # 点击探针：原生事件计数写进状态行
└── skills/
    └── m_inline_show.md  # 教 agent 何时输出这三种围栏
```

## 在 PI-Desktop 里加载

1. 打开 **插件 / Plugins** 页
2. 点 **加载开发插件（可选）**（英文界面为 *Load a development plugin*）
3. 选择目录 `~/pi_desk_plugin/m_inline_show`
4. 审阅它申请的权限 → **加载插件**
   - `renderer.extension`：把渲染模块加载进应用窗口，在聊天插槽里画界面
   - `agent.prompt.inject`：注册上面那个技能文档
5. 加载后：目录被记进 `~/.pi-desktop/plugins/registry.json`（`source: "dev"`）

改完代码后在插件页**重新加载**该插件即可生效（renderer 模块是重新求值的）。

不加载插件时，这三种围栏只会显示成普通代码块 —— 无副作用。

## 自测消息（可直接粘贴给 agent 或自己发）

````
演示两种内联块：

```local.m_inline_show:chart
{"type":"line","title":"p50 延迟","unit":"ms","x":["10:00","10:05","10:10","10:15","10:20"],"series":[{"name":"p50","values":[128,143,131,155,149]},{"name":"p95","values":[310,352,336,401,388]}]}
```

```local.m_inline_show:chart
{"type":"bar","title":"各模块用例数","x":["parser","renderer","ipc","cli"],"values":[128,64,41,18]}
```

```local.m_inline_show:chart
{"type":"pie","title":"请求来源","x":["桌面","CLI","移动"],"values":[520,310,170]}
```

```local.m_inline_show:chart
{"type":"spark","values":[3,5,4,8,7,11,9,14]}
```

```local.m_inline_show:html
<table><tr><th>项</th><th>值</th></tr><tr><td>版本</td><td>0.15.10</td></tr><tr><td>槽位</td><td>blockRenderer</td></tr></table>
```

坏输入也要能兜住：

```local.m_inline_show:chart
{"type":"line","values":[1,2,
```
````

## 离线自测（不需要 app）

纯逻辑层不 import react，可以直接用 node 跑全部回归检查：

```bash
cd ~/pi_desk_plugin/m_inline_show
node selftest.mjs
```

覆盖：规格解析（合法/非法 JSON、缺字段、空数据、单点、断线、字符串数字、系列与点数上限）、
刻度算法、折线/柱状/饼图几何、标签抽样、颜色与调色板注入防护、srcdoc 的 CSP、
块宽度估算（自适应方向与上下限、`width` 字段解析、HTML 宽度钳制）。

## 边界与已知限制

| 项 | 行为 |
| --- | --- |
| 块高度 | 图表固定高度（240/220/64px）；HTML 片段自适应但钳制在 3600px 以内（宿主在 4000px 处兜底回退） |
| 块宽度 | **按内容自适应**：先按「把字都显示完整」估算（x 轴标签、标题头部、多系列图例里最长的系列名都算进去），再封顶 **720px**；撞到上限就是「字特别多」，多出来的靠**横向滚动条**看 —— 图例一行排、每项按字数占位，不截断也不压缩。HTML 片段量一次内容的 `max-content` 宽度（钳在 220–680px）；块整体在聊天栏里居中，窄窗口下自然退化为满宽。围栏里可用 `"width":"auto"\|"full"\|"sm"\|"md"\|"lg"\|<像素>` 覆盖（仅 chart） |
| 坏 JSON / 空数据 | 块内显示错误 + 保留原文；不会回退成代码块，也不会崩会话 |
| 组件抛错 | 宿主会自动回退为普通代码块（源码仍可见） |
| HTML 片段 | 沙箱**无脚本**（`allow-same-origin`）；CSP 禁外链、禁表单；仅内联样式、data:/blob: 图片与 `--series-1…8` |
| widget 片段 | 沙箱**允许脚本**（`allow-scripts`，不给 same-origin）＋ CSP `connect-src 'none'`：能交互，但读不到本页、也发不出去；高度由片段 postMessage 上报 |
| 图表交互 | tooltip、十字准线、点高亮、图例联动；点数 ≥9 时支持滚轮缩放 / 拖动平移 / 双击复位（纯 SVG，不需要 iframe 脚本） |
| 导出 | 下载 SVG / PNG（导出时把 token 解析成具体色值，脱离宿主 CSS 也好看） |
| 主题 | 色值来自 `tokens.mjs`（Radix 色阶 → 语义别名）；组件把探测到的主题写成 `data-ldp-theme`，明暗各一套，不猜宿主的类名 |
| 复制按钮 | 三层兜底：**插件进程原生剪贴板**（`pi.dispatch` → `plugin.call` → `pi.clipboard.writeText`，需要 `clipboard.write` 权限）→ `navigator.clipboard` → `execCommand("copy")`。触发挂在 `mouseup`（宿主认的可信手势列表里没有 `click`）。失败时按钮显示「复制失败」、状态行与悬浮提示给出三层各自的原因 |
| 全局复制补丁 | 把应用界面的 `navigator.clipboard.writeText` 包一层（`execCommand` → 原 API → 插件进程原生剪贴板），**应用自带的复制按钮**（消息复制 / 表格复制 / 末尾复制）在权限被拒的环境里也能用。幂等安装，`onUnload` 逐项还原 |
| 状态行 | 块底部一行小字，显示原生点击事件计数与最近一次复制结果 —— 用于区分「事件没到」和「复制被拒」 |
| 选取按钮 | 展开源码并选中它，完全不依赖剪贴板 API；剪贴板被环境禁用时的保底手段 |
| 语言标签 | 必须 `<pluginId>:<lang>`，`<lang>` 仅 `[A-Za-z0-9_-]`；不能占用 `json`/`ts`/`mermaid`/宿主高亮语言 |

## 扩展方式

- 新图表类型：在 `chart-spec.mjs` 加几何函数 + `CHART_TYPES` 一行，再在 `chart.mjs` 加一个 `XxxPlot` 分支（`BLOCK_HEIGHT` 里补默认高度）。
- 调色板 / 圆角 / 间距：改 `tokens.mjs` 的语义映射与 `styles.mjs` 即可，组件只管结构。色值取自 Radix Colors v3.0.0（MIT），生成方式见 `tokens.mjs` 顶部注释。
- 换重库（ECharts 等）：需要自己 bundling（宿主不会替你装依赖）；不过手写 SVG + 交互层 + widget 沙箱已经能覆盖多数需求。
- 想加「点按钮把结果回传模型」：本槽位做不到，需要改用面板（`ui.panel`）＋ agent tool ＋ 动作回路。

## 许可

本插件以 **MIT** 协议开源，见 [`LICENSE`](LICENSE)。

运行时零第三方依赖。唯一的外来资产是 `renderer/tokens.mjs` 里的**色阶数值**，取自
[Radix Colors](https://github.com/radix-ui/colors) v3.0.0（MIT，© 2021-2022 Modulz / 2022-Present WorkOS）；
版权声明保留在该文件头部。
