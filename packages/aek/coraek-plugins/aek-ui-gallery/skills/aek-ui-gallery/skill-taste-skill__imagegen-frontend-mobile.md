# imagegen-frontend-mobile

移动端视觉 · App 原生

> 来源：TasteSkill

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #F4F4F8 |
| surface | #FFFFFF |
| text | #1B1B20 |
| muted | #8A8A93 |
| accent | #F97316 |
| accent2 | #007AFF |

## 关键参数

- 质感类：apple
- 字体：sans
- 圆角：20px
- 毛玻璃：22px
- 深色底：否

## 应用 CSS

```css
/* imagegen-frontend-mobile — apple */
.aek-stage {
  --p-bg: #F4F4F8;
  --p-surface: #FFFFFF;
  --p-text: #1B1B20;
  --p-muted: #8A8A93;
  --p-accent: #F97316;
  --p-accent2: #007AFF;
  --sg-radius: 20px;
  --sg-blur: 22px;
}
```