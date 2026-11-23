# design-taste-frontend-v1

v1 旧版 · 灰调

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F5F4F2 |
| text | #1C1B19 |
| muted | #8A8782 |
| accent | #57534E |
| accent2 | #A8A29E |

## 关键参数

- 质感类：boldmin
- 字体：sans
- 圆角：4px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* design-taste-frontend-v1 — boldmin */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F5F4F2;
  --p-text: #1C1B19;
  --p-muted: #8A8782;
  --p-accent: #57534E;
  --p-accent2: #A8A29E;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```