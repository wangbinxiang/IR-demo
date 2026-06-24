import type { DSLNode } from '../compiler/dsl'
import { useIRStore } from '../ir/store'
import type { NodeType } from '../ir/types'
import { isContainer } from '../ir/types'
import { shapeIdFor } from '../canvas/sync'
import { MAIN_VIEWPORT } from '../layout/responsive'
import { useSelection } from './selection'

// 手动添加元素的默认模板（无 id 的 DSL，编译器会分配 id）
const TEMPLATES: Record<NodeType, DSLNode> = {
  text: { type: 'text', text: '文本', fontSize: 16, color: '#18181b' },
  button: { type: 'button', text: '按钮', width: 120, height: 44, fill: '#4f46e5', color: '#ffffff', radius: 8, fontSize: 14, fontWeight: 600 },
  input: { type: 'input', placeholder: '输入框', width: 'fill', height: 44, fill: '#ffffff', borderColor: '#d4d4d8', borderWidth: 1, radius: 8, fontSize: 14, color: '#71717a' },
  image: { type: 'image', width: 120, height: 120, fill: '#e4e4e7', radius: 8 },
  frame: { type: 'frame', direction: 'col', gap: 8, padding: 16, width: 240, height: 160, fill: '#ffffff', borderColor: '#e4e4e7', borderWidth: 1, radius: 12 },
  box: { type: 'box', direction: 'row', gap: 8, padding: 8, width: 'fill', height: 'hug' },
}

// 添加一个元素。落点规则（类 Figma）：
//  - 选中容器 → 作为其末尾子节点
//  - 选中叶子 → 作为其同级、紧随其后
//  - 未选中 → 根的末尾
// 返回新节点 id（已自动选中）。
export function addElement(type: NodeType): string | null {
  const { ir, applyOps } = useIRStore.getState()
  const selId = useSelection.getState().selectedId

  let parentId = ir.rootId
  let index = ir.nodes[ir.rootId].childIds.length
  if (selId && ir.nodes[selId]) {
    const sel = ir.nodes[selId]
    if (isContainer(sel)) {
      parentId = selId
      index = sel.childIds.length
    } else if (sel.parentId) {
      parentId = sel.parentId
      index = ir.nodes[sel.parentId].childIds.indexOf(selId) + 1
    }
  }

  const before = new Set(Object.keys(ir.nodes))
  applyOps([{ op: 'insert', parentId, index, node: TEMPLATES[type] }])

  // 找出新插入子树的根（新增且父为 parentId 的节点）
  const after = useIRStore.getState().ir
  const newId = Object.keys(after.nodes).find((id) => !before.has(id) && after.nodes[id].parentId === parentId)
  if (newId) {
    // 等同步把形状建出来后选中它（驱动样式面板）
    setTimeout(() => {
      const editor = (window as unknown as { __editor?: { select: (id: unknown) => void } }).__editor
      editor?.select(shapeIdFor(MAIN_VIEWPORT, newId))
    }, 80)
  }
  return newId ?? null
}
