# imagegen-frontend-web

Web 视觉 · 转化导向

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #FFF6EF |
| text | #141210 |
| muted | #87786C |
| accent | #F97316 |
| accent2 | #1C1917 |

## 关键参数

- 质感类：hero
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* imagegen-frontend-web — hero */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #FFF6EF;
  --p-text: #141210;
  --p-muted: #87786C;
  --p-accent: #F97316;
  --p-accent2: #1C1917;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```