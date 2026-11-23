# superdesign

无限画布 · 渐变网格

> 来源：Superdesign

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFF8FB |
| surface | #FFF0F7 |
| text | #21121C |
| muted | #8E7A88 |
| accent | #EC4899 |
| accent2 | #8B5CF6 |

## 关键参数

- 质感类：mesh
- 字体：sans
- 圆角：18px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* superdesign — mesh */
.aek-stage {
  --p-bg: #FFF8FB;
  --p-surface: #FFF0F7;
  --p-text: #21121C;
  --p-muted: #8E7A88;
  --p-accent: #EC4899;
  --p-accent2: #8B5CF6;
  --sg-radius: 18px;
  --sg-blur: 16px;
}
```