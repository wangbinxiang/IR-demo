import { create } from 'zustand'
import type { IR, NodeId } from '../ir/types'
import type { LayoutResult, Rect } from '../layout/yoga'
import type { DropTarget } from './reorder'

// 拖拽时的插入指示线（页面坐标系下的一条细矩形）。null 表示不显示。
interface IndicatorState {
  line: Rect | null
  set: (line: Rect | null) => void
}
export const useDragIndicator = create<IndicatorState>((set) => ({
  line: null,
  set: (line) => set({ line }),
}))

const THICK = 3 // 指示线粗细（页面单位）

// 根据落点目标(容器+插入下标)算出指示线应画在哪：
// 列容器→水平线（夹在两子元素之间）；行容器→竖直线。
export function insertionLine(
  ir: IR,
  layout: LayoutResult,
  draggedId: NodeId,
  target: DropTarget,
): Rect | null {
  const parent = ir.nodes[target.parentId]
  const R = layout.get(target.parentId)
  if (!parent || !R) return null
  const dir = parent.layout?.direction ?? 'col'
  const pad = parent.layout?.padding ?? 0
  const gap = parent.layout?.gap ?? 0
  // 兄弟（排除被拖节点），按 childIds 顺序取布局矩形
  const sibs = parent.childIds
    .filter((id) => id !== draggedId)
    .map((id) => layout.get(id))
    .filter((r): r is Rect => !!r)

  if (dir === 'col') {
    const x = R.x + pad
    const w = R.w - pad * 2
    let y: number
    if (sibs.length === 0) y = R.y + R.h / 2
    else if (target.index <= 0) y = sibs[0].y - gap / 2
    else if (target.index >= sibs.length) {
      const last = sibs[sibs.length - 1]
      y = last.y + last.h + gap / 2
    } else y = (sibs[target.index - 1].y + sibs[target.index - 1].h + sibs[target.index].y) / 2
    return { x, y: y - THICK / 2, w, h: THICK }
  } else {
    const y = R.y + pad
    const h = R.h - pad * 2
    let x: number
    if (sibs.length === 0) x = R.x + R.w / 2
    else if (target.index <= 0) x = sibs[0].x - gap / 2
    else if (target.index >= sibs.length) {
      const last = sibs[sibs.length - 1]
      x = last.x + last.w + gap / 2
    } else x = (sibs[target.index - 1].x + sibs[target.index - 1].w + sibs[target.index].x) / 2
    return { x: x - THICK / 2, y, w: THICK, h }
  }
}

// e2e 调试钩子
if (typeof window !== 'undefined')
  (window as unknown as { __dragIndicator: typeof useDragIndicator }).__dragIndicator = useDragIndicator
