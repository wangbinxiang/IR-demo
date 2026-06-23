// 端到端验证拖拽插入指示线：
// 按住拖动(不松手) → 指示线出现 → 松手 → 指示线消失且发生重排
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

const before = await page.evaluate(() => window.__irStore.getState().ir.nodes.card.childIds)

// 计算 submit 中心与目标(标题上方)的屏幕坐标
const coords = await page.evaluate(() => {
  const e = window.__editor
  const s = e.getCurrentPageShapes().find((x) => x.props?.nodeId === 'submit')
  const t = e.getCurrentPageShapes().find((x) => x.props?.nodeId === 'title')
  return {
    from: e.pageToScreen({ x: s.x + s.props.w / 2, y: s.y + s.props.h / 2 }),
    to: e.pageToScreen({ x: t.x + t.props.w / 2, y: t.y - 4 }),
  }
})

// 按住并移动（不松手）
await page.mouse.move(coords.from.x, coords.from.y)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(
    coords.from.x + ((coords.to.x - coords.from.x) * i) / 10,
    coords.from.y + ((coords.to.y - coords.from.y) * i) / 10,
  )
}
await page.waitForTimeout(100)

// 拖动中：指示线应可见，且 store 有 line
const indicatorDuringDrag = await page.locator('[data-testid=drag-indicator]').count()
const lineDuringDrag = await page.evaluate(() => window.__dragIndicator.getState().line !== null)

// 松手
await page.mouse.up()
await page.waitForTimeout(300)

const indicatorAfterDrop = await page.locator('[data-testid=drag-indicator]').count()
const after = await page.evaluate(() => window.__irStore.getState().ir.nodes.card.childIds)

await browser.close()

console.log('console errors:', errors.length ? errors : '无')
console.log('拖动中指示线 DOM 数:', indicatorDuringDrag, '| store.line 非空:', lineDuringDrag)
console.log('松手后指示线 DOM 数:', indicatorAfterDrop)
console.log('拖动前顺序:', before.join(', '))
console.log('拖动后顺序:', after.join(', '))

const reordered = JSON.stringify(before) !== JSON.stringify(after)
const pass =
  errors.length === 0 &&
  indicatorDuringDrag === 1 &&
  lineDuringDrag &&
  indicatorAfterDrop === 0 &&
  reordered
console.log('\n结果:', pass ? '✅ PASS —— 拖动时显示插入指示线，松手后消失并重排' : '❌ FAIL')
process.exit(pass ? 0 : 1)
