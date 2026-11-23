# redesign-existing-projects

改版审计 · 批注

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F8F9FB |
| text | #111318 |
| muted | #7E8590 |
| accent | #F97316 |
| accent2 | #EF4444 |

## 关键参数

- 质感类：annotate
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* redesign-existing-projects — annotate */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F8F9FB;
  --p-text: #111318;
  --p-muted: #7E8590;
  --p-accent: #F97316;
  --p-accent2: #EF4444;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```