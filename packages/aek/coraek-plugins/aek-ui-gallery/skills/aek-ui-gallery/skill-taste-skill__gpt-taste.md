# gpt-taste

GSAP 动效 · 暗色

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0A0A0A |
| surface | #151515 |
| text | #FAFAF9 |
| muted | #909090 |
| accent | #F97316 |
| accent2 | #22D3EE |

## 关键参数

- 质感类：motion
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* gpt-taste — motion (dark) */
.aek-stage {
  --p-bg: #0A0A0A;
  --p-surface: #151515;
  --p-text: #FAFAF9;
  --p-muted: #909090;
  --p-accent: #F97316;
  --p-accent2: #22D3EE;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```