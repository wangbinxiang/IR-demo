import type { IR, IRNode, LayoutProps, NodeId, StyleProps } from './types'
import { isContainer } from './types'
import { compileTree, parseSizing, type DSLNode } from '../compiler/dsl'

// ============================================================================
// 编辑操作（op）—— AI 改图与画布交互共用的同一套 mutation 词汇。
// AI 拿到带 ID 的 IR 概览，返回 Op[]；applyOps 套用，未改动节点的 ID 原样保留。
// ============================================================================

export type Op =
  | { op: 'setStyle'; id: NodeId; style: Partial<StyleProps> }
  | { op: 'setProps'; id: NodeId; props: { text?: string; placeholder?: string; src?: string } }
  | { op: 'setLayout'; id: NodeId; layout: Partial<LayoutProps> }
  | { op: 'setSizing'; id: NodeId; axis: 'width' | 'height'; value: 'hug' | 'fill' | number }
  | { op: 'insert'; parentId: NodeId; index: number; node: DSLNode }
  | { op: 'remove'; id: NodeId }
  | { op: 'move'; id: NodeId; parentId: NodeId; index: number }

// —— IR → 带 ID 的紧凑概览（喂给 AI，让它知道有哪些节点、ID 是什么、当前值）——
export function outlineIR(ir: IR): string {
  const lines: string[] = []
  const sz = (s: IRNode['width']) => (s.mode === 'fixed' ? s.value : s.mode)
  const walk = (id: NodeId, depth: number) => {
    const n = ir.nodes[id]
    const parts = [`#${id}`, n.type]
    if (isContainer(n) && n.layout) {
      const L = n.layout
      parts.push(`${L.direction} gap:${L.gap} pad:${L.padding} align:${L.align} justify:${L.justify}`)
    }
    parts.push(`w:${sz(n.width)} h:${sz(n.height)}`)
    if (n.props.text) parts.push(`text:"${n.props.text}"`)
    if (n.props.placeholder) parts.push(`ph:"${n.props.placeholder}"`)
    const st = n.style
    const stPairs = Object.entries(st).map(([k, v]) => `${k}:${v}`)
    if (stPairs.length) parts.push(`{${stPairs.join(' ')}}`)
    lines.push('  '.repeat(depth) + parts.join(' '))
    if (isContainer(n)) n.childIds.forEach((c) => walk(c, depth + 1))
  }
  walk(ir.rootId, 0)
  return lines.join('\n')
}

// 收集子树所有 id（含自身）
function subtreeIds(nodes: Record<string, IRNode>, id: NodeId, acc: NodeId[] = []): NodeId[] {
  acc.push(id)
  for (const c of nodes[id]?.childIds ?? []) subtreeIds(nodes, c, acc)
  return acc
}

// 生成不与现有 ID 冲突的新 ID（用 'g' 前缀 + 去重保证）
function makeIdGen(existing: Set<string>): () => string {
  let k = 0
  return () => {
    let id: string
    do {
      id = `g${k++}`
    } while (existing.has(id))
    existing.add(id)
    return id
  }
}

// —— 套用一组 op，返回新 IR（纯函数，逐 op 在工作副本上修改）——
export function applyOps(ir: IR, ops: Op[]): IR {
  const nodes: Record<string, IRNode> = { ...ir.nodes }
  const rootId = ir.rootId

  // 把 child 从其父的 childIds 中移除
  const detach = (id: NodeId) => {
    const pid = nodes[id]?.parentId
    if (pid && nodes[pid]) {
      nodes[pid] = { ...nodes[pid], childIds: nodes[pid].childIds.filter((c) => c !== id) }
    }
  }
  // 把 child 插入父的 childIds 指定位置
  const attach = (id: NodeId, parentId: NodeId, index: number) => {
    const arr = nodes[parentId].childIds.filter((c) => c !== id)
    const i = Math.max(0, Math.min(index, arr.length))
    arr.splice(i, 0, id)
    nodes[parentId] = { ...nodes[parentId], childIds: arr }
  }

  for (const op of ops) {
    switch (op.op) {
      case 'setStyle': {
        const n = nodes[op.id]
        if (n) nodes[op.id] = { ...n, style: { ...n.style, ...op.style } }
        break
      }
      case 'setProps': {
        const n = nodes[op.id]
        if (n) nodes[op.id] = { ...n, props: { ...n.props, ...op.props } }
        break
      }
      case 'setLayout': {
        const n = nodes[op.id]
        if (n && isContainer(n)) {
          const base = n.layout ?? { direction: 'col', gap: 0, padding: 0, align: 'stretch', justify: 'start' }
          nodes[op.id] = { ...n, layout: { ...base, ...op.layout } }
        }
        break
      }
      case 'setSizing': {
        const n = nodes[op.id]
        if (n) nodes[op.id] = { ...n, [op.axis]: parseSizing(op.value) }
        break
      }
      case 'remove': {
        if (op.id === rootId || !nodes[op.id]) break
        detach(op.id)
        for (const sid of subtreeIds(nodes, op.id)) delete nodes[sid]
        break
      }
      case 'move': {
        const n = nodes[op.id]
        if (!n || op.id === rootId || !nodes[op.parentId]) break
        // 守卫：不能移进自己的子树
        if (subtreeIds(nodes, op.id).includes(op.parentId)) break
        detach(op.id)
        attach(op.id, op.parentId, op.index)
        nodes[op.id] = { ...nodes[op.id], parentId: op.parentId }
        break
      }
      case 'insert': {
        if (!nodes[op.parentId]) break
        const idGen = makeIdGen(new Set(Object.keys(nodes)))
        const sub = compileTree(op.node, op.parentId, idGen)
        Object.assign(nodes, sub.nodes)
        attach(sub.rootId, op.parentId, op.index)
        break
      }
    }
  }
  return { rootId, nodes }
}
