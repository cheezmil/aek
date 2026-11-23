# mobile-native

移动原生 · iOS 手感

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F2F2F7 |
| surface | #FFFFFF |
| text | #1C1C1E |
| muted | #8E8E93 |
| accent | #007AFF |
| accent2 | #34C759 |

## 关键参数

- 质感类：apple
- 字体：sans
- 圆角：16px
- 毛玻璃：20px
- 深色底：否

## 应用 CSS

```css
/* mobile-native — apple */
.aek-stage {
  --p-bg: #F2F2F7;
  --p-surface: #FFFFFF;
  --p-text: #1C1C1E;
  --p-muted: #8E8E93;
  --p-accent: #007AFF;
  --p-accent2: #34C759;
  --sg-radius: 16px;
  --sg-blur: 20px;
}
```