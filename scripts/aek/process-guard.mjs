#!/usr/bin/env node
/**
 * process-guard.mjs — PTC Python worker 孤儿进程巡检 / 清理 / 自检。
 *
 * 背景：从 dsh 复制来的 packages/experimental/ptc-runtime-python 会 spawn 独立
 * CPython worker。macOS 没有 PR_SET_PDEATHSIG，宿主被硬杀时 Node 侧的 dispose /
 * 进程组 SIGTERM 全都不跑，worker 变孤儿后可以钉死一核。上游
 * deepseek-ai/deepseek-harness Discussion #6661 从 2026-09 起 open 未修。
 * 主防线是 py/bootstrap.py 内的 _start_orphan_watchdog()（父 pid 变化即退出），
 * 本脚本是第二道：审计 + 兜底清理 + 可复跑的回归验证。
 *
 * 用法（不带任何参数 = 只读报告，零副作用）：
 *   node scripts/aek/process-guard.mjs                    # 只读扫描
 *   node scripts/aek/process-guard.mjs --check           # 只读；发现残留 exit 1
 *   node scripts/aek/process-guard.mjs --kill            # 预演，零副作用
 *   node scripts/aek/process-guard.mjs --kill --yes      # 真正 SIGTERM 清理
 *   node scripts/aek/process-guard.mjs --selftest        # 造孤儿场景验证看门狗
 *   node scripts/aek/process-guard.mjs --selftest --python python3.15
 *   node scripts/aek/process-guard.mjs --help
 *
 * 安全约定：
 *   - 默认只读；--kill 不带 --yes 一律 dry-run；绝不自动升级 SIGKILL。
 *   - 只匹配「PPID=1 且命令行带 PTC worker 特征」的进程，正常 worker 不受影响。
 *   - 所有路径相对仓库根计算，脚本内不出现任何绝对路径。
 *   - 巡检依赖 ps，仅 POSIX (macOS / Linux / WSL) 可用；Windows 明确跳过。
 *   - --selftest 会短暂造两个 100% CPU 的探针进程，内置超时与 SIGTERM 兜底。
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import process from 'node:process'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PY_DIR = join(ROOT, 'packages/experimental/ptc-runtime-python/py')

/** launch.ts 注入的 loader 会把这两个名字写进 Python 的 __file__ / 命令行。 */
const WORKER_MARKERS = ['dsh-ptc-protocol', 'dsh-ptc-bootstrap']
const PS_ARGS = ['-Ao', 'pid=,ppid=,pcpu=,etime=,command=']

const argv = new Set(process.argv.slice(2))
const has = (flag) => argv.has(flag)

function argValue(flag) {
  const list = process.argv.slice(2)
  const i = list.indexOf(flag)
  return i >= 0 ? list[i + 1] : undefined
}

const HELP = `process-guard — PTC Python worker 孤儿进程巡检

不带参数 = 只读扫描，零副作用。

  --check              只读；发现孤儿 worker 时 exit 1（适合长任务收尾）
  --kill               预演将清理哪些进程，不动手
  --kill --yes         真正清理（SIGTERM，优雅退出；不自动 SIGKILL）
  --selftest           造真实孤儿场景，验证 bootstrap.py 的看门狗仍有效
  --selftest --python <bin>   指定 Python 可执行文件（默认 python3）
  --help               显示本帮助

匹配条件：PPID=1（孤儿）且命令行含 dsh-ptc-protocol / dsh-ptc-bootstrap。
巡检依赖 ps，仅 POSIX；Windows 会明确跳过。脚本内无任何绝对路径。`

/** 只列出孤儿 PTC worker；ps 不可用或 Windows 时返回 null 表示「不支持」。 */
function scan() {
  if (process.platform === 'win32') return null
  let out
  try {
    out = execFileSync('ps', PS_ARGS, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
  const hits = []
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.*)$/.exec(line)
    if (!m) continue
    const [, pidText, ppidText, cpuText, etime, command] = m
    if (Number(ppidText) !== 1) continue
    if (!WORKER_MARKERS.some((marker) => command.includes(marker))) continue
    hits.push({ pid: Number(pidText), ppid: 1, cpu: Number(cpuText), etime, command })
  }
  return hits
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch { return false }
}

function report(hits) {
  console.log(`孤儿 PTC worker：${hits.length} 个`)
  for (const hit of hits) {
    console.log(`  pid=${hit.pid} ppid=1 cpu=${hit.cpu}% etime=${hit.etime}  ${hit.command.slice(0, 160)}`)
  }
  if (hits.length === 0) console.log('  （无；主防线是 bootstrap.py 内的父死看门狗）')
}

async function cleanup(hits) {
  for (const hit of hits) {
    if (!alive(hit.pid)) continue
    try {
      process.kill(hit.pid, 'SIGTERM')
      console.log(`  SIGTERM -> ${hit.pid}`)
    } catch (error) {
      console.log(`  跳过 ${hit.pid}：${String(error.message ?? error)}`)
    }
  }
  let remaining = []
  for (let i = 0; i < 15; i += 1) {
    remaining = hits.filter((hit) => alive(hit.pid))
    if (remaining.length === 0) break
    await delay(200)
  }
  if (remaining.length > 0) {
    console.log(`  仍有 ${remaining.length} 个未退出，不自动升级 SIGKILL，请人工确认：${remaining.map((h) => h.pid).join(', ')}`)
    return false
  }
  console.log('  全部已优雅退出')
  return true
}

/**
 * 造一个「父进程消失 + 事件循环被 CPU-bound 代码卡死」的 worker，并设对照组。
 * 对照组不装看门狗 → 应该一直卡住；实验组装了 → 应在秒级自行退出。
 * 两组都有超时与 SIGTERM 兜底，绝不会留下新的吃满 CPU 的残留。
 */
async function selftest(pythonBin) {
  const dir = mkdtempSync(join(tmpdir(), 'aek-process-guard-'))
  const sourcesPath = join(dir, 'sources.json')
  writeFileSync(sourcesPath, JSON.stringify({
    protocol: readFileSync(join(PY_DIR, 'protocol.py'), 'utf8'),
    bootstrap: readFileSync(join(PY_DIR, 'bootstrap.py'), 'utf8'),
  }))

  const probe = (withWatchdog) => [
    'import json, types, sys',
    `_sources = json.load(open(${JSON.stringify(sourcesPath)}, encoding="utf-8"))`,
    '_protocol = types.ModuleType("protocol")',
    '_protocol.__file__ = "<dsh-ptc-protocol>"',
    'exec(compile(_sources["protocol"], _protocol.__file__, "exec"), _protocol.__dict__)',
    'sys.modules["protocol"] = _protocol',
    '# 阻止 bootstrap 的 __main__ 守卫执行 main()（main 需要 fd 3）',
    '__name__ = "_aek_process_guard_probe"',
    'exec(compile(_sources["bootstrap"], "<dsh-ptc-bootstrap>", "exec"), globals())',
    withWatchdog ? '_start_orphan_watchdog()' : 'pass',
    'while True: pass',
  ].join('\n')

  const middlePath = join(dir, 'middle.mjs')
  writeFileSync(middlePath, [
    "import { spawn } from 'node:child_process'",
    "import { writeFileSync } from 'node:fs'",
    'const [bin, pyPath, pidPath] = process.argv.slice(2)',
    "const child = spawn(bin, ['-u', '-I', pyPath], { stdio: 'ignore', detached: true })",
    'writeFileSync(pidPath, String(child.pid))',
    'child.unref()',
    '// 模拟宿主不执行任何 dispose 就消失',
    'setTimeout(() => process.exit(0), 400)',
  ].join('\n'))

  async function trial(label, withWatchdog) {
    const pyPath = join(dir, `probe-${label}.py`)
    const pidPath = join(dir, `probe-${label}.pid`)
    writeFileSync(pyPath, probe(withWatchdog))
    const middle = spawn(process.execPath, [middlePath, pythonBin, pyPath, pidPath], { stdio: 'ignore' })
    const middleResult = await new Promise((done) => middle.on('exit', (code) => done(code)))
    let pid
    try {
      pid = Number(readFileSync(pidPath, 'utf8').trim())
    } catch {
      return { label, error: `探针未启动（middle exit=${String(middleResult)}，检查 --python ${pythonBin}）` }
    }
    const t0 = Date.now()
    let exited = false
    while (Date.now() - t0 < 8000) {
      if (!alive(pid)) { exited = true; break }
      await delay(200)
    }
    const elapsed = Date.now() - t0
    if (alive(pid)) {
      try { process.kill(pid, 'SIGTERM') } catch {}
      await delay(500)
    }
    return { label, pid, exited, elapsed, stillAlive: alive(pid) }
  }

  try {
    console.log(`selftest: python=${pythonBin}，构造孤儿 worker（含对照组）…`)
    const control = await trial('control', false)
    const patched = await trial('patched', true)
    console.log('  对照组（无看门狗）:', JSON.stringify(control))
    console.log('  实验组（有看门狗）:', JSON.stringify(patched))
    const pass = control.error === undefined && patched.error === undefined
      && patched.exited && !control.exited
      && !control.stillAlive && !patched.stillAlive
    console.log(pass
      ? `PASS  孤儿 worker 在 ${patched.elapsed}ms 内自行退出；对照组仍卡死，已用 SIGTERM 清掉`
      : 'FAIL  看门狗未生效或探针异常，请检查上面两组输出')
    return pass
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  if (has('--help')) {
    console.log(HELP)
    return 0
  }

  if (has('--selftest')) {
    return (await selftest(argValue('--python') ?? 'python3')) ? 0 : 1
  }

  const hits = scan()
  if (hits === null) {
    console.log('process-guard: 当前平台/环境不支持 ps 巡检（仅 POSIX），跳过。')
    return 0
  }
  report(hits)

  if (has('--check')) return hits.length === 0 ? 0 : 1

  if (has('--kill') && !has('--yes')) {
    console.log(`dry-run：将向 ${hits.length} 个进程发 SIGTERM（加 --yes 才真正执行）`)
    return 0
  }
  if (has('--kill') && has('--yes')) {
    if (hits.length === 0) return 0
    return (await cleanup(hits)) ? 0 : 1
  }
  return 0
}

process.exitCode = await main()
