# image-to-code

图生代码 · 玻璃

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F6F8FB |
| text | #12161C |
| muted | #7F8894 |
| accent | #F97316 |
| accent2 | #6366F1 |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：22px
- 毛玻璃：18px
- 深色底：否

## 应用 CSS

```css
/* image-to-code — glass */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F6F8FB;
  --p-text: #12161C;
  --p-muted: #7F8894;
  --p-accent: #F97316;
  --p-accent2: #6366F1;
  --sg-radius: 22px;
  --sg-blur: 18px;
}
```