// 端到端验证 AI 生成：输入 prompt → 点生成 → 等待 → 断言画布换成了新 IR
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

// 记录初始（示例 IR）根节点 id 与节点数
const before = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  return { rootId: ir.rootId, count: Object.keys(ir.nodes).length }
})

// 输入 prompt 并点击生成
await page.fill('input[placeholder*="描述"]', '一个商品卡片，包含图片、标题、价格和一个加入购物车按钮')
await page.click('text=✨ 生成')

// 等待生成完成：IR 节点集合发生变化（新根 id 或节点数变化），最多 90s
await page.waitForFunction(
  (b) => {
    const ir = window.__irStore.getState().ir
    return ir.rootId !== b.rootId || Object.keys(ir.nodes).length !== b.count
  },
  before,
  { timeout: 90000 },
)
await page.waitForTimeout(500)

const after = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  const shapes = window.__editor.getCurrentPageShapes().filter((s) => s.type === 'ir-node').length
  const types = Object.values(ir.nodes).map((n) => n.type)
  return { rootId: ir.rootId, count: Object.keys(ir.nodes).length, shapes, types }
})

await browser.close()

console.log('console errors:', errors.length ? errors : '无')
console.log('生成前:', JSON.stringify(before))
console.log('生成后:', JSON.stringify({ rootId: after.rootId, count: after.count, shapes: after.shapes }))
console.log('生成的节点类型:', after.types.join(', '))

// 断言：IR 变了、节点数与形状数一致（每个节点都同步成了形状）、无报错
const changed = after.rootId !== before.rootId || after.count !== before.count
const shapesMatch = after.shapes === after.count
const pass = errors.length === 0 && changed && shapesMatch && after.count > 1
console.log('\n结果:', pass ? '✅ PASS —— prompt→DSL→IR→画布 全链路打通' : '❌ FAIL')
process.exit(pass ? 0 : 1)
