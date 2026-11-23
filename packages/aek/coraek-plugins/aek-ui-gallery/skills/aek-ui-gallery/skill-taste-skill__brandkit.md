# brandkit

品牌套件 · 高端画板

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FBF9F4 |
| surface | #F3EFE5 |
| text | #191713 |
| muted | #877F6F |
| accent | #B8860B |
| accent2 | #1F1C17 |

## 关键参数

- 质感类：editorial
- 字体：serif
- 圆角：2px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* brandkit — editorial */
.aek-stage {
  --p-bg: #FBF9F4;
  --p-surface: #F3EFE5;
  --p-text: #191713;
  --p-muted: #877F6F;
  --p-accent: #B8860B;
  --p-accent2: #1F1C17;
  --sg-radius: 2px;
  --sg-blur: 0px;
}
```