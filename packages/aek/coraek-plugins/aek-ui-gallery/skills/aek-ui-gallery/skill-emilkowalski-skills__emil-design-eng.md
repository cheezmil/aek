# emil-design-eng

设计工程 · 打磨质感

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAFAFA |
| surface | #F1F2F4 |
| text | #14151A |
| muted | #84868E |
| accent | #0EA5E9 |
| accent2 | #F59E0B |

## 关键参数

- 质感类：tactile
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* emil-design-eng — tactile */
.aek-stage {
  --p-bg: #FAFAFA;
  --p-surface: #F1F2F4;
  --p-text: #14151A;
  --p-muted: #84868E;
  --p-accent: #0EA5E9;
  --p-accent2: #F59E0B;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```