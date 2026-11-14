---
description: "DSh bundle：安装 @cheezmil/aek-for-dsh 后，dsh profile 即可获得面向 dsh 的 AEK 插件（coraek、aek-websearch）"
kind: "package-bundle"
---

# @cheezmil/aek-for-dsh

[English](README.md) | 中文

## 这是什么

`@cheezmil/aek-for-dsh` 是一个 **dsh 聚合 bundle**——它本身不是插件，而是把
面向 dsh 的 AEK 插件一次性注册进任意 dsh profile 的安装层。

安装一次，profile 就获得 AEK 功能层（身份 + 搜索）。

宿主专属的 UI 表面（例如 `@cheezmil/aek-web`，宿主 serve 到 `#root`、替代 dsh
shell 的独立 React 应用）**有意不放进这个 bundle**：它属于拥有它的宿主
（web-app / aek-desktop profile），由宿主侧 serve，不在这里安装。

## 安装

```bash
pnpm add @cheezmil/aek-for-dsh
```

然后在 profile 的 `package.json` 中引用：

```json
{
  "name": "my-aek-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@cheezmil/dsh-base", "@cheezmil/aek-for-dsh"]
    }
  }
}
```

或命令行方式：

```bash
dsh plugin --profile my-aek-profile add @cheezmil/aek-for-dsh
dsh --profile my-aek-profile "your task"
```

## 包含的插件

安装后，profile 获得以下两个 AEK 插件：

| 插件 id | 包名 | 作用 |
|---|---|---|
| `coraek` | `@cheezmil/coraek` | 打印 `aek web:` 启动行；向所有其他 AEK 插件 re-export Context/Volatile/ClientContext 类型 |
| `web-search-aggregation` | `@cheezmil/aek-websearch` | 多搜索引擎聚合（tavily → exa → serper → brave），密钥轮询 fallback |

## 为什么不逐个安装？

可以。每个 AEK 插件都有独立的 npm 包。但 `aek-for-dsh` 的存在就是为了省去
手动添加每个插件的 `cordis.patch.yml` 行、逐个更新依赖的繁琐步骤。
安装一个 = 全部配好。

未来新增的 AEK 插件会统一加入此 bundle，只需升级 bundle 版本。

## 实现细节

`aek-for-dsh` 不含 TypeScript 源码。核心只有 `cordis.patch.yml`，声明了两条
`- insert:` 行，分别对应两个插件包名。dsh Loader 在运行时按名字解析并加载
实际的 npm 包。

peerDependencies 仅作声明，不在此包内安装——由 dsh profile 自身的依赖图满足。
