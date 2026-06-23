// 端到端验证 React Native 代码生成：
// 切到 RN 目标读源码 → esbuild 校验是合法 TSX → 结构断言（组件/样式/文案）
import { chromium } from 'playwright'
import esbuild from 'esbuild'

const URL = process.env.URL || 'http://localhost:5179/'
const errors = []
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.innerText.includes('登录账户'), { timeout: 15000 })

await page.click('text=</> 代码')
await page.click('text=React Native')
await page.waitForTimeout(300)
const code = await page.evaluate(() => document.querySelector('pre')?.textContent || '')
await browser.close()

// 1) esbuild 解析校验：能否作为 TSX 编译（语法合法性）
let parseOk = true
let parseErr = ''
try {
  await esbuild.transform(code, { loader: 'tsx' })
} catch (e) {
  parseOk = false
  parseErr = e.message
}

// 2) 结构断言
const checks = {
  导入RN组件: /from 'react-native'/.test(code) && code.includes('TouchableOpacity'),
  有StyleSheet: code.includes('StyleSheet.create('),
  文字包在Text里: code.includes('<Text style={styles.title}>登录账户</Text>'),
  按钮是Touchable: code.includes('<TouchableOpacity'),
  输入框是TextInput: code.includes('<TextInput') && code.includes('placeholder="邮箱"'),
  用flexDirection: code.includes('flexDirection:'),
  fontWeight是字符串: /fontWeight: '700'/.test(code),
  fill映射flex1: code.includes('flex: 1') || code.includes("alignSelf: 'stretch'"),
}

console.log('console errors:', errors.length ? errors : '无')
console.log('TSX 可解析:', parseOk, parseOk ? '' : '→ ' + parseErr)
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✓' : '✗'} ${k}`)
console.log('\n--- 生成的 RN 代码（前 30 行）---')
console.log(code.split('\n').slice(0, 30).join('\n'))

const pass = errors.length === 0 && parseOk && Object.values(checks).every(Boolean)
console.log('\n结果:', pass ? '✅ PASS —— IR→React Native 生成合法且结构正确' : '❌ FAIL')
process.exit(pass ? 0 : 1)
