---
name: aek-websearch
description: AEK Web Search CLI 使用方法，用于上网搜索、网页内容提取、密钥池诊断。
---
## AEK Web Search CLI

独立的多提供商搜索代理 CLI（oclif，包名 `@cheezmil/aek-websearch`，可执行文件名 `aekws`）。支持 Tavily / Exa，带 API key 池与故障转移。

### 命令一览

| 命令 | 作用 |
|---|---|
| `aekws search QUERY` | 网页搜索，默认 10 条 |
| `aekws extract URL` | 提取网页内容（仅 Tavily） |
| `aekws pool ACTION [PROVIDER] [INDEX]` | 密钥池管理 |
| `aekws doctor` | 检查 API key 与提供商健康 |
| `aekws status` | 显示当前模式与解析到的路径 |
| `aekws use MODE` | 切换默认模式（dev / npm） |

命令与参数一律以 `aekws --help` 和各子命令 `--help` 为准。

### 搜索

```bash
aekws search "搜索关键词"
aekws search "query" --num 5        # 限制条数，默认 10
aekws search "query" --exa          # 强制 Exa
aekws search "query" --tavily       # 强制 Tavily
```

输出为「结论摘要 + 带来源链接的条目列表」。**不要截断搜索结果**，完整返回后由 agent 自己筛选。

### 提取网页

```bash
aekws extract "https://example.com"
aekws extract "https://example.com" --depth advanced --query "关键词" --chunks 3
```

`--depth`：`basic`（默认）或 `advanced`；`--chunks`：每源最多分块数，1-5，默认 3；`--query`：只返回相关分块。

### 密钥池

```bash
aekws pool show [tavily|exa]
aekws pool disable <provider> <index>
aekws pool enable <provider> <index>
aekws pool reset [provider]
```

`pool` 是单个 oclif 命令带 `ACTION` 位置参数（`show` / `disable` / `enable` / `reset`），不是独立的子命令树。

### 运行模式

`bin/aekws.mjs` 按自身真实路径自动判断上下文，不依赖写死的仓库路径：

| 模式 | 行为 |
|---|---|
| `dev` | 仓库 checkout：通过工作区的 `tsx` 直接跑 TS 源码（默认，除非 mode 文件写为 `npm`） |
| `npm` | 仓库 checkout 委托给全局安装的 CLI（pnpm global bin dir / `$NPM_PREFIX/bin` / 用户主目录下的 `.npm-global/bin`） |
| installed | **自动判定**：真实路径落在 `node_modules/` 内时即为 installed，直接跑包内编译产物；`aekws use` 无法选，由路径决定 |

- 默认模式写在 `$AEK_HOME/aekws-mode`（`dev` / `npm` 二选一）；`AEK_HOME` 未设置时为用户主目录下的 `.aek`。
- `aekws use dev` 或 `aekws use npm` 切换默认模式；临时覆盖而不改用户配置可用 `AEK_HOME=$(mktemp -d) aekws doctor`。
- `aekws status` 打印 `AEK_HOME`、包根、CLI bin 的实际路径，排障以它为准。

### 配置与数据

- 配置根目录：`$AEK_HOME`（默认用户主目录下的 `.aek`）。
- 密钥池数据库：`$AEK_HOME/websearch/<provider>.db`。
- `aekws doctor` 会打印实际使用的路径，排障以它的输出为准。

### 安装

```bash
pnpm add -g @cheezmil/aek-websearch
```

### 注意事项

- **禁止使用 `| head` 或其他管道截断搜索结果**：搜索结果必须完整返回，由 agent 自己处理筛选。
- **写代码时不会或不清楚就上网搜**：不要卡住或瞎编，直接搜；首次使用先 `aekws doctor` 探活。
- 本 skill 只对应当前 oclif 版 `aekws`。旧版 Go 实现的 `aek websearch ...` 系列命令已全部移除，不要按旧笔记或其它文档里的写法调用。
