# Industrial Raw

Raw industrial urban aesthetics

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #D6D3D1 |
| surface | #cbc9c8 |
| text | #1F2937 |
| muted | #71767c |
| accent | #F97316 |
| accent2 | #374151 |

## 关键参数

- 质感类：neubrutal
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Industrial Raw — neubrutal */
.aek-stage {
  --p-bg: #D6D3D1;
  --p-surface: #cbc9c8;
  --p-text: #1F2937;
  --p-muted: #71767c;
  --p-accent: #F97316;
  --p-accent2: #374151;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```