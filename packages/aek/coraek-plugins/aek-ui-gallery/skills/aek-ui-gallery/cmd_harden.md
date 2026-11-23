# harden

Designs that only work with perfect data aren't production-ready. Harden the interface against the …

> 来源：Impeccable

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F5F5F5 |
| surface | #E8E8E8 |
| text | #1A1A1A |
| muted | #7D7D7D |
| accent | #F59E0B |
| accent2 | #22C55E |

## 关键参数

- 质感类：dash
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* harden — dash */
.aek-stage {
  --p-bg: #F5F5F5;
  --p-surface: #E8E8E8;
  --p-text: #1A1A1A;
  --p-muted: #7D7D7D;
  --p-accent: #F59E0B;
  --p-accent2: #22C55E;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```