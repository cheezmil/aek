---
name: aek-usage
description: AEK 通用教程：环境自检与安装、部署（后端/桌面壳）、日常使用（aek 命令族）、开发（双槽 dev-cycle）、迭代（release/云编译）、排障速查。agent 要「检查 AEK 环境是否正确 / 帮用户装好 AEK」、或要开发迭代 AEK 自身时，先读这份。
---

# aek-usage（AEK 通用教程）

> **事实原则：源码 > 本手册。** 本手册可能过时；发现与仓库源码/脚本行为不符时，以源码为准，并顺手修正本手册（它住在
> `packages/aek/coraek-plugins/aek-skill-manager/aek-system-ohter-skills/aek-usage/SKILL.md`，
> 由 `scripts/aek/seed-system-skills.mjs --yes` 灌到各槽 hub 的
> `<AEK_HOME>/skill-manager/aek-system-skill/aek-usage/`）。

## 0. 给代办的 Agent：最短路径

用户说「检查 AEK 环境是否正确 / 帮我装好 AEK」时，按 §1 自检 → 缺什么按 §2 装 → 装完逐条验证 → 重启后端 → 复测。
全程**不要**在网页控制台里手工点安装（除非用户就在桌面壳前），命令行一步到位。

## 1. 环境自检（按序执行）

| 序 | 检查 | 命令 | 判定 |
|---|---|---|---|
| 1 | Node.js | `node --version` | 需 >= 20（AEK 现行开发机 = 24.x） |
| 2 | 包管理器 | `pnpm --version`（没有就 `npm --version`） | pnpm 优先，npm 可兜底 |
| 3 | AEK 宿主 CLI | `aek --version` | 形如 `@cheezmil/coraek/x.y.z` |
| 4 | 提示词管理 aekpm | `aekpm --version` | `@cheezmil/aek-prompt-manager/x.y.z` |
| 5 | Web 搜索 aekws | `aekws --version` | `@cheezmil/aek-websearch/x.y.z` |
| 6 | 技能管理 aeksm | `aeksm --version` | `@cheezmil/aek-skill-manager/x.y.z` |
| 7 | 后端在跑 | `curl -s -o /dev/null -w "%{http_code}" http://aek.localhost:1685/` | `200` = 在跑 |

> 桌面壳首启引导页（`/setup`）与右上角悬浮通知，展示的就是 1–7 的探测结果（壳 main 自己探测，
> 不依赖后端在跑）；装完点「进入控制台」即完成引导。

## 2. 安装

```sh
pnpm add -g @cheezmil/coraek @cheezmil/aek-prompt-manager @cheezmil/aek-websearch @cheezmil/aek-skill-manager
# 没有 pnpm 就：
npm install -g @cheezmil/coraek @cheezmil/aek-prompt-manager @cheezmil/aek-websearch @cheezmil/aek-skill-manager
```

装完逐条验证（§1 第 3–6 行），然后**重启 AEK 后端**（LaunchAgent 形态：重新 bootstrap 或直接 `aek web` 前台跑起来），
再复测一次 §1 全表。

**已知坑（2026-11）**：npm 现网 0.2.0/1.2.0/0.1.3 这三个旧版的 manifest 漏了 `workspace:` 协议，
工作区外 `pnpm add -g` 会报 `Cannot resolve package ... workspace packages were not loaded`。
**解法 = 装新版**（新发布链的 `pnpm pack` 已正确改写 workspace 依赖；旧版本 npm 不可重发，只能等/发新版）。
报错原文照抄给用户，别自己瞎猜。

## 3. 部署形态

- **后端 = web host**：默认槽 `aek` 端口 1685；开发槽 `next` 端口 1687。`aek web`（前台）或 LaunchAgent（自启动；
  仓库 `scripts/aek/service.mjs`）。**给 current 槽装 LaunchAgent 时，`service.mjs install` 必须在稳定树 cwd 下跑**
  （plist 的 programArguments 由执行脚本的树决定；开发树装会指向开发树 → 门禁 FAIL「指向开发树」）。
- **桌面壳 = `AEK.app`（Electron）**：窗口 `loadURL` 指到后端，**壳 asar 不含 webui**——UI 全部由后端 HTTP 服务，
  换血后端后在跑壳自动重载出新 UI。壳产物走 GitHub release（三平台×双架构；`.github/workflows/electron.yml`
  只接受手动 `workflow_dispatch`，绝不 push 触发，也不发 gitea）。
- 端口/数据根由宿主从槽位表运行时解析，**不要写死**在任何脚本或文档里。

## 4. 日常使用（aek 命令族）

宿主 CLI `aek`（`@cheezmil/coraek` 的 bin，四个子命令）：

- `aek web` — 起 web 宿主（控制台）；`aek logs` — 读壳与宿主的内置文本日志（无需 GUI）
- `aek runtime` — 能力运行时拓扑选择（share 进程内 / isolate 独立进程）
- `aek external` — 外部能力 provider（独立进程、标准协议）管理

能力 CLI（全部 `aek*` 前缀）：

- `aekpm`（提示词管理）：patch/map/remove/status + pr init/gen
- `aekws`（web 搜索）：search/extract/doctor/pool/status/use
- `aeksm`（技能管理）：list/status/import/distribute/update（hub = `<AEK_HOME>/skill-manager`）

**本仓永不发、不链、不调用任何 `dsh` 前缀命令**（`dsh` 是真 DeepSeek Harness 产品的命令，与 AEK 共存但不同物）。

## 5. 开发（双槽 dev-cycle，开发 AEK 自身时）

1. 开发/验收一律在 **next 槽**：仓库根 `pnpm exec node scripts/aek/launch.mjs --slot next dev-web`
   （宿主强制 `--no-open`，自动复用/起开发壳；手动散跑 `aek web` 必须自己带 `--no-open`）。
2. webui 调试走 **Electron 壳**（`capture-ui.mjs` 截图驱动 next 壳，CDP），禁止系统浏览器。
3. 起任何壳之前先 `node scripts/aek/shell-instances.mjs --check`（同槽最多一个壳主进程）；
   **禁止 `open -a AEK`**（LaunchServices 可能解析到 dev-variant 拉起重复实例），一律显式 bundle 路径。
4. 验收通过后收尾：`node scripts/aek/dev-cycle.mjs run --yes`（四步顺序不可换：
   卸两槽 LaunchAgent → `slots.mjs --stop-all --yes` → promote next→current → 只起 current 并装回 agent）
   → 只读门禁 `node scripts/aek/dev-cycle.mjs verify`（14 门）。
5. 最终状态只允许一个实例：`current`。

## 6. 迭代（release）

- 发布链：`node scripts/aek/release.mjs --yes`（next 的构建推 current + 打 tag + 回滚指针）；
  回滚：`node scripts/aek/release.mjs --rollback --yes`。
- **AI 自动执行发布链的前提 = `<AEK_HOME>/ai-release.json` 的 `{"allowed":true}`**（控制台「运行实例」节可切）；
  开关关闭/缺失时每次发布前必须征求用户同意。
- electron 层有变更才需要壳重打包（`desktop.mjs`）；壳重打包/云编译 = 手动触发 GitHub Actions
  （`electron-cloud.mjs` 指纹变了会提示你手动去云编译，指纹未变则安静）。
- git 提交/推送：作者本机走 `cqg`（多平台 token），全球 clone（无 cqg）用裸 git。

## 7. 排障速查（实测踩过的）

| 现象 | 真相 / 解法 |
|---|---|
| 壳启动瞬间 `ERR_CONNECTION_REFUSED` / `boot stalled: module system not created after 5s` | 壳先于后端就绪开窗口，reconnect watcher 会自动重载恢复，无需处理 |
| 探测 aekpm「未检测到」但实际装了 | 本机 aekpm 是 dev-link 指向稳定树代码，`--version` 面是 promote 后才有的；下一轮 release 后转绿（环境事实，非 bug） |
| LaunchAgent 重装后 verify FAIL「aek LaunchAgent plist: 指向开发树」 | `service.mjs install` 在开发树 cwd 跑了；从稳定树（aek-next）cwd 重装 |
| 重装 agent 时 launchd 装不上 / 端口抢注 | 旧 job 子进程还占着 1685；先把占用者清掉（端口空了）再 bootstrap |
| 开发壳（`~/.aek/next/dev/AEK Next.app`）被 slots 自动拉起 | dev-cycle 收尾会停 next 槽；残留 dev 壳 kill 掉即可（`shell-instances.mjs --check` 核对） |
| `pnpm add -g @cheezmil/*` 报 workspace 解析错 | 见 §2 已知坑：旧版 manifest 坏了，装新版 |

> 发现本手册与源码/现状不符：**以源码为准，顺手改这里**（源码是 `packages/aek/coraek-plugins/aek-skill-manager/aek-system-ohter-skills/aek-usage/`，改完跑 `node scripts/aek/seed-system-skills.mjs --yes` 灌两槽）。
