// 样式预设：把 StyleProps 里的语义化数值映射成具体 CSS 值。
// 画布渲染(IrNodeShape) 与 HTML 代码生成(html.ts) 共用，保证「所见即所得」。

// 按钮的默认内部内边距：让文字不紧贴底色边缘（胶囊/按钮观感）。
// yoga 测量(尺寸要含 padding)、画布渲染、HTML 导出三处共用同一组值，保证 canvas=code。
export const BUTTON_PAD_X = 14
export const BUTTON_PAD_Y = 8

// 阴影 elevation 预设 → CSS box-shadow。索引 = StyleProps.shadow（0/省略=无）。
const SHADOW_PRESETS: Record<number, string> = {
  1: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)', // 轻
  2: '0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)', // 中
  3: '0 10px 30px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)', // 重
}

// 取 box-shadow 值；无效/0 返回 undefined（不输出该声明）
export function shadowCSS(elevation?: number): string | undefined {
  if (!elevation) return undefined
  return SHADOW_PRESETS[elevation]
}
