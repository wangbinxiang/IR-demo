import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from 'tldraw'
import type { IRNode } from '../ir/types'
import { useIRStore } from '../ir/store'
import { resolveDrop } from './reorder'
import { getCurrentLayout } from './sync'
import { insertionLine, useDragIndicator } from './indicator'

// tldraw 形状类型：每个 IR 节点对应一个。props 里只放渲染所需的派生数据
// （w/h 由布局算出，nodeId 指回 IR），事实来源仍是 IR store。
export type IrNodeShape = TLBaseShape<
  'ir-node',
  { w: number; h: number; nodeId: string; depth: number }
>

// 根据 IR 节点类型渲染真实 DOM —— 「画布所见 ≈ HTML emitter 产物」
function renderNode(node: IRNode): React.CSSProperties & { content?: string } {
  const s = node.style
  const base: React.CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    borderRadius: s.radius,
    background: s.fill,
    border: s.borderWidth ? `${s.borderWidth}px solid ${s.borderColor ?? '#000'}` : undefined,
    color: s.color,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight as React.CSSProperties['fontWeight'],
  }
  return base
}

export class IrNodeShapeUtil extends BaseBoxShapeUtil<IrNodeShape> {
  static override type = 'ir-node' as const

  override getDefaultProps(): IrNodeShape['props'] {
    return { w: 100, h: 40, nodeId: '', depth: 0 }
  }

  // 容器允许被点选但其背景不拦截子节点的命中（pointerEvents 在 component 里控制）
  override canResize = () => true
  override canBind = () => false

  override component(shape: IrNodeShape) {
    // 直接从 IR store 读节点定义来渲染（派生视图）
    const node = useIRStore((st) => st.ir.nodes[shape.props.nodeId])
    if (!node) return null
    const style = renderNode(node)

    let inner: React.ReactNode = null
    switch (node.type) {
      case 'text':
        inner = <span>{node.props.text}</span>
        break
      case 'button':
        inner = <span>{node.props.text}</span>
        break
      case 'input':
        inner = <span style={{ opacity: 0.7 }}>{node.props.placeholder}</span>
        break
      case 'image':
        inner = <span style={{ opacity: 0.5 }}>🖼</span>
        break
      // frame / box 是容器：只画背景，不放文字
    }

    const isLeaf = node.type !== 'frame' && node.type !== 'box'
    const flexCenter: React.CSSProperties =
      node.type === 'button'
        ? { display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : node.type === 'input'
          ? { display: 'flex', alignItems: 'center', padding: '0 12px' }
          : node.type === 'text'
            ? { display: 'flex', alignItems: 'center' }
            : {}

    return (
      <HTMLContainer
        style={{
          ...style,
          ...flexCenter,
          // 容器背景不应拦截对子形状的点击；叶子可交互
          pointerEvents: isLeaf ? 'all' : 'none',
          overflow: 'hidden',
          whiteSpace: 'nowrap', // hug 文本是单行，禁止折行裁切
          fontFamily: 'system-ui, sans-serif',
          userSelect: 'none',
        }}
      >
        {inner}
      </HTMLContainer>
    )
  }

  override indicator(shape: IrNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />
  }

  // —— 拖拽过程中：实时计算落点并画插入指示线（Figma 手感）——
  override onTranslate(_initial: IrNodeShape, current: IrNodeShape) {
    const { ir } = useIRStore.getState()
    const layout = getCurrentLayout()
    if (!layout) return
    const point = { x: current.x + current.props.w / 2, y: current.y + current.props.h / 2 }
    const target = resolveDrop(ir, layout, current.props.nodeId, point)
    useDragIndicator.getState().set(target ? insertionLine(ir, layout, current.props.nodeId, target) : null)
  }

  // —— 核心：自由拖拽 → 解释成 auto-layout 重排序 ——
  override onTranslateEnd(_initial: IrNodeShape, current: IrNodeShape) {
    useDragIndicator.getState().set(null) // 收起指示线
    const { ir, moveNode } = useIRStore.getState()
    const layout = getCurrentLayout()
    if (!layout) return
    // 落点取被拖形状的中心
    const point = { x: current.x + current.props.w / 2, y: current.y + current.props.h / 2 }
    const target = resolveDrop(ir, layout, current.props.nodeId, point)
    if (target) {
      // 改 IR → 触发 relayout → 形状吸附到算出的槽位（Figma auto-layout 手感）
      moveNode(current.props.nodeId, target.parentId, target.index)
    } else {
      // 没落到任何合法容器：bump 一次让它弹回原位
      useIRStore.setState((st) => ({ version: st.version + 1 }))
    }
  }

  // —— 拖缩放手柄 → 把该节点尺寸固定为像素值（Hug/Fill → Fixed）——
  override onResizeEnd(_initial: IrNodeShape, current: IrNodeShape) {
    const { setSizing } = useIRStore.getState()
    setSizing(current.props.nodeId, 'width', { mode: 'fixed', value: Math.round(current.props.w) })
    setSizing(current.props.nodeId, 'height', { mode: 'fixed', value: Math.round(current.props.h) })
  }
}
