# high-end-visual-design

高端 agency · 衬线排版

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAF8F5 |
| surface | #F2EEE8 |
| text | #111111 |
| muted | #8A847A |
| accent | #1A1A1A |
| accent2 | #C9A227 |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* high-end-visual-design — editorial */
.aek-stage {
  --p-bg: #FAF8F5;
  --p-surface: #F2EEE8;
  --p-text: #111111;
  --p-muted: #8A847A;
  --p-accent: #1A1A1A;
  --p-accent2: #C9A227;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```