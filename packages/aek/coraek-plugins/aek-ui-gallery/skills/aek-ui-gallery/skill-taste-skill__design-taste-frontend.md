# design-taste-frontend

反模板落地页

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #FFF7F0 |
| text | #141210 |
| muted | #877C71 |
| accent | #F97316 |
| accent2 | #1C1917 |

## 关键参数

- 质感类：boldmin
- 字体：sans
- 圆角：4px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* design-taste-frontend — boldmin */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #FFF7F0;
  --p-text: #141210;
  --p-muted: #877C71;
  --p-accent: #F97316;
  --p-accent2: #1C1917;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```