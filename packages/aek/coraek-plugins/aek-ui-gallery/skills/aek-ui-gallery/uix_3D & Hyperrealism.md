# 3D & Hyperrealism

Gaming, product showcase, immersive experiences, high-end e-commerce, architectural viz, …

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFD700 |
| surface | #f0cc04 |
| text | #001F3F |
| muted | #737223 |
| accent | #800020 |
| accent2 | #228B22 |

## 关键参数

- 质感类：clay
- 字体：sans
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* 3D & Hyperrealism — clay */
.aek-stage {
  --p-bg: #FFD700;
  --p-surface: #f0cc04;
  --p-text: #001F3F;
  --p-muted: #737223;
  --p-accent: #800020;
  --p-accent2: #228B22;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```