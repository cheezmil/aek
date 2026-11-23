# discernment-nudge

克制 · 电子墨水

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAF9F5 |
| surface | #EFEDE6 |
| text | #2B2925 |
| muted | #847F73 |
| accent | #6B7280 |
| accent2 | #4B5563 |

## 关键参数

- 质感类：eink
- 字体：serif
- 圆角：3px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* discernment-nudge — eink */
.aek-stage {
  --p-bg: #FAF9F5;
  --p-surface: #EFEDE6;
  --p-text: #2B2925;
  --p-muted: #847F73;
  --p-accent: #6B7280;
  --p-accent2: #4B5563;
  --sg-radius: 3px;
  --sg-blur: 0px;
}
```