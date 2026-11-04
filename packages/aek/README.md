# AEK 包家族（@cheezmil）

本组是 AEK（agent-enhance-kit）自研包的专属分组，与 `packages/` 下其余组（dsh 上游复制来的
`@deepseek-ai/*`）互不混放。归属判定看 npm scope：`@cheezmil/*` = AEK 自研。

## 桶归属规则

| 桶 | 放什么 | 判定问题 |
|---|---|---|
| `base/` | coraek——AEK 身份/基础层（cordis plugin + oclif CLI 地基） | "是 coraek 地基吗？" → base |
| `coraek-plugins/` | 长在 coraek 架构上的插件（宿主无关） | "依赖 coraek 且服务任意宿主吗？" → coraek-plugins |
| `public/` | 零 cordis 依赖、任何程序可用的通用工具 | "没有 coraek 依赖吗？" → public |
| `target-extensions/` | 宿主专属适配 bundle（cordis.patch.yml 聚合包） | "只服务某一个宿主吗？" → target-extensions/<宿主>/<bundle> |

新增包先问上表四个判定问题，顺序即优先级。

## target-extensions 宿主槽位

目录 = 宿主短名（连字符风格，与产品名一致），不建空目录——宿主出第一个 bundle 时再建。

| 槽位 | 现状 |
|---|---|
| `deepseek-harness/` | 已有 `aek-for-dsh` |
| `opencode/` | 预留 |
| `hermes/` | 预留 |
| `codex/` | 预留 |
| `claude-code/` | 预留 |

## 命名与版本约定

- 包名沿用 npm scope `@cheezmil`；目录名与 npm 名一致（历史例外：`base/coraek` 前身
  `@cheezmil/aek-base` 已改名，npm 旧名不再维护）。
- 全组 license 统一 `Apache-2.0`。
- `public/` 桶允许目的命名（如 `prevent-agent-directly-seeing-key`）；其余桶用"是什么"名词。
- 宿主 bundle 命名 `aek-for-<宿主简称>`。

## 工具链注意

- 深度比 `packages/<组>/<包>` 多一层（桶/包），dsh 上游脚本按 `packages/*/*` 扫描的
  校验门禁**有意不覆盖**本组（门禁规则面向 `@deepseek-ai/*`）。
- 需要发现本组包的三处构建 glob 已加 aek 深度模式：根 `tsdown.config.ts`、
  `scripts/dev-web.ts`（2 处）。pnpm workspace 用 `packages/aek/**` 一行覆盖任意深度。
