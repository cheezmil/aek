# Voice-First Multimodal

Voice assistants, accessibility apps, hands-free tools, smart home, automotive UI, cookin…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FAFAFA |
| surface | #ececed |
| text | #18181b |
| muted | #7e7e7f |
| accent | #22C55E |
| accent2 | #9B8FBB |

## 关键参数

- 质感类：vapor
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Voice-First Multimodal — vapor */
.aek-stage {
  --p-bg: #FAFAFA;
  --p-surface: #ececed;
  --p-text: #18181b;
  --p-muted: #7e7e7f;
  --p-accent: #22C55E;
  --p-accent2: #9B8FBB;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```