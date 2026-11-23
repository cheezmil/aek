# midnight-galaxy

A dramatic and cosmic theme with deep purples and mystical tones for impactful presentations.

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #E6E6FA |
| surface | #dbdaef |
| text | #2B1E3E |
| muted | #7f7893 |
| accent | #4A4E8F |
| accent2 | #A490C2 |

## 关键参数

- 质感类：cinema
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* midnight-galaxy — cinema */
.aek-stage {
  --p-bg: #E6E6FA;
  --p-surface: #dbdaef;
  --p-text: #2B1E3E;
  --p-muted: #7f7893;
  --p-accent: #4A4E8F;
  --p-accent2: #A490C2;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```