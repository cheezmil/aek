# find-animation-opportunities

动效机会 · 标注巡览

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F8FAFC |
| text | #0F172A |
| muted | #7A869A |
| accent | #0EA5E9 |
| accent2 | #F59E0B |

## 关键参数

- 质感类：annotate
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* find-animation-opportunities — annotate */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F8FAFC;
  --p-text: #0F172A;
  --p-muted: #7A869A;
  --p-accent: #0EA5E9;
  --p-accent2: #F59E0B;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```