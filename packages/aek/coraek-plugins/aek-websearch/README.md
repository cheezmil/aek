# aekws

AEK web search CLI with key pool management. Multi-provider (Tavily, Exa) with automatic key failover.

## Installation

```bash
pnpm add -g @cheezmil/aek-websearch
```

## Usage

```bash
aekws search "your query"           # search with key pool failover
aekws search "query" --exa          # force Exa provider
aekws search "query" --num 5        # limit to 5 results
aekws extract <url>                 # extract page content (Tavily)
aekws doctor                        # check key status
aekws pool show <tavily|exa>        # show keys in pool
aekws pool disable <tavily|exa> 0   # disable key #0
aekws pool enable <tavily|exa> 0    # enable key #0
aekws pool reset <tavily|exa>       # reset all cooldowns
aekws use <dev|npm>                 # set default mode
aekws status                        # show paths and mode
```

## Commands

| Command        | Description                                      |
|---------------|--------------------------------------------------|
| `aekws search` | Search the web with key pool failover            |
| `aekws extract`| Extract page content from URL (Tavily only)     |
| `aekws pool`   | Manage API key pool (show, enable, disable, reset)|
| `aekws doctor` | Check API key status and provider health        |
| `aekws use`    | Set default mode (dev or npm)                   |
| `aekws status` | Show current mode and paths                     |

## Providers

- **Tavily** — default, supports search + extract
- **Exa** — alternative, search only (no extract API)

## Key Storage

API keys are stored in encrypted SQLite databases under `~/.aek/websearch/`:
- `tavily.db` — Tavily API keys
- `exa.db` — Exa API keys
