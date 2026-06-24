import {
  loadYoga,
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  type Node as YogaNode,
  type Yoga,
  type MeasureFunction,
} from 'yoga-layout/load'
import type { IR, IRNode, NodeId, Sizing } from '../ir/types'
import { isContainer } from '../ir/types'
import { BUTTON_PAD_X, BUTTON_PAD_Y } from '../ir/style-presets'
import { ARTBOARD_ORIGIN } from './responsive'

// 布局结果：每个节点在 tldraw 页面坐标系下的绝对矩形
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export type LayoutResult = Map<NodeId, Rect>

let yoga: Yoga | null = null
// 异步加载 yoga（wasm/asm）。只加载一次。
export async function initYoga(): Promise<void> {
  if (!yoga) yoga = await loadYoga()
}

// 统一行高比例：yoga 测量 / 画布渲染 / HTML 导出三处必须一致，否则折行高度对不上。
export const LINE_HEIGHT_RATIO = 1.4

// 离屏 canvas，用于同步精确测量文字宽度（浏览器可用）。无 DOM 环境返回 null。
let measureCtx: CanvasRenderingContext2D | null = null
function ensureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

// 图片等无文本叶子的内在尺寸（单行估算）
function measureLeaf(node: IRNode): { w: number; h: number } {
  const fontSize = node.style.fontSize ?? 14
  const h = Math.round(fontSize * LINE_HEIGHT_RATIO)
  return { w: Math.max(24, fontSize), h: Math.max(24, h) }
}

// 词级折行：在 maxW 内贪心排版，超长单词(CJK/URL)按字符断行。返回行数与最长行宽。
function wrapMeasure(text: string, maxW: number, ctx: CanvasRenderingContext2D): { lines: number; maxLineW: number } {
  const W = (s: string) => ctx.measureText(s).width
  const words = text.split(/\s+/).filter(Boolean) // 按空白切词（CJK 整段为一“词”→走字符断行）
  const lineWidths: number[] = []
  let line = ''
  const breakLine = () => {
    lineWidths.push(W(line))
    line = ''
  }
  for (let word of words) {
    // 单词本身超过一行 → 逐字符切（贴近浏览器 overflow-wrap:break-word）
    while (W(word) > maxW && word.length > 1) {
      let cut = word.length
      while (cut > 1 && W((line ? line + ' ' : '') + word.slice(0, cut)) > maxW) cut--
      line = (line ? line + ' ' : '') + word.slice(0, cut)
      breakLine()
      word = word.slice(cut)
    }
    const cand = line ? line + ' ' + word : word
    if (W(cand) <= maxW || !line) line = cand // 放得下、或当前行空(至少放一个)
    else breakLine(), (line = word) // 放不下 → 换行
  }
  breakLine()
  return { lines: Math.max(1, lineWidths.length), maxLineW: Math.max(0, ...lineWidths) }
}

// 文本叶子的 yoga 测量函数：按 yoga 给的可用宽度折行，返回多行尺寸。
// 这让画布与 CSS 块级文字一致：宽度受限时折行、高度随行数增长（修掉单行溢出/卡片错位）。
function measureText(node: IRNode): MeasureFunction {
  const fontSize = node.style.fontSize ?? 14
  const weight = node.style.fontWeight ?? 400
  const text = node.props.text ?? node.props.placeholder ?? ''
  const lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO)
  // 按钮自带内部内边距（尺寸需含进去，文字才不贴边）；其余类型为 0
  const padX = node.type === 'button' ? BUTTON_PAD_X : 0
  const padY = node.type === 'button' ? BUTTON_PAD_Y : 0
  return (width, widthMode) => {
    if (!text) return { width: 2 * padX, height: lineHeight + 2 * padY }
    const ctx = ensureCtx()
    if (!ctx) {
      const w = [...text].length * fontSize * 0.6 // 无 DOM 退回字符估算
      return { width: (isFinite(width) ? Math.min(w, width) : w) + 2 * padX, height: lineHeight + 2 * padY }
    }
    ctx.font = `${weight} ${fontSize}px system-ui, sans-serif`
    const single = Math.ceil(ctx.measureText(text).width) + 2 // +2 余量防裁切
    // 文字可用宽 = 节点宽 - 左右内边距
    const avail = widthMode !== MeasureMode.Undefined && isFinite(width) ? width - 2 * padX : Infinity
    // 不强制宽度且单行放得下 → 单行（hug 在 row 父级 / 短文本）
    if (widthMode !== MeasureMode.Exactly && single <= avail) {
      return { width: single + 2 * padX, height: lineHeight + 2 * padY }
    }
    // 否则按可用宽度折行（hug 在 stretch 列父级 / fixed / fill）
    const { lines, maxLineW } = wrapMeasure(text, Math.max(1, avail), ctx)
    const contentW = widthMode === MeasureMode.Exactly ? width - 2 * padX : Math.min(Math.ceil(maxLineW) + 2, avail)
    return { width: contentW + 2 * padX, height: lines * lineHeight + 2 * padY }
  }
}

const ALIGN_MAP = {
  start: Align.FlexStart,
  center: Align.Center,
  end: Align.FlexEnd,
  stretch: Align.Stretch,
} as const
const JUSTIFY_MAP = {
  start: Justify.FlexStart,
  center: Justify.Center,
  end: Justify.FlexEnd,
  between: Justify.SpaceBetween,
} as const

// 递归构建 yoga 树
function build(ir: IR, nodeId: NodeId, yg: Yoga): YogaNode {
  const node = ir.nodes[nodeId]
  const yn = yg.Node.create()
  const parent = node.parentId ? ir.nodes[node.parentId] : null
  const parentDir = parent?.layout?.direction ?? 'col'

  // —— 尺寸三态 → yoga ——
  applySizing(yn, node.width, 'w', parentDir)
  applySizing(yn, node.height, 'h', parentDir)

  // 叶子节点的内在尺寸（yoga 不知道文字多大）
  if (!isContainer(node)) {
    if (node.type === 'image') {
      // 图片无文本：沿用单行估算给 hug 尺寸
      const m = measureLeaf(node)
      if (node.width.mode === 'hug') yn.setWidth(m.w)
      if (node.height.mode === 'hug') yn.setHeight(m.h)
    } else {
      // 文本类(text/button/input)：用 measure 函数支持按可用宽度折行、返回多行高度
      yn.setMeasureFunc(measureText(node))
    }
  }

  // —— 容器的 auto-layout ——
  if (isContainer(node) && node.layout) {
    const L = node.layout
    yn.setFlexDirection(L.direction === 'row' ? FlexDirection.Row : FlexDirection.Column)
    yn.setGap(Gutter.All, L.gap)
    yn.setPadding(Edge.All, L.padding)
    yn.setAlignItems(ALIGN_MAP[L.align])
    yn.setJustifyContent(JUSTIFY_MAP[L.justify])
    node.childIds.forEach((cid, i) => yn.insertChild(build(ir, cid, yg), i))
  }
  return yn
}

// 把尺寸三态翻成 yoga 调用。fill 需结合「父轴方向」决定是 flexGrow 还是 100%。
function applySizing(
  yn: YogaNode,
  sizing: Sizing,
  axis: 'w' | 'h',
  parentDir: 'row' | 'col',
): void {
  const isMainAxis = (axis === 'w' && parentDir === 'row') || (axis === 'h' && parentDir === 'col')
  if (sizing.mode === 'fixed') {
    if (axis === 'w') yn.setWidth(sizing.value!)
    else yn.setHeight(sizing.value!)
  } else if (sizing.mode === 'fill') {
    if (isMainAxis) {
      yn.setFlexGrow(1) // 主轴填充 → 抢占剩余空间
      yn.setFlexShrink(1)
      yn.setFlexBasis(0) // 必须 basis=0：与 CSS flex:1 1 0 一致，多个 fill 兄弟才等分(否则按内容起算→不等宽)
    } else {
      // 交叉轴填充 → 占满父内容区
      if (axis === 'w') yn.setWidthPercent(100)
      else yn.setHeightPercent(100)
    }
    // fill 上限（仅宽度）：封顶到 max；居中由父 align 负责（cap-only），不在此设对齐
    if (axis === 'w' && sizing.max !== undefined) yn.setMaxWidth(sizing.max)
  }
  // hug：容器留 auto（由子节点决定）；叶子在 build() 里单独给估算尺寸
}

// DFS 把 yoga 的相对坐标累加成绝对页面坐标
function collect(ir: IR, nodeId: NodeId, yn: YogaNode, originX: number, originY: number, out: LayoutResult): void {
  const { left, top, width, height } = yn.getComputedLayout()
  const x = originX + left
  const y = originY + top
  out.set(nodeId, { x, y, w: width, h: height })
  const node = ir.nodes[nodeId]
  if (isContainer(node)) {
    node.childIds.forEach((cid, i) => collect(ir, cid, yn.getChild(i), x, y, out))
  }
}

// 布局选项：rootWidth 强制覆盖 root 宽（响应式视口驱动），origin 指定画板左上角。
export interface LayoutOptions {
  rootWidth?: number // 视口宽度：覆盖 root 三态宽（高度仍 hug）
  origin?: { x: number; y: number } // 画板原点，多视口时各不相同
}

// 对整份 IR 跑一次布局，返回每个节点的绝对矩形
export function layoutIR(ir: IR, options: LayoutOptions = {}): LayoutResult {
  if (!yoga) throw new Error('yoga 未初始化，请先 await initYoga()')
  const origin = options.origin ?? ARTBOARD_ORIGIN // 默认用群原点
  const root = build(ir, ir.rootId, yoga)
  // 视口驱动：强制 root 宽为视口宽，覆盖 IR 里的三态宽（高度不动，仍由内容 hug）
  if (options.rootWidth !== undefined) root.setWidth(options.rootWidth)
  root.calculateLayout(undefined, undefined, Direction.LTR)
  const out: LayoutResult = new Map()
  collect(ir, ir.rootId, root, origin.x, origin.y, out)
  root.freeRecursive() // 释放 wasm 侧内存
  return out
}
