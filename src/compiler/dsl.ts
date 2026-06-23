import type { IR, IRNode, NodeId, NodeType, Sizing, StyleProps } from '../ir/types'

// ============================================================================
// 紧凑 DSL（AI 产出的格式）→ 确定性编译器 → 扁平规范 IR。
// DSL 无 ID、嵌套、字段可省；编译器负责：分配稳定 ID、规范化、补默认值。
// 核心 walk 抽成 compileTree，供整图生成与 insert op 复用（ID 由外部生成器控制）。
// ============================================================================

// DSL 节点：宽松形状（AI 可能省略任意字段）
export interface DSLNode {
  type: NodeType
  direction?: 'row' | 'col'
  gap?: number
  padding?: number
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between'
  children?: DSLNode[]
  width?: 'hug' | 'fill' | number
  height?: 'hug' | 'fill' | number
  fill?: string
  color?: string
  borderColor?: string
  borderWidth?: number
  radius?: number
  fontSize?: number
  fontWeight?: number
  text?: string
  placeholder?: string
  src?: string
  // 容错：AI 有时会把样式嵌套在 style:{} 里（受 setStyle op 影响），也接受
  style?: StyleProps
}

const CONTAINER_TYPES = new Set<NodeType>(['frame', 'box'])

// DSL 尺寸值（字符串/数字）→ IR Sizing 三态
export function parseSizing(v: DSLNode['width'], fallback: Sizing = { mode: 'hug' }): Sizing {
  if (v === undefined) return fallback
  if (v === 'hug') return { mode: 'hug' }
  if (v === 'fill') return { mode: 'fill' }
  if (typeof v === 'number' && v > 0) return { mode: 'fixed', value: v }
  return fallback
}

function toStyle(n: DSLNode): StyleProps {
  // 先取嵌套 style（若有），再让顶层字段覆盖——两种写法都兼容
  const s: StyleProps = { ...(n.style ?? {}) }
  if (n.fill !== undefined) s.fill = n.fill
  if (n.color !== undefined) s.color = n.color
  if (n.borderColor !== undefined) s.borderColor = n.borderColor
  if (n.borderWidth !== undefined) s.borderWidth = n.borderWidth
  if (n.radius !== undefined) s.radius = n.radius
  if (n.fontSize !== undefined) s.fontSize = n.fontSize
  if (n.fontWeight !== undefined) s.fontWeight = n.fontWeight
  return s
}

// 可复用的核心：DSL 子树 → 节点集合。ID 由传入的 nextId 生成器决定。
export function compileTree(
  dsl: DSLNode,
  parentId: NodeId | null,
  nextId: () => string,
): { rootId: NodeId; nodes: Record<string, IRNode> } {
  const nodes: Record<string, IRNode> = {}

  const walk = (d: DSLNode, pid: string | null): string => {
    const id = nextId()
    const type: NodeType = d.type ?? 'box'
    const isContainer = CONTAINER_TYPES.has(type)
    const node: IRNode = {
      id,
      type,
      parentId: pid,
      childIds: [],
      width: parseSizing(d.width),
      height: parseSizing(d.height),
      style: toStyle(d),
      props: {
        ...(d.text !== undefined ? { text: d.text } : {}),
        ...(d.placeholder !== undefined ? { placeholder: d.placeholder } : {}),
        ...(d.src !== undefined ? { src: d.src } : {}),
      },
    }
    if (isContainer) {
      node.layout = {
        direction: d.direction ?? 'col',
        gap: d.gap ?? 0,
        padding: d.padding ?? 0,
        align: d.align ?? 'stretch',
        justify: d.justify ?? 'start',
      }
    }
    nodes[id] = node
    if (isContainer && d.children) node.childIds = d.children.map((c) => walk(c, id))
    return id
  }

  const rootId = walk(dsl, parentId)
  return { rootId, nodes }
}

// 整图编译入口：DSL 树 → IR（用递增 ID n1,n2,…）
export function compileDSL(root: DSLNode): IR {
  let counter = 0
  const nextId = () => `n${++counter}`
  // 根若不是容器，包一层 frame 兜底
  const rootDSL: DSLNode = CONTAINER_TYPES.has(root.type)
    ? root
    : { type: 'frame', direction: 'col', padding: 24, children: [root] }
  const { rootId, nodes } = compileTree(rootDSL, null, nextId)
  return { rootId, nodes }
}
