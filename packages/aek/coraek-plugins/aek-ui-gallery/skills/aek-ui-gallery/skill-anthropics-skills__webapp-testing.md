# webapp-testing

Playwright · 测试终端

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #0C0F0D |
| surface | #131815 |
| text | #E6F2E9 |
| muted | #8A9A8E |
| accent | #45BA4B |
| accent2 | #2E7D32 |

## 关键参数

- 质感类：terminal
- 字体：mono
- 圆角：4px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* webapp-testing — terminal (dark) */
.aek-stage {
  --p-bg: #0C0F0D;
  --p-surface: #131815;
  --p-text: #E6F2E9;
  --p-muted: #8A9A8E;
  --p-accent: #45BA4B;
  --p-accent2: #2E7D32;
  --sg-radius: 4px;
  --sg-blur: 0px;
}
```