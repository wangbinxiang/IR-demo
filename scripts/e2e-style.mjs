// 端到端验证右侧样式面板：
// A) 点选叶子(按钮) → 面板出现 → 改文案 → IR 与画布更新
// B) 程序化选中容器(card) → 面板出现布局控件
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

// —— A) 点选 submit 按钮 ——
const pt = await page.evaluate(() => {
  const editor = window.__editor
  const s = editor.getCurrentPageShapes().find((s) => s.props?.nodeId === 'submit')
  const c = editor.pageToScreen({ x: s.x + s.props.w / 2, y: s.y + s.props.h / 2 })
  return { x: c.x, y: c.y }
})
await page.mouse.click(pt.x, pt.y)
await page.waitForFunction(() => window.__selection.getState().selectedId === 'submit', null, { timeout: 5000 })

// 面板出现且标注 #submit
const panelVisible = await page.locator('[data-panel=style]').isVisible()
const showsId = await page.locator('[data-panel=style]').locator('text=#submit').isVisible()

// 改文案：面板内唯一的纯文本 input（排除 number/color）
const textInput = page.locator('[data-panel=style] input:not([type=number]):not([type=color])')
await textInput.fill('提交')
await textInput.dispatchEvent('input')
await page.waitForTimeout(300)
const newText = await page.evaluate(() => window.__irStore.getState().ir.nodes.submit.props.text)
// 画布上的按钮形状是否重渲染为新文案
const canvasShowsNewText = await page.evaluate(() => document.body.innerText.includes('提交'))

// —— B) 程序化选中容器 card ——
await page.evaluate(() => {
  const editor = window.__editor
  const s = editor.getCurrentPageShapes().find((s) => s.props?.nodeId === 'card')
  editor.select(s.id)
})
await page.waitForFunction(() => window.__selection.getState().selectedId === 'card', null, { timeout: 5000 })
const showsLayout = await page.locator('[data-panel=style]').locator('text=方向').isVisible()

await browser.close()

console.log('console errors:', errors.length ? errors : '无')
console.log('A 面板可见:', panelVisible, '| 标注#submit:', showsId)
console.log('A 改文案后 IR.submit.text:', newText, '| 画布显示新文案:', canvasShowsNewText)
console.log('B 容器选中后显示布局控件(方向):', showsLayout)

const pass =
  errors.length === 0 && panelVisible && showsId && newText === '提交' && canvasShowsNewText && showsLayout
console.log('\n结果:', pass ? '✅ PASS —— 样式面板选中联动、编辑回写 IR、容器布局可调' : '❌ FAIL')
process.exit(pass ? 0 : 1)
