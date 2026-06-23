import type { IR, IRNode, NodeId, Sizing, StyleProps } from '../ir/types'
import { isContainer } from '../ir/types'

// ============================================================================
// 确定性代码生成：IR → React Native (.tsx)。
// RN 原生就用 yoga 布局，所以与 HTML emitter 同构、映射近乎 1:1——
// 这是「一份 IR 多端落地」最有说服力的证据：同一 IR，换个 emitter 即出移动端代码。
//
// RN 与 web 的关键差异：
//  - 组件：View / Text / TextInput / TouchableOpacity / Image
//  - 所有文字必须包在 <Text> 里
//  - 样式 camelCase、数值无单位、backgroundColor、fontWeight 用字符串
// ============================================================================

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }

// 尺寸三态 → RN 样式键值（fill 区分主轴/交叉轴，与 yoga/HTML 一致）
function sizing(s: Sizing, axis: 'w' | 'h', parentDir: 'row' | 'col'): Record<string, unknown> {
  const prop = axis === 'w' ? 'width' : 'height'
  const isMain = (axis === 'w' && parentDir === 'row') || (axis === 'h' && parentDir === 'col')
  if (s.mode === 'fixed') return { [prop]: s.value }
  if (s.mode === 'fill') return isMain ? { flex: 1 } : { alignSelf: 'stretch' }
  return {} // hug：默认内容尺寸
}

// 文字相关样式（用于 Text / TextInput / 按钮内的 Text）
function textStyle(s: StyleProps): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  if (s.color) o.color = s.color
  if (s.fontSize) o.fontSize = s.fontSize
  if (s.fontWeight) o.fontWeight = String(s.fontWeight) // RN 要求字符串
  return o
}

// 盒子相关样式（背景/边框/圆角/布局/尺寸）
function boxStyle(ir: IR, node: IRNode): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  const parentDir = node.parentId ? (ir.nodes[node.parentId].layout?.direction ?? 'col') : 'col'
  Object.assign(o, sizing(node.width, 'w', parentDir))
  Object.assign(o, sizing(node.height, 'h', parentDir))

  if (isContainer(node) && node.layout) {
    const L = node.layout
    o.flexDirection = L.direction === 'row' ? 'row' : 'column'
    if (L.gap) o.gap = L.gap
    if (L.padding) o.padding = L.padding
    o.alignItems = ALIGN[L.align]
    o.justifyContent = JUSTIFY[L.justify]
  } else if (node.type === 'button') {
    o.alignItems = 'center'
    o.justifyContent = 'center'
  } else if (node.type === 'input') {
    o.paddingHorizontal = 12
  }
  const s = node.style
  if (s.fill) o.backgroundColor = s.fill
  if (s.borderWidth && s.borderColor) {
    o.borderWidth = s.borderWidth
    o.borderColor = s.borderColor
  }
  if (s.radius) o.borderRadius = s.radius
  return o
}

// 把样式对象序列化成 StyleSheet 条目（值为 number 不加引号，string 加引号）
function styleLiteral(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj).map(([k, v]) =>
    typeof v === 'number' ? `${k}: ${v}` : `${k}: '${v}'`,
  )
  return `{ ${entries.join(', ')} }`
}

export function emitReactNative(ir: IR): string {
  const styles: Record<string, Record<string, unknown>> = {}

  const jsx = (id: NodeId, depth: number): string => {
    const node = ir.nodes[id]
    const pad = '  '.repeat(depth + 2)
    const box = boxStyle(ir, node)

    switch (node.type) {
      case 'text': {
        styles[id] = { ...box, ...textStyle(node.style) }
        return `${pad}<Text style={styles.${id}}>${node.props.text ?? ''}</Text>`
      }
      case 'button': {
        styles[id] = box
        styles[`${id}_label`] = textStyle(node.style) // 标签文字样式拆到内层 Text
        return (
          `${pad}<TouchableOpacity style={styles.${id}}>\n` +
          `${pad}  <Text style={styles.${id}_label}>${node.props.text ?? ''}</Text>\n` +
          `${pad}</TouchableOpacity>`
        )
      }
      case 'input': {
        styles[id] = { ...box, ...textStyle(node.style) } // TextInput 可直接吃文字样式
        const ph = node.props.placeholder ?? ''
        const phColor = node.style.color ? ` placeholderTextColor="${node.style.color}"` : ''
        return `${pad}<TextInput style={styles.${id}} placeholder="${ph}"${phColor} />`
      }
      case 'image': {
        styles[id] = box
        return node.props.src
          ? `${pad}<Image style={styles.${id}} source={{ uri: '${node.props.src}' }} />`
          : `${pad}<View style={styles.${id}} />`
      }
      default: {
        // frame / box
        styles[id] = box
        if (!node.childIds.length) return `${pad}<View style={styles.${id}} />`
        const children = node.childIds.map((c) => jsx(c, depth + 1)).join('\n')
        return `${pad}<View style={styles.${id}}>\n${children}\n${pad}</View>`
      }
    }
  }

  const tree = jsx(ir.rootId, 0)
  const styleEntries = Object.entries(styles)
    .map(([k, v]) => `  ${k}: ${styleLiteral(v)},`)
    .join('\n')

  return `import React from 'react'
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native'

export default function GeneratedScreen() {
  return (
${tree}
  )
}

const styles = StyleSheet.create({
${styleEntries}
})
`
}
