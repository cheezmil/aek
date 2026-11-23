# 3D Product Preview

E-commerce, furniture, fashion, automotive, electronics, jewelry, product configurators

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #f1f1f1 |
| text | #18181b |
| muted | #808082 |
| accent | #E8E8E8 |
| accent2 | #F5F5F5 |

## 关键参数

- 质感类：flat
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* 3D Product Preview — flat */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #f1f1f1;
  --p-text: #18181b;
  --p-muted: #808082;
  --p-accent: #E8E8E8;
  --p-accent2: #F5F5F5;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```