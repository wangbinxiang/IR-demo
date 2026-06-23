// 端到端验证左侧图层树：渲染全部节点 + 双向选中联动 + 折叠
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

// 1) 树渲染了全部节点
const nodeCount = await page.evaluate(() => Object.keys(window.__irStore.getState().ir.nodes).length)
const rowCount = await page.locator('[data-panel=layers] [data-node-id]').count()

// 2) 点击图层行 → 选中画布形状（useSelection 回写）
await page.click('[data-panel=layers] [data-node-id=submit]')
await page.waitForFunction(() => window.__selection.getState().selectedId === 'submit', null, { timeout: 5000 })
const canvasSelected = await page.evaluate(() => {
  const e = window.__editor
  const ids = e.getSelectedShapeIds()
  return ids.length === 1 && e.getShape(ids[0]).props.nodeId === 'submit'
})

// 3) 画布选中 → 对应图层行高亮
await page.evaluate(() => {
  const e = window.__editor
  const s = e.getCurrentPageShapes().find((x) => x.props?.nodeId === 'title')
  e.select(s.id)
})
await page.waitForFunction(() => window.__selection.getState().selectedId === 'title', null, { timeout: 5000 })
const titleRowHighlighted = await page.evaluate(() => {
  const el = document.querySelector('[data-panel=layers] [data-node-id=title]')
  return getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'
})

// 4) 折叠 card → 其子节点行消失
const beforeCollapse = await page.locator('[data-panel=layers] [data-node-id]').count()
await page.locator('[data-panel=layers] [data-node-id=card] span', { hasText: '▾' }).first().click()
await page.waitForTimeout(200)
const afterCollapse = await page.locator('[data-panel=layers] [data-node-id]').count()

await browser.close()

console.log('console errors:', errors.length ? errors : '无')
console.log('节点数:', nodeCount, '| 图层行数:', rowCount)
console.log('点图层→画布选中 submit:', canvasSelected)
console.log('画布选中→title 行高亮:', titleRowHighlighted)
console.log('折叠前行数:', beforeCollapse, '→ 折叠后:', afterCollapse)

const pass =
  errors.length === 0 &&
  rowCount === nodeCount &&
  canvasSelected &&
  titleRowHighlighted &&
  afterCollapse < beforeCollapse
console.log('\n结果:', pass ? '✅ PASS —— 图层树渲染完整、双向选中联动、可折叠' : '❌ FAIL')
process.exit(pass ? 0 : 1)
