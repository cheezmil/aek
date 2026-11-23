# Aurora UI

Modern SaaS, creative agencies, branding, music platforms, lifestyle, premium products, h…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #00FFFF |
| surface | #01f1f1 |
| text | #18181b |
| muted | #0d8082 |
| accent | #FF1493 |
| accent2 | #FF1493 |

## 关键参数

- 质感类：mesh
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Aurora UI — mesh */
.aek-stage {
  --p-bg: #00FFFF;
  --p-surface: #01f1f1;
  --p-text: #18181b;
  --p-muted: #0d8082;
  --p-accent: #FF1493;
  --p-accent2: #FF1493;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```