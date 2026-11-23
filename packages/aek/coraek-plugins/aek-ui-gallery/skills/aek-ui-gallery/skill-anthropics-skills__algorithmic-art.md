# algorithmic-art

生成艺术 · 霓虹暗色

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #08080F |
| surface | #12121F |
| text | #E9E9F5 |
| muted | #8E8EA6 |
| accent | #00E5FF |
| accent2 | #FF3D81 |

## 关键参数

- 质感类：cyber
- 字体：mono
- 圆角：0px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* algorithmic-art — cyber (dark) */
.aek-stage {
  --p-bg: #08080F;
  --p-surface: #12121F;
  --p-text: #E9E9F5;
  --p-muted: #8E8EA6;
  --p-accent: #00E5FF;
  --p-accent2: #FF3D81;
  --sg-radius: 0px;
  --sg-blur: 0px;
}
```