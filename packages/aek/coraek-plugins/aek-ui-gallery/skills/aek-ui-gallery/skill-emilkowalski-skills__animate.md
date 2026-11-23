# animate

动效构建 · 弹簧手感

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F5F9FC |
| text | #0F1720 |
| muted | #7C8B99 |
| accent | #0EA5E9 |
| accent2 | #6366F1 |

## 关键参数

- 质感类：motion
- 字体：sans
- 圆角：14px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* animate — motion */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F5F9FC;
  --p-text: #0F1720;
  --p-muted: #7C8B99;
  --p-accent: #0EA5E9;
  --p-accent2: #6366F1;
  --sg-radius: 14px;
  --sg-blur: 0px;
}
```