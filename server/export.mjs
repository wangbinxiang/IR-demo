// 导出：把前端生成的多端代码文件写到磁盘 exports/<name>/ 下。
import { promises as fs } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'exports')

// 文件夹名清洗：非法字符替换为 _，防目录穿越
function safeName(name) {
  const s = (name || 'untitled').replace(/[^\w一-龥-]+/g, '_').slice(0, 64)
  return s || 'untitled'
}

// files: [{ path, content }]。写入 exports/<name>/，返回绝对目录路径与写入清单。
export async function exportFiles(name, files) {
  if (!Array.isArray(files) || !files.length) throw new Error('files 为空')
  const dir = path.join(ROOT, safeName(name))
  await fs.mkdir(dir, { recursive: true })
  const written = []
  for (const f of files) {
    // 单层文件名，禁止子路径/穿越
    const base = path.basename(f.path || 'file.txt')
    await fs.writeFile(path.join(dir, base), String(f.content ?? ''), 'utf8')
    written.push(base)
  }
  return { dir, files: written }
}
