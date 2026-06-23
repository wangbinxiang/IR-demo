// ============================================================================
// Design IR —— 系统的「事实来源」
// 决策：扁平规范化表 + 稳定 ID（见设计共识）。位置/几何全部由布局引擎派生，
// 不存进 IR；IR 只描述「结构 + 意图」。
// ============================================================================

export type NodeId = string // 稳定字符串 ID，AI 改图时必须保留

// 尺寸三态：对应 Figma 的 Hug / Fill / Fixed，可干净映射到 CSS
export type Sizing =
  | { mode: 'hug' } // 包裹内容   → width:auto / fit-content
  | { mode: 'fill' } // 填满父级   → flex:1 / 100%
  | { mode: 'fixed'; value: number } // 固定像素 → width:Npx

// 容器的 auto-layout 配置（flex 语义）
export interface LayoutProps {
  direction: 'row' | 'col' // 主轴方向
  gap: number // 子元素间距
  padding: number // 内边距（四向统一，切片够用）
  align: 'start' | 'center' | 'end' | 'stretch' // 交叉轴对齐
  justify: 'start' | 'center' | 'end' | 'between' // 主轴对齐
}

// 视觉样式。Token 感知但不强制：值可为裸值或 { token } 引用（切片先用裸值）
export interface StyleProps {
  fill?: string // 背景色
  color?: string // 文字色
  borderColor?: string // 边框色
  borderWidth?: number // 边框宽
  radius?: number // 圆角
  fontSize?: number // 字号
  fontWeight?: number // 字重
}

// 节点类型：混合词汇——语义原子 + 通用 Box 逃生门
export type NodeType =
  | 'frame' // 语义容器（带 auto-layout）
  | 'text' // 文本
  | 'button' // 按钮
  | 'input' // 输入框
  | 'image' // 图片占位
  | 'box' // 通用容器逃生门（也带 auto-layout）

export interface IRNode {
  id: NodeId
  type: NodeType
  parentId: NodeId | null // 根节点为 null
  childIds: NodeId[] // 子节点顺序 = flex 顺序
  width: Sizing
  height: Sizing
  layout?: LayoutProps // 仅容器（frame/box）有
  style: StyleProps
  // 按类型的专属属性：text/button 的文案、input 的 placeholder、image 的 src
  props: { text?: string; placeholder?: string; src?: string }
}

// 扁平规范化文档
export interface IR {
  rootId: NodeId
  nodes: Record<NodeId, IRNode>
}

// 判断是否为容器（参与 auto-layout 排布子元素）
export function isContainer(node: IRNode): boolean {
  return node.type === 'frame' || node.type === 'box'
}
