/**
 * Host bridge that brings EVERY Prompt Manager / Skill Manager capability to
 * the console front end.
 *
 * WHY A BRIDGE INSTEAD OF `ctx.promptManager` / `ctx.skillsManager`
 * The web profile's `cordis.patch.yml` mounts only coraek, websearch/admin and
 * aek-home. Prompt Manager and Skill Manager are mounted in the *dsh* profile,
 * so their in-process services simply do not exist in this host. Their CLIs
 * (`aekpm`, `aeksm`) are the primary human/script face anyway, so this route
 * drives exactly those CLIs — the same engine, the same commands, zero
 * duplicated business logic.
 *
 * SECURITY
 * - Plugin ids are a fixed whitelist; no arbitrary binary can be selected.
 * - The first argument must be a known command; no shell is used (execFile
 *   with an argument ARRAY), and shell metacharacters are rejected.
 * - Commands that change local data require an explicit `confirm: true` from
 *   the browser (the UI shows a second confirmation step).
 * - Bounded argv, 30s timeout, 1 MiB buffer, 64 KiB of returned text.
 *
 * The command catalogue is a complete static roster (so every capability is
 * visible even when the CLI cannot be spawned) PLUS top-level commands parsed
 * from `<cli> --help`, so new CLI commands show up automatically.
 *
 * @module aek-websearch/plugin-console
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@cheezmil/coraek/types'
import { readPluginMeta } from '@cheezmil/coraek/plugin-meta'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

/** Routes owned by this module. */
export const PLUGIN_CONSOLE_API_PATH = '/api/aek/plugin-console'
export const PLUGIN_CONSOLE_RUN_API_PATH = '/api/aek/plugin-console/run'

/** Hard bounds. */
const MAX_ARGS = 12
const MAX_ARG_LEN = 128
const TIMEOUT_MS = 30_000
const MAX_BUFFER = 1024 * 1024
const RETURN_LIMIT = 64 * 1024

/** Commands that only read state; everything else needs a confirmation. */
const READ_ONLY = new Set([
  'status', 'list', 'get', 'doctor', 'cost', 'check', 'help', '--help', '-h',
  'version', '--version', 'echo', 'catalog info', 'categories list',
  'categories status', 'preset list', 'provenance list', 'sync status',
  'backup list', 'audit security', 'audit overlap', 'audit descriptions',
  'audit security-whitelist', 'trigger test', 'project-rules',
])

/** @typedef {{ args: string[], label: string, mutating: boolean }} CommandSpec */
interface CommandSpec {
  args: string[]
  label: string
  mutating: boolean
}

interface PluginSpec {
  id: string
  packageName: string
  cli: string
  bin: string
  commands: CommandSpec[]
}

/**
 * Build a command spec; mutating defaults to true (deny-by-default).
 * @param args - command path, e.g. ['categories', 'list'].
 * @param label - short human description.
 * @param readOnly - true when the command only reads state.
 * @returns the spec.
 */
function spec(args: string[], label: string, readOnly = false): CommandSpec {
  return { args, label, mutating: !readOnly }
}

/** The complete Skill Manager CLI surface (see docs/CLI.md). */
const AEKSM_COMMANDS: CommandSpec[] = [
  spec(['status'], '查看 hub 状态', true),
  spec(['doctor'], '健康检查 / 断链修复建议', true),
  spec(['list'], '列出全部技能', true),
  spec(['get'], '读取单个技能', true),
  spec(['cost'], '技能体积 / 开销统计', true),
  spec(['check'], '校验技能结构', true),
  spec(['echo'], '回显解析结果', true),
  spec(['bootstrap'], '初始化 / 引导 hub'),
  spec(['init'], '新建技能'),
  spec(['edit'], '编辑技能'),
  spec(['add'], '添加技能'),
  spec(['update'], '更新技能'),
  spec(['archive'], '归档技能'),
  spec(['adopt'], '接管外部技能'),
  spec(['undistribute'], '撤销分发'),
  spec(['redistribute'], '重新分发'),
  spec(['distribute'], '分发技能到运行时'),
  spec(['distribute', 'rollback'], '回滚分发'),
  spec(['distribute-rollback'], '回滚分发（旧入口）'),
  spec(['migrate-views'], '迁移集合视图'),
  spec(['migrate-consumers'], '迁移消费者登记'),
  spec(['rebuild-collections'], '重建集合'),
  spec(['pool', 'reconcile'], '校对技能池'),
  spec(['categories', 'list'], '列出分类', true),
  spec(['categories', 'status'], '分类状态', true),
  spec(['categories', 'set'], '设置分类'),
  spec(['categories', 'add'], '新增分类'),
  spec(['categories', 'remove'], '删除分类'),
  spec(['categories', 'apply'], '应用分类'),
  spec(['preset', 'list'], '列出预设', true),
  spec(['preset', 'set'], '设置预设'),
  spec(['preset', 'remove'], '删除预设'),
  spec(['preset', 'apply'], '应用预设'),
  spec(['provenance', 'list'], '列出来源登记', true),
  spec(['provenance', 'adopt'], '认领来源'),
  spec(['sync', 'status'], '同步状态', true),
  spec(['sync', 'init'], '初始化同步'),
  spec(['sync', 'push'], '推送同步'),
  spec(['sync', 'pull'], '拉取同步'),
  spec(['backup', 'list'], '列出备份', true),
  spec(['backup', 'restore'], '恢复备份'),
  spec(['catalog', 'info'], '目录信息', true),
  spec(['catalog', 'refresh'], '刷新目录'),
  spec(['audit', 'security'], '安全审计', true),
  spec(['audit', 'security-whitelist'], '安全白名单审计', true),
  spec(['audit', 'overlap'], '重复度审计', true),
  spec(['audit', 'descriptions'], '描述质量审计', true),
  spec(['trigger', 'test'], '触发词测试', true),
]

/** The complete Prompt Manager CLI surface. */
const AEKPM_COMMANDS: CommandSpec[] = [
  spec(['status'], '查看当前映射状态', true),
  spec(['init'], '初始化全局提示词'),
  spec(['patch'], '打补丁到目标工具'),
  spec(['map'], '配置工具映射'),
  spec(['apply'], '应用提示词'),
  spec(['remove'], '移除提示词'),
  spec(['pr', 'init'], '初始化 project-rules'),
  spec(['pr', 'gen'], '生成项目规则文件'),
  spec(['project-rules'], '列出支持的项目规则目标', true),
  spec(['use'], '切换 local / npm 来源'),
  spec(['--help'], '查看完整帮助', true),
]

/** Fixed whitelist: the browser cannot pick any other binary. */
const PLUGINS: PluginSpec[] = [
  {
    id: 'aek-skill-manager',
    packageName: '@cheezmil/aek-skill-manager',
    cli: 'aeksm',
    bin: 'bin/aeksm.mjs',
    commands: AEKSM_COMMANDS,
  },
  {
    id: 'aek-prompt-manager',
    packageName: '@cheezmil/aek-prompt-manager',
    cli: 'aekpm',
    bin: 'bin/aekpm.js',
    commands: AEKPM_COMMANDS,
  },
]

/**
 * Repository root, derived from this module's own URL (no absolute path in
 * source). Works for a workspace checkout; falls back to Node resolution for
 * an installed package.
 * @returns {string | null} repository root.
 */
function workspaceRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Locate a plugin's CLI entry in the workspace or in node_modules.
 * @param plugin - the whitelisted plugin.
 * @returns {{ bin: string, source: string } | null} resolved bin.
 */
function resolveCli(plugin: PluginSpec): { bin: string; source: string } | null {
  const root = workspaceRoot()
  if (root !== null) {
    const local = join(root, 'packages', 'aek', 'coraek-plugins', plugin.id, plugin.bin)
    if (existsSync(local)) return { bin: local, source: 'workspace checkout' }
  }
  try {
    const manifestPath = require.resolve(`${plugin.packageName}/package.json`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { bin?: Record<string, string> }
    const entry = Object.values(manifest.bin ?? {})[0]
    if (entry !== undefined) {
      const bin = join(dirname(manifestPath), entry)
      if (existsSync(bin)) return { bin, source: 'installed package' }
    }
  } catch { /* not installed */ }
  return null
}

/** Cached help-derived commands per bin path. */
const helpCache = new Map<string, { at: number; names: string[] }>()

/**
 * Async version of `dynamicCommands`, with a 60s cache.
 * @param bin - CLI entry path.
 * @returns {Promise<string[]>} discovered command names.
 */
async function helpCommands(bin: string): Promise<string[]> {
  const cached = helpCache.get(bin)
  if (cached !== undefined && Date.now() - cached.at < 60_000) return cached.names
  let names: string[] = []
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [bin, '--help'], {
      timeout: 8_000, maxBuffer: 256 * 1024, encoding: 'utf8',
    })
    const text = `${String(stdout)}\n${String(stderr)}`
    const found = new Set<string>()
    // Only the `Commands:` SECTION counts. aekpm's hand-written help also has
    // a `Supported tools` section with two-space-indented agent ids
    // (claude-code, cursor, ...) that would otherwise look like commands.
    let inCommands = false
    for (const line of text.split(/\r?\n/u)) {
      const heading = line.trim()
      if (/^Commands?:\s*$/iu.test(heading)) { inCommands = true; continue }
      if (/^(?:Options|Supported tools|Arguments|Examples|Global Options):/iu.test(heading)) {
        inCommands = false
        continue
      }
      if (!inCommands) continue
      const match = /^\s{2,}([a-z][a-z0-9-]*)(?:\s{2,}|\s+\[|\s+<|\s*$)/u.exec(line)
      if (match !== null) found.add(match[1] ?? '')
    }
    names = [...found].filter(name => /^[a-z][a-z0-9-]*$/u.test(name))
  } catch { /* CLI not runnable — static roster still covers everything */ }
  helpCache.set(bin, { at: Date.now(), names })
  return names
}

/**
 * Build the catalogue the front end renders.
 * @returns {Promise<object>} catalogue payload.
 */
export async function readPluginConsole(): Promise<object> {
  const metaByName = new Map(readPluginMeta(workspaceRoot() ?? process.cwd()).map(item => [item.packageName, item]))
  const plugins = await Promise.all(PLUGINS.map(async (plugin) => {
    const cli = resolveCli(plugin)
    const meta = metaByName.get(plugin.packageName)
    const dynamic = cli === null ? [] : await helpCommands(cli.bin)
    const known = new Set(plugin.commands.map(item => item.args[0] ?? ''))
    const extra = dynamic
      .filter(name => !known.has(name))
      .map(name => spec([name], `${plugin.cli} ${name}`))
    return {
      id: plugin.id,
      packageName: plugin.packageName,
      cli: plugin.cli,
      version: meta?.version ?? '',
      distribution: meta?.distribution.value ?? '',
      languages: meta?.languages.languages ?? [],
      primaryLanguage: meta?.languages.primary ?? 'unknown',
      bin: cli?.bin ?? '',
      binSource: cli?.source ?? '',
      available: cli !== null,
      commands: [...plugin.commands, ...extra].map(item => ({
        args: item.args,
        name: item.args.join(' '),
        label: item.label,
        mutating: item.mutating,
      })),
    }
  }))
  return { plugins, generatedAt: new Date().toISOString() }
}

/** Send one JSON response (same convention as console.ts). */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Read a bounded JSON body. */
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.length
    if (size > 64 * 1024) break
    chunks.push(buffer)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
  } catch { /* bad-request below */ }
  return {}
}

/** Reject shell metacharacters / control characters in any argument. */
const UNSAFE_ARG = /[;&|`$><\n\r\0]/u

/**
 * Validate a requested command against the whitelist.
 * @param plugin - selected plugin.
 * @param raw - raw argv from the browser.
 * @returns {{ ok: true, args: string[], mutating: boolean } | { ok: false, message: string }} result.
 */
function validate(plugin: PluginSpec, raw: unknown): { ok: true; args: string[]; mutating: boolean } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ARGS) {
    return { ok: false, message: `command must be an array of 1..${String(MAX_ARGS)} arguments` }
  }
  const args: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ARG_LEN || UNSAFE_ARG.test(value)) {
      return { ok: false, message: 'invalid argument (empty, too long, or contains a shell metacharacter)' }
    }
    args.push(value)
  }
  const head = args[0] ?? ''
  const known = new Set(plugin.commands.map(item => item.args[0] ?? ''))
  if (!known.has(head)) {
    return { ok: false, message: `unknown command '${head}' — pick one from the catalogue` }
  }
  const joined = args.join(' ')
  const declared = plugin.commands.find(item => item.args.join(' ') === joined)
  const mutating = declared?.mutating ?? !READ_ONLY.has(head)
  return { ok: true, args, mutating }
}

/** The narrow `webServer` seam, spelled locally. */
function serverOf(ctx: Context): {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
} | undefined {
  return (ctx as unknown as {
    webServer?: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => void
    }
  }).webServer
}

/** @param ctx - the plugin context. */
export function registerPluginConsole(ctx: Context): void {
  const server = serverOf(ctx)
  if (server === undefined) return

  ctx.effect(() => server.register({
    kind: 'exact',
    path: PLUGIN_CONSOLE_API_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        res.setHeader('allow', 'GET')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use GET' })
        return
      }
      try {
        sendJson(res, 200, await readPluginConsole())
      } catch (error) {
        sendJson(res, 500, { code: 'catalog-failed', message: String((error as Error).message) })
      }
    },
  }), 'aek-websearch: plugin console catalogue')

  ctx.effect(() => server.register({
    kind: 'exact',
    path: PLUGIN_CONSOLE_RUN_API_PATH,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        sendJson(res, 405, { code: 'method-not-allowed', message: 'use POST' })
        return
      }
      const body = await readBody(req)
      const pluginId = typeof body.plugin === 'string' ? body.plugin : ''
      const plugin = PLUGINS.find(item => item.id === pluginId)
      if (plugin === undefined) {
        sendJson(res, 400, { code: 'unknown-plugin', message: 'plugin must be a whitelisted manager id' })
        return
      }
      const cli = resolveCli(plugin)
      if (cli === null) {
        sendJson(res, 503, { code: 'cli-missing', message: `${plugin.cli} CLI not found in this install` })
        return
      }
      const check = validate(plugin, body.command)
      if (!check.ok) {
        sendJson(res, 400, { code: 'invalid-command', message: check.message })
        return
      }
      if (check.mutating && body.confirm !== true) {
        sendJson(res, 428, {
          code: 'confirmation-required',
          message: 'this command changes local data — confirm it in the UI first',
          command: check.args.join(' '),
        })
        return
      }
      const started = Date.now()
      try {
        const { stdout, stderr } = await execFileAsync(process.execPath, [cli.bin, ...check.args], {
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
          encoding: 'utf8',
          cwd: workspaceRoot() ?? process.cwd(),
          env: { ...process.env },
        })
        const clip = (value: string) => value.length > RETURN_LIMIT
          ? `${value.slice(0, RETURN_LIMIT)}\n… (truncated)`
          : value
        sendJson(res, 200, {
          plugin: plugin.id,
          command: check.args,
          mutating: check.mutating,
          exitCode: 0,
          stdout: clip(String(stdout ?? '')),
          stderr: clip(String(stderr ?? '')),
          durationMs: Date.now() - started,
          bin: cli.bin,
        })
      } catch (error) {
        const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string; killed?: boolean }
        sendJson(res, 200, {
          plugin: plugin.id,
          command: check.args,
          mutating: check.mutating,
          exitCode: typeof failure.code === 'number' ? failure.code : 1,
          stdout: String(failure.stdout ?? '').slice(0, RETURN_LIMIT),
          stderr: String(failure.stderr ?? failure.message ?? 'command failed').slice(0, RETURN_LIMIT),
          timedOut: failure.killed === true,
          durationMs: Date.now() - started,
          bin: cli.bin,
        })
      }
    },
  }), 'aek-websearch: plugin console runner')
}
