import { useState } from 'react'
import { compileDSL, type DSLNode } from '../compiler/dsl'
import { outlineIR, type Op } from '../ir/ops'
import { useIRStore } from '../ir/store'
import { useProject } from './project'

// 顶部提示词栏：
//  - 生成：prompt → DSL → 编译 IR → 整份载入画布
//  - 改图：当前 IR 概览 + 指令 → AI 返回 op-patch → 套用（保留未改动节点的 ID）
export function PromptBar() {
  const loadIR = useIRStore((s) => s.loadIR)
  const applyOps = useIRStore((s) => s.applyOps)
  const [prompt, setPrompt] = useState('一个简洁的登录页面，有标题、邮箱和密码输入框、登录按钮')
  const [busy, setBusy] = useState<null | 'gen' | 'edit'>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy('gen')
    setError(null)
    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
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
        body: JSON.stringify({ outline, instruction: prompt, sessionKey }),
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
      <input
        style={input}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && generate()}
        placeholder="描述要生成的 UI，或要对当前 UI 做的修改…"
        disabled={!!busy}
      />
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
  alignItems: 'center',
  gap: 8,
  padding: 8,
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
  fontFamily: 'system-ui, sans-serif',
  // 宽度卡在左右面板之间，避免与图层/样式面板重叠
  width: 'min(680px, calc(100vw - 540px))',
}
const input: React.CSSProperties = {
  flex: 1,
  height: 38,
  padding: '0 12px',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
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
const editBtn: React.CSSProperties = { ...genBtn, background: '#0891b2' }
const err: React.CSSProperties = { color: '#dc2626', fontSize: 12, maxWidth: 160 }
