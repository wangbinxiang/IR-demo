import { useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from 'tldraw'
import type { IRNode } from '../ir/types'
import { useIRStore } from '../ir/store'
import { resolveDrop } from './reorder'
import { getCurrentLayout } from './sync'
import { insertionLine, useDragIndicator } from './indicator'
import { MAIN_VIEWPORT } from '../layout/responsive'
import { LINE_HEIGHT_RATIO } from '../layout/yoga'
import { shadowCSS, BUTTON_PAD_X, BUTTON_PAD_Y } from '../ir/style-presets'

// tldraw 形状类型：每个 IR 节点 × 每个视口对应一个。props 里只放渲染所需的派生数据
// （w/h 由布局算出，nodeId 指回 IR，viewport 标明所属画板），事实来源仍是 IR store。
export type IrNodeShape = TLBaseShape<
  'ir-node',
  { w: number; h: number; nodeId: string; depth: number; viewport: string }
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
    lineHeight: LINE_HEIGHT_RATIO, // 与 yoga 测量/HTML 导出统一行高，折行高度才一致
    boxShadow: shadowCSS(s.shadow), // 阴影预设，与 HTML 导出一致
  }
  return base
}

export class IrNodeShapeUtil extends BaseBoxShapeUtil<IrNodeShape> {
  static override type = 'ir-node' as const

  override getDefaultProps(): IrNodeShape['props'] {
    return { w: 100, h: 40, nodeId: '', depth: 0, viewport: MAIN_VIEWPORT }
  }

  // 缩放仅主视口可用（tldraw 无 canMove；移动只读由 onTranslate/End 守卫 + 吸附回位实现）。
  // 非主视口仍可点选 → 样式面板/AI 编辑（编辑的是同一 IR 节点）。
  override canResize = (shape: IrNodeShape) => shape.props.viewport === MAIN_VIEWPORT
  override canBind = () => false

  override component(shape: IrNodeShape) {
    // 直接从 IR store 读节点定义来渲染（派生视图）
    const node = useIRStore((st) => st.ir.nodes[shape.props.nodeId])
    // 图片加载失败标记 → 切回占位（hook 必须在任何 return 之前，保证调用顺序稳定）
    const [imgError, setImgError] = useState(false)
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
        // 有 src 且未失败 → 渲染真图（object-fit:cover 与 HTML 导出一致，不变形）
        // 容器自带 overflow:hidden + borderRadius，负责圆角裁切
        if (node.props.src && !imgError) {
          inner = (
            <img
              src={node.props.src}
              alt=""
              onError={() => setImgError(true)} // 加载失败 → 切回占位
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )
        } else if (node.props.src) {
          // 有 src 但加载失败：用 🖼 兜底，避免浏览器原生裂图
          inner = <span style={{ opacity: 0.5 }}>🖼</span>
        }
        // 无 src → inner 保持 null，露出节点背景盒（对齐预览的空 <div>）
        break
      // frame / box 是容器：只画背景，不放文字
    }

    const isLeaf = node.type !== 'frame' && node.type !== 'box'
    const isText = node.type === 'text'
    const flexCenter: React.CSSProperties =
      node.type === 'button'
        ? { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${BUTTON_PAD_Y}px ${BUTTON_PAD_X}px` }
        : node.type === 'input'
          ? { display: 'flex', alignItems: 'center', padding: '0 12px' }
          : {} // text 不用 flex 居中：按块级文本自然从上往下排，和 CSS 块级 div 一致

    return (
      <HTMLContainer
        style={{
          ...style,
          ...flexCenter,
          // 容器背景不应拦截对子形状的点击；叶子可交互
          pointerEvents: isLeaf ? 'all' : 'none',
          // 文本：允许折行（与 yoga measure / CSS 块级一致）；其余单行不折
          whiteSpace: isText ? 'normal' : 'nowrap',
          overflowWrap: isText ? 'break-word' : undefined,
          wordBreak: isText ? 'break-word' : undefined,
          overflow: isText ? 'visible' : 'hidden', // 文本不裁切（高度已按折行算准）
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
    if (current.props.viewport !== MAIN_VIEWPORT) return // 只读视口不参与重排
    const { ir } = useIRStore.getState()
    const layout = getCurrentLayout()
    if (!layout) return
    const point = { x: current.x + current.props.w / 2, y: current.y + current.props.h / 2 }
    const target = resolveDrop(ir, layout, current.props.nodeId, point)
    useDragIndicator.getState().set(target ? insertionLine(ir, layout, current.props.nodeId, target) : null)
  }

  // —— 核心：自由拖拽 → 解释成 auto-layout 重排序 ——
  override onTranslateEnd(_initial: IrNodeShape, current: IrNodeShape) {
    if (current.props.viewport !== MAIN_VIEWPORT) {
      // 只读视口：不重排，bump 一次触发 relayout 让被拖形状吸附回原位
      useIRStore.setState((st) => ({ version: st.version + 1 }))
      return
    }
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
