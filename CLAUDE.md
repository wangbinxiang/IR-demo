# CLAUDE.md

> 交接常驻层。接手开发或把本系统移植到其他系统前，**深度文档读 [`docs/DESIGN-IR.md`](docs/DESIGN-IR.md)**（概念移植 + 完整踩坑断言 + 移植分界线）。

## 定位

IR-demo 是验证 **Design IR** 概念的原型：**AI 生成 / 画布编辑 / 代码生成三条链路共用同一份 IR 作唯一事实来源**。几何坐标从不进 IR，由 yoga 从 IR 派生。非产品，是架构验证。

## 运行 / 验证（⚠️ 用 pnpm，不是 npm）

```bash
pnpm install
pnpm dev                 # dev server，端口随占用浮动（默认 5173）；AI 后端是 Vite 中间件，无独立进程
pnpm exec tsc -b         # 类型门（已验证 exit 0）
node scripts/e2e.mjs     # 先 pnpm dev，再另开终端跑；e2e 选择器与 UI 文案强绑定，改文案必同步脚本
```

README 里的 `npm` 指令是**过期的**，以 pnpm 为准。

## 模块地图

| 文件 | 职责 |
|---|---|
| `src/ir/types.ts` | **IR 类型**：扁平表 `{rootId, nodes}` + 稳定 ID + 三态尺寸 Hug/Fill/Fixed + 混合节点词汇 |
| `src/ir/ops.ts` | **统一 mutation 层**：op 词汇 + `outlineIR`（喂 AI）+ `applyOps` reducer——架构承重墙 |
| `src/ir/store.ts` | IR store（画布/AI/面板共用的改写入口） |
| `src/ir/style-presets.ts` | `BUTTON_PAD_X/Y`、`shadowCSS`（三处共用常量，见雷区⑤） |
| `src/layout/yoga.ts` | IR → yoga → 绝对几何；`LINE_HEIGHT_RATIO`、文字 `setMeasureFunc` 折行 |
| `src/layout/responsive.ts` | `responsiveTransform(ir,vw)` 纯函数 + R1/R1b/R2/R3 规则 |
| `src/layout/responsiveCorrect.ts` | 布局后溢出纠正（画布与导出都调它，非直接 transform） |
| `src/canvas/IrNodeShape.tsx` | tldraw 自定义形状 + 拖拽/缩放语义（一节点↔3视口形状） |
| `src/canvas/reorder.ts` | 拖拽落点 → 目标容器 + 下标 |
| `src/canvas/sync.ts` | IR+布局 → 协调 tldraw 形状；`getIndices` 重设 z 序 |
| `src/canvas/DragIndicator.tsx` | 拖拽插入指示线（屏幕坐标系，`pageToScreen` 转换） |
| `src/codegen/html.ts` | `emitHTML(ir)`：CSS flexbox 镜像 yoga + `@media` |
| `src/codegen/reactNative.ts` | `emitReactNative(ir)`：同构 RN emitter |
| `src/compiler/dsl.ts` | DSL → 扁平 IR（系统分配稳定 ID） |
| `src/ui/PromptBar.tsx` | 提示词栏 + AI 源/模型选择器 |
| `src/ui/StylePanel.tsx` / `LayersPanel.tsx` | 右样式面板 / 左图层树（全走 op） |
| `server/ai.mjs` | **AI 源分发**：前端选哪个调哪个，无隐式 fallback |
| `server/claude.mjs` / `codex.mjs` | Claude Code（零 key 本地）/ Codex App provider |
| `server/{generate,edit,export,projects}.mjs` | prompt→DSL / 改图 op / 导出磁盘 / 持久化 |
| `vite.config.ts` | `aiBackend()` 中间件：`/api/generate`、`/api/edit` |

## 雷区一句话清单（改这些必读 `docs/DESIGN-IR.md` §3 全文）

- **改行高 1.4 → 必同步三处**：`yoga.ts` / `IrNodeShape.tsx` / `html.ts`，否则 canvas≠code。
- **改按钮内边距 → 必同步三处**：`style-presets.ts` 常量被 yoga/画布/html 共用。
- **fill 主轴必 `setFlexBasis(0)`**（yoga），否则多个 fill 兄弟不等宽。
- **主轴 fixed/hug 必 `flex-shrink:0`**（html），yoga 默认不收缩、CSS 默认收缩，相反。
- **cross-axis fill 用 `width:100%` 不用 `align-self:stretch`**，否则覆盖父居中。
- **响应式规则顺序 R1/R1b → R2 → R3**，画布与导出都调 `responsiveCorrect`（非直接 transform）。
- **tldraw z 序靠 `index` 不靠 `depth`**，`syncToCanvas` 每次按视口×DFS 重设。
- **`InFrontOfTheCanvas` 是屏幕坐标系**，指示线必须 `pageToScreen` 转换。
- **AI 改图必须保留未改动节点的 ID**（op-patch 语义）。

## 移植到其他系统时（🔴 最大坑）

- **AI 后端零 key 只在装了本地 Claude Code 的机器成立**——换 CI/服务器/他人机器必须切回 `ANTHROPIC_API_KEY`。详见 `docs/DESIGN-IR.md` §4。
- **可移植内核 vs web 专属绑定**的分界线见 `docs/DESIGN-IR.md` §1：IR/op/三态尺寸/确定性编译器/responsive 语义 = 照搬思想；tldraw/yoga/CSS 镜像/AI 后端 = 重写。

## 当前状态与已知缺口

详见 `docs/DESIGN-IR.md` §6。要点：基线 commit `b2b1695`（AI 源分发层 + pnpm）；`src/ui/insert.ts`+`e2e-add.mjs` 是孤儿未接回 UI；固定高卡片日期溢出小 bug 未修；`fill.max`/`shadow` 未全链路（RN 忽略）。
</content>
