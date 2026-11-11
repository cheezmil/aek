# aek-quick-prompt

A2 · 完全本地使用的插件空壳（TypeScript）。目前没有任何行为，也没有挂进任何
`cordis.patch.yml`，因此不会被运行中的 host 加载。

## 分类规则

`package.json` 里 `aek.distribution` 是 **`A2`**：

- A2 = 完全本地使用，**程序自动发布到 npm / release 时必须完全排除**。
- `private: true` 是第二道独立保险（npm 会拒绝发布 private 包）。
- `node scripts/aek/plugin-class.mjs publish-list` 不会列出它。
- `node scripts/aek/verify-build-rules.mjs` 会检查任何发布 / 安装清单里都没有它。
- **改成 A1 必须先得到用户允许**：`node scripts/aek/plugin-class.mjs set aek-quick-prompt A1 --reason "..." --confirm`。

只有 A1 / A2 两类，没有第三类；未声明分类的包直接编译不通过。

## 现状与后续

- `src/index.ts` 是最小 Cordis 形状（`name` / `inject` / `apply`），`apply()` 故意留空。
- `tsconfig.json` 是独立的 NodeNext 严格配置，`pnpm --filter @cheezmil/aek-quick-prompt typecheck` 可验证。
- 等真正实现 quick-prompt 能力时，再补 `bin/` CLI、`exports`、配置 schema，
  并决定是否挂进 `coraek-profile/cordis.patch.yml`（挂之前先想清楚它是否需要 host 面）。
