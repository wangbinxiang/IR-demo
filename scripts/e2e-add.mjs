// 端到端验证手动添加元素：落点规则（容器内/根末尾）+ 插入即选中 + 画布同步
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

const count = () => page.evaluate(() => Object.keys(window.__irStore.getState().ir.nodes).length)
const before = await count()

// 1) 选中容器 card → 添加「文本」→ 应成为 card 的子节点并被选中
await page.click('[data-panel=layers] [data-node-id=card]')
await page.click('button[title="添加T 文本"]')
await page.waitForFunction((c) => Object.keys(window.__irStore.getState().ir.nodes).length === c + 1, before, { timeout: 5000 })
await page.waitForTimeout(200)
const r1 = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  const sel = window.__selection.getState().selectedId
  const n = sel ? ir.nodes[sel] : null
  return { selType: n?.type, selParent: n?.parentId, isCardChild: n ? ir.nodes.card.childIds.includes(sel) : false }
})

// 2) 取消选中 → 添加「按钮」→ 应落到根末尾
await page.evaluate(() => window.__editor.selectNone())
await page.waitForFunction(() => window.__selection.getState().selectedId === null, null, { timeout: 5000 })
const mid = await count()
await page.click('button[title="添加⬭ 按钮"]')
await page.waitForFunction((c) => Object.keys(window.__irStore.getState().ir.nodes).length === c + 1, mid, { timeout: 5000 })
await page.waitForTimeout(200)
const r2 = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  const sel = window.__selection.getState().selectedId
  return { selType: ir.nodes[sel]?.type, selParent: ir.nodes[sel]?.parentId, rootId: ir.rootId }
})

// 画布形状数与节点数一致
const synced = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  const shapes = window.__editor.getCurrentPageShapes().filter((s) => s.type === 'ir-node').length
  return shapes === Object.keys(ir.nodes).length
})

await browser.close()

console.log('console errors:', errors.length ? errors : '无')
console.log('选容器加文本 →', JSON.stringify(r1))
console.log('空选加按钮 →', JSON.stringify(r2))
console.log('画布形状与节点数一致:', synced)

const pass =
  errors.length === 0 &&
  r1.selType === 'text' && r1.selParent === 'card' && r1.isCardChild && // 落进容器且选中
  r2.selType === 'button' && r2.selParent === r2.rootId && // 落到根
  synced
console.log('\n结果:', pass ? '✅ PASS —— 手动添加遵循落点规则、插入即选中、画布同步' : '❌ FAIL')
process.exit(pass ? 0 : 1)
