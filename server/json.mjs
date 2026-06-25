// AI 输出 JSON 解析工具：兼容模型偶尔包 markdown 围栏或附带解释文本的情况。
export function extractJSON(text) {
  let t = text.trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('输出中未找到 JSON 对象')
  return JSON.parse(t.slice(start, end + 1))
}

export function repairPrompt(prompt, error) {
  return `${prompt}\n\n（上次输出无法解析：${error.message}。请只输出一个合法 JSON 对象。）`
}
