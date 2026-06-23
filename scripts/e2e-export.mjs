// 端到端验证导出到磁盘：UI 点导出 → 后端写文件 → 校验磁盘上的文件存在且内容正确
import { chromium } from 'playwright'
import { promises as fs } from 'node:fs'
import path from 'node:path'

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

// 用一个独特项目名，便于定位导出目录
await page.fill('[data-testid=proj-name]', 'export-test')

// 打开代码面板并点导出，捕获 /api/export 响应
await page.click('text=</> 代码')
const respP = page.waitForResponse((r) => r.url().includes('/api/export'), { timeout: 10000 })
await page.click('text=导出到磁盘')
const body = await (await respP).json()
await browser.close()

// 校验磁盘文件
const dir = body.dir
let htmlOk = false
let rnOk = false
let irOk = false
if (dir) {
  const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8').catch(() => '')
  const rn = await fs.readFile(path.join(dir, 'GeneratedScreen.tsx'), 'utf8').catch(() => '')
  const ir = await fs.readFile(path.join(dir, 'design.ir.json'), 'utf8').catch(() => '')
  htmlOk = html.includes('<!doctype html>') && html.includes('登录账户')
  rnOk = rn.includes("from 'react-native'") && rn.includes('StyleSheet.create(')
  irOk = ir.includes('"rootId"') && ir.includes('"nodes"')
  // 清理
  await fs.rm(dir, { recursive: true, force: true })
}

console.log('console errors:', errors.length ? errors : '无')
console.log('导出目录:', dir)
console.log('写入文件:', JSON.stringify(body.files))
console.log('index.html 正确:', htmlOk, '| GeneratedScreen.tsx 正确:', rnOk, '| design.ir.json 正确:', irOk)

const pass = errors.length === 0 && !!dir && htmlOk && rnOk && irOk
console.log('\n结果:', pass ? '✅ PASS —— 一份 IR 导出 web+RN 代码与 IR JSON 到磁盘' : '❌ FAIL')
process.exit(pass ? 0 : 1)
