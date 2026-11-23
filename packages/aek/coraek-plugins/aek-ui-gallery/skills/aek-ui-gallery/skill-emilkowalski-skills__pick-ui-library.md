# pick-ui-library

组件库选型 · Bento 网格

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F5F7FA |
| text | #131720 |
| muted | #7C8592 |
| accent | #0EA5E9 |
| accent2 | #8B5CF6 |

## 关键参数

- 质感类：bento
- 字体：sans
- 圆角：20px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* pick-ui-library — bento */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F5F7FA;
  --p-text: #131720;
  --p-muted: #7C8592;
  --p-accent: #0EA5E9;
  --p-accent2: #8B5CF6;
  --sg-radius: 20px;
  --sg-blur: 0px;
}
```