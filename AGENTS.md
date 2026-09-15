# AGENTS.md

## 项目概览

三火工作台 —— 零依赖的原生 HTML/CSS/JS **PWA 单页应用**，面向个人商单管理。免登录、无后端、无构建步骤，数据全部存 localStorage，离线可用。界面文案与注释均为简体中文，所有文件必须保持 UTF-8 编码。

## 开发与运行

没有构建、打包、lint、测试工具链（无 `package.json`、无 `node_modules`）。改完文件刷新浏览器即可。

```bash
# 本地预览（README 约定）
python -m http.server 8080
# 或任意静态服务器 / 直接用 IDE 的静态预览
```

- Service Worker 只在 `http`/`https` 下注册（见 [app.js](app.js) 末尾），`file://` 打开时 PWA 缓存与安装功能不生效，调试 SW 需用静态服务器。
- 手工回归路径：新增商单 → 三页「完成」流转状态 → 我的页编辑/删除/排序/状态筛选 → 年份月份筛选 → 金额脱敏眼睛 → 灵感页分类筛选 + 复制提示词 → 离线（DevTools Offline）后刷新仍可打开。

## 架构

四个文件构成应用，无框架、无模块化、无依赖：

| 文件 | 职责 |
| --- | --- |
| [index.html](index.html) | 全部静态结构：7 个视图 `<section class="view" id="view-NAME">`、导航、三个弹窗（新增/详情/确认） |
| [app.js](app.js) | 单个 IIFE 包裹的全部逻辑：数据层、渲染、事件、滑删、PWA 注册 |
| [style.css](style.css) | 设计 token（`:root` CSS 变量）+ 各视图样式，按视图顺序分节 |
| [sw.js](sw.js) | 预缓存核心资源，网络优先 + 离线回退 |

### 数据层

- localStorage 单一 key：`sanhuo-workbench-v3`，结构 `{ orders: [...] }`。
- 订单字段：`id`、`createdAt`、`name`、`date`（`datetime-local` 字符串）、`fee`、`deposit`、`requirements`、`status`。
- 状态机为唯一真源：`STATUS_LIST = ['todo','pending','collect','done']`，`NEXT_STATUS = {todo:'pending', pending:'collect', collect:'done'}`，展示文案/样式集中在 `STATUS_META`。新增或重命名状态必须同步这三处 + [index.html](index.html) 中的 `sp-item` 与 `mine-status-select` 选项 + `views` 之外的导航按钮。
- 向后兼容由 `normReqs()` 承担（旧版 `requirements` 是字符串数组，现为 `{text, done}` 对象数组）。**改动存储结构时必须继续兼容旧数据**；直接改 key 会静默丢弃用户已有数据。

### 修图灵感页（静态，不走数据层）

「灵感」页与商单功能完全解耦：提示词是 [app.js](app.js) 里的硬编码常量 `PROMPT_TEMPLATES` + `TEMPLATE_CATEGORIES`，分类筛选状态 `templateFilter` 只存在于内存，**不写入 localStorage**，刷新即回到「全部」。

- 新增一条提示词需要在三处对齐：`PROMPT_TEMPLATES` 增加 `{ category, title, tag, cover, prompt }`（`category` 必须是 `TEMPLATE_CATEGORIES` 中已有的 id）；`cover` 是新造的封面样式名时，还要在 [style.css](style.css) 的 `:root` 补 `--template-cover-*` / `--template-subject-*` token 并写 `.<cover>` 与 `.<cover> .cover-subject{::before}` 规则（封面是纯 CSS 拼贴，无图片资源）。
- 列表用 `data-template-cat` / `data-template-act="copy"` + `data-template-index` 委托分发；复制走 `copyTemplatePrompt()`，`navigator.clipboard` 不可用（非 HTTPS、非 secure context）时自动降级 `execCommand`，失败提示「长按复制」。
- `#template-filters` / `#template-list` 的事件绑在初始化时一次性完成，渲染函数 `renderTemplateView()` 只重写 `innerHTML`，不要在其中重复绑定监听。

### 渲染与事件约定

- 渲染全部是「拼字符串 → `innerHTML`」，无虚拟 DOM、无增量更新。任何数据变更后调用 `saveData()` + `refreshAll()`；`refreshAll()` 重渲染所有视图与徽标、提醒条，是唯一的同步出口。
- 所有写入 DOM 的用户文本必须过 `esc()`（HTML 转义）。
- 列表交互统一用**事件委托**，通过 `data-*` 约定分发：`data-act`（flow-done / del-order）、`data-req-act`（edit/save/cancel/del）、`data-mf-act`（prev/next/all）、`data-sort`、`data-status`、`data-view`、`data-goto`。新增交互按钮请沿用这套属性，不要在生成 HTML 时逐节点绑定监听。
- 卡片有两种渲染模式（`renderOrderCard(o, mode)`）：`flow` 用于待办/发布/结余/完成四页（只有「完成」按钮，推进状态）；`full` 用于我的页（删除按钮 + 点击进详情）。
- 两个表单弹窗共用同一套子需求编辑器状态 `reqEditorState` 和状态选择器辅助函数，并用同一个 `editingOrderId` 指针指向当前编辑对象；改动这两个共享状态时同时检查 `#order-modal`(`#f-*`) 与 `#detail-modal`(`#e-*`) 两套 DOM。
- 子需求编辑器有「幽灵点击」防护（`reqGhostGuard`，重绘后 200ms 内忽略合成点击）+ 250ms 连点去抖，这是修 `数据重绘误触` bug 的关键，不要移除。

### 新增一个视图的完整清单

`index.html` 加 `<section class="view" id="view-X">` → app.js 的 `views` 数组加 `'X'`（当前顺序：`home, mine, templates, todo, publish, balance, done`，该数组决定视图显示顺序） → 导航加 `.nav-item[data-view="X"]` → 写 `renderXView()` → 在 `switchView()` 与 `refreshAll()` 中调用 → 若涉及静态资源请检查 [sw.js](sw.js) 的 `CORE_ASSETS`。

### 样式约定

- 颜色、圆角、阴影、布局尺寸全部走 `:root` 的 CSS 变量（`--green-main`、`--radius-card`、`--shadow-card`、`--app-w` 等），不要硬编码色值。
- 应用以 `390x844` 手机画布为基准（`--app-w/--app-h`），桌面端居中显示，`max-width:480px` 或 `max-height:900px` 时转为全屏铺满。布局改动需同时验证手机全屏与桌面画布两种形态。

## PWA 缓存（最容易踩的坑）

[sw.js](sw.js) 用 `CACHE_NAME`（当前 `sanhuo-workbench-v10`）区分缓存版本，`activate` 时删除所有旧缓存。

- **改动 `index.html` / `style.css` / `app.js` 或任何 `CORE_ASSETS` 中的资源后，必须同步上调 `CACHE_NAME` 的版本号**，否则已安装的 PWA 会长时间命中旧缓存。
- 新增需要离线可用的图片/资源，除放入 `assets/images/` 外，还要登记进 `CORE_ASSETS`。
- 抓取策略是 Network First：在线时总是取最新并回写缓存，离线时回退缓存。这是为了让「云端更新后已安装 PWA 下次打开即同步」，不要改回 Cache First。

## Git 约定

- 远端：`https://github.com/yahoolcj/sanhuo-desktop`，默认分支 `main`；尚未验收的改动走 `main-2` 等并行分支，不要直接推到 `main`。项目名历史遗留（README 中写作 `sanhuo-workbench`），仓库与目录名以 `sanhuo-desktop` 为准。
- 提交信息为中文 Conventional Commits，一次提交只做一件事（`feat: 我的页添加按钮固定右下角 + 排序模式切换`、`fix: 列表按添加时间倒序 + 完成菜单隐藏徽标 + 日期差一天修复`）。
