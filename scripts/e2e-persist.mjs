// 端到端验证持久化：改 IR → 保存 → 刷新页面 → 自动恢复（含改动与项目名）
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear()) // 干净起步
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

// 改一处 IR（按钮改成特征色），设项目名，保存
const MARK = '#123456'
await page.evaluate((mark) => {
  window.__irStore.getState().applyOps([{ op: 'setStyle', id: 'submit', style: { fill: mark } }])
}, MARK)
await page.fill('[data-testid=proj-name]', 'persist-test')
await page.click('text=保存')
await page.waitForFunction(() => window.__project.getState().id !== null, null, { timeout: 8000 })
const pid = await page.evaluate(() => window.__project.getState().id)

// 校验后端文件：GET 该项目，IR 含改动
const saved = await page.evaluate((id) => fetch(`/api/projects/${id}`).then((r) => r.json()), pid)
const savedOk = saved?.ir?.nodes?.submit?.style?.fill === MARK && saved?.name === 'persist-test'

// 刷新页面 → 自动恢复
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(
  (mark) => window.__irStore.getState().ir.nodes.submit?.style.fill === mark,
  MARK,
  { timeout: 15000 },
)
const restored = await page.evaluate(() => ({
  fill: window.__irStore.getState().ir.nodes.submit.style.fill,
  name: window.__project.getState().name,
  id: window.__project.getState().id,
}))

// 清理
await page.evaluate((id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }), pid)
await browser.close()

console.log('console errors:', errors.length ? errors : '无')
console.log('保存的项目 id:', pid)
console.log('后端文件含改动 + 名称:', savedOk)
console.log('刷新后恢复:', JSON.stringify(restored))

const pass =
  errors.length === 0 &&
  !!pid &&
  savedOk &&
  restored.fill === MARK &&
  restored.name === 'persist-test' &&
  restored.id === pid
console.log('\n结果:', pass ? '✅ PASS —— 保存到本地文件，刷新自动恢复（改动+项目名+id）' : '❌ FAIL')
process.exit(pass ? 0 : 1)
