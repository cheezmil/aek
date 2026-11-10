# AGENTS.md — Agent Enhance Kit (AEK)

> 本仓库的最高优先级协作约定。任何 AI agent / 开发者动手前先读。
>
> **事实冲突时的优先级：源码现状 > 本文件 > `scripts/aek/upstream/scope.mjs` > 项目笔记。**
>
> 笔记是历史记录、会过时；发现不一致一律以源码为准，并顺手把过时笔记标注或清掉，不要照着旧笔记继续干。

---

## 1. 这个项目是什么（先搞清楚目的）

AEK 一开始从 `deepseek-harness`（简称 dsh）整仓复制而来，削减了很多不需要的东西，**是一次性分叉，不是 dsh 的长期下游**：

- 保留 dsh 的 **cordis 运行时架构**（coraek 建立在它之上，这部分一个都不能少）
- 自己改了 **web** 和 **desktop**
- 自己加了 **aek 插件体系** 和 **coraek 架构**

不需要「追平上游」，不需要把 dsh 的全套 CI / 文档站 / 双语规范 / 发版史搬回来。**目标是让 aek 自己写的代码能跑、能测、能发版。**

## 2. 上游边界（判断「这个东西要不要」的第一依据）

- **不持续同步 dsh 上游**，不做长期同步机制（用户 2026-11-05 定调）。
- **cordis 运行时架构必须完整保留**：`vendor/**`、`packages/typert/**`、4 个 `cordis-*` 扩展、`packages/aek/base/coraek/**`、cordis 契约脚本与测试。
- **唯一真源**：`scripts/aek/upstream/scope.mjs`（`KEEP` / `DROP` / `DOC_GATES` 三张表）。改边界先改它，再跑 `node scripts/aek/upstream/scope.mjs --check`。
- 已裁决：`.github/` **不恢复**（aek 没有 GitHub Actions）；`docs/` 治理层已删 251 文件 / 4.7MB，只剩 2 个文件。
- **禁止为了让复制过来的 dsh 门禁变绿，而搬回 dsh 的文档 / CI / 测试夹具。** 这是本项目反复踩过的坑。
- `docs/cordis-api/inherited.md` 不是文档站页面，是 typert 测试逐字节比对的 **cordis 契约快照**，必须保留。

## 3. 测试与门禁：哪些要管、哪些不用管（AI 自行判定，别把技术取舍抛给用户）

**实测现状**：全仓 1670 个 `*.spec.ts`（`packages/` 1503、`scripts/` 145、`apps/` 22），**全部是从 dsh 复制过来的**；aek 自有代码 `packages/aek/` + `apps/aek-desktop/` 共 304 个源文件，**0 个自有 spec**。所以「全绿」不是本项目的目标，也不要拿 dsh 的失败数当项目健康度。

**判定口径：这个测试/门禁验证的是不是「AEK 自己写的代码」或「cordis 运行时契约」？**

| 类别 | 要不要管 | 例子 |
|---|---|---|
| aek 自有代码的行为测试 | **要管**（且目前缺失，值得补） | `packages/aek/**`、`apps/aek-desktop/**` |
| cordis 运行时契约 | **要管** | `scripts/cordis-*`、`packages/typert/**`、`verify-cordis-config`、`verify-cordis-inspect-catalog`、`gen-cordis-inspect-catalog` |
| 代码质量门 | **要管** | `pnpm run lint`（当前 0 错 0 警告）、`pnpm run typecheck` |
| dsh 治理层 spec | **不用管** | CI workflow（`.github/`）、文档站/双语翻译、session 持久化变更史与发版记录、子系统页面、dsh 文档写作规范 |
| 需要网络 / 外部快照的 dsh 用例 | **不用管**（除非 aek 自己依赖它） | 上游 API 快照、snapshot 比对 |

这些「不用管」的用例在 aek 里**没有对应产物**，红了属于「上游门禁不适用」，**不是 bug**。处理规则：

- 优先在 `vitest.config.ts` 的 `aekExcludedDshDocSpecs` 里**登记排除**，**不删 spec 文件**（`run-gates.ts` 的门和 lint baseline 仍引用它们）。
- `run-gates.ts` 的 `docSyncLeafGates()` 里约 17 个 dsh 文档门只在 dsh 的 `doc-sync` / `ci-static` 聚合里跑，**aek 不跑这些 mode**。若将来要跑 `check:all`，逐条摘，且**别连 `cordis-inspect-catalog` / `tool-catalog` / `config-catalog` / `tsconfig-paths` 这些代码契约门一起删**，并同步改 `run-gates.spec.ts` 里硬编码的 gate id 期望。
- 已排除：`scripts/doc-standard.spec.ts`、`scripts/persistence-developer.spec.ts`、`scripts/translation-prompt.spec.ts`。

**常用验证**：`pnpm run lint`、`pnpm test`（= build:native-system + vitest run）、`pnpm run typecheck`、`node scripts/aek/upstream/scope.mjs --check`。`pnpm run check:all` 会跑 dsh 聚合门禁，结果里的 dsh 文档门红按上表忽略。

> **不要让用户裁决技术细节。** 测试取舍、门禁增删、夹具是否恢复，一律按本文件自行判断并执行，在结果里写清依据即可。只有**不可逆或涉及外部系统**的动作才需要确认：`npm publish` / 发布、删除用户文件、推远端生产、系统级配置改动。

## 4. 代码与架构

- **数据目录的位置由清单决定，不由代码推导**：`<容器>/aek.yaml`（默认 `~/.aek/aek.yaml`）记录每个槽的数据根、`backups/` 以及槽内各目录（`dirs`）。要搬家——插一层父文件夹、换外置盘、给某个目录改名——**只改这个文件**。代码里只允许通过 `@cheezmil/coraek/home`（`resolveAekHome` / `aekHomePath` / `aekBackupsPath`）与 `@cheezmil/coraek/slots`（`slotHome`）取路径；`join(..., 'current')` 这类推导一律禁止，`scripts/aek/verify-aek-home.mjs` 会拦。查看/校验/生成清单：`node scripts/aek/paths.mjs [show|check|init]`（默认只读）。
- **禁止硬编码任何绝对路径**——项目面向全球用户。源码与配置里的路径一律相对仓库根、由运行时解析；本文件同样不写开发者本机的绝对路径（笔记目录、临时目录、clone 目标等一律由使用者当轮提供，不预设）。**同样禁止出现任何真实用户名**：`/Users/<人名>`、`/home/<人名>`、`C:\Users\<人名>` 在代码、注释、文档、测试夹具、生成模板里都不允许——注释会进 fork 和截图，夹具会把作者身份固化进仓库，模板会把作者家目录复制进每个用户的数据目录。占位写 `<user>` / `~` / `$HOME` / `%USERPROFILE%`，测试用 `tester` / `fixture`。`node scripts/aek/verify-user-paths.mjs`（`pnpm verify:user-paths`）会扫 AEK 自有目录，`--all` 可扫全仓做人工复核。
- **改 dsh 原来源码，优先通过 `aek-base` 插件（现包名 `@cheezmil/coraek`）扩展**；cordis 插件能做到的都在插件层做，实在解决不了才直接改源码。注意：cordis 插件是**运行时**扩展点，管不到 vitest spec 和 `run-gates` 这类构建期门禁，别硬套。
- **框架直接装、别 vendor；别人 MIT 产品整只复制后裁剪；只有 AEK 自己的能力自己写。** 例外：已存在的 `vendor/cordis/` 是本次分叉保留的运行时资产，属于 KEEP，不要按「别 vendor」这条去删它。
- 插件接口分层：**CLI 必须**（`aek{能力名}`，入口 `bin/*.mjs`）、**MCP 只有 `aek-mcp-gateway` 需要**、**REST 可选**。
- 插件从 `@cheezmil/coraek` 的类型入口导入 `Context` / `Volatile` / `ClientContext`，**不直接 import cordis**。
- `aek-for-dsh` 是 `cordis.patch.yml` **bundle**（一次注册所有 aek 插件），不是插件，不承担 `apply(ctx)`。
- 不凭空造 `aek-core` 之类中间包；`aek-base`/coraek 只做身份层与类型 re-export，不放业务逻辑。
- `vendor/*/src/` 不要随手改；确需改要按 `vendor/README.md` 的流程记录。

## 5. Electron / 桌面

- 成品必须在 **Spotlight 和 Finder 里显示为 `AEK.app`**，不能是默认的「Electron」。
- 本地 macOS 开发用 **cheezmil 签名**，**禁止 adhoc 签名**；打开时不能出现「无法打开，你应该将它移到废纸篓」。
- **只能有一个 AEK.app 实例**：开发测试启动新实例前必须先终止旧实例，不允许出现多个并排 / 重复。
- 启动、重启、验证优先写 **`.mjs` 脚本**，不要每次手敲长命令。
- macOS 一律 **arm64** 原生，不用 Intel/x86 转译（除非该依赖确实只有 x86 版本）。

## 6. 工程流程

- 所有命令**先 cd 到仓库根**再执行。
- **提交/推送一律用 `cqg`，禁止裸 `git`**（会绕过 token 注入与 exclude 校验）。非交互提交：`cqg acp --all -m "..."`；只推不提交 `cqg push-only`；其它 git 操作 `cqg git <args> --platform <name>`。
- 脚本 **不带参数默认必须是安全的只读 / dry-run，零副作用**；`--prune` / `--copy` 之类改变状态的操作必须显式 `--yes` 才生效。dry-run 要逐行确认没有漏网的真实执行点。
- 改动用户级 / 系统级配置文件（shell 启动文件、工具配置目录、系统配置等）前**先留 `<原文件名>.bak.<时间戳>-pre-edit` 备份**；同类提权操作合并成一次授权，需要 sudo 就直接 sudo。
- 需要提权的注册类操作（如 launchd bootstrap）在沙箱内会失败，需在沙箱外执行并自检。
- **已知上游缺陷**：`packages/experimental/ptc-runtime-python` 的 CPython worker 在 macOS 上会因宿主被硬杀变成孤儿并吃满一核（dsh 上游 Discussion #6661，2026-09 起 open 未修；父死后 Node 侧的 `dispose()` / 进程组信号全部不执行）。主防线是 `py/bootstrap.py` 的 `_start_orphan_watchdog()`（父 pid 变化即退出），**不要删、不要绕过**；它是独立 Python 子进程，cordis 插件层在架构上管不到，属于「实在解决不了才直接改源码」的例外。
- 长时间 / 全量测试收尾执行 `node scripts/aek/process-guard.mjs --check` 做只读巡检；发现残留用 `--kill --yes`（SIGTERM 优雅退出，不自动升级 SIGKILL）。改动 Python 引导逻辑后必须跑 `--selftest`（含对照组）确认看门狗仍有效。
- **「以后手动检查」不算解决方案**。反复出现 ≥2 次的环境问题，必须有自动生效的机制（子进程自检、入口隔离等），手动巡检只能当辅助；还要先上网查上游 issue 与开源方案，别只从本机现象推原因。
- 跑重 CPU 的自检 / 验证脚本时**不要和带短超时的测试并行**（dsh 上游存在 5s 超时用例，CPU 被抢会假红）。串行跑；出现超时先单独复跑该用例，再判断是不是回归。

## 7. 笔记与 Todo

- 笔记目录由使用者在会话中给出，属于本机资料、**不在本仓库内**；本文件不预设它的位置，找不到就先问，别猜。
  - 目录内的固定结构：当前待办 `todos/aek-todos.md`；**已完成的 todo 移到 `todos/archive/`**；架构决策/参考放 `references/`；完成记录放 `archive/`。
  - **todo 与 archive 只放在上述子目录里**，不要散落到笔记目录本身、它的上层目录或项目根。
- 用户需求随时会变：**过时或不正确的 todo 及时清理**，不要留着误导下一轮；详情写归档、live 只留指针。
- 用户没明确要求时**不新建 skill**；要写就写在使用者指定的目录下，结构遵循使用者提供的 skill 结构范例（`SKILL.md` + `assets/` + `references/` + `scripts/`），文件夹名**不带 `skill` / `notes` 等冗余词**；主题相近先问用户是否合并成一个。

## 8. 调研与工具

- **上网搜索只用 aek websearch skill**（`aekws`），且要**多次搜索交叉确认**；**禁止 `| head` 截断结果**；未经用户允许不用其它工具联网搜索。可配合 `gh` CLI。
- **遇到不会的先上网搜**，棘手问题主动找解决办法和开源项目借鉴，**不要全部自己写**。
- 找 GitHub 仓库就 clone 下来看（必须 `--filter=blob:none`）；clone 到哪个目录由使用者当轮指定（不同操作系统位置不同，不预设）；有 release 就用 release，不要擅自编译；总结时写清编程语言、技术栈、star 数。
- 下载二进制优先 `aria2`，GitHub 资源用 `gh` CLI；装软件默认 Homebrew。
- 推荐跨平台开源工具时，按**网友评价推荐度 → 热度**综合排序，写明编程语言与真实依据（star / 仓库路径 / 日期），**不要凭印象编造**；默认偏好免费 + 开源 + 原生实现，避开付费墙。
- 断言版本 / 兼容性等事实前**先检索核实**，拿不准就写「待核实」，禁止凭记忆下结论。

## 9. 过时笔记核对（2026-11-05）

历史笔记里有一批与源码不符的事实，**已在本次整理中修正**，别再按旧表述干：

| 出处 | 曾经的错误 | 当前事实 / 处理 |
|---|---|---|
| `references/AEK不可违背原则.md` P3 | 「别把 cordis vendor 进仓」 | `vendor/cordis/` 真实存在且属 KEEP → 已加修订说明，禁止删 |
| 同上 P4 / P6 / P10 | 包名 `@cheezmil/aek-base`、11-02 版本号快照 | 现名 `@cheezmil/coraek`（旧名引用 0 处）；已改为「版本一律查 `package.json` / `npm view`」 |
| 同上 P8 | `aek-mcp-router` | 现名 `aek-mcp-gateway`，已改 |
| 同上 P12 | Bundle ID `com.aek.desktop` | 已改为「以 `apps/aek-desktop` 源码为准，用前核对」 |
| `references/aek插件架构决策.md` | 状态「待实施」+ 3 条已完成的待办 | 已改为「决策有效、待办已结案」，其中 `plugin.json` / MCP 路由转入 todo backlog |
| `SKILL.md` | lint 9132 错「三选一待用户拍板」、P1 为「本轮重点」 | 已改为「已收口至 0 错 0 警告」并换成归档指针 |
| 子目录 `AGENTS.md`（`scripts/`、`packages/`、`vendor/` 等，dsh 遗留） | 引用 `docs/testing.md`、`docs/architecture.md`、`docs/postmortem/*`、`.agents/skills/dsh-ci-test-reliability/` | **仍未修**：这些文件已随 dsh 文档裁剪删除，链接全部失效。保留作上游遗留，但**其中规则不能当当前事实** |
| 各笔记中「aek 有文档站 / 有 GitHub Actions」的隐含假设 | — | `docs/` 只剩 2 个文件，`.github/` 已裁决不恢复 |

> 用户口中的「aek-base 插件」= 现在的 `@cheezmil/coraek` 包 / 插件层，按新名理解即可。
>
> 当前待办唯一真源：使用者当轮给出的笔记目录里的 `todos/aek-todos.md`（本机笔记，不在本仓库内，此处不记录其绝对路径）。
