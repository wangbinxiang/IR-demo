// 共享的本地 Claude Code 调用器：给定 system + prompt，返回解析后的 JSON。
// 支持 resume 复用会话（会话保温/对话式连续编辑），并回传 sessionId。
import { query } from '@anthropic-ai/claude-agent-sdk'

const MODEL = process.env.IR_MODEL || 'claude-sonnet-4-6'

// 从模型输出里抠出 JSON（去围栏、取首个 { 到末个 }）
function extractJSON(text) {
  let t = text.trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('输出中未找到 JSON 对象')
  return JSON.parse(t.slice(start, end + 1))
}

// 单次调用。system 为空则不带（resume 时系统提示已在会话里）。resume 为已有会话 id。
async function runOnce(system, prompt, resume) {
  const options = {
    model: MODEL,
    allowedTools: [],
    maxTurns: 1,
    permissionMode: 'bypassPermissions',
    settingSources: [],
  }
  if (system) options.systemPrompt = system
  if (resume) options.resume = resume

  let result = ''
  let sessionId
  for await (const msg of query({ prompt, options })) {
    if (msg.session_id) sessionId = msg.session_id // init/result 都带，取最新
    if (msg.type === 'result' && msg.subtype === 'success') result = msg.result
    else if (msg.type === 'result') throw new Error('生成失败: ' + (msg.subtype || 'unknown'))
  }
  if (!result) throw new Error('模型无输出')
  return { data: extractJSON(result), sessionId }
}

// 对外：返回 { data, sessionId }。带一次解析失败重试。
export async function runJSON(system, prompt, opts = {}) {
  try {
    return await runOnce(system, prompt, opts.resume)
  } catch (e) {
    return await runOnce(system, `${prompt}\n\n（上次输出无法解析：${e.message}。请只输出一个合法 JSON 对象。）`, opts.resume)
  }
}
