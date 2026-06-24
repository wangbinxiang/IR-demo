import { useEditor, useValue } from 'tldraw'
import { useDragIndicator } from './indicator'

// 拖拽插入指示线。作为 tldraw 的 InFrontOfTheCanvas 覆盖层渲染——
// 该层是【屏幕坐标系】(不随相机变换)，而 line 是【页面坐标系】的矩形，
// 故必须用 editor.pageToScreen 把页面坐标转成屏幕坐标，并按 zoom 缩放线宽高，
// 否则相机非 zoom=1/pan=0 时指示线会错位（曾因此偏下、偏离拖拽位置）。
export function DragIndicator() {
  const editor = useEditor()
  const line = useDragIndicator((s) => s.line)
  // 相机变化时重算（getZoomLevel/pageToScreen 依赖相机）
  const camera = useValue('camera', () => editor.getCamera(), [editor])
  if (!line) return null
  const z = camera.z // 当前缩放
  const vsb = editor.getViewportScreenBounds() // 视口在窗口中的偏移
  const tl = editor.pageToScreen({ x: line.x, y: line.y }) // 页面坐标 → 屏幕坐标
  return (
    <div
      data-testid="drag-indicator"
      style={{
        position: 'absolute',
        left: tl.x - vsb.x, // 相对覆盖层(=视口)定位
        top: tl.y - vsb.y,
        width: line.w * z, // 线宽高也随缩放
        height: line.h * z,
        background: '#4f46e5',
        borderRadius: 2,
        pointerEvents: 'none',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
      }}
    />
  )
}
