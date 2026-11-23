# AI-Native UI

AI products, chatbots, voice assistants, copilots, AI-powered tools, conversational inter…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F9FAFB |
| surface | #ececee |
| text | #18181b |
| muted | #7d7e80 |
| accent | #10B981 |
| accent2 | #E0E7FF |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* AI-Native UI — minimal */
.aek-stage {
  --p-bg: #F9FAFB;
  --p-surface: #ececee;
  --p-text: #18181b;
  --p-muted: #7d7e80;
  --p-accent: #10B981;
  --p-accent2: #E0E7FF;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```