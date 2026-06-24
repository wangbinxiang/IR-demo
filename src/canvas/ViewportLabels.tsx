import { VIEWPORTS, originXFor, ARTBOARD_ORIGIN } from '../layout/responsive'

// 三个画板上方的标题标签（"Desktop · 1280" 等）。
// 作为 tldraw OnTheCanvas 覆盖层渲染——处于页面坐标系内，left/top 用页面单位，
// 自动跟随相机缩放/平移，像 Figma 的画板标题。不进形状集合，故不污染 sync/选中/导出。
export function ViewportLabels() {
  return (
    <>
      {VIEWPORTS.map((vp, i) => (
        <div
          key={vp.name}
          data-viewport-label={vp.name}
          style={{
            position: 'absolute',
            left: originXFor(i), // 与 sync 同一原点算式（共用 originXFor，杜绝漂移）
            top: ARTBOARD_ORIGIN.y - 32, // 画板上方
            fontFamily: 'system-ui, sans-serif',
            fontSize: 18, // 页面单位，随缩放变化
            fontWeight: 600,
            color: '#a1a1aa',
            whiteSpace: 'nowrap',
            pointerEvents: 'none', // 不拦截画布交互
            userSelect: 'none',
          }}
        >
          {/* 首字母大写的视口名 · 像素宽 */}
          {vp.name.charAt(0).toUpperCase() + vp.name.slice(1)} · {vp.width}
        </div>
      ))}
    </>
  )
}
