# t3 single huge quote

组件变体 · hallmark

> 来源：Hallmark

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFBFE |
| surface | #F1EEF1 |
| text | #1C1B1F |
| muted | #828083 |
| accent | #6750A4 |
| accent2 | #4D3D75 |

## 关键参数

- 质感类：material
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* t3 single huge quote — material */
.aek-stage {
  --p-bg: #FFFBFE;
  --p-surface: #F1EEF1;
  --p-text: #1C1B1F;
  --p-muted: #828083;
  --p-accent: #6750A4;
  --p-accent2: #4D3D75;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```