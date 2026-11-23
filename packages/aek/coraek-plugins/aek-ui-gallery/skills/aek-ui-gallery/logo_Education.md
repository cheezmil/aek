# Education

Schools universities edtech

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #4F46E5 |
| surface | #6057e7 |
| text | #f4f4f5 |
| muted | #aaa6ee |
| accent | #7C3AED |
| accent2 | #7C3AED |

## 关键参数

- 质感类：material
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* Education — material (dark) */
.aek-stage {
  --p-bg: #4F46E5;
  --p-surface: #6057e7;
  --p-text: #f4f4f5;
  --p-muted: #aaa6ee;
  --p-accent: #7C3AED;
  --p-accent2: #7C3AED;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```