# minimalist-ui

极简 · 暖调单色

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FBFAF8 |
| surface | #F3F1ED |
| text | #1C1C1C |
| muted | #8F8B84 |
| accent | #1C1C1C |
| accent2 | #A8A29E |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：6px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* minimalist-ui — minimal */
.aek-stage {
  --p-bg: #FBFAF8;
  --p-surface: #F3F1ED;
  --p-text: #1C1C1C;
  --p-muted: #8F8B84;
  --p-accent: #1C1C1C;
  --p-accent2: #A8A29E;
  --sg-radius: 6px;
  --sg-blur: 0px;
}
```