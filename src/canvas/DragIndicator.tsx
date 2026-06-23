import { useDragIndicator } from './indicator'

// 拖拽插入指示线。作为 tldraw 的 InFrontOfTheCanvas 覆盖层渲染——
// 它处于页面坐标系内，left/top 用页面单位即可，自动跟随相机缩放/平移。
export function DragIndicator() {
  const line = useDragIndicator((s) => s.line)
  if (!line) return null
  return (
    <div
      data-testid="drag-indicator"
      style={{
        position: 'absolute',
        left: line.x,
        top: line.y,
        width: line.w,
        height: line.h,
        background: '#4f46e5',
        borderRadius: 2,
        pointerEvents: 'none',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
      }}
    />
  )
}
