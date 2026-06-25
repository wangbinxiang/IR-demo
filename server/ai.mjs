// AI provider 分发层：前端选择哪个源，后端就只调用哪个源，不做隐式 fallback。
export const DEFAULT_PROVIDER = 'claude'
export const PROVIDERS = new Set(['claude', 'codex'])

export function normalizeProvider(provider) {
  const p = provider || DEFAULT_PROVIDER
  if (!PROVIDERS.has(p)) throw new Error(`未知 AI 源: ${p}`)
  return p
}

export function normalizeModel(model) {
  return typeof model === 'string' && model.trim() ? model.trim() : undefined
}

export async function runAIJSON(provider, system, prompt, opts = {}) {
  const p = normalizeProvider(provider)
  if (p === 'claude') {
    const { runClaudeJSON } = await import('./claude.mjs')
    return runClaudeJSON(system, prompt, opts)
  }
  if (p === 'codex') {
    const { runCodexJSON } = await import('./codex.mjs')
    return runCodexJSON(system, prompt, opts)
  }
  throw new Error(`未知 AI 源: ${p}`)
}
