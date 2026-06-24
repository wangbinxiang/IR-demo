// AI 生成：prompt → 紧凑 DSL（JSON）。调本地 Claude Code。
import { runJSON } from './claude.mjs'

const SYSTEM_PROMPT = `你是一个 UI 设计编译器。把用户的自然语言需求转成描述 UI 的 JSON 树。

只输出一个 JSON 对象，不要任何解释、不要 markdown 代码围栏。

节点 Node 结构：
{
  "type": "frame" | "box" | "text" | "button" | "input" | "image",
  // 容器(frame/box)专用：
  "direction": "row" | "col",                 // 默认 "col"
  "gap": number,                              // 子元素间距，默认 0
  "padding": number,                          // 内边距，默认 0
  "align": "start"|"center"|"end"|"stretch",  // 交叉轴对齐，默认 "stretch"
  "justify": "start"|"center"|"end"|"between",// 主轴对齐，默认 "start"
  "children": Node[],
  // 尺寸：字符串 "hug"(包裹内容) | "fill"(填满父级) | 数字(固定px)，默认 "hug"
  "width": "hug" | "fill" | number,
  "height": "hug" | "fill" | number,
  // 样式（按需给）：
  "fill": "#hex", "color": "#hex", "borderColor": "#hex", "borderWidth": number,
  "radius": number, "fontSize": number, "fontWeight": number,
  // 内容：
  "text": "...",        // type=text/button 时
  "placeholder": "...", // type=input 时
  "src": "..."          // type=image 时
}

规则：
- 根节点必须是一个 frame，width 用 "fill"（画板宽由预览视口决定，不要写固定像素）。
- 用嵌套 children 表达层级；用 frame/box + direction/gap/padding 表达布局。
- 优先响应式：页面级的横向(row)容器与其子元素优先用 "fill"/"hug"，固定像素宽只用于图标、头像等真正定尺的小元素——避免在窄屏(手机)溢出。
- 输入框、按钮等横向元素通常 width:"fill"。
- 颜色用十六进制。配色协调、间距合理，做出可直接预览的高质量 UI。
- 不要输出 id 字段，id 由系统分配。`

export const generateDSL = async (userPrompt) => (await runJSON(SYSTEM_PROMPT, userPrompt)).data
