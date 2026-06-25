// AI 改图：当前 IR 概览 + 指令 → 一组编辑操作（op）。provider 由前端选择。
import { normalizeModel, normalizeProvider, runAIJSON } from './ai.mjs'

const SYSTEM_PROMPT = `你是一个 UI 编辑器的操作生成器。给你「当前 UI 的结构概览（每个节点带 #id）」和「用户的修改指令」，你要输出一组对现有节点的编辑操作。

只输出一个 JSON 对象：{ "ops": Op[] }。不要解释、不要 markdown 围栏。

概览格式：每行一个节点，形如  #id 类型 [布局] w:.. h:.. text:".." {样式键:值 ...}，缩进表示层级。

可用操作 Op：
{ "op": "setStyle", "id": "...", "style": { "fill":"#hex","color":"#hex","borderColor":"#hex","borderWidth":n,"radius":n,"fontSize":n,"fontWeight":n } }  // 合并样式
{ "op": "setProps", "id": "...", "props": { "text":"...","placeholder":"...","src":"..." } }  // 改文案/占位符
{ "op": "setLayout", "id": "...", "layout": { "direction":"row|col","gap":n,"padding":n,"align":"start|center|end|stretch","justify":"start|center|end|between" } }  // 容器布局
{ "op": "setSizing", "id": "...", "axis": "width|height", "value": "hug"|"fill"|n }  // 尺寸三态
{ "op": "insert", "parentId": "...", "index": n, "node": Node }  // 在某容器第 index 位插入新子树；Node 是无 id 的 DSL（结构同生成时：type/children/width/style/text 等）
{ "op": "remove", "id": "..." }  // 删除该节点及其子树
{ "op": "move", "id": "...", "parentId": "...", "index": n }  // 移动到某容器第 index 位

规则：
- 只对需要改动的节点产出 op，其余不动（保留它们的 id）。
- 引用已存在的 #id（去掉 # 号填进 id 字段）。新增内容用 insert，节点结构与生成时的 Node 一致。
- 颜色用十六进制。尽量用最少的 op 完成指令。`

// 每个项目(sessionKey)维持一个温会话 id，实现对话式连续编辑。
const sessions = new Map()

export async function generateOps(outline, instruction, sessionKey = '__default__', provider, model) {
  const p = normalizeProvider(provider)
  const m = normalizeModel(model)
  const scopedSessionKey = `${p}:${m || '__default__'}:${sessionKey}`
  // 仍每轮发当前 outline，保证用户在画布/面板上的 out-of-band 修改也被看见
  const prompt = `当前 UI 结构概览：\n${outline}\n\n用户修改指令：${instruction}\n\n请输出 { "ops": [...] }。`
  const resume = sessions.get(scopedSessionKey)
  try {
    // resume 时系统提示已在会话里，不重发；首轮才带完整 system
    const { data, sessionId } = await runAIJSON(p, resume ? '' : SYSTEM_PROMPT, prompt, { resume, model: m })
    if (sessionId) sessions.set(scopedSessionKey, sessionId)
    return { ops: data.ops ?? [], resumed: !!resume, provider: p, model: m }
  } catch (e) {
    // 会话失效等 → 丢弃旧会话，用完整上下文重来一次
    if (resume) {
      sessions.delete(scopedSessionKey)
      const { data, sessionId } = await runAIJSON(p, SYSTEM_PROMPT, prompt, { model: m })
      if (sessionId) sessions.set(scopedSessionKey, sessionId)
      return { ops: data.ops ?? [], resumed: false, provider: p, model: m }
    }
    throw e
  }
}
