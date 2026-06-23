import { create } from 'zustand'
import type { IR, NodeId, Sizing } from './types'
import { sampleIR } from './sample'
import { applyOps as applyOpsToIR, type Op } from './ops'

// ============================================================================
// 统一 mutation 层。
// 关键架构点：画布交互（拖/缩/面板）和未来的 AI op-patch 都只通过这里改 IR。
// 每次改动 bump `version`，下游（布局→画布同步）据此重算重绘。撤销重做将来挂在这层。
// ============================================================================

interface IRState {
  ir: IR
  version: number // 单调递增，作为「IR 已变更」的信号
  // op：把 nodeId 移动到 newParentId 的 index 位置（重排序 / 跨容器移动）
  moveNode: (nodeId: NodeId, newParentId: NodeId, index: number) => void
  // op：设置某节点某方向的尺寸（拖缩放手柄 → Fixed；面板切 Hug/Fill）
  setSizing: (nodeId: NodeId, axis: 'width' | 'height', sizing: Sizing) => void
  // 整份替换 IR（AI 生成结果载入画布）
  loadIR: (ir: IR) => void
  // 套用一组编辑操作（AI 改图结果；与画布交互共用同一 mutation 层）
  applyOps: (ops: Op[]) => void
}

// 判断 maybeAncestor 是否是 node 的祖先（含自身）——用于阻止把节点拖进自己的子树
function isAncestor(ir: IR, maybeAncestor: NodeId, node: NodeId): boolean {
  let cur: NodeId | null = node
  while (cur) {
    if (cur === maybeAncestor) return true
    cur = ir.nodes[cur]?.parentId ?? null
  }
  return false
}

export const useIRStore = create<IRState>((set) => ({
  ir: sampleIR,
  version: 0,

  moveNode: (nodeId, newParentId, index) =>
    set((state) => {
      const ir = state.ir
      const node = ir.nodes[nodeId]
      const newParent = ir.nodes[newParentId]
      if (!node || !newParent) return state
      // 守卫：不能移动根、不能把节点放进它自己的子树（会成环）
      if (nodeId === ir.rootId) return state
      if (isAncestor(ir, nodeId, newParentId)) return state

      // 浅拷贝受影响的节点（保持其余引用不变，利于将来做 diff）
      const nodes = { ...ir.nodes }
      const oldParentId = node.parentId
      if (oldParentId) {
        const oldParent = nodes[oldParentId]
        nodes[oldParentId] = {
          ...oldParent,
          childIds: oldParent.childIds.filter((id) => id !== nodeId),
        }
      }
      // 若同父移动，先在已移除的数组上重新插入；否则在新父数组插入
      const targetChildIds = [...(nodes[newParentId].childIds.filter((id) => id !== nodeId))]
      const clamped = Math.max(0, Math.min(index, targetChildIds.length))
      targetChildIds.splice(clamped, 0, nodeId)
      nodes[newParentId] = { ...nodes[newParentId], childIds: targetChildIds }
      nodes[nodeId] = { ...node, parentId: newParentId }

      return { ir: { ...ir, nodes }, version: state.version + 1 }
    }),

  setSizing: (nodeId, axis, sizing) =>
    set((state) => {
      const node = state.ir.nodes[nodeId]
      if (!node) return state
      const nodes = { ...state.ir.nodes, [nodeId]: { ...node, [axis]: sizing } }
      return { ir: { ...state.ir, nodes }, version: state.version + 1 }
    }),

  loadIR: (ir) => set((state) => ({ ir, version: state.version + 1 })),

  applyOps: (ops) =>
    set((state) => ({ ir: applyOpsToIR(state.ir, ops), version: state.version + 1 })),
}))

// 调试钩子：供 e2e 测试读取/驱动 IR
if (typeof window !== 'undefined') (window as unknown as { __irStore: typeof useIRStore }).__irStore = useIRStore
