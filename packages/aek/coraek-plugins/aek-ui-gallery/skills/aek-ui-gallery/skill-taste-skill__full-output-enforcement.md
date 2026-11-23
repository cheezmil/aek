# full-output-enforcement

完整输出 · 严格终端

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0A0A0A |
| surface | #141414 |
| text | #F2F2F2 |
| muted | #8C8C8C |
| accent | #F97316 |
| accent2 | #EF4444 |

## 关键参数

- 质感类：terminal
- 字体：mono
- 圆角：0px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* full-output-enforcement — terminal (dark) */
.aek-stage {
  --p-bg: #0A0A0A;
  --p-surface: #141414;
  --p-text: #F2F2F2;
  --p-muted: #8C8C8C;
  --p-accent: #F97316;
  --p-accent2: #EF4444;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```