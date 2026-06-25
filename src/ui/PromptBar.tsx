import { useState, useRef, useLayoutEffect } from 'react'
import { compileDSL, type DSLNode } from '../compiler/dsl'
import { outlineIR, type Op } from '../ir/ops'
import { useIRStore } from '../ir/store'
import { useProject } from './project'

type AIProvider = 'claude' | 'codex'
type ModelChoice = '' | 'claude-sonnet-4-6' | 'gpt-5.4' | 'custom'

const AI_PROVIDER_KEY = 'ir-demo:ai-provider'
const AI_MODEL_CHOICE_PREFIX = 'ir-demo:ai-model-choice:'
const AI_CUSTOM_MODEL_PREFIX = 'ir-demo:ai-custom-model:'
const providerLabels: Record<AIProvider, string> = {
  claude: 'Claude Code',
  codex: 'Codex App',
}
const modelOptions: Record<AIProvider, Array<{ value: ModelChoice; label: string }>> = {
  claude: [
    { value: '', label: '默认模型' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'custom', label: '自定义模型' },
  ],
  codex: [
    { value: '', label: '默认模型' },
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'custom', label: '自定义模型' },
  ],
}

const readModelChoice = (provider: AIProvider): ModelChoice => {
  const saved = localStorage.getItem(AI_MODEL_CHOICE_PREFIX + provider)
  return modelOptions[provider].some((option) => option.value === saved) ? (saved as ModelChoice) : ''
}

const readCustomModel = (provider: AIProvider): string => localStorage.getItem(AI_CUSTOM_MODEL_PREFIX + provider) ?? ''

// 顶部提示词栏：
//  - 生成：prompt → DSL → 编译 IR → 整份载入画布
//  - 改图：当前 IR 概览 + 指令 → AI 返回 op-patch → 套用（保留未改动节点的 ID）
export function PromptBar() {
  const loadIR = useIRStore((s) => s.loadIR)
  const applyOps = useIRStore((s) => s.applyOps)
  const [prompt, setPrompt] = useState('一个简洁的登录页面，有标题、邮箱和密码输入框、登录按钮')
  const [provider, setProviderState] = useState<AIProvider>(() => {
    const saved = localStorage.getItem(AI_PROVIDER_KEY)
    return saved === 'codex' ? 'codex' : 'claude'
  })
  const [modelChoices, setModelChoices] = useState<Record<AIProvider, ModelChoice>>(() => ({
    claude: readModelChoice('claude'),
    codex: readModelChoice('codex'),
  }))
  const [customModels, setCustomModels] = useState<Record<AIProvider, string>>(() => ({
    claude: readCustomModel('claude'),
    codex: readCustomModel('codex'),
  }))
  const [busy, setBusy] = useState<null | 'gen' | 'edit'>(null)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const modelChoice = modelChoices[provider]
  const customModel = customModels[provider]
  const model = modelChoice === 'custom' ? customModel.trim() : modelChoice || undefined

  const setProvider = (next: AIProvider) => {
    localStorage.setItem(AI_PROVIDER_KEY, next)
    setProviderState(next)
  }

  const setModelChoice = (next: ModelChoice) => {
    localStorage.setItem(AI_MODEL_CHOICE_PREFIX + provider, next)
    setModelChoices((prev) => ({ ...prev, [provider]: next }))
  }

  const setCustomModel = (next: string) => {
    localStorage.setItem(AI_CUSTOM_MODEL_PREFIX + provider, next)
    setCustomModels((prev) => ({ ...prev, [provider]: next }))
  }

  // 多行自适应：按内容增高，封顶 MAX_H 后内部滚动
  const MAX_H = 140
  const autosize = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto' // 先重置才能正确测量内容高 scrollHeight
    el.style.height = Math.min(el.scrollHeight, MAX_H) + 'px' // 跟随内容、封顶
    el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden' // 超上限才出滚动条
  }
  useLayoutEffect(() => autosize(), []) // 首屏按初始文案定高

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy('gen')
    setError(null)
    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider, model }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      loadIR(compileDSL(data.dsl as DSLNode))
      setTimeout(() => (window as unknown as { __editor?: { zoomToFit: () => void } }).__editor?.zoomToFit(), 80)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const edit = async () => {
    if (!prompt.trim() || busy) return
    setBusy('edit')
    setError(null)
    try {
      // 把当前 IR 概览（带 ID）连同指令发给后端；sessionKey 用项目 id 维持温会话
      const outline = outlineIR(useIRStore.getState().ir)
      const sessionKey = useProject.getState().id ?? '__unsaved__'
      const resp = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outline, instruction: prompt, sessionKey, provider, model }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
      applyOps(data.ops as Op[]) // 套用到现有 IR，保留未改动节点
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={wrap}>
      <textarea
        ref={taRef}
        data-prompt
        style={input}
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value)
          autosize() // 每次输入重算高度
        }}
        onKeyDown={(e) => {
          // Enter 生成、Shift+Enter 换行（多行输入）
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            generate()
          }
        }}
        rows={1}
        placeholder="描述要生成的 UI，或要对当前 UI 做的修改…（Shift+Enter 换行）"
        disabled={!!busy}
      />
      <select
        style={select}
        value={provider}
        onChange={(e) => setProvider(e.target.value as AIProvider)}
        disabled={!!busy}
        title="AI 源"
        aria-label="AI 源"
      >
        {(Object.keys(providerLabels) as AIProvider[]).map((p) => (
          <option key={p} value={p}>
            {providerLabels[p]}
          </option>
        ))}
      </select>
      <select
        style={modelSelect}
        value={modelChoice}
        onChange={(e) => setModelChoice(e.target.value as ModelChoice)}
        disabled={!!busy}
        title="模型"
        aria-label="模型"
      >
        {modelOptions[provider].map((option) => (
          <option key={option.value || 'default'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {modelChoice === 'custom' && (
        <input
          style={customModelInput}
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          placeholder="模型 ID"
          disabled={!!busy}
          aria-label="自定义模型 ID"
        />
      )}
      <button style={{ ...genBtn, opacity: busy ? 0.6 : 1 }} onClick={generate} disabled={!!busy}>
        {busy === 'gen' ? '生成中…' : '✨ 生成'}
      </button>
      <button style={{ ...editBtn, opacity: busy ? 0.6 : 1 }} onClick={edit} disabled={!!busy}>
        {busy === 'edit' ? '改图中…' : '🪄 改图'}
      </button>
      {error && <span style={err}>⚠ {error}</span>}
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'absolute',
  top: 54, // 顶部第二行（项目栏下方）
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'flex-start', // 多行增高时按钮顶对齐第一行
  gap: 8,
  padding: 8,
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
  fontFamily: 'system-ui, sans-serif',
  // 宽度卡在左右面板之间，避免与图层/样式面板重叠
  width: 'min(860px, calc(100vw - 540px))',
}
const input: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 38, // 单行时与按钮等高
  maxHeight: 140, // 与 MAX_H 一致：封顶后内部滚动
  padding: '8px 12px', // 垂直内边距让单行文字居中
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  fontSize: 14,
  lineHeight: '20px',
  outline: 'none',
  resize: 'none', // 禁用手动拖拽缩放，交给自适应
  fontFamily: 'inherit', // textarea 默认等宽字体 → 跟随面板字体
  boxSizing: 'border-box',
}
const genBtn: React.CSSProperties = {
  height: 38,
  padding: '0 16px',
  background: '#4f46e5',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const select: React.CSSProperties = {
  height: 38,
  maxWidth: 132,
  padding: '0 10px',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  background: '#fff',
  color: '#18181b',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
}
const modelSelect: React.CSSProperties = { ...select, maxWidth: 154 }
const customModelInput: React.CSSProperties = {
  height: 38,
  width: 132,
  padding: '0 10px',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  color: '#18181b',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}
const editBtn: React.CSSProperties = { ...genBtn, background: '#0891b2' }
const err: React.CSSProperties = { color: '#dc2626', fontSize: 12, maxWidth: 160 }
