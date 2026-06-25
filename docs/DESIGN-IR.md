# DESIGN-IR.md —— 交接与移植深度文档

> 读者：**接手 / 移植本系统的 Claude Code（或工程师）**。
> 配套：仓库根 `CLAUDE.md` 是常驻精简层（导航 + 雷区一句话清单）；本文件是按需深度层。
> 基准：以**当前工作区真实状态**为准（commit `b2b1695` 之后），不是更早的 git 历史，也不是作者私有 memory。

本文档两个使命：
1. **A·概念移植**——让你把「Design IR 作单一事实来源」这套思想搬进**另一个系统**时，分得清**什么能照搬、什么必须重写**。
2. **B·代码接手**——让你在**本仓库**里继续开发时，知道**红线在哪、改一处要同步哪几处**，不重复踩已记录的坑。

---

## 0. 一句话定位

IR-demo 是验证 **Design IR**（设计中间表示）概念的原型：**AI 生成 / 画布编辑 / 代码生成三条链路共用同一份 IR 作为唯一事实来源**。不是产品，是为了证明「一份结构化 IR 能同时驱动可视化编辑和确定性代码生成」。

```
                    ┌─────────── Design IR（唯一事实来源）───────────┐
                    │  扁平规范表 nodes:{id→node} + rootId，只存结构+意图   │
                    └───────────────────────────────────────────────┘
                       ▲                  ▲                    │
        AI 生成 DSL→编译  │      画布拖拽/样式面板→op │   yoga 布局派生几何 │ emitter
                       │                  │                    ▼
                  紧凑 DSL          统一 op mutation 层     tldraw 形状 / HTML / RN
```

几何坐标**从不进 IR**——由布局引擎（yoga）从 IR 派生。IR 只描述「结构 + 意图」。

---

## 1. 移植分界线：可移植内核 vs web 专属绑定

这是 A·概念移植的脊柱。换平台时，**内核照搬思想，绑定必须重写**。别把 tldraw/yoga 的坑当成 IR 的本质，也别把 IR 的不变量当成可随意改的实现细节。

### 1.1 可移植内核（Design IR 的本质，换平台照搬思想）

| 内核 | 为什么它是本质 | 代码锚点 |
|---|---|---|
| **IR 作单一事实来源** + 扁平规范表 + 稳定 ID | 三条链路不各存一份状态、不互相转换，消除「画布和代码不一致」这类根本问题。`IR = { rootId, nodes: Record<id, node> }`，几何不入 IR。 | `src/ir/types.ts` |
| **统一 mutation 层（op 词汇）** | **整个架构的承重墙**：画布交互、AI 改图、样式面板**全部**翻译成同一套 op（`setStyle/setProps/setLayout/setSizing/insert/remove/move`）。只有一个改 IR 的入口 → 行为可预测、可测试、AI 与人共用。 | `src/ir/ops.ts`（op 词汇 + `outlineIR` + `applyOps` reducer）、`src/ir/store.ts` |
| **三态尺寸 Hug/Fill/Fixed** + auto-layout 优先、绝对定位逃生门 | 干净映射到任意 flex 系统（CSS flex / yoga / RN）；逃生门避免「纯 auto-layout 表达不了」时卡死。 | `Sizing` in `types.ts`（`fill` 带可选 `max`） |
| **确定性编译器**：DSL→IR、IR→代码（emitter 可插拔） | **可靠性来源**：AI 只产出紧凑 DSL / op-patch，**ID 分配与结构展开由确定性代码负责**，不让模型直接吐最终结构。换输出平台 = 换 emitter，IR 不动。 | `src/compiler/dsl.ts`（DSL→IR）、`src/codegen/html.ts`、`src/codegen/reactNative.ts` |
| **responsive 作纯函数** `transform(ir, viewportWidth) → IR'` | 画布预览与导出代码**共用同一个变换** → 「预览即所得」。纯函数、只读、desktop 恒等。 | `src/layout/responsive.ts`、`src/layout/responsiveCorrect.ts` |
| **响应式规则 R1/R1b/R2/R3 + 布局后溢出纠正的语义** | 规则**语义**可移植（见 §3.3），哪怕换布局引擎也成立。⚠️**但当前导出实现绑死 CSS `@media`**：规则结果通过 `@media(max-width)` 的 cssDiff 表达；换平台（如 RN）要用别的机制（如 `Dimensions`/`useWindowDimensions`）重新表达同一套规则。**语义是内核，@media 是绑定。** | `responsive.ts` + `html.ts` 的 `@media` cssDiff |

### 1.2 web 专属绑定（换平台必须重写，别当本质）

| 绑定 | 换平台时它会变成什么 |
|---|---|
| **tldraw 形状同步**（一节点↔N形状、坐标系/z-index/canMove 守卫） | 换成目标平台的画布/渲染层；同步「IR→几何→形状」的回路思想保留，具体 API 全换。见 §3.4。 |
| **yoga-layout(wasm) 作布局引擎** + `setMeasureFunc` 文字折行 | 换平台可能用平台原生布局（RN 本就用 yoga）或别的引擎；「IR→几何坐标」这步保留，引擎可换。 |
| **HTML emitter 的 CSS 镜像细节** + `@media` cssDiff | 换目标语言换 emitter（已有 RN emitter 作为「IR 与平台无关」的证据）。 |
| **AI 后端：本地 Claude Code Agent SDK（零 key）** | 🔴 **移植最大坑，见 §4**。换系统分发必须切回 `ANTHROPIC_API_KEY`，否则跑不起来。 |

---

## 2. 模块地图（B·接手用）

完整文件→职责见根 `CLAUDE.md` 的表。这里只标**三条链路如何交汇到 IR**：

- **生成链路**：`PromptBar` →（POST `/api/generate`，`vite.config.ts` 中间件）→ `server/ai.mjs` 分发 → `server/generate.mjs`（prompt→DSL）→ `src/compiler/dsl.ts`（DSL→IR，系统分配 ID）→ `store.loadIR`。
- **编辑链路**：画布拖拽（`IrNodeShape`/`reorder`）、样式面板（`StylePanel`）、AI 改图（`PromptBar`→`/api/edit`→`server/edit.mjs`→AI 返回 op）**全部**汇入 `store.applyOps`（`src/ir/ops.ts` 的 reducer）。
- **派生链路**：IR 变 → `src/layout/yoga.ts` 算几何 → `src/canvas/sync.ts` 协调 tldraw 形状 / `src/codegen/*` 出代码。

---

## 3. 不变量与雷区（B·接手核心，断言在前、根因在后）

**改对应代码前先扫这一节。** 每条是「必须维持的不变量」，违反 → `canvas ≠ code` 或行为错乱。按代码区域分组。

### 3.1 yoga 布局类

**① fill 主轴必须 `setFlexBasis(0)`**
`src/layout/yoga.ts:176`。fill 主轴只 `setFlexGrow(1)+setFlexShrink(1)` 会漏 basis，`basis=auto` 按内容起算 → 多个 fill 兄弟（如卡片网格两卡）不等宽。
*根因：对齐 CSS `flex: 1 1 0` 才等分；`flex:1 1 auto` 不等分。*

**② 主轴上的 fixed/hug 必须显式 `flex-shrink: 0`**
`src/codegen/html.ts:42-44,57`。yoga `flexShrink` 默认 **0**（不收缩），CSS flex item 默认 **1**（收缩）——两者默认值相反。固定尺寸子元素塞进过小固定父级时，CSS 会压小、yoga 不压 → 高/宽 `canvas ≠ code`。
*根因：emitter 显式输出 `flex-shrink:0` 与 yoga 对齐（固定即固定、宁可溢出不压缩，符合 Figma 直觉）。*

**③ 文字折行：yoga 必须用 `setMeasureFunc`**
`src/layout/yoga.ts`（`measureText`，约 :85）。文字叶子（text/button/input）不能只给单行尺寸——CSS 把文字渲染成块级 div 占满父宽自动折行，若 yoga 给单行高 → 多行文字 canvas 严重溢出、卡片错位，而 HTML 预览正常。修法：按 yoga 传入的可用宽度（MeasureMode Exactly/AtMost/Undefined）做词级折行（超长词/CJK 断字），返回正确多行高。图片仍走 `measureLeaf`。

**④ 行高 `1.4` 必须三处统一**
`LINE_HEIGHT_RATIO = 1.4`（`src/layout/yoga.ts:35`）/ 画布 `IrNodeShape.tsx:32`（`lineHeight`）/ `html.ts`（`line-height:1.4`）。**改任一处必同步另两处**，否则折行高度对不上 → `canvas ≠ code`。

**⑤ 按钮内边距 `BUTTON_PAD_X=14 / BUTTON_PAD_Y=8` 三处共用**
`src/ir/style-presets.ts:6-7`，被 `yoga.ts`（measure 计入按钮 hug 尺寸）/ `IrNodeShape.tsx:94`（画布 padding）/ `html.ts:84`（CSS padding）共用。button 是叶子（无 `layout.padding`），靠这对常量给内边距。`box-sizing:border-box` 保证 hug 宽含 padding → 三处差 ≤3px。

### 3.2 emitter 一致性类

**⑥ cross-axis fill 在 HTML 用 `width:100%/height:100%`，不用 `align-self:stretch`**
`src/codegen/html.ts`。`align-self:stretch` 会覆盖父 `align:center`，致 maxWidth 封顶后元素靠左 → `canvas ≠ code`。`width:100%` 与 yoga 的 `setWidthPercent` 机制对齐。

**⑦ 居中不由 maxWidth 负责，交父 `layout.align`**
`fill` 的 `max` 只产出 `max-width:Npx`（cap-only）。「宽屏封顶居中、窄屏自动满宽」靠 `fill+max` ＋ 父 `align:center` 组合，不是 maxWidth 自己居中。（AI DSL / 样式面板暂不支持 `max`；RN 忽略 `max`。）

### 3.3 响应式类（语义可移植，实现绑 @media —— 见 §1.1 末行）

执行顺序关键：**R1/R1b → R2 → R3**，碰撞判定用**原始**间距。

- **R1 溢出塌列**：row 容器「子 fixed 宽之和 + gap + padding > 视口宽」→ 改 col + stretch；只看 fixed，fill/hug 计 0。命中时**还把该容器的 fixed 宽子元素一并降级 fill**（一致性，否则同样塌列却半宽/全宽割裂）。
- **R1b 网格塌列**：`responsive.ts:127`。row 容器若 ≥2 个 fill 容器子元素且 `viewportWidth / childCount < MIN_COL_WIDTH(260)` → 塌单列。补 R1 只看 fixed、fill 算 0 导致「fill 卡片网格永不塌」的漏洞。
- **R2 固定宽超视口降级 fill**。
- **R3 间距缩放**：`responsive.ts:143`，`SPACING_SCALE` 桶（mobile ≤375 factor0.55/cap16、tablet ≤768 factor0.75/cap20、desktop 恒等），`clamp(round(value×factor), floor=2, cap)` 压 padding/gap。在 R1/R1b/R2 之后跑。
- **布局后溢出纠正** `src/layout/responsiveCorrect.ts`：R1~R3 是布局**前**启发式、只按视口宽近似，抓不住「容器相对溢出」（hug 内容、小于视口但放不进父的 fixed）。`responsiveCorrect` 先变换→真实 `layoutIR`→找溢出 row→塌列→迭代 ≤3 次至稳定。**`sync.ts` 与 `html.ts` 都改调 `responsiveCorrect`（不再直接 `responsiveTransform`）→ 画布与导出一致修好。** 模块依赖无环：`responsiveCorrect → {responsive, yoga}`，`yoga → responsive`。

### 3.4 tldraw 同步类（web 专属，移植时整段重写）

**⑧ z 序由 tldraw `index`（分数索引）决定，非 `props.depth`**
`src/canvas/sync.ts:2,83`（`getIndices` 从 `@tldraw/utils` 引，tldraw 主包不导出）。`syncToCanvas` 必须每次按「视口×DFS」顺序给所有 ir-node 重设 `index`——否则拖拽重新父子化后被移动形状保留旧 index、z 序过期 → 子元素被新父盖住（`canvas ≠ 预览`）。所有 ir-node 都是 page 级平铺形状，全局递增 index 即正确 z。

**⑨ 坐标系坑：`InFrontOfTheCanvas` 是屏幕坐标系（不随相机变换）**
`OnTheCanvas` 是页面坐标系（随相机）。`DragIndicator` 在 `InFrontOfTheCanvas` 层渲染，必须用 `editor.pageToScreen`（`DragIndicator.tsx:16`）把线的页面坐标转屏幕坐标、按 zoom 缩放宽高（减 `getViewportScreenBounds` 偏移），否则相机非 `zoom=1/pan=0` 时指示线错位。`ViewportLabels` 放 `OnTheCanvas` 故天然正确。

**⑩ 三视口只读靠 `canResize` + `onTranslate` 守卫**
tldraw **无 `canMove`**。`IrNodeShape` 一节点↔3 形状（`shapeIdFor(viewport,nodeId)='ir-<vp>-<nodeId>'`）；只读非主视口靠 `canResize=主视口` + `onTranslate/End` 守卫（非主视口 bump version 吸附回位）；`getCurrentLayout` 只存主视口供 reorder。

**⑪ reorder 拖到自己的直接兄弟（及其子树）按重排处理、不嵌套**
`src/canvas/reorder.ts`。避免同级 box 互拖被塞进彼此。

---

## 4. 🔴 AI 后端可移植性（移植最大坑）

当前 AI 后端是 **commit `b2b1695` 引入的 provider 分发层**：

- `server/ai.mjs`：分发，**前端选哪个源后端只调哪个，无隐式 fallback**。`DEFAULT_PROVIDER='claude'`。
- `server/claude.mjs`：Claude Code provider，进程内调 `@anthropic-ai/claude-agent-sdk`，**零 key、走本地 Claude Code 订阅额度**（`runClaudeJSON`，保留 `runJSON` 别名向后兼容）。
- `server/codex.mjs`：Codex App provider，`@openai/codex-sdk`，只读 sandbox + 临时空目录 `os.tmpdir()/ir-demo-codex-provider` + `networkAccessEnabled:false`。
- `server/json.mjs`：共享 JSON 解析（`extractJSON` 去围栏取首尾 `{}`、`repairPrompt` 解析失败重试）。
- 会话保温：`server/edit.mjs` 按 `provider:model:sessionKey(项目id)` 隔离会话 Map，Claude `resume` / Codex thread，失败回退完整上下文。

**🔴 移植到其他系统时：**
1. **零 key 只在装了本地 Claude Code / Codex 的机器上成立。** 换到 CI/服务器/别人的机器，Claude provider 跑不起来——必须切回 `ANTHROPIC_API_KEY` + 标准 Anthropic SDK。这是「demo 能跑」和「可分发」之间的鸿沟。
2. AI 后端是 **Vite dev 中间件**（`vite.config.ts` 的 `aiBackend()`），**不是独立后端进程**。生产部署要把这套中间件搬成真后端。
3. 模型默认：Claude 走 `IR_MODEL` / `claude-sonnet-4-6`，Codex 走 `IR_CODEX_MODEL` / 本地默认；前端选具体模型随请求覆盖。

---

## 5. 验证套件（复制系统后第一件事：确认没搬坏）

每条 e2e 对应一个架构风险。**dev server 端口随占用浮动**（默认 5173，实测会变）；**e2e 选择器与 UI 文案强绑定——改文案必须同步脚本**（作者反复踩过）。

| 脚本 | 守护的不变量/风险 |
|---|---|
| `scripts/e2e.mjs` | **最高风险**：Playwright 真实拖拽断言「自由 x/y → 重排序到 flex 槽位」成立 |
| `scripts/e2e-codegen.mjs` | **canvas = code 像素级一致**（+ @media 断言）——IR 够格当事实来源的核心证据 |
| `scripts/e2e-rn.mjs` | 一份 IR → 合法 RN `.tsx`（esbuild 校验 + 结构断言）——IR 与平台无关 |
| `scripts/e2e-ai.mjs` | prompt→生成→画布换新 IR |
| `scripts/e2e-edit.mjs` | AI 改图保留原 ID 全集 + 指令生效 + 画布同步 |
| `scripts/e2e-resume.mjs` | 第二次改图 `resumed:true` + 指代消解命中 |
| `scripts/e2e-style.mjs` | 选叶子改文案回写 IR + 容器布局控件出现 |
| `scripts/e2e-persist.mjs` | 改 IR→保存→刷新→恢复 |
| `scripts/e2e-indicator.mjs` | 拖拽插入指示线落点正确 |
| `scripts/e2e-layers.mjs` | 图层行数=节点数 + 双向选中 + 折叠 |
| `scripts/e2e-responsive.mjs` | 三视口同屏 + 塌列规则 |
| `scripts/e2e-export.mjs` | UI 点导出→校验磁盘文件内容 |
| `scripts/e2e-add.mjs` | ⚠️ **孤儿**，见 §6 |

跑法：`pnpm dev`（先起服务）→ 另开终端 `node scripts/e2e-*.mjs`。类型门：`pnpm exec tsc -b`（已验证 exit 0）。
注意：`e2e-ai/e2e-edit/e2e-resume` 需真实调用 AI 后端（走订阅额度，非 headless 友好）。

---

## 6. 当前状态与已知缺口（诚实清单）

- **基线**：commit `b2b1695` 起，AI 后端已是「源分发层（Claude Code / Codex App 可切换）」。包管理器已切 **pnpm**——README 里的 `npm install / npm run dev` 是**过期指令**，以 `pnpm` 为准。
- **孤儿代码**：`src/ui/insert.ts` + `scripts/e2e-add.mjs`（手动添加元素）在响应式那轮**没接回 UI**，仅靠给 `shapeIdFor` 传 `MAIN_VIEWPORT` 兜过编译。接手若要恢复「手动加元素」入口，从这里捡。
- **已知小 bug**：固定高卡片塞不下「折行文字 + 日期」时，日期仍溢出底部（fixed 容器不随内容长大，未处理）。
- **maxWidth 模型未全链路**：`fill.max` 仅画布 + HTML 支持；**AI DSL / 样式面板未接入、RN 忽略**。
- **shadow**：`StyleProps.shadow`（elevation 0-3）仅画布 + HTML，RN 忽略。

---

## 7. 路线图

核心 + 打磨已完成。后续可选方向：组件实例/变体、任意视口可结构编辑（`getCurrentLayout` 扩 per-viewport）、flex-wrap 规则、maxWidth 接入 AI DSL+样式面板+RN、协作。
</content>
</invoke>
