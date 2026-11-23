# Classic Traditional

Timeless traditional corporate aesthetics

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F5F4 |
| surface | #e7e8e8 |
| text | #0F172A |
| muted | #777b85 |
| accent | #713F12 |
| accent2 | #1E3A8A |

## 关键参数

- 质感类：vibrant
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Classic Traditional — vibrant */
.aek-stage {
  --p-bg: #F5F5F4;
  --p-surface: #e7e8e8;
  --p-text: #0F172A;
  --p-muted: #777b85;
  --p-accent: #713F12;
  --p-accent2: #1E3A8A;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```