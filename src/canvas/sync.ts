import { type Editor, createShapeId, type TLShapeId } from 'tldraw'
import type { IR, NodeId } from '../ir/types'
import { layoutIR, type LayoutResult } from '../layout/yoga'
import type { IrNodeShape } from './IrNodeShape'

// 最近一次布局结果，供拖拽重排序时做命中测试（reorder 用绝对矩形）
let currentLayout: LayoutResult | null = null
export function getCurrentLayout(): LayoutResult | null {
  return currentLayout
}

export const shapeIdFor = (nodeId: NodeId): TLShapeId => createShapeId(`ir-${nodeId}`)

// 按 DFS 顺序展平节点（父在前 → 子形状的 z 序在上）
function dfsOrder(ir: IR): { id: NodeId; depth: number }[] {
  const out: { id: NodeId; depth: number }[] = []
  const walk = (id: NodeId, depth: number) => {
    out.push({ id, depth })
    for (const cid of ir.nodes[id].childIds) walk(cid, depth + 1)
  }
  walk(ir.rootId, 0)
  return out
}

// 把 IR 跑布局并协调到 tldraw 形状（创建/更新/删除）
export function syncToCanvas(editor: Editor, ir: IR): void {
  const layout = layoutIR(ir)
  currentLayout = layout

  const ordered = dfsOrder(ir)
  const wantedIds = new Set<string>(ordered.map((o) => shapeIdFor(o.id)))

  // 现存的 ir-node 形状
  const existing = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'ir-node') as IrNodeShape[]
  const existingById = new Map(existing.map((s) => [s.id, s]))

  const toCreate: IrNodeShape[] = []
  const toUpdate: { id: TLShapeId; type: 'ir-node'; x: number; y: number; props: Partial<IrNodeShape['props']> }[] = []

  for (const { id: nodeId, depth } of ordered) {
    const r = layout.get(nodeId)!
    const sid = shapeIdFor(nodeId)
    const prev = existingById.get(sid)
    if (!prev) {
      toCreate.push({
        id: sid,
        type: 'ir-node',
        x: r.x,
        y: r.y,
        // 其余字段由 createShapes 补默认值
        props: { w: r.w, h: r.h, nodeId, depth },
      } as IrNodeShape)
    } else {
      toUpdate.push({ id: sid, type: 'ir-node', x: r.x, y: r.y, props: { w: r.w, h: r.h, depth } })
    }
  }

  // 删除 IR 里已不存在的形状
  const toDelete = existing.filter((s) => !wantedIds.has(s.id)).map((s) => s.id)

  editor.run(
    () => {
      if (toDelete.length) editor.deleteShapes(toDelete)
      if (toCreate.length) editor.createShapes(toCreate)
      if (toUpdate.length) editor.updateShapes(toUpdate)
    },
    { history: 'ignore' }, // 程序化同步不进撤销栈
  )
}
