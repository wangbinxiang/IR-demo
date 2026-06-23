// 端到端验证：加载页面 → 检查渲染 → 真实模拟拖拽重排 → 断言 IR 顺序变化
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })

// 1) 等 yoga 加载完成 + 形状渲染出来（等到出现“登录账户”标题文本）
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

// 2) 确认所有节点都渲染了文案
const texts = ['登录账户', '邮箱', '密码', '登录', '忘记密码？', '注册']
const bodyText = await page.evaluate(() => document.body.innerText)
const missing = texts.filter((t) => !bodyText.includes(t))

// 3) 读初始顺序
const before = await page.evaluate(() => window.__irStore.getState().ir.nodes.card.childIds)

// 4) 真实拖拽：把“登录”按钮拖到“标题”上方，期望它被插到 card 的第 0 位
const coords = await page.evaluate(() => {
  const editor = window.__editor
  const store = window.__irStore.getState()
  // 用 tldraw 形状的页面坐标 → 屏幕坐标
  const submit = editor.getShape(editor.getCurrentPageShapes().find((s) => s.props?.nodeId === 'submit').id)
  const title = editor.getShape(editor.getCurrentPageShapes().find((s) => s.props?.nodeId === 'title').id)
  const sCenter = editor.pageToScreen({ x: submit.x + submit.props.w / 2, y: submit.y + submit.props.h / 2 })
  // 目标：标题上方一点点（落到 card 顶部 → index 0）
  const tTop = editor.pageToScreen({ x: title.x + title.props.w / 2, y: title.y - 4 })
  return { from: sCenter, to: tTop }
})

// 执行带步进的鼠标拖拽（超过点击阈值才会触发 translate）
await page.mouse.move(coords.from.x, coords.from.y)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(
    coords.from.x + ((coords.to.x - coords.from.x) * i) / 10,
    coords.from.y + ((coords.to.y - coords.from.y) * i) / 10,
  )
}
await page.mouse.up()
await page.waitForTimeout(300)

// 5) 读拖拽后的顺序
const after = await page.evaluate(() => window.__irStore.getState().ir.nodes.card.childIds)

await browser.close()

// —— 报告 ——
console.log('console errors:', errors.length ? errors : '无')
console.log('缺失文案:', missing.length ? missing : '无（全部渲染）')
console.log('拖拽前 card 顺序:', before.join(', '))
console.log('拖拽后 card 顺序:', after.join(', '))

const orderChanged = JSON.stringify(before) !== JSON.stringify(after)
const submitMovedUp = after.indexOf('submit') < before.indexOf('submit')
const pass = errors.length === 0 && missing.length === 0 && orderChanged && submitMovedUp
console.log('\n结果:', pass ? '✅ PASS —— 渲染正常、拖拽触发了 auto-layout 重排序' : '❌ FAIL')
process.exit(pass ? 0 : 1)
