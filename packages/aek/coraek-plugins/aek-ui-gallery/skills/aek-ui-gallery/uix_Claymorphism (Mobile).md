# Claymorphism (Mobile)

Children education apps, teen social products, crypto gamification, creative tools, brand…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F4F1FA |
| surface | #e8e5ee |
| text | #332F3A |
| muted | #8a8690 |
| accent | #10B981 |
| accent2 | #DB2777 |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：20px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* Claymorphism (Mobile) — glass */
.aek-stage {
  --p-bg: #F4F1FA;
  --p-surface: #e8e5ee;
  --p-text: #332F3A;
  --p-muted: #8a8690;
  --p-accent: #10B981;
  --p-accent2: #DB2777;
  --sg-radius: 20px;
  --sg-blur: 16px;
}
```