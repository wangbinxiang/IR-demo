import { useEffect, useState, type CSSProperties } from 'react'
import { useIRStore } from '../ir/store'
import { sampleIR } from '../ir/sample'
import { useProject } from './project'
import { useCodePanel } from './codePanelStore'

interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
}

const zoomFit = () =>
  setTimeout(() => (window as unknown as { __editor?: { zoomToFit: () => void } }).__editor?.zoomToFit(), 80)

// 左上角项目栏：保存 / 打开 / 新建。项目存为后端本地 JSON 文件。
export function ProjectBar() {
  const ir = useIRStore((s) => s.ir)
  const loadIR = useIRStore((s) => s.loadIR)
  const { id, name, setProject } = useProject()
  const toggleCode = useCodePanel((s) => s.toggle)
  const [list, setList] = useState<ProjectMeta[]>([])
  const [status, setStatus] = useState('')

  const refreshList = async () => {
    const r = await fetch('/api/projects')
    const d = await r.json()
    setList(d.projects ?? [])
  }

  // 启动时拉项目列表，并尝试恢复 localStorage 记住的项目
  useEffect(() => {
    refreshList()
    if (id) {
      fetch(`/api/projects/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.ir) {
            loadIR(d.ir)
            setProject(d.id, d.name)
            zoomFit()
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setStatus('保存中…')
    const method = id ? 'PUT' : 'POST'
    const url = id ? `/api/projects/${id}` : '/api/projects'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ir }),
    })
    const meta = await r.json()
    setProject(meta.id, meta.name)
    await refreshList()
    setStatus('已保存 ✓')
    setTimeout(() => setStatus(''), 1500)
  }

  const open = async (pid: string) => {
    if (!pid) return
    const d = await (await fetch(`/api/projects/${pid}`)).json()
    if (d?.ir) {
      loadIR(d.ir)
      setProject(d.id, d.name)
      zoomFit()
    }
  }

  const create = () => {
    loadIR(sampleIR)
    setProject(null, '未命名')
    zoomFit()
  }

  return (
    <div style={bar}>
      <span style={{ fontSize: 16 }}>📁</span>
      <input data-testid="proj-name" style={nameInput} value={name} onChange={(e) => setProject(id, e.target.value)} />
      <button style={btn} onClick={save}>
        保存
      </button>
      <select style={select} value="" onChange={(e) => open(e.target.value)}>
        <option value="">打开…</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button style={btnGhost} onClick={create}>
        新建
      </button>
      <button style={btnDark} onClick={toggleCode}>
        {'</> 代码'}
      </button>
      {status && <span style={{ fontSize: 12, color: '#16a34a' }}>{status}</span>}
    </div>
  )
}

const bar: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: '50%',
  transform: 'translateX(-50%)', // 顶部居中，让开 tldraw 左上角菜单
  zIndex: 999,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: 6,
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: 10,
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  fontFamily: 'system-ui, sans-serif',
}
const nameInput: CSSProperties = {
  width: 120,
  height: 28,
  border: '1px solid #e4e4e7',
  borderRadius: 6,
  padding: '0 8px',
  fontSize: 13,
  outline: 'none',
}
const btn: CSSProperties = {
  height: 28,
  padding: '0 12px',
  background: '#4f46e5',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
const btnGhost: CSSProperties = { ...btn, background: '#f4f4f5', color: '#52525b', fontWeight: 400 }
const btnDark: CSSProperties = { ...btn, background: '#18181b' }
const select: CSSProperties = {
  height: 28,
  border: '1px solid #e4e4e7',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  maxWidth: 120,
}
