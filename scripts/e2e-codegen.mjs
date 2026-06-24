// 端到端验证代码生成：打开代码面板 → 生成的 HTML 在真实浏览器(iframe)里渲染出全部内容
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

// 打开代码面板（默认预览 tab）
await page.click('text=</> 代码')
const frameEl = await page.waitForSelector('iframe[title=preview]', { timeout: 5000 })
await page.waitForTimeout(400)

// 进入 iframe，断言生成的代码渲染出了全部文案
const frame = await frameEl.contentFrame()
const frameText = await frame.evaluate(() => document.body.innerText)
// 注意：input 的 placeholder 不计入 innerText，单独校验
const expected = ['登录账户', '登录', '忘记密码', '注册']
const missing = expected.filter((t) => !frameText.includes(t))

// 断言生成结构：input 是真实 <input>（含 placeholder），button 是真实 <button>
const tags = await frame.evaluate(() => ({
  inputs: document.querySelectorAll('input').length,
  buttons: document.querySelectorAll('button').length,
  placeholders: [...document.querySelectorAll('input')].map((i) => i.placeholder),
  flexContainers: [...document.querySelectorAll('*')].filter(
    (e) => getComputedStyle(e).display === 'flex',
  ).length,
}))
const placeholdersOk = tags.placeholders.includes('邮箱') && tags.placeholders.includes('密码')

// 读源码 tab 校验 CSS
await page.click('button:has-text("源码")')
const source = await page.evaluate(() => document.querySelector('pre')?.textContent || '')

await browser.close()

// —— 响应式断言：导出 CSS 含两个 @media 断点块，且 mobile 块内某容器塌成纵向 ——
const hasTabletMedia = source.includes('@media (max-width: 1024px)')
const hasMobileMedia = source.includes('@media (max-width: 640px)')
// 640 块内应出现 flex-direction: column（features 容器在 mobile 塌列）
const mobileBlock = source.slice(source.indexOf('@media (max-width: 640px)'))
const mobileCollapses = hasMobileMedia && mobileBlock.includes('flex-direction: column')

console.log('console errors:', errors.length ? errors : '无')
console.log('iframe 缺失文案:', missing.length ? missing : '无（全部渲染）')
console.log('生成结构:', JSON.stringify(tags))
console.log('源码含 flex 布局:', source.includes('display: flex'))
console.log('源码含 box-sizing:', source.includes('box-sizing: border-box'))
console.log('@media 1024:', hasTabletMedia, ' @media 640:', hasMobileMedia, ' 640内塌列:', mobileCollapses)

console.log('input placeholders:', tags.placeholders)
const pass =
  errors.length === 0 &&
  missing.length === 0 &&
  tags.inputs === 2 &&
  tags.buttons === 1 &&
  placeholdersOk &&
  tags.flexContainers >= 3 &&
  source.includes('display: flex') &&
  hasTabletMedia &&
  hasMobileMedia &&
  mobileCollapses
console.log('\n结果:', pass ? '✅ PASS —— IR→HTML/CSS 生成正确（含响应式 @media），真实浏览器渲染一致' : '❌ FAIL')
process.exit(pass ? 0 : 1)
