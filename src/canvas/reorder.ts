import type { IR, NodeId } from '../ir/types'
import { isContainer } from '../ir/types'
import type { LayoutResult, Rect } from '../layout/yoga'

// 拖拽落点 → 目标容器 + 插入下标。
// 这是「自由 x/y 翻译成 auto-layout 树操作」的核心：把一个绝对坐标的落点
// 解释成「应该插进哪个容器的第几个槽位」。
export interface DropTarget {
  parentId: NodeId
  index: number
}

// 收集 nodeId 的所有后代（含自身），用于排除——不能把节点拖进自己的子树
function descendants(ir: IR, nodeId: NodeId, acc = new Set<NodeId>()): Set<NodeId> {
  acc.add(nodeId)
  for (const cid of ir.nodes[nodeId].childIds) descendants(ir, cid, acc)
  return acc
}

function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function resolveDrop(
  ir: IR,
  layout: LayoutResult,
  draggedId: NodeId,
  point: { x: number; y: number },
): DropTarget | null {
  const excluded = descendants(ir, draggedId) // 自身 + 子树都不能当目标
  // 拖到「自己的直接兄弟（及其子树）」上应理解为重排、而非嵌套进它：
  // 把兄弟子树也排除出候选容器 → 落点解析会回退到共享父级做相邻插入。
  // （只影响「兄弟本身是容器」的情况，如固定尺寸的 box 互拖；兄弟是 text 等非容器时本就不是目标。）
  const dragged = ir.nodes[draggedId]
  if (dragged.parentId) {
    for (const sib of ir.nodes[dragged.parentId].childIds) {
      if (sib !== draggedId) descendants(ir, sib, excluded)
    }
  }

  // 1) 找到「包含落点」且层级最深的合法容器（面积最小者≈最深）
  let best: { id: NodeId; area: number } | null = null
  for (const [id, node] of Object.entries(ir.nodes)) {
    if (!isContainer(node)) continue
    if (excluded.has(id)) continue
    const r = layout.get(id)
    if (!r || !contains(r, point.x, point.y)) continue
    const area = r.w * r.h
    if (!best || area < best.area) best = { id, area }
  }
  if (!best) return null
  const parentId = best.id
  const parent = ir.nodes[parentId]
  const dir = parent.layout?.direction ?? 'col'

  // 2) 在该容器内，按主轴比较落点与各子节点中心，确定插入下标
  const siblings = parent.childIds.filter((id) => id !== draggedId)
  let index = siblings.length
  for (let i = 0; i < siblings.length; i++) {
    const r = layout.get(siblings[i])
    if (!r) continue
    const center = dir === 'row' ? r.x + r.w / 2 : r.y + r.h / 2
    const p = dir === 'row' ? point.x : point.y
    if (p < center) {
      index = i
      break
    }
  }
  return { parentId, index }
}
