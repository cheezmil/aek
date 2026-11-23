# brand-guidelines

Anthropic 品牌规范

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F0EEE6 |
| surface | #FAF9F6 |
| text | #141413 |
| muted | #6B6862 |
| accent | #D97757 |
| accent2 | #BD5D3A |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* brand-guidelines — minimal */
.aek-stage {
  --p-bg: #F0EEE6;
  --p-surface: #FAF9F6;
  --p-text: #141413;
  --p-muted: #6B6862;
  --p-accent: #D97757;
  --p-accent2: #BD5D3A;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```