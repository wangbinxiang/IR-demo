import { useEffect, useRef, useState } from 'react'
import { Tldraw, type Editor, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { IrNodeShapeUtil } from './canvas/IrNodeShape'
import { DragIndicator } from './canvas/DragIndicator'
import { syncToCanvas } from './canvas/sync'
import { initYoga } from './layout/yoga'
import { useIRStore } from './ir/store'
import { PromptBar } from './ui/PromptBar'
import { CodePanel } from './ui/CodePanel'
import { StylePanel } from './ui/StylePanel'
import { ProjectBar } from './ui/ProjectBar'
import { LayersPanel } from './ui/LayersPanel'
import { useSelection } from './ui/selection'
import type { IrNodeShape } from './canvas/IrNodeShape'

// 注册自定义形状
const shapeUtils = [IrNodeShapeUtil]
// 保留 tldraw 自带 UI（菜单/工具栏/缩放等），只隐藏它自带的样式面板：
// 那个面板改的是 tldraw 形状属性，对我们每次 relayout 覆盖的几何无效，且与右侧面板重复。
const components: TLComponents = {
  InFrontOfTheCanvas: DragIndicator,
  StylePanel: null,
}

export default function App() {
  const [ready, setReady] = useState(false) // yoga 异步加载完成标志
  const editorRef = useRef<Editor | null>(null)
  const didFit = useRef(false) // 是否已做过首屏框选居中
  const version = useIRStore((s) => s.version) // IR 变更信号
  const ir = useIRStore((s) => s.ir)

  // 启动时加载 yoga（wasm）
  useEffect(() => {
    initYoga().then(() => setReady(true))
  }, [])

  // IR 变化（或 yoga 就绪）时，重新布局并同步到画布
  useEffect(() => {
    if (!ready || !editorRef.current) return
    syncToCanvas(editorRef.current, ir)
    // 首次形状建好后框选居中（onMount 时形状还没建好，zoomToFit 是空操作）
    if (!didFit.current) {
      editorRef.current.zoomToFit()
      didFit.current = true
    }
  }, [ready, version, ir])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <PromptBar />
      <CodePanel />
      <StylePanel />
      <ProjectBar />
      <LayersPanel />
      <Tldraw
        shapeUtils={shapeUtils}
        components={components}
        onMount={(editor) => {
          editorRef.current = editor
          ;(window as unknown as { __editor: Editor }).__editor = editor // e2e 调试钩子
          // 监听画布选中变化 → 映射回 IR 节点 id，驱动右侧样式面板
          editor.store.listen(() => {
            const ids = editor.getSelectedShapeIds()
            let nodeId: string | null = null
            if (ids.length === 1) {
              const shape = editor.getShape(ids[0]) as IrNodeShape | undefined
              nodeId = shape?.props.nodeId ?? null
            }
            if (useSelection.getState().selectedId !== nodeId) useSelection.getState().setSelected(nodeId)
          })
          // 开启网格背景，强化「无限画布」的视觉感（类 Figma）
          editor.updateInstanceState({ isGridMode: true })
          if (ready) syncToCanvas(editor, useIRStore.getState().ir)
          // 首屏框选居中由上面的 effect 在形状建好后执行
        }}
      />
      {!ready && (
        <div style={{ position: 'absolute', top: 12, left: 12, padding: '6px 10px', background: '#000', color: '#fff', borderRadius: 6, fontSize: 12, fontFamily: 'system-ui' }}>
          正在加载布局引擎 (yoga)…
        </div>
      )}
    </div>
  )
}
