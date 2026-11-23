# stitch-design-taste

设计系统 Token

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F5F6F8 |
| text | #14161A |
| muted | #7B8189 |
| accent | #F97316 |
| accent2 | #8B5CF6 |

## 关键参数

- 质感类：dash
- 字体：mono
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* stitch-design-taste — dash */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F5F6F8;
  --p-text: #14161A;
  --p-muted: #7B8189;
  --p-accent: #F97316;
  --p-accent2: #8B5CF6;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```