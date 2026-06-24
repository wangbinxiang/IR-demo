// 端到端验证 AI 改图会话保温：
// 保存项目得唯一 sessionKey → 连续两次改图 → 第二次应 resumed:true，且指代消解生效
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

// 保存 → 取得唯一项目 id 作为 sessionKey（避免跨运行会话残留）
await page.fill('[data-testid=proj-name]', 'resume-test')
await page.click('text=保存')
await page.waitForFunction(() => window.__project.getState().id !== null, null, { timeout: 8000 })
const pid = await page.evaluate(() => window.__project.getState().id)

const editAndCapture = async (instruction) => {
  await page.fill('textarea', instruction)
  const respP = page.waitForResponse((r) => r.url().includes('/api/edit'), { timeout: 90000 })
  await page.click('text=🪄 改图')
  const body = await (await respP).json()
  await page.waitForTimeout(400) // 等 applyOps 落地
  return body
}

const submitFillBefore = await page.evaluate(() => window.__irStore.getState().ir.nodes.submit.style.fill)
const b1 = await editAndCapture('把登录按钮改成绿色')
const b2 = await editAndCapture('再把它的文字改大一点') // “它”靠会话上下文消解

const after = await page.evaluate(() => window.__irStore.getState().ir.nodes.submit.style)

// 清理
await page.evaluate((id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }), pid)
await browser.close()

console.log('console errors:', errors.length ? errors : '无')
console.log('sessionKey(项目id):', pid)
console.log('edit1 resumed:', b1.resumed, '| ops:', JSON.stringify(b1.ops))
console.log('edit2 resumed:', b2.resumed, '| ops:', JSON.stringify(b2.ops))
console.log('submit 最终样式:', JSON.stringify(after))

const edit2HitsSubmit = (b2.ops ?? []).some((o) => o.id === 'submit')
const pass =
  errors.length === 0 &&
  b1.resumed === false && // 首轮建会话
  b2.resumed === true && // 次轮复用会话
  after.fill !== submitFillBefore && // 第一次改色生效
  edit2HitsSubmit // 指代消解命中按钮
console.log('\n结果:', pass ? '✅ PASS —— 第二次改图复用会话，指代消解生效' : '❌ FAIL')
process.exit(pass ? 0 : 1)
