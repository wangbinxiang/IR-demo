import { useState, type CSSProperties } from 'react'
import { useIRStore } from '../ir/store'
import type { IRNode, NodeId, NodeType } from '../ir/types'
import { isContainer } from '../ir/types'
import { shapeIdFor } from '../canvas/sync'
import { useSelection } from './selection'

// 左侧图层结构树（类 Figma）：
//  - 反映 IR 层级，缩进 + 折叠
//  - 点击图层 → 选中画布对应形状（经选中监听回写 useSelection，双向联动）
//  - 画布选中 → 对应图层高亮
const ICON: Record<NodeType, string> = {
  frame: '▤',
  box: '▢',
  text: 'T',
  button: '⬭',
  input: '▭',
  image: '🖼',
}

// 图层显示名：有文案/占位符就用内容，否则用类型
function labelOf(n: IRNode): string {
  if (n.props.text) return n.props.text
  if (n.props.placeholder) return n.props.placeholder
  return n.type
}

export function LayersPanel() {
  const ir = useIRStore((s) => s.ir)
  useIRStore((s) => s.version) // 订阅变更
  const selectedId = useSelection((s) => s.selectedId)
  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set())

  const toggle = (id: NodeId) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // 点击图层 → 选中画布形状（触发选中监听更新 useSelection）
  const selectNode = (id: NodeId) => {
    const editor = (window as unknown as { __editor?: { select: (id: unknown) => void } }).__editor
    editor?.select(shapeIdFor(id))
  }

  const renderRow = (id: NodeId, depth: number): React.ReactNode => {
    const node = ir.nodes[id]
    if (!node) return null
    const hasChildren = isContainer(node) && node.childIds.length > 0
    const isCollapsed = collapsed.has(id)
    const selected = selectedId === id
    return (
      <div key={id}>
        <div
          data-node-id={id}
          style={row(selected)}
          onClick={() => selectNode(id)}
          onMouseEnter={(e) => !selected && (e.currentTarget.style.background = '#f4f4f5')}
          onMouseLeave={(e) => !selected && (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ width: depth * 14, flexShrink: 0 }} />
          {hasChildren ? (
            <span
              style={chevron}
              onClick={(e) => {
                e.stopPropagation()
                toggle(id)
              }}
            >
              {isCollapsed ? '▸' : '▾'}
            </span>
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}
          <span style={icon}>{ICON[node.type]}</span>
          <span style={label}>{labelOf(node)}</span>
        </div>
        {hasChildren && !isCollapsed && node.childIds.map((c) => renderRow(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={panel} data-panel="layers">
      <div style={head}>图层</div>
      <div style={body}>{renderRow(ir.rootId, 0)}</div>
    </div>
  )
}

const panel: CSSProperties = {
  position: 'absolute',
  top: 56,
  left: 8,
  bottom: 76,
  width: 224,
  zIndex: 998,
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: 12,
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, sans-serif',
  overflow: 'hidden',
}
const head: CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #f0f0f0',
  fontSize: 12,
  fontWeight: 700,
  color: '#a1a1aa',
  textTransform: 'uppercase',
}
const body: CSSProperties = { padding: 4, overflowY: 'auto', flex: 1 }
const row = (selected: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  height: 28,
  padding: '0 6px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  background: selected ? '#eef2ff' : 'transparent',
  color: selected ? '#4f46e5' : '#3f3f46',
})
const chevron: CSSProperties = { width: 14, flexShrink: 0, fontSize: 10, color: '#a1a1aa', textAlign: 'center' }
const icon: CSSProperties = { width: 18, flexShrink: 0, textAlign: 'center', fontSize: 12, opacity: 0.7 }
const label: CSSProperties = { marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
