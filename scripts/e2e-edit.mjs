// 端到端验证 AI 改图（op-patch）：
// 对示例登录卡片下指令 → 断言①未改动节点 ID 全部保留 ②指令效果生效 ③有新增节点
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

// 改图前：记录所有节点 id 与 submit 的填充色
const before = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  return { ids: Object.keys(ir.nodes), submitFill: ir.nodes.submit?.style.fill, count: Object.keys(ir.nodes).length }
})

// 下达修改指令并点「改图」
await page.fill('input', '把登录按钮改成绿色，并在标题下面加一句副标题“欢迎回来”')
await page.click('text=🪄 改图')

// 等待 IR 变化（节点数变化 或 submit 颜色变化），最多 90s
await page.waitForFunction(
  (b) => {
    const ir = window.__irStore.getState().ir
    return Object.keys(ir.nodes).length !== b.count || ir.nodes.submit?.style.fill !== b.submitFill
  },
  before,
  { timeout: 90000 },
)
await page.waitForTimeout(400)

const after = await page.evaluate(() => {
  const ir = window.__irStore.getState().ir
  const shapes = window.__editor.getCurrentPageShapes().filter((s) => s.type === 'ir-node').length
  return {
    ids: Object.keys(ir.nodes),
    submitFill: ir.nodes.submit?.style.fill,
    count: Object.keys(ir.nodes).length,
    shapes,
    texts: Object.values(ir.nodes).filter((n) => n.type === 'text').map((n) => n.props.text),
  }
})

await browser.close()

// 断言
const idsPreserved = before.ids.every((id) => after.ids.includes(id)) // 原 ID 全保留
const submitChanged = after.submitFill !== before.submitFill // 按钮颜色变了
const nodeAdded = after.count > before.count // 有新增（副标题）
const shapesMatch = after.shapes === after.count // 形状同步一致

console.log('console errors:', errors.length ? errors : '无')
console.log('改图前节点数:', before.count, '| submit 填充:', before.submitFill)
console.log('改图后节点数:', after.count, '| submit 填充:', after.submitFill, '| 形状数:', after.shapes)
console.log('原 ID 全部保留:', idsPreserved)
console.log('文本节点:', after.texts.join(' | '))

const pass = errors.length === 0 && idsPreserved && submitChanged && nodeAdded && shapesMatch
console.log('\n结果:', pass ? '✅ PASS —— AI 改图保 ID、效果生效、画布同步' : '❌ FAIL')
process.exit(pass ? 0 : 1)
