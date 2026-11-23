# Nature Biophilic

Nature-inspired biophilic design approach

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #22C55E |
| surface | #37ca6d |
| text | #f4f4f5 |
| muted | #96dfb1 |
| accent | #0891B2 |
| accent2 | #0EA5E9 |

## 关键参数

- 质感类：organic
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* Nature Biophilic — organic */
.aek-stage {
  --p-bg: #22C55E;
  --p-surface: #37ca6d;
  --p-text: #f4f4f5;
  --p-muted: #96dfb1;
  --p-accent: #0891B2;
  --p-accent2: #0EA5E9;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```