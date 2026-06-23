import { useMemo, useState } from 'react'
import { emitHTML } from '../codegen/html'
import { emitReactNative } from '../codegen/reactNative'
import { useIRStore } from '../ir/store'
import { useProject } from './project'
import { useCodePanel } from './codePanelStore'

type Target = 'html' | 'rn'

// 代码面板：IR → 多端代码。
// HTML 目标支持 iframe 真实预览（与画布对照验证保真度）；
// RN 目标无浏览器运行时，仅展示源码——证明同一 IR 换 emitter 即出移动端代码。
export function CodePanel() {
  const ir = useIRStore((s) => s.ir)
  const version = useIRStore((s) => s.version)
  const open = useCodePanel((s) => s.open)
  const setOpen = useCodePanel((s) => s.setOpen)
  const [target, setTarget] = useState<Target>('html')
  const [tab, setTab] = useState<'preview' | 'source'>('preview')
  const [copied, setCopied] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const projectName = useProject((s) => s.name)

  // 确定性、纯函数，IR 变即重算
  const html = useMemo(() => emitHTML(ir), [ir, version])
  const rn = useMemo(() => emitReactNative(ir), [ir, version])
  const code = target === 'html' ? html : rn
  // RN 无法在浏览器预览，强制源码视图
  const effTab = target === 'rn' ? 'source' : tab

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // 导出到磁盘：一份 IR → web + RN 两端代码 + IR JSON，写入后端 exports/<项目名>/
  const exportToDisk = async () => {
    setExported('导出中…')
    const files = [
      { path: 'index.html', content: html },
      { path: 'GeneratedScreen.tsx', content: rn },
      { path: 'design.ir.json', content: JSON.stringify(ir, null, 2) },
    ]
    const r = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName, files }),
    })
    const d = await r.json()
    setExported(r.ok ? `✓ 已导出到 ${d.dir}` : `导出失败: ${d.error}`)
    setTimeout(() => setExported(null), 4000)
  }

  if (!open) return null
  return (
    <>
      {
        <div style={panel}>
          <div style={targetRow}>
            <button style={targetBtn(target === 'html')} onClick={() => setTarget('html')}>
              HTML / CSS
            </button>
            <button style={targetBtn(target === 'rn')} onClick={() => setTarget('rn')}>
              React Native
            </button>
            <button style={closeBtn} onClick={() => setOpen(false)} title="关闭">
              ✕
            </button>
          </div>
          <div style={header}>
            <div style={{ display: 'flex', gap: 4 }}>
              {target === 'html' && (
                <button style={tabBtn(effTab === 'preview')} onClick={() => setTab('preview')}>
                  预览
                </button>
              )}
              <button style={tabBtn(effTab === 'source')} onClick={() => setTab('source')}>
                源码{target === 'html' ? ' (.html)' : ' (.tsx)'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={copyBtn} onClick={copy}>
                {copied ? '✓ 已复制' : '复制'}
              </button>
              <button style={exportBtn} onClick={exportToDisk}>
                💾 导出到磁盘
              </button>
            </div>
          </div>
          {exported && <div style={exportNote}>{exported}</div>}
          {effTab === 'preview' ? (
            <iframe title="preview" srcDoc={html} style={iframe} />
          ) : (
            <pre style={source}>{code}</pre>
          )}
          {target === 'rn' && (
            <div style={note}>ℹ React Native 代码需在 RN 环境运行，此处仅展示源码</div>
          )}
        </div>
      }
    </>
  )
}

const closeBtn: React.CSSProperties = {
  marginLeft: 'auto',
  width: 32,
  height: 32,
  background: '#f4f4f5',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
  color: '#52525b',
}
const panel: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(520px, 45vw)',
  zIndex: 1001,
  background: '#fff',
  borderLeft: '1px solid #e4e4e7',
  boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, sans-serif',
}
const targetRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '10px 10px 0',
}
const targetBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  height: 32,
  background: active ? '#111827' : '#f4f4f5',
  color: active ? '#fff' : '#52525b',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
})
const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 10,
  borderBottom: '1px solid #f0f0f0',
}
const tabBtn = (active: boolean): React.CSSProperties => ({
  height: 30,
  padding: '0 12px',
  background: active ? '#4f46e5' : '#f4f4f5',
  color: active ? '#fff' : '#52525b',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
})
const copyBtn: React.CSSProperties = {
  height: 30,
  padding: '0 12px',
  background: '#f4f4f5',
  border: '1px solid #e4e4e7',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
}
const exportBtn: React.CSSProperties = {
  height: 30,
  padding: '0 12px',
  background: '#18181b',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const exportNote: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 11,
  color: '#16a34a',
  background: '#f0fdf4',
  borderBottom: '1px solid #f0f0f0',
  wordBreak: 'break-all',
}
const iframe: React.CSSProperties = { flex: 1, border: 'none', width: '100%' }
const source: React.CSSProperties = {
  flex: 1,
  margin: 0,
  padding: 16,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.5,
  fontFamily: 'ui-monospace, Menlo, monospace',
  background: '#1e1e2e',
  color: '#cdd6f4',
}
const note: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  color: '#71717a',
  background: '#fafafa',
  borderTop: '1px solid #f0f0f0',
}
