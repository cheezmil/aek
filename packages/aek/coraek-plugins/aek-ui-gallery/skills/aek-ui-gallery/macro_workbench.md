# workbench

Product screenshots in frames are the primary content. The page is a guided tour of the app in use.…

> 来源：Hallmark

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #050505 |
| surface | #0D1A0D |
| text | #33FF00 |
| muted | #1A3D1A |
| accent | #33FF00 |
| accent2 | #FFB000 |

## 关键参数

- 质感类：terminal
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* workbench — terminal (dark) */
.aek-stage {
  --p-bg: #050505;
  --p-surface: #0D1A0D;
  --p-text: #33FF00;
  --p-muted: #1A3D1A;
  --p-accent: #33FF00;
  --p-accent2: #FFB000;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```