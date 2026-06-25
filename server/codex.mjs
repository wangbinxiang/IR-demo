// 本地 Codex App/SDK 调用器：把 Codex 约束成只读 JSON 生成源，不让它操作当前项目。
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Codex } from '@openai/codex-sdk'
import { extractJSON, repairPrompt } from './json.mjs'

const DEFAULT_MODEL = process.env.IR_CODEX_MODEL || undefined
const WORKDIR = path.join(os.tmpdir(), 'ir-demo-codex-provider')

const codex = new Codex()

const threadOptions = (model) => ({
  ...(model || DEFAULT_MODEL ? { model: model || DEFAULT_MODEL } : {}),
  sandboxMode: 'read-only',
  workingDirectory: WORKDIR,
  skipGitRepoCheck: true,
  approvalPolicy: 'never',
  webSearchMode: 'disabled',
  networkAccessEnabled: false,
})

async function runOnce(system, prompt, resume, schema, model) {
  await fs.mkdir(WORKDIR, { recursive: true })

  const thread = resume ? codex.resumeThread(resume, threadOptions(model)) : codex.startThread(threadOptions(model))
  const input = system ? `${system}\n\n${prompt}` : prompt
  const turn = await thread.run(input, schema ? { outputSchema: schema } : {})
  if (!turn.finalResponse) throw new Error('Codex App 模型无输出')
  return { data: extractJSON(turn.finalResponse), sessionId: thread.id ?? resume }
}

// 对外：返回 { data, sessionId }。带一次解析失败重试，接口与 Claude provider 对齐。
export async function runCodexJSON(system, prompt, opts = {}) {
  try {
    return await runOnce(system, prompt, opts.resume, opts.schema, opts.model)
  } catch (e) {
    return await runOnce(system, repairPrompt(prompt, e), opts.resume, opts.schema, opts.model)
  }
}
