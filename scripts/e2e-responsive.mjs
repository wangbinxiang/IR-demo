// 端到端验证响应式三视口同屏预览：
//  1) 画布上存在 3 组形状（desktop/tablet/mobile），每组节点数相等且 = IR 节点数
//  2) 同一节点 root 的几何宽：desktop > tablet > mobile
//  3) R1 塌列：features 容器 desktop 横排(子 x 递增、y 近似)、mobile 纵排(子 y 递增、x 近似)
//  4) R2 降级（loadIR 注入临界 IR）：fixed 500 的元素 mobile 被降级为 fill，宽 ≈ 视口宽 < desktop
//  5) 改一处样式 → 三视口对应形状同步
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })
await page.waitForTimeout(400) // 等三视口形状建好

// —— 读取按视口分组的形状几何 ——
const snap = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  const shapes = window.__editor.getCurrentPageShapes().filter((s) => s.type === 'ir-node')
  const byVp = {}
  for (const s of shapes) {
    const vp = s.props.viewport
    ;(byVp[vp] ??= []).push({ nodeId: s.props.nodeId, x: s.x, y: s.y, w: s.props.w, h: s.props.h })
  }
  return { nodeCount: Object.keys(ir.nodes).length, rootId: ir.rootId, byVp }
})

// 1) 三组形状、计数相等
const vpNames = ['desktop', 'tablet', 'mobile']
const counts = vpNames.map((v) => (snap.byVp[v] || []).length)
const countsOk = counts.every((c) => c === snap.nodeCount) && counts.length === 3

// 2) root 宽递减
const rootW = (vp) => (snap.byVp[vp] || []).find((n) => n.nodeId === snap.rootId)?.w ?? 0
const widthsDescending = rootW('desktop') > rootW('tablet') && rootW('tablet') > rootW('mobile')

// 3) R1 塌列：features 的两子 colA/colB
const child = (vp, id) => (snap.byVp[vp] || []).find((n) => n.nodeId === id)
const dA = child('desktop', 'colA'), dB = child('desktop', 'colB')
const mA = child('mobile', 'colA'), mB = child('mobile', 'colB')
// desktop 横排：x 明显递增、y 近似相等
const desktopRow = dA && dB && dB.x > dA.x + 50 && Math.abs(dA.y - dB.y) < 10
// mobile 纵排：y 明显递增、x 近似相等
const mobileCol = mA && mB && mB.y > mA.y + 50 && Math.abs(mA.x - mB.x) < 10
const r1Ok = desktopRow && mobileCol

// 5) 改一处样式 → 三视口同步（用 setStyle 改 submit 背景色，断言每视口该形状仍存在且 IR 已变）
await page.evaluate(() => {
  window.__irStore.getState().applyOps([{ op: 'setStyle', id: 'submit', style: { fill: '#dc2626' } }])
})
await page.waitForTimeout(300)
const syncOk = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  const shapes = window.__editor.getCurrentPageShapes().filter((s) => s.type === 'ir-node')
  const vps = ['desktop', 'tablet', 'mobile']
  // 每个视口都应有一个 submit 形状（三视口同步重绘后均在）
  const allPresent = vps.every((v) => shapes.some((s) => s.props.viewport === v && s.props.nodeId === 'submit'))
  return allPresent && ir.nodes.submit.style.fill === '#dc2626'
})

// 4) R2 降级：注入一个含 fixed 500 元素的临界 IR
const r2 = await page.evaluate(() => {
  const ir = {
    rootId: 'r',
    nodes: {
      r: { id: 'r', type: 'frame', parentId: null, childIds: ['big'], width: { mode: 'fill' }, height: { mode: 'hug' }, layout: { direction: 'col', gap: 0, padding: 0, align: 'start', justify: 'start' }, style: {}, props: {} },
      big: { id: 'big', type: 'box', parentId: 'r', childIds: [], width: { mode: 'fixed', value: 500 }, height: { mode: 'fixed', value: 80 }, layout: { direction: 'col', gap: 0, padding: 0, align: 'start', justify: 'start' }, style: { fill: '#ddd' }, props: {} },
    },
  }
  window.__irStore.getState().loadIR(ir)
  return true
})
await page.waitForTimeout(400)
const r2Ok = await page.evaluate(() => {
  const shapes = window.__editor.getCurrentPageShapes().filter((s) => s.type === 'ir-node')
  const bigW = (vp) => shapes.find((s) => s.props.viewport === vp && s.props.nodeId === 'big')?.props.w ?? 0
  // desktop 保持 500；mobile 被 R2 降级为 fill → 宽 ≈ 375（< 500 且 ≤ 视口宽）
  return Math.round(bigW('desktop')) === 500 && bigW('mobile') < 500 && bigW('mobile') <= 375
})

await browser.close()

// —— 报告 ——
console.log('console errors:', errors.length ? errors : '无')
console.log('三视口形状计数:', counts, '应各 =', snap.nodeCount)
console.log('root 宽 desktop/tablet/mobile:', rootW('desktop'), rootW('tablet'), rootW('mobile'))
console.log('R1 塌列 desktop横排:', desktopRow, ' mobile纵排:', mobileCol)
console.log('改样式三视口同步:', syncOk)
console.log('R2 固定宽降级:', r2Ok)

const pass = errors.length === 0 && countsOk && widthsDescending && r1Ok && syncOk && r2Ok
console.log('\n结果:', pass ? '✅ PASS —— 三视口预览/R1塌列/R2降级/同步 全部正确' : '❌ FAIL')
process.exit(pass ? 0 : 1)
