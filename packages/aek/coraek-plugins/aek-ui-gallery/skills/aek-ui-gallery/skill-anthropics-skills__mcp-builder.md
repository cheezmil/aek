# mcp-builder

MCP 构建 · 协议 HUD

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0B1013 |
| surface | #111A1E |
| text | #E3F0F2 |
| muted | #7E949A |
| accent | #14B8A6 |
| accent2 | #38BDF8 |

## 关键参数

- 质感类：hud
- 字体：mono
- 圆角：6px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* mcp-builder — hud (dark) */
.aek-stage {
  --p-bg: #0B1013;
  --p-surface: #111A1E;
  --p-text: #E3F0F2;
  --p-muted: #7E949A;
  --p-accent: #14B8A6;
  --p-accent2: #38BDF8;
  --sg-radius: 6px;
  --sg-blur: 0px;
}
```