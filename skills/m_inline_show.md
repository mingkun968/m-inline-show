---
name: m_inline_show 内联块
description: 用 local.m_inline_show:chart 围栏内联画小图表（折线/柱状/饼图/sparkline），用 local.m_inline_show:html 围栏内联显示小段 HTML，用 local.m_inline_show:widget 围栏跑一小段可交互的 HTML+JS（断网沙箱）。用户要看趋势/占比、要一小块结构化排版、或要个能点的小控件时使用。
---

# m_inline_show 内联块

插件 `local.m_inline_show` 在 PI-Desktop 的回复正文里注册了**三个**代码块渲染器。**只有带这个前缀的围栏会被渲染**，普通 ```json / ```html / ```mermaid 不受影响。

## 何时用

- 用户想直观看**趋势 / 对比 / 占比**，且数据点不多（≤ 8 条系列、每系列几十点以内）→ `local.m_inline_show:chart`
- 需要一小块**结构化排版**（小表格、说明卡、键值列表、带样式的摘要）→ `local.m_inline_show:html`
- 需要**可交互**的一小块（点击切换、可排序、带联动）→ `local.m_inline_show:widget`（片段可跑内联脚本，但断网、读不到页面）
- 只要一两句话能说清、或需要可复制原文时，**不要**用这三种块，直接写 Markdown

## 图表：`local.m_inline_show:chart`

围栏正文是一段 JSON：

````
```local.m_inline_show:chart
{"type":"line","title":"p50 延迟","unit":"ms","x":["10:00","10:05","10:10"],"series":[{"name":"p50","values":[128,143,131]},{"name":"p95","values":[310,352,336]}]}
```
````

字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `type` | 否 | `line`（默认）/ `bar` / `pie` / `spark` |
| `title` | 否 | 块标题 |
| `unit` | 否 | 单位，显示在标题旁 |
| `x` | 否 | x 轴标签数组（饼图里是切片名） |
| `series` | 是* | `[{name, values:[数字…]}]`，最多 8 条 |
| `values` | 是* | 单系列简写，等价于一条 `series` |
| `data` | 是* | `[{label, value}]` 简写；`label` 会自动当成 `x` |
| `width` | 否 | `auto`（默认，按内容自适应）/ `full`（占满聊天栏）/ `sm` `md` `lg` / 像素数（260–720） |

\* 四种数据写法任选其一即可。

约定：

- `line` 适合时间序列；`bar` 适合分类对比；`pie` 只看第一条系列，非正数会被跳过；`spark` 是窄条趋势线（不带坐标轴）。
- 折线里某个值是 `null` 或非数字 → 该处**断线**并在块底部提示忽略了几个点。
- 数字可以写成字符串（`"1,234"`、`"45%"` 会被解析）。
- 数据点尽量精简：文字说明留在正文里，图表只放需要看趋势的那几条。
- **宽度默认按内容自适应**：先按「把字都显示完整」算（x 轴标签、标题、最长的系列名都算进去），再封顶 720px；撞到上限才出横向滚动条。系列名长一点块就自己变宽；要刻意占满（比如宽时间轴）就写 `"width":"full"`。

## HTML：`local.m_inline_show:html`

围栏正文是 HTML 片段：

````
```local.m_inline_show:html
<table><tr><th>项</th><th>值</th></tr><tr><td>版本</td><td>0.15.10</td></tr></table>
```
````

限制（沙箱内执行，硬约束）：

- **脚本、外链、表单提交会被阻止**：不要放 `<script>`、事件属性（`onclick` 等）、`<link>`、远程图片或字体。
- 只有**内联样式**与 `data:`/`blob:` 图片可用；宿主还注入了 `--fg` / `--muted` / `--faint` / `--line` / `--surface` / `--accent` / `--code` 与 `--series-1…8`（跟随块的明暗主题），优先用它们而不是写死颜色。
- 内容高度上限 3600px，超过会被截断视为失败；片段尽量控制在 20 行以内。
- **宽度会贴合内容**（量一次内容的 max-content 宽度，钳在 220–680px）：简单表格/卡片不会被拉长。想让片段占满一行，就写一段天然的宽内容（比如多列表格），而不是靠撑宽度。
- 复杂交互（点击后把结果回传模型）**做不到** —— 本槽位是「一次性渲染、无数据流」，那种需求要用面板类插件。只要**本地**交互（点了切图、悬停联动）就用下面的 `local.m_inline_show:widget`。

## 交互（图表自带，不用声明）

图表块自己就带：悬停数值提示 + 十字准线、图例 hover 联动高亮、点数 ≥9 时**滚轮缩放 / 拖动平移 / 双击复位**，以及**下载 SVG / PNG**。围栏里不需要做任何额外声明。

## 交互片段：`local.m_inline_show:widget`

围栏正文是一段 HTML（**可含内联 `<script>`**），跑在 `sandbox="allow-scripts"` 的 iframe 里。这是唯一能跑脚本的块，适合：可点切换的图表、可排序表格、带 hover 联动的自绘图形、纯前端小工具。

硬约束（比 html 块多一条「断网」）：

- **不能联网**：CSP 是 `default-src 'none'` + `connect-src 'none'`，`fetch` / XHR / 外链脚本一律失败；要用图表库得自己内联进来。
- **读不到页面**：沙箱不给 `allow-same-origin`，拿不到宿主 DOM / localStorage / cookie；对外只能靠 `parent.postMessage`。
- **高度不用你管**：宿主按片段内容自动调（内容变化也会跟着重算）。
- 片段脚本报错会显示在块里（`window.onerror` 回传宿主），便于自查。

优先级：能用 `chart` / `html` 说清的就别用 widget —— 脚本越少越稳。

## 失败时

JSON 写错、数据为空、片段为空 → 块里会显示友好错误并保留原文，不会崩掉会话；所以可以放心尝试。写完后不要再用同样的内容重复一个普通代码块。
