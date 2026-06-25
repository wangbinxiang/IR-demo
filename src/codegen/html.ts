import type { IR, IRNode, NodeId, Sizing } from '../ir/types'
import { isContainer } from '../ir/types'
import { shadowCSS, BUTTON_PAD_X, BUTTON_PAD_Y } from '../ir/style-presets'
import { MAIN_WIDTH } from '../layout/responsive'
import { responsiveCorrect } from '../layout/responsiveCorrect'

// ============================================================================
// 确定性代码生成：IR → HTML/CSS。
// 是「验证 IR」的另一半——证明 IR 不只是能渲染，还够格当事实来源编译出代码。
// CSS 用 flexbox 镜像 yoga 的 auto-layout 语义，与画布所见一致。
// 响应式：base = 桌面布局；两个 @media 断点输出「相对基线变化的声明」（差异覆盖），
// 由与画布同一套 responsiveTransform 驱动，保证导出代码 = 画布预览。
// ============================================================================

// 导出断点：maxWidth 是 CSS @media 阈值（区间边界），viewportWidth 是该区间的采样宽（喂 transform）。
// 阈值取 Tailwind lg/sm 锚点，使桌面(1280)落 base、平板(768)落 1024 块、手机(375)落 640 块。
const RESPONSIVE_BREAKPOINTS = [
  { maxWidth: 1024, viewportWidth: 768 }, // tablet
  { maxWidth: 640, viewportWidth: 375 }, // mobile
]

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
    // 主轴上禁止收缩：CSS flex item 默认 flex-shrink:1 会把固定尺寸压小，
    // 而 yoga 默认 flexShrink:0 不压。显式置 0 与 yoga 对齐（固定即固定，宁可溢出也不压缩）→ canvas=code。
    if (isMainAxis) out.push('flex-shrink: 0')
  } else if (sizing.mode === 'fill') {
    if (isMainAxis) {
      out.push('flex: 1 1 0') // 主轴填充：抢占剩余空间（shrink 1，与 yoga setFlexShrink(1) 一致）
    } else {
      // 交叉轴填充：用 100% 而非 align-self:stretch——与 yoga(setWidthPercent) 机制一致，
      // 且不覆盖父 align（封顶后才能靠父 align:center 居中，保证 canvas=code）。
      out.push(axis === 'w' ? 'width: 100%' : 'height: 100%')
    }
    // fill 上限（仅宽度）：封顶到 max；居中由父 align 负责（cap-only）
    if (axis === 'w' && sizing.max !== undefined) out.push(`max-width: ${sizing.max}px`)
  } else if (isMainAxis) {
    // hug 在主轴：同样禁止收缩，与 yoga 默认对齐
    out.push('flex-shrink: 0')
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
    if (node.type === 'button') {
      // 按钮内部内边距：文字不贴底色边缘（与 yoga 测量、画布一致）
      decls.push('justify-content: center', `padding: ${BUTTON_PAD_Y}px ${BUTTON_PAD_X}px`)
    } else {
      decls.push('padding-left: 12px')
    }
  } else if (node.type === 'text') {
    // 文本：统一行高 1.4（与 yoga 测量、画布渲染一致，折行高度才对齐）+ 长词断行
    decls.push('line-height: 1.4', 'overflow-wrap: break-word')
  } else if (node.type === 'image') {
    // 图片按容器尺寸裁切填充、不拉伸（与画布 IrNodeShape 的 object-fit 一致）
    decls.push('object-fit: cover')
  }

  const s = node.style
  if (s.fill) decls.push(`background: ${s.fill}`)
  if (s.color) decls.push(`color: ${s.color}`)
  if (s.borderWidth && s.borderColor) decls.push(`border: ${s.borderWidth}px solid ${s.borderColor}`)
  if (s.radius) decls.push(`border-radius: ${s.radius}px`)
  if (s.fontSize) decls.push(`font-size: ${s.fontSize}px`)
  if (s.fontWeight) decls.push(`font-weight: ${s.fontWeight}`)
  const sh = shadowCSS(s.shadow)
  if (sh) decls.push(`box-shadow: ${sh}`)
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

// 取声明的属性名（'flex: 1 1 0' → 'flex'）
function declProp(decl: string): string {
  return decl.slice(0, decl.indexOf(':')).trim()
}

// 计算 vp 相对 base 的声明差异：变化/新增的声明照搬；base 有而 vp 没有的属性 → 重置为 initial。
// 依赖断点单调性（窄视口的变化集 ⊇ 宽视口），故各 @media 块各自对 base 求差即可正确级联。
function cssDiff(baseDecls: string[], vpDecls: string[]): string[] {
  const baseMap = new Map(baseDecls.map((d) => [declProp(d), d]))
  const vpMap = new Map(vpDecls.map((d) => [declProp(d), d]))
  const out: string[] = []
  for (const [p, d] of vpMap) {
    if (baseMap.get(p) !== d) out.push(d) // 值不同或新增 → 覆盖
  }
  for (const [p] of baseMap) {
    if (!vpMap.has(p)) out.push(`${p}: initial`) // base 独有 → 重置（如 fill→fixed 切换时的 flex/width）
  }
  return out
}

// 主入口：IR → 完整可预览的、带 @media 断点的响应式 HTML 文档
export function emitHTML(ir: IR): string {
  // base = 桌面布局（含布局后溢出纠正；≥1280 时前置变换恒等，但仍会纠正桌面自身的溢出）
  const baseIr = responsiveCorrect(ir, MAIN_WIDTH)
  const cssRules: string[] = []
  const baseDeclsById: Record<NodeId, string[]> = {} // 缓存每节点 base 声明，供 @media 求差
  const buildNode = (id: NodeId, depth: number): string => {
    const node = baseIr.nodes[id]
    const decls = nodeCSS(baseIr, node)
    baseDeclsById[id] = decls
    // root 额外加自适应：占满但限宽居中，让导出页本身在浏览器里也响应式
    const extra = id === baseIr.rootId ? ['width: 100%', `max-width: ${MAIN_WIDTH}px`, 'margin: 0 auto'] : []
    cssRules.push(`.${node.id} {\n  ${[...decls, ...extra].join(';\n  ')};\n}`)
    const indent = '  '.repeat(depth + 2)
    let childrenHTML = ''
    if (isContainer(node) && node.childIds.length) {
      childrenHTML = node.childIds.map((cid) => buildNode(cid, depth + 1)).join('\n')
    }
    return nodeHTML(node, childrenHTML, indent)
  }
  const bodyHTML = buildNode(baseIr.rootId, 0)

  // 为每个断点生成差异覆盖块
  const mediaBlocks = RESPONSIVE_BREAKPOINTS.map(({ maxWidth, viewportWidth }) => {
    const vpIr = responsiveCorrect(ir, viewportWidth) // 该断点应呈现的 IR（含溢出纠正）
    const rules: string[] = []
    for (const id of Object.keys(baseIr.nodes)) {
      const vpDecls = nodeCSS(vpIr, vpIr.nodes[id]) // 用变换后 IR 算（父轴方向变化会被捕获）
      const diff = cssDiff(baseDeclsById[id], vpDecls)
      if (diff.length) rules.push(`  .${id} {\n    ${diff.join(';\n    ')};\n  }`)
    }
    if (!rules.length) return '' // 该断点无变化则不输出空块
    return `@media (max-width: ${maxWidth}px) {\n${rules.join('\n')}\n}`
  }).filter(Boolean)

  const mediaCSS = mediaBlocks.length
    ? '\n' + mediaBlocks.map((b) => b.replace(/^/gm, '    ')).join('\n')
    : ''

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
${cssRules.map((r) => '    ' + r.replace(/\n/g, '\n    ')).join('\n')}${mediaCSS}
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`
}
