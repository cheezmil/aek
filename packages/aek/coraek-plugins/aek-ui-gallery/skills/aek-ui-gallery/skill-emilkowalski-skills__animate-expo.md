# animate-expo

Expo 动效 · 暗色流光

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0B0B12 |
| surface | #14141F |
| text | #EDF0F5 |
| muted | #8A8CA0 |
| accent | #61DAFB |
| accent2 | #A78BFA |

## 关键参数

- 质感类：motion
- 字体：sans
- 圆角：16px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* animate-expo — motion (dark) */
.aek-stage {
  --p-bg: #0B0B12;
  --p-surface: #14141F;
  --p-text: #EDF0F5;
  --p-muted: #8A8CA0;
  --p-accent: #61DAFB;
  --p-accent2: #A78BFA;
  --sg-radius: 16px;
  --sg-blur: 0px;
}
```