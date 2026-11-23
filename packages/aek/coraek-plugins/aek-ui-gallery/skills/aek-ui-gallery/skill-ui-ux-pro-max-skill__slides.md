# slides

演示幻灯片 · 大版面

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F4F5FF |
| text | #12131F |
| muted | #7B7D96 |
| accent | #6366F1 |
| accent2 | #8B5CF6 |

## 关键参数

- 质感类：hero
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* slides — hero */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F4F5FF;
  --p-text: #12131F;
  --p-muted: #7B7D96;
  --p-accent: #6366F1;
  --p-accent2: #8B5CF6;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```