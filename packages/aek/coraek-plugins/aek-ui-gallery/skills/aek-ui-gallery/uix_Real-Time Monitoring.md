# Real-Time Monitoring

System monitoring dashboards, DevOps dashboards, real-time analytics, stock market dashbo…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFA500 |
| surface | #f19d02 |
| text | #18181b |
| muted | #80570f |
| accent | #FF0000 |
| accent2 | #22C55E |

## 关键参数

- 质感类：cyber
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Real-Time Monitoring — cyber */
.aek-stage {
  --p-bg: #FFA500;
  --p-surface: #f19d02;
  --p-text: #18181b;
  --p-muted: #80570f;
  --p-accent: #FF0000;
  --p-accent2: #22C55E;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```