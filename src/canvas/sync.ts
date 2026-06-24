import { type Editor, createShapeId, type TLShapeId, type IndexKey } from 'tldraw'
import { getIndices } from '@tldraw/utils'
import type { IR, NodeId } from '../ir/types'
import { layoutIR, type LayoutResult } from '../layout/yoga'
import {
  VIEWPORTS,
  MAIN_VIEWPORT,
  type ViewportName,
  originXFor,
  ARTBOARD_ORIGIN,
} from '../layout/responsive'
import { responsiveCorrect } from '../layout/responsiveCorrect'
import type { IrNodeShape } from './IrNodeShape'

// 最近一次「主视口」布局结果，供拖拽重排序时做命中测试（reorder 用绝对矩形）。
// 只存主视口：结构编辑仅在主视口发生，其余视口只读。
let currentLayout: LayoutResult | null = null
export function getCurrentLayout(): LayoutResult | null {
  return currentLayout
}

// 形状 id 带视口前缀：一个 IR 节点 ↔ N 个形状（每视口一个）。
export const shapeIdFor = (viewport: ViewportName, nodeId: NodeId): TLShapeId =>
  createShapeId(`ir-${viewport}-${nodeId}`)

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

// 把 IR 在三个视口各跑一次响应式变换 + 布局，协调到 tldraw 形状（创建/更新/删除）。
export function syncToCanvas(editor: Editor, ir: IR): void {
  // 收集本轮所有视口、所有节点期望存在的形状 id
  const wantedIds = new Set<string>()
  const toCreate: IrNodeShape[] = []
  const toUpdate: { id: TLShapeId; type: 'ir-node'; x: number; y: number; index?: IndexKey; props: Partial<IrNodeShape['props']> }[] = []
  // 按「视口×DFS」顺序记录 shapeId，用于回写 tldraw 的 z 序(index)——
  // 否则拖拽重新父子化后被移动形状保留旧 index、z 序过期 → 子元素被新父盖住(canvas≠预览)。
  const orderedSids: TLShapeId[] = []

  // 现存的 ir-node 形状（跨全部视口）
  const existing = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'ir-node') as IrNodeShape[]
  const existingById = new Map(existing.map((s) => [s.id, s]))

  // 逐视口：变换 → 布局 → 排进创建/更新队列
  VIEWPORTS.forEach((vp, vpIndex) => {
    const vpIr = responsiveCorrect(ir, vp.width) // 该视口应呈现的 IR（含布局后溢出纠正）
    const origin = { x: originXFor(vpIndex), y: ARTBOARD_ORIGIN.y } // 该画板左上角
    const layout = layoutIR(vpIr, { rootWidth: vp.width, origin }) // 视口宽驱动布局
    if (vp.name === MAIN_VIEWPORT) currentLayout = layout // 仅缓存主视口供 reorder 命中

    // 用变换后 IR 的结构展平（R1 可能改 direction，但 childIds 不变 → 用基线即可；这里用 vpIr 保持一致）
    for (const { id: nodeId, depth } of dfsOrder(vpIr)) {
      const r = layout.get(nodeId)!
      const sid = shapeIdFor(vp.name, nodeId)
      wantedIds.add(sid)
      orderedSids.push(sid) // 记录 DFS 顺序 → 稍后据此设 index(z序)
      const prev = existingById.get(sid)
      if (!prev) {
        toCreate.push({
          id: sid,
          type: 'ir-node',
          x: r.x,
          y: r.y,
          props: { w: r.w, h: r.h, nodeId, depth, viewport: vp.name },
        } as IrNodeShape)
      } else {
        toUpdate.push({ id: sid, type: 'ir-node', x: r.x, y: r.y, props: { w: r.w, h: r.h, depth } })
      }
    }
  })

  // 据 DFS 顺序回写 z 序 index：所有 ir-node 都是 page 级平铺形状，全局递增 index 即正确 z（父在后/子在前）。
  // 每次 sync 都重设 → 拖拽重新父子化后 z 序也跟着纠正，不再出现子元素被新父盖住。
  const indices = getIndices(orderedSids.length) // 返回 n+1 个严格递增 key，取前 n 个
  const indexBySid = new Map<TLShapeId, IndexKey>()
  orderedSids.forEach((sid, i) => indexBySid.set(sid, indices[i]))
  for (const s of toCreate) s.index = indexBySid.get(s.id)!
  for (const u of toUpdate) u.index = indexBySid.get(u.id)!

  // 删除 IR/视口里已不存在的形状（含被删节点在三视口的所有形状）
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
