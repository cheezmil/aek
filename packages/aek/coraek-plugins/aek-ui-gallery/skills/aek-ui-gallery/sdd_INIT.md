# INIT

You are performing a Superdesign Init — analyzing this repository to build UI context files that Su…

> 来源：Superdesign

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #1C1714 |
| surface | #251E19 |
| text | #E8DFD4 |
| muted | #3D332B |
| accent | #C9A227 |
| accent2 | #C9A962 |

## 关键参数

- 质感类：academia
- 字体：mono
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* INIT — academia (dark) */
.aek-stage {
  --p-bg: #1C1714;
  --p-surface: #251E19;
  --p-text: #E8DFD4;
  --p-muted: #3D332B;
  --p-accent: #C9A227;
  --p-accent2: #C9A962;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```