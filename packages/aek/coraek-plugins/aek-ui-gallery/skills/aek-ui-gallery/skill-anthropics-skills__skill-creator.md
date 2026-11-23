# skill-creator

Skill 创建 · 紧凑清单

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F2F7F3 |
| text | #141A16 |
| muted | #7C8A80 |
| accent | #16A34A |
| accent2 | #0F7A38 |

## 关键参数

- 质感类：dash
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* skill-creator — dash */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F2F7F3;
  --p-text: #141A16;
  --p-muted: #7C8A80;
  --p-accent: #16A34A;
  --p-accent2: #0F7A38;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```