// 持久化：每个项目一份 JSON 存在 <repo>/projects/<id>.json。
// 文件结构：{ id, name, updatedAt, ir }
import { promises as fs } from 'node:fs'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'projects')

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true })
}

function fileFor(id) {
  // 防目录穿越：只允许字母数字/下划线/连字符
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('非法项目 id')
  return path.join(DIR, `${id}.json`)
}

function newId() {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

// 列出所有项目的元信息（不含完整 IR），按更新时间倒序
export async function listProjects() {
  await ensureDir()
  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'))
  const metas = []
  for (const f of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'))
      metas.push({ id: data.id, name: data.name, updatedAt: data.updatedAt })
    } catch {
      // 跳过损坏文件
    }
  }
  return metas.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

// 读取单个项目（含完整 IR）
export async function readProject(id) {
  const data = JSON.parse(await fs.readFile(fileFor(id), 'utf8'))
  return data
}

// 写入/更新项目。无 id 则新建。返回保存后的元信息。
export async function saveProject({ id, name, ir }) {
  await ensureDir()
  const pid = id || newId()
  const record = { id: pid, name: name || '未命名', updatedAt: Date.now(), ir }
  await fs.writeFile(fileFor(pid), JSON.stringify(record, null, 2), 'utf8')
  return { id: pid, name: record.name, updatedAt: record.updatedAt }
}

export async function deleteProject(id) {
  await fs.rm(fileFor(id), { force: true })
}
