# industrial-brutalist-ui

工业粗野 · 军事终端

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #E5E2DA |
| surface | #D9D6CE |
| text | #0A0A0A |
| muted | #5E5B54 |
| accent | #B7410E |
| accent2 | #1B3A2F |

## 关键参数

- 质感类：military
- 字体：mono
- 圆角：0px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* industrial-brutalist-ui — military */
.aek-stage {
  --p-bg: #E5E2DA;
  --p-surface: #D9D6CE;
  --p-text: #0A0A0A;
  --p-muted: #5E5B54;
  --p-accent: #B7410E;
  --p-accent2: #1B3A2F;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```