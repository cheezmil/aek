# Modern Tech

Contemporary tech-forward visual identity

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F8FAFC |
| surface | #ebecef |
| text | #18181b |
| muted | #7d7e80 |
| accent | #0EA5E9 |
| accent2 | #10B981 |

## 关键参数

- 质感类：saas
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Modern Tech — saas */
.aek-stage {
  --p-bg: #F8FAFC;
  --p-surface: #ebecef;
  --p-text: #18181b;
  --p-muted: #7d7e80;
  --p-accent: #0EA5E9;
  --p-accent2: #10B981;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```