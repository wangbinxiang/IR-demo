import type { IR, IRNode, NodeId, Sizing } from '../ir/types'
import { isContainer } from '../ir/types'

// ============================================================================
// 确定性代码生成：IR → HTML/CSS。
// 是「验证 IR」的另一半——证明 IR 不只是能渲染，还够格当事实来源编译出代码。
// CSS 用 flexbox 镜像 yoga 的 auto-layout 语义，与画布所见一致。
// ============================================================================

const ALIGN_CSS = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const JUSTIFY_CSS = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
}

// HTML 文本转义
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 把尺寸三态翻成 CSS 声明（fill 需结合父轴方向：主轴→flex-grow，交叉轴→align-self:stretch）
function sizingCSS(sizing: Sizing, axis: 'w' | 'h', parentDir: 'row' | 'col'): string[] {
  const out: string[] = []
  const prop = axis === 'w' ? 'width' : 'height'
  const isMainAxis = (axis === 'w' && parentDir === 'row') || (axis === 'h' && parentDir === 'col')
  if (sizing.mode === 'fixed') {
    out.push(`${prop}: ${sizing.value}px`)
  } else if (sizing.mode === 'fill') {
    if (isMainAxis) {
      out.push('flex: 1 1 0') // 主轴填充：抢占剩余空间
    } else {
      out.push('align-self: stretch') // 交叉轴填充：占满父内容区
    }
  }
  // hug：交给默认（内容尺寸）
  return out
}

// 收集单个节点的 CSS 声明
function nodeCSS(ir: IR, node: IRNode): string[] {
  const decls: string[] = ['box-sizing: border-box']
  const parentDir = node.parentId ? (ir.nodes[node.parentId].layout?.direction ?? 'col') : 'col'

  decls.push(...sizingCSS(node.width, 'w', parentDir))
  decls.push(...sizingCSS(node.height, 'h', parentDir))

  if (isContainer(node) && node.layout) {
    const L = node.layout
    decls.push('display: flex')
    decls.push(`flex-direction: ${L.direction === 'row' ? 'row' : 'column'}`)
    if (L.gap) decls.push(`gap: ${L.gap}px`)
    if (L.padding) decls.push(`padding: ${L.padding}px`)
    decls.push(`align-items: ${ALIGN_CSS[L.align]}`)
    decls.push(`justify-content: ${JUSTIFY_CSS[L.justify]}`)
  } else if (node.type === 'button' || node.type === 'input') {
    // 让按钮/输入框内容居中/对齐，与画布渲染一致
    decls.push('display: flex', 'align-items: center')
    decls.push(node.type === 'button' ? 'justify-content: center' : 'padding-left: 12px')
  }

  const s = node.style
  if (s.fill) decls.push(`background: ${s.fill}`)
  if (s.color) decls.push(`color: ${s.color}`)
  if (s.borderWidth && s.borderColor) decls.push(`border: ${s.borderWidth}px solid ${s.borderColor}`)
  if (s.radius) decls.push(`border-radius: ${s.radius}px`)
  if (s.fontSize) decls.push(`font-size: ${s.fontSize}px`)
  if (s.fontWeight) decls.push(`font-weight: ${s.fontWeight}`)
  return decls
}

// 节点 → 对应 HTML 标签 + 内容
function nodeHTML(node: IRNode, childrenHTML: string, indent: string): string {
  const cls = node.id
  switch (node.type) {
    case 'text':
      return `${indent}<div class="${cls}">${esc(node.props.text ?? '')}</div>`
    case 'button':
      return `${indent}<button class="${cls}">${esc(node.props.text ?? '')}</button>`
    case 'input':
      return `${indent}<input class="${cls}" placeholder="${esc(node.props.placeholder ?? '')}" />`
    case 'image':
      return node.props.src
        ? `${indent}<img class="${cls}" src="${esc(node.props.src)}" alt="" />`
        : `${indent}<div class="${cls}"></div>`
    default: // frame / box
      return childrenHTML
        ? `${indent}<div class="${cls}">\n${childrenHTML}\n${indent}</div>`
        : `${indent}<div class="${cls}"></div>`
  }
}

// 主入口：IR → 完整可预览的 HTML 文档
export function emitHTML(ir: IR): string {
  const cssRules: string[] = []
  const buildNode = (id: NodeId, depth: number): string => {
    const node = ir.nodes[id]
    cssRules.push(`.${node.id} {\n  ${nodeCSS(ir, node).join(';\n  ')};\n}`)
    const indent = '  '.repeat(depth + 2)
    let childrenHTML = ''
    if (isContainer(node) && node.childIds.length) {
      childrenHTML = node.childIds.map((cid) => buildNode(cid, depth + 1)).join('\n')
    }
    return nodeHTML(node, childrenHTML, indent)
  }
  const bodyHTML = buildNode(ir.rootId, 0)

  return `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { margin: 0; }
    body { font-family: system-ui, sans-serif; background: #fafafa; padding: 24px; }
    button, input { font: inherit; border: none; outline: none; cursor: pointer; }
    input { cursor: text; }
${cssRules.map((r) => '    ' + r.replace(/\n/g, '\n    ')).join('\n')}
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`
}
