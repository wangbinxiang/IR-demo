import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 开发中间件：POST /api/generate —— 调本地 Claude Code 把 prompt 生成 DSL。
// 放在 Vite 进程内，无需单开后端/代理。
function aiBackend(): Plugin {
  return {
    name: 'ir-ai-backend',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('Method Not Allowed')
        }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const { prompt } = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          if (!prompt || typeof prompt !== 'string') {
            res.statusCode = 400
            return res.end(JSON.stringify({ error: 'prompt 必填' }))
          }
          // 懒加载，避免 SDK 初始化拖慢配置加载
          const { generateDSL } = await import('./server/generate.mjs')
          const dsl = await generateDSL(prompt)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ dsl }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (e as Error).message }))
        }
      })

      // POST /api/edit —— 当前 IR 概览 + 指令 → 编辑操作 op[]
      server.middlewares.use('/api/edit', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('Method Not Allowed')
        }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const { outline, instruction, sessionKey } = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          if (!outline || !instruction) {
            res.statusCode = 400
            return res.end(JSON.stringify({ error: 'outline 与 instruction 必填' }))
          }
          const { generateOps } = await import('./server/edit.mjs')
          const result = await generateOps(outline, instruction, sessionKey)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ops: result.ops ?? [], resumed: result.resumed }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (e as Error).message }))
        }
      })

      // POST /api/export —— 把前端生成的多端代码写到磁盘 exports/<name>/
      server.middlewares.use('/api/export', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('Method Not Allowed')
        }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const { name, files } = JSON.parse(Buffer.concat(chunks).toString() || '{}')
          const { exportFiles } = await import('./server/export.mjs')
          const result = await exportFiles(name, files)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (e as Error).message }))
        }
      })

      // /api/projects 项目持久化（列表/读/写/删，存为本地 JSON 文件）
      server.middlewares.use('/api/projects', async (req, res) => {
        const json = (code: number, body: unknown) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const readBody = async () => {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          return JSON.parse(Buffer.concat(chunks).toString() || '{}')
        }
        try {
          const P = await import('./server/projects.mjs')
          // 挂载在 /api/projects 后，req.url 为 '/'（集合）或 '/<id>'（单项）
          const id = (req.url || '/').split('?')[0].replace(/^\//, '')
          if (!id) {
            if (req.method === 'GET') return json(200, { projects: await P.listProjects() })
            if (req.method === 'POST') return json(200, await P.saveProject(await readBody()))
          } else {
            if (req.method === 'GET') return json(200, await P.readProject(id))
            if (req.method === 'PUT') return json(200, await P.saveProject({ ...(await readBody()), id }))
            if (req.method === 'DELETE') {
              await P.deleteProject(id)
              return json(200, { ok: true })
            }
          }
          json(405, { error: 'Method Not Allowed' })
        } catch (e) {
          json(500, { error: (e as Error).message })
        }
      })
    },
  }
}

// yoga-layout 以 wasm/asm 形式发布，需排除预打包以保证其内置的异步加载逻辑正常工作
export default defineConfig({
  plugins: [react(), aiBackend()],
  optimizeDeps: {
    exclude: ['yoga-layout'],
  },
})
