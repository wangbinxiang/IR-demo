# IR-demo

Claude Design + Figma 思路的原型：用 **Design IR** 作为事实来源，AI 生成 / 画布编辑 / 代码生成共用同一份 IR。

当前进度：**垂直切片已跑通**（验证最高风险的架构核心）。

## 这个切片验证了什么

最高风险点 ——「每个 IR 元素 = 原生 tldraw 形状」与「auto-layout 是事实来源」这层同步 —— 已端到端打通：

```
写死 IR (扁平+稳定ID)  ──▶  yoga 布局引擎  ──▶  绝对几何坐标
       ▲                                              │
       │ moveNode (统一 op)                            ▼
   拖拽落点 ──解释成──▶ 重排序             tldraw 原生形状 (HTMLContainer 渲染真 DOM)
```

- yoga-layout(wasm) 在浏览器把 auto-layout 树算成几何坐标
- 每个节点渲染为 tldraw 原生形状（可选中/拖拽/缩放），内部用真实 DOM 渲染
- 拖动元素 → `onTranslateEnd` 把自由 x/y 翻译成「插入哪个容器的第几槽位」→ 改 IR → 重新布局 → 形状吸附到新槽位（Figma auto-layout 手感）
- 缩放手柄 → 把尺寸固定为像素值（Hug/Fill → Fixed）

## 运行

```bash
pnpm install
pnpm dev           # dev server，端口随占用浮动（默认 5173）
```

## 验证

```bash
pnpm dev               # 另开终端先起服务
node scripts/e2e.mjs   # Playwright 驱动真实拖拽，断言 IR 顺序改变
```

> 交接 / 移植本系统：先读根 [`CLAUDE.md`](CLAUDE.md)（常驻导航 + 雷区清单），深度文档见 [`docs/DESIGN-IR.md`](docs/DESIGN-IR.md)。

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/ir/types.ts` | Design IR 类型（扁平规范表 + 稳定 ID + 三态尺寸 + 混合词汇） |
| `src/ir/store.ts` | 统一 mutation 层（画布与未来 AI 共用的 op） |
| `src/layout/yoga.ts` | IR → yoga → 绝对几何 |
| `src/canvas/IrNodeShape.tsx` | tldraw 自定义形状 + 拖拽/缩放语义 |
| `src/canvas/reorder.ts` | 落点 → 目标容器+下标 |
| `src/canvas/sync.ts` | IR+布局 → 协调 tldraw 形状 |

## AI 生成（已实现）

顶部提示词栏选择 AI 源（`Claude Code` / `Codex App`）与模型 → `/api/generate`（Vite 中间件）→ provider 分发层 → 产出紧凑 DSL → `compileDSL` 确定性展开为 IR（系统分配稳定 ID）→ 载入画布。

- `server/ai.mjs`：AI 源分发；前端选哪个源，后端只调用哪个源，不做隐式 fallback
- `server/claude.mjs`：Claude Code provider（禁用工具、`settingSources:[]`、带一次重试）
- `server/codex.mjs`：Codex App provider（`@openai/codex-sdk`、只读 sandbox、临时空目录、JSON 解析重试）
- `server/generate.mjs`：prompt → DSL
- `src/compiler/dsl.ts`：DSL → 扁平 IR
- `src/ui/PromptBar.tsx`：提示词栏 + AI 源/模型选择器（按源写入 localStorage，支持自定义模型 ID）
- 验证：`node scripts/e2e-ai.mjs`（输入 prompt→点生成→断言画布换成新 IR）
- 前端选具体模型时会随请求覆盖环境默认；未选择时 Claude 走 `IR_MODEL` / `claude-sonnet-4-6`，Codex 走 `IR_CODEX_MODEL` / 本地 Codex 默认配置

## 代码生成（已实现：HTML/CSS）

确定性 emitter：IR → 完整 HTML 文档，CSS 用 flexbox 镜像 yoga 的 auto-layout 语义。
左下角「</> 代码」打开面板：**预览**（iframe 真实浏览器渲染生成的代码）+ **HTML 源码**（可复制）。

- `src/codegen/html.ts`：`emitHTML(ir)` —— 纯函数，IR 变即重算
- `src/ui/CodePanel.tsx`：预览/源码面板
- 验证：`node scripts/e2e-codegen.mjs`（断言生成代码在真实浏览器渲染一致）
- 已证明：同一份 IR，画布(tldraw) 与生成代码的浏览器渲染**像素级一致** → IR 够格当事实来源

### React Native 目标（已实现）

同一份 IR，换 emitter 即出移动端代码（RN 原生用 yoga，与 HTML emitter 同构、近乎 1:1）。

- `src/codegen/reactNative.ts`：`emitReactNative(ir)` → 合法 `.tsx`（View/Text/TextInput/TouchableOpacity/Image + StyleSheet）
- 代码面板顶部切「HTML / CSS」「React Native」两个目标
- 验证：`node scripts/e2e-rn.mjs`（esbuild 校验是合法 TSX + 结构断言）
- 已证明：**一份 IR → web 与移动端两套不同平台代码** → IR 与平台无关

## AI 改图（已实现：op-patch）

当前 IR 概览（带 ID）+ 修改指令 → AI 返回一组编辑操作 op → 套用，**保留未改动节点的 ID**（手动调整不丢）。

- `src/ir/ops.ts`：op 词汇（setStyle/setProps/setLayout/setSizing/insert/remove/move）、`outlineIR`（喂 AI 的带 ID 概览）、`applyOps`（reducer）
- op 与画布交互共用同一 mutation 层；insert 子树由编译器分配不冲突的新 ID
- `server/edit.mjs` + `/api/edit` 中间件；`server/ai.mjs` 为生成/改图共享 provider 分发层
- 顶部「🪄 改图」按钮；验证：`node scripts/e2e-edit.mjs`（断言原 ID 全保留 + 指令生效 + 画布同步）

## 右侧样式面板（已实现）

选中画布元素 → 右侧 inspector 编辑尺寸/布局/样式/内容；改动全走与 AI 改图共用的 op。

- `src/ui/StylePanel.tsx`：类型感知控件（尺寸三态、容器布局、外观、文本/占位符）
- `src/ui/selection.ts` + App 监听 tldraw 选中 → 映射回 nodeId
- 控件分别派发 `setSizing/setLayout/setStyle/setProps`
- 验证：`node scripts/e2e-style.mjs`（点选叶子改文案回写 IR + 容器布局控件出现）

## 持久化（已实现）

项目存为后端本地 JSON 文件（`projects/<id>.json`，结构 `{id,name,updatedAt,ir}`）；localStorage 记住当前项目，刷新自动恢复。

- `server/projects.mjs` + `/api/projects`（列表/读/写/删）
- `src/ui/ProjectBar.tsx`（保存/打开/新建）+ `src/ui/project.ts`（当前项目 store）
- 验证：`node scripts/e2e-persist.mjs`（改 IR→保存→刷新→恢复改动+项目名+id）

## 拖拽插入指示线（已实现）

拖动元素时实时显示插入指示线（列容器横线 / 行容器竖线），预示松手落点（Figma 手感）。

- `src/canvas/indicator.ts`：指示线 store + 几何计算
- `src/canvas/DragIndicator.tsx`：作为 tldraw `InFrontOfTheCanvas` 覆盖层渲染（页面坐标系，跟随相机）
- 形状 `onTranslate` 实时算落点更新指示线，`onTranslateEnd` 收起
- 验证：`node scripts/e2e-indicator.mjs`

## AI 改图会话保温（已实现）

每个项目、每个 AI 源分别维持一个温会话（Claude `resume` / Codex thread），实现**对话式连续编辑**：后续指令能理解「再大一点」「把它也改成那个色」等对前文的指代。

- `server/claude.mjs` / `server/codex.mjs`：provider 调用器支持会话恢复、回传 `sessionId`
- `server/edit.mjs`：按 provider + sessionKey(项目 id) 维持会话 Map，resume 失败自动回退完整上下文
- 正确性：每轮仍发当前 outline（用户在画布/面板的 out-of-band 修改也被看见）
- 验证：`node scripts/e2e-resume.mjs`（第二次改图 resumed:true + 指代消解命中）

## 导出代码到磁盘（已实现）

代码面板「💾 导出到磁盘」：一份 IR → web + RN 代码 + IR JSON，写入后端 `exports/<项目名>/`。

- `server/export.mjs` + `/api/export`（前端生成的文件写盘，文件名清洗防穿越）
- 导出 `index.html`、`GeneratedScreen.tsx`、`design.ir.json`（IR 作为单一来源一并落盘）
- 验证：`node scripts/e2e-export.mjs`（UI 点导出 → 校验磁盘文件内容）

## 左侧图层树（已实现）

类 Figma 的图层结构面板：反映 IR 层级，缩进 + 折叠 + 类型图标；**与画布/样式面板三栏双向联动**（点图层选画布、选画布高亮图层）。

- `src/ui/LayersPanel.tsx`：递归渲染 `useIRStore` 的树，复用 `useSelection` 联动
- 点击行 → `editor.select(shapeIdFor(id))` → 选中监听回写 useSelection
- 验证：`node scripts/e2e-layers.mjs`（行数=节点数 + 双向选中 + 折叠）

## 路线图

核心 + 打磨全部完成。后续可继续的方向：组件实例/变体、响应式断点、多画板、协作。
