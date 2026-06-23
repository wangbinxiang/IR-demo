import {
  loadYoga,
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  type Node as YogaNode,
  type Yoga,
} from 'yoga-layout/load'
import type { IR, IRNode, NodeId } from '../ir/types'
import { isContainer } from '../ir/types'

// 布局结果：每个节点在 tldraw 页面坐标系下的绝对矩形
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export type LayoutResult = Map<NodeId, Rect>

// 画板在画布中的原点（让内容落在可见区域）
const ARTBOARD_ORIGIN = { x: 120, y: 120 }

let yoga: Yoga | null = null
// 异步加载 yoga（wasm/asm）。只加载一次。
export async function initYoga(): Promise<void> {
  if (!yoga) yoga = await loadYoga()
}

// 叶子节点 hug 时的内在尺寸：用离屏 canvas 精确测量文字宽度（同步、浏览器可用），
// 避免粗估导致的换行裁切。无 DOM 环境下退回字符数估算。
let measureCtx: CanvasRenderingContext2D | null = null
function measureLeaf(node: IRNode): { w: number; h: number } {
  const fontSize = node.style.fontSize ?? 14
  const weight = node.style.fontWeight ?? 400
  const text = node.props.text ?? node.props.placeholder ?? ''
  const h = Math.round(fontSize * 1.4) // 行高
  if (typeof document !== 'undefined') {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) {
      measureCtx.font = `${weight} ${fontSize}px system-ui, sans-serif`
      const w = Math.ceil(measureCtx.measureText(text).width) + 4 // 余量防字体渲染差异导致裁切
      return { w: Math.max(24, w), h }
    }
  }
  return { w: Math.max(24, [...text].length * fontSize * 0.9 + 8), h }
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

  // 叶子 + hug：用估算的内在尺寸（yoga 不知道文字多大）
  if (!isContainer(node)) {
    const m = measureLeaf(node)
    if (node.width.mode === 'hug') yn.setWidth(m.w)
    if (node.height.mode === 'hug') yn.setHeight(m.h)
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
  sizing: { mode: 'hug' | 'fill' | 'fixed'; value?: number },
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
    } else {
      // 交叉轴填充 → 占满父内容区
      if (axis === 'w') yn.setWidthPercent(100)
      else yn.setHeightPercent(100)
    }
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

// 对整份 IR 跑一次布局，返回每个节点的绝对矩形
export function layoutIR(ir: IR): LayoutResult {
  if (!yoga) throw new Error('yoga 未初始化，请先 await initYoga()')
  const root = build(ir, ir.rootId, yoga)
  root.calculateLayout(undefined, undefined, Direction.LTR)
  const out: LayoutResult = new Map()
  collect(ir, ir.rootId, root, ARTBOARD_ORIGIN.x, ARTBOARD_ORIGIN.y, out)
  root.freeRecursive() // 释放 wasm 侧内存
  return out
}
