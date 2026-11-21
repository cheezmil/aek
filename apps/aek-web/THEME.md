# aek-web 组件主题规范（design-token 定案）

> BO 轮（m07690⑥）：「必须把风格列表所有组件定下主题风格」。本文 = 全组件 token
> 刻度表（色 / 圆角 / 字重 / 间距）+ index.css 变量对齐 + 画廊（art-gallery）换肤
> 系统如何叠在这些基础 token 之上。落地为「一份文档 + 一处 CSS 变量真源」，画廊
> 面板（`/art`）是它的实时讨论界面：点任意风格卡，右侧舞台把 9 个组件按该风格
> 重渲，用来对照本规范的刻度是否合理。

## 0. 三层模型

| 层 | 位置 | 谁改 | 何时生效 |
| --- | --- | --- | --- |
| **基础 token**（本文 §1–§5） | `src/index.css` `:root` `--aek-*` | 设计师定案，极少动 | 全局默认 |
| **shadcn 语义令牌**（§6） | `src/index.css` 第二段 `:root` `--primary` 等 | 映射到 §1，不直接填值 | 组件经 `@theme inline` 吃到 |
| **画廊皮肤**（§7） | `src/webui-art-gallery/stage.css` `.aek-stage[data-mode=…]` | 每风格一组，覆盖式 | 只作用于舞台/卡片内嵌的 `.aek-stage` 容器，不影响全站 |

铁律（承 style-gallery 参考仓 AGENTS）：**画廊皮肤层只写原始值 `--p-*`，生效值
`--sg-*` 由 base 块派生 + 皮肤表覆盖；shadcn 语义令牌在 `.aek-stage` 内桥接到
`--sg-*`，所以组件自动跟随换肤。基础 token（§1）永远不被皮肤改动** —— 皮肤
只活在 `.aek-stage` 子树里，关掉画廊回到别的页面就是默认主题。

## 1. 颜色刻度（§1 = index.css `:root` 第 1 块）

表面（surfaces）—— 一页一底，禁止「色底叠色底」（BO-5 定案）：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--aek-bg` | `#f6f7f9` | 页面底（body / main 背景） |
| `--aek-surface` | `#ffffff` | 卡 / 面板主面（`--card`） |
| `--aek-surface-subtle` | `#fafafa` | 次级面 / muted 底（`--secondary` `--muted`） |
| `--aek-surface-hover` | `#f4f4f5` | 行 / 按钮 hover 底 |
| `--aek-border` | `#e9e9ee` | 默认描边 |
| `--aek-border-strong` | `#dcdce3` | 输入框 / 强调描边（`--input`） |

文字（text）—— 四档层级：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--aek-text` | `#18181b` | 主文字（`--foreground` `--card-foreground`） |
| `--aek-text-secondary` | `#52525b` | 次级文字（`--secondary-foreground`） |
| `--aek-text-muted` | `#a1a1aa` | 弱化 / 占位（`--muted-foreground`） |
| `--aek-text-inverse` | `#ffffff` | 反白（`--primary-foreground`） |

品牌（brand，accent 一族）—— 全站主操作 / 高亮只用这一色：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--aek-accent` | `#ea580c` | 主色（`--primary` `--ring` `--chart-1`） |
| `--aek-accent-hover` | `#c2410c` | 主按钮 hover |
| `--aek-accent-soft` | `#fff2e8` | 主色浅底（active 行 / 选中卡，`--accent`） |
| `--aek-accent-border` | `#fed7aa` | 主色描边 |
| `--aek-accent-ink` | `#9a3412` | 主色上的可读文字（`--accent-foreground`） |

状态（status）：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--aek-success` / `-soft` / `-border` | `#16a34a` / `#ecfdf3` / `#bbf7d0` | 成功（`--chart-2`） |
| `--aek-danger` / `-soft` / `-border` | `#dc2626` / `#fef2f2` / `#fecaca` | 危险（`--destructive` `--chart-4`） |

图表（chart-3/5）直接借文字色：`--chart-3`=`text-secondary`，`--chart-5`=`text-muted`。

> 定案：**新增语义色一律走上面 4 组；不得在组件里写裸 hex**（shadcn `no-raw-colors`
> 门禁）。logo/provider 渐变色（`--color-logo-*`）是 Icons.tsx 专有，不算语义色。

## 2. 圆角刻度（`--aek-radius-*`）

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--aek-radius-2xs` | 4px | 紧凑输入 / ghost 图标钮（`--radius-2xs`） |
| `--aek-radius-xs` | 6px | 小徽标 / 小控件（`--radius-xs`） |
| `--aek-radius-sm` | 8px | 次级卡 / 折叠体（`--radius-sm`） |
| `--aek-radius` | 12px | **默认卡 / 面板**（`--radius` `--radius-md` `--radius-lg` 全映射到此） |
| `--aek-radius-lg` | 16px | 大弹层 / 模态（`--radius-lg`） |

> 定案：shadcn `rounded-*` 工具类吃 `--radius-md/lg/sm`，三者都指 `--aek-radius`；
> 画廊皮肤若改 `--radius`，§7 base 块补了 `--radius-md/lg/sm = var(--radius)` 派生，
> 组件圆角跟随。

## 3. 字重 + 字号刻度（type）

字体族 = **系统字体栈**（不打包字体，`--font-sans`）。字号刻度 = Tailwind 标准
scale + aek 自加 sub-scale（`@theme inline` 第 3/4 块）：

| token | 值 | 用途 |
| --- | --- | --- |
| `text-2xxs` (`--aek-text-2xs`) | 11px | 弱标注 / 徽标内文字 |
| `text-aek-11` | 11px | rail hint |
| `text-aek-115` | 11.5px | 行 / chip / 路径 |
| `text-aek-125` | 12.5px | 提示 / 行动按钮 |
| `text-aek-13` | 13px | 行内说明 / 占位 |
| `text-aek-135` | 13.5px | 副题 / 行标签 |
| `text-xs` | 12px | 次级正文 |
| `text-sm` | 14px | **正文 / 行标题**（侧栏字号默认） |
| `text-base` | 16px | **页头 / 卡标题**（ViewHeader `h1`） |

字重只用 3 档：**normal(400) / medium(500) / bold(700)**。定案：
- 正文 = 400；行标题 / 按钮 / chip = 500；页头 / 强调数字 = 700（`tabular-nums` 用于计数）。

## 4. 间距刻度（4px 网格）

`--aek-space-1…10` = 4/8/12/16/20/24/32/40px，**对齐 Tailwind 标准 spacing**（`p-1…p-10`
即迁移目标，变量只留给运行时消费）。定案：

| 场景 | 值 |
| --- | --- |
| 行内元素 gap | 8px（`gap-2`） |
| 卡片内 padding | 12–16px（`p-3`/`p-4`） |
| 卡与卡 / 区块 gap | 16–24px（`gap-4`/`gap-6`） |
| 页内左右留白 | `--aek-content-pad`（settings 可调，默认 24px） |

> 参考仓排版节奏（4px 网格 / 区块 gap 24px / 卡片 px-5 py-5）作**节奏参照**，
> 但落值一律走上面 aek 刻度，不引入参考仓私值。

## 5. 阴影 + 动效

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--aek-shadow-sm` | `0 1px 2px rgba(16,24,40,.04)` | 行 / 微浮 |
| `--aek-shadow` | `0 4px 16px rgba(16,24,40,.06)` | 默认卡 |
| `--aek-shadow-lg` | `0 12px 40px rgba(16,24,40,.08)` | 弹层 |
| `--aek-ease` | `cubic-bezier(.2,0,.2,1)` | 通用 |
| `--aek-ease-out` | `cubic-bezier(.22,1,.36,1)` | rail 折叠（减速曲线，防机械感） |
| `--aek-sidebar-duration` | 260ms | 侧栏过渡 |

## 6. shadcn 语义令牌映射（index.css 第 2 段 `:root`）

组件不吃 `--aek-*` 裸值，吃 shadcn 语义令牌；后者在 `:root` 指回 `--aek-*`，
`@theme inline` 再暴露成 Tailwind 工具类（`bg-card` / `text-foreground` …）：

```
--background=--aek-bg   --card=--aek-surface      --primary=--aek-accent
--foreground=--aek-text --secondary/--muted=--aek-surface-subtle
--primary-foreground=--aek-text-inverse --accent=--aek-accent-soft
--border=--aek-border   --input=--aek-border-strong --ring=--aek-accent
--destructive=--aek-danger --radius=--aek-radius
```

**单主题（light only，`.dark` 不应用）** —— 与 aek-web 无暗色模式一致。

## 7. 画廊皮肤系统（叠在 §1–§6 之上，只活于 `.aek-stage` 子树）

数据（`src/webui-art-gallery/`，自 style-gallery 移植，P16 组件自写）：
- `data/style-themes.ts` = **88 条**基准主题 `{name, mode, dark, vars{bg,surface,text,
  muted,accent,accent2,ok,bad,warn,radius,shadow,blur,font}}`（ui-ux-pro-max styles.csv 生成）。
- `data/skill-styles.ts` = **57 条** skill→质感映射 `{m:质感, p:[6 色], r:圆角,
  f:字体, b:blur, d:深色, tag:中文标签}` + 7 仓 fallback。
- `stage.css` = **43 种质感皮肤** `.aek-stage[data-mode=…]`（非 `@layer`，写在
  Tailwind 之外以覆盖 utility；`[data-slot]` 属性选择器让组件吃皮肤）。

两层变量铁律（base 块）：
```
--p-bg/--p-surface/--p-text/--p-muted/--p-accent/--p-accent2  ← 皮肤/inline 写「原始值」
--sg-bg = var(--p-bg) …（生效值，默认派生自 --p-*；皮肤表可整体覆盖）
--radius-md/lg/sm = var(--radius)  ← 补派生，皮肤改圆角组件才跟
shadcn 令牌桥接：--background=var(--sg-bg) --primary=var(--sg-accent) …
```
- `specStyle(spec)`（inline）**只写 `--p-*` 原始值 + `--sg-radius` + `--sg-blur` +
  status 三件**，绝不直接写生效值/语义令牌 —— 防止击穿两层分离。
- 复制 CSS（`copyVars`）产出的片段即这套 `--p-*` 原始值块，可粘进别处 `.aek-stage`。

## 8. 舞台 9 组件 → token 对照（「风格列表所有组件」定案）

| 组件 | 吃的基础 token | 换肤时跟谁 |
| --- | --- | --- |
| Card（含 CardAction） | `--card` `--radius` `--shadow` | `--sg-surface` `--sg-radius` |
| Button（5 变体） | `--primary` `--border` `--radius` | `--sg-accent` `--sg-radius` |
| Badge（4 变体） | `--secondary` `--muted` `--radius-2xs` | `--sg-surface` |
| Input / Label | `--input` `--border` `--radius` | `--sg-accent`（focus ring） |
| Switch | `--primary` `--border` | `--sg-accent` |
| Separator | `--border` | 固定 |
| Table（头/体/格） | `--border` `--muted` | `--sg-surface`（隔行） |
| Tooltip | `--popover` `--radius` | Portal，不受 `.aek-stage` 子树限制 |

> 注：Tooltip 走 Portal 渲染到 body，**不在 `.aek-stage` 子树内**，皮肤不影响它
> 的内容气泡（仅 Trigger 在卡内）。这是已知边界，讨论时可定是否要 Tooltip 也跟肤。

## 9. 待议（给用户的讨论点）

1. **字号 11.5/12.5/13.5 三档 sub-scale** 是否合并到 11/12/13（少 3 个私值）？
2. **圆角 `--radius-lg=16` 与 `--radius=12`** 目前 `--radius-md/lg` 都指 12，
   16 实际未用 —— 要不要让 `--radius-lg` 真正指 16px？
3. **Tooltip 跟肤**：当前 Portal 跳出 `.aek-stage`，要不要把气泡也挂皮肤？
4. 88 主题里 `dark:true` 的条目在 light-only 的 aek-web 里**只当配色板用**，
   不做暗色切换 —— 确认保留此语义（画廊展示 ≠ 全站换暗色）。
