// ============================================================================
// 响应式变换 —— 把同一份基线 IR 按目标视口宽度，纯函数地变形成「该视口下应呈现的 IR」。
// 这是「画布预览 = 导出代码」的单一事实来源：画布三画板（喂给 yoga）与
// HTML 导出（喂给 emitHTML）都消费它，保证所见即所得。
// 只读：永不修改入参 ir，desktop 宽度返回恒等结果。
// ============================================================================
import type { IR, IRNode, NodeId } from '../ir/types'
import { isContainer } from '../ir/types'

// 三个预览视口：名称 + 宽度。desktop-first，从宽到窄。
export const VIEWPORTS = [
  { name: 'desktop', width: 1280 }, // 主视口（唯一可结构编辑）
  { name: 'tablet', width: 768 },
  { name: 'mobile', width: 375 },
] as const

export type ViewportName = (typeof VIEWPORTS)[number]['name']

// 主视口：只有它允许拖拽重排，其余只读预览
export const MAIN_VIEWPORT: ViewportName = 'desktop'
// 主视口宽度（恒等变换的判定基准）
export const MAIN_WIDTH = VIEWPORTS[0].width
// 三画板之间的水平间距
export const ARTBOARD_GAP = 64
// 多列网格的「最小舒适列宽」：每列宽低于此值则塌成单列（卡片网格在窄屏堆叠）
const MIN_COL_WIDTH = 260

// R3 间距缩放：窄视口按比例压缩 padding/gap（封顶 cap + 保底 floor），避免大内边距浪费空间。
// 按视口取桶：viewportWidth ≤ maxWidth 的第一条命中（mobile 在前、tablet 在后）。
const SPACING_FLOOR = 2 // 非 0 间距的最小值，防止缩没
const SPACING_SCALE: { maxWidth: number; factor: number; cap: number }[] = [
  { maxWidth: 375, factor: 0.55, cap: 16 }, // mobile
  { maxWidth: 768, factor: 0.75, cap: 20 }, // tablet
]

// clamp(round(value×factor), floor, cap)；0 保持 0
function scaleSpacing(value: number, factor: number, cap: number): number {
  if (value <= 0) return 0
  return Math.min(Math.max(Math.round(value * factor), SPACING_FLOOR), cap)
}
// 画板群在画布中的原点（沿用 yoga 既有锚点）
export const ARTBOARD_ORIGIN = { x: 120, y: 120 }

// 计算某视口画板的左上角 X：前面所有视口宽 + 间距 累加。
// sync 与画板标签组件共用此函数，避免坐标算式漂移。
export function originXFor(viewportIndex: number): number {
  let x = ARTBOARD_ORIGIN.x // 从群原点起
  for (let i = 0; i < viewportIndex; i++) {
    x += VIEWPORTS[i].width + ARTBOARD_GAP // 累加前面每个画板宽 + 间距
  }
  return x
}

// 深拷贝单个节点（含 width/height/layout/style/props），避免变换写穿基线 IR。
function cloneNode(node: IRNode): IRNode {
  return {
    ...node, // 浅拷标量字段（id/type/parentId）
    childIds: [...node.childIds], // 拷子序数组
    width: { ...node.width }, // 拷尺寸三态对象
    height: { ...node.height },
    layout: node.layout ? { ...node.layout } : undefined, // 容器才有 layout
    style: { ...node.style },
    props: { ...node.props },
  }
}

// 把一个 row 容器塌成纵向：col + 交叉轴 stretch + 块状(fixed)子元素降级 fill（全宽竖排）。
// R1/R1b 与「布局后溢出纠正」共用。
function collapseRow(n: IRNode, nodes: Record<NodeId, IRNode>): void {
  if (!n.layout) return
  n.layout.direction = 'col'
  n.layout.align = 'stretch'
  // 释放固定高：固定高度是为「横排单行」设计的，塌成竖排后内容明显变高，
  // 若仍焊死会撑不开 → 内容溢出压住后续兄弟节点。改 hug 让容器抱紧竖排内容。
  if (n.height.mode === 'fixed') n.height = { mode: 'hug' }
  for (const cid of n.childIds) {
    const c = nodes[cid]
    if (c && c.width.mode === 'fixed') c.width = { mode: 'fill' }
  }
}

// 把指定 row 容器集合塌成纵向，返回新 IR（纯函数、深拷贝、不改入参）。
// 供「布局后溢出纠正」使用：检测到溢出的 row 在这里被塌列。
export function collapseRows(ir: IR, ids: Set<NodeId>): IR {
  if (ids.size === 0) return ir
  const nodes: Record<NodeId, IRNode> = {}
  for (const id of Object.keys(ir.nodes)) nodes[id] = cloneNode(ir.nodes[id])
  for (const id of ids) {
    const n = nodes[id]
    if (n) collapseRow(n, nodes)
  }
  return { rootId: ir.rootId, nodes }
}

// 主入口：返回「该视口宽度下应呈现」的新 IR。纯函数、不改入参。
export function responsiveTransform(ir: IR, viewportWidth: number): IR {
  // desktop 基线：恒等返回原 IR（不拷贝、不变形）
  if (viewportWidth >= MAIN_WIDTH) return ir

  // 全量深拷贝节点表，后续只在副本上改
  const nodes: Record<string, IRNode> = {}
  for (const id of Object.keys(ir.nodes)) nodes[id] = cloneNode(ir.nodes[id])

  // —— R1（溢出才塌列）—— 必须先于 R2 跑。
  // 对 row 容器：子节点 fixed 宽之和 + gap×(n-1) + padding×2 > 视口宽 → 改 col + 交叉轴 stretch。
  // 只看 fixed 宽（hug/fill 计 0）：一行 fill 子元素永不触发，自然压缩不丑塌；真放不下的固定宽行才塌列。
  // 先于 R2：用「原始固定宽」判断整行是否放不下；若先跑 R2 把超宽子元素降级 fill，
  // R1 的固定宽之和会归零而漏判，导致该行不塌列（被压成并排窄块）。
  for (const id of Object.keys(nodes)) {
    const n = nodes[id]
    if (!isContainer(n) || !n.layout || n.layout.direction !== 'row') continue // 仅横向容器
    const childCount = n.childIds.length
    if (childCount === 0) continue
    // 累加子节点固定宽（非 fixed 计 0）
    let fixedSum = 0
    let fillBoxCount = 0 // fill 容器子元素数（卡片网格特征）
    for (const cid of n.childIds) {
      const c = nodes[cid]
      if (!c) continue
      if (c.width.mode === 'fixed') fixedSum += c.width.value
      if (c.width.mode === 'fill' && isContainer(c)) fillBoxCount++
    }
    // R1：固定宽之和 + 间距 + 内边距 放不下视口 → 塌列
    const required = fixedSum + n.layout.gap * (childCount - 1) + n.layout.padding * 2
    const r1 = required > viewportWidth
    // R1b：≥2 个 fill 容器（卡片网格），每列宽低于最小舒适列宽 → 塌成单列
    const r1b = fillBoxCount >= 2 && viewportWidth / childCount < MIN_COL_WIDTH
    // 塌列后块状(fixed)子元素降级 fill → 竖排全宽一致（解决「features 半宽、stats 全宽」割裂）
    if (r1 || r1b) collapseRow(n, nodes)
  }

  // —— R2（固定宽超视口降级）—— 在 R1 之后。
  // 把「自身固定宽 > 视口宽」的节点降级为 fill，防止单个宽元素撑爆视口；
  // 塌列后这些元素在新的纵向容器里 fill → 满宽，竖排整齐。
  for (const id of Object.keys(nodes)) {
    const n = nodes[id]
    if (n.width.mode === 'fixed' && n.width.value > viewportWidth) {
      n.width = { mode: 'fill' } // fixed → fill，CSS 出 width:100%/align-self:stretch
    }
  }

  // —— R3（间距缩放）—— 窄视口压缩各容器 padding/gap，腾出内容空间（在 R1/R1b/R2 之后）
  const spacing = SPACING_SCALE.find((s) => viewportWidth <= s.maxWidth)
  if (spacing) {
    for (const id of Object.keys(nodes)) {
      const n = nodes[id]
      if (!n.layout) continue
      n.layout.padding = scaleSpacing(n.layout.padding, spacing.factor, spacing.cap)
      n.layout.gap = scaleSpacing(n.layout.gap, spacing.factor, spacing.cap)
    }
  }

  return { rootId: ir.rootId, nodes }
}
