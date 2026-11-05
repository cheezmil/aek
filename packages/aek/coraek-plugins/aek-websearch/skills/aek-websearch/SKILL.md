---
name: aek-websearch
description: AEK Web Search CLI 使用方法，用于上网搜索、网页内容提取、密钥池诊断。
---

## AEK Web Search CLI

独立的多提供商搜索代理 CLI（oclif，包名 `@cheezmil/aek-websearch`，可执行文件名 `aekws`）。支持 Tavily / Exa，带 API key 池与故障转移。

### 搜索

```bash
aekws search "搜索关键词"                 # 默认 10 条
aekws search "query" --num 5             # 限制条数
aekws search "query" --exa               # 强制 Exa
aekws search "query" --tavily            # 强制 Tavily
```

输出为「结论摘要 + 带来源链接的条目列表」。**不要截断搜索结果**，完整返回后由 agent 自己筛选。

### 其它子命令

```bash
aekws extract "https://example.com"      # 提取网页内容（仅 Tavily）
aekws extract "https://example.com" --depth advanced --query "关键词" --chunks 3
aekws doctor                             # 检查 API key 与提供商健康
aekws status                             # 显示当前模式与解析到的路径
aekws use dev | npm                      # 切换默认模式
aekws pool show [tavily|exa]             # 查看密钥池
aekws pool disable <provider> <index>    # 停用某个 key
aekws pool enable <provider> <index>     # 启用某个 key
aekws pool reset [provider]              # 重置冷却状态
```

### 运行模式

`bin/aekws.mjs` 按自身真实路径自动判断上下文，不依赖写死的仓库路径：

| 模式 | 行为 |
|---|---|
| `dev` | 仓库 checkout：通过工作区的 `tsx` 直接跑 TS 源码 |
| `npm` | 仓库 checkout 委托给全局安装的 CLI（pnpm global bin dir / `$NPM_PREFIX/bin` / 用户主目录下的 `.npm-global/bin`） |
| installed | 已发布 tarball（真实路径在 `node_modules` 内）：直接跑包内编译产物 |

- 默认模式写在 `$AEK_HOME/aekws-mode`（`dev` / `npm`）；`AEK_HOME` 未设置时为用户主目录下的 `.aek`。
- `aekws use` 始终在本地执行，是模式配错时的逃生舱。
- 临时切模式而不改用户配置：用环境变量覆盖 `AEK_HOME`，例如 `AEK_HOME=$(mktemp -d) aekws doctor`。

### 配置与数据

- 配置根目录：`$AEK_HOME`（默认用户主目录下的 `.aek`）。
- 密钥池：`$AEK_HOME/websearch/<provider>.db`，提供商配置 `providers.yml`。
- `aekws doctor` 会打印实际使用的路径，排障以它的输出为准。

### 注意事项

- **禁止使用 `| head` 或其他管道截断搜索结果**：搜索结果必须完整返回，由 agent 自己处理筛选。
- **写代码时不会或不清楚就上网搜**：不要卡住或瞎编，直接搜；首次使用先 `aekws doctor` 探活。
- 本文档对应当前 oclif 版 CLI。**旧版 Go 实现的 `aek websearch ...` 命令以及 `-m` 模式、`--json` / `--free` / `-p` / `-s`、`code-search` / `budgets` / `test-provider` / `key-pool-*` / `aek serve` / `aek mcp` 均已不存在**，不要照旧笔记写；以 `aekws --help` 和各子命令 `--help` 为准。
