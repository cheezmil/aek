# break-ui

破坏性测试 · 倾斜混乱

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFF6F5 |
| surface | #FFEDEB |
| text | #1C1312 |
| muted | #8A7A78 |
| accent | #DC2626 |
| accent2 | #F59E0B |

## 关键参数

- 质感类：chaos
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* break-ui — chaos */
.aek-stage {
  --p-bg: #FFF6F5;
  --p-surface: #FFEDEB;
  --p-text: #1C1312;
  --p-muted: #8A7A78;
  --p-accent: #DC2626;
  --p-accent2: #F59E0B;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```