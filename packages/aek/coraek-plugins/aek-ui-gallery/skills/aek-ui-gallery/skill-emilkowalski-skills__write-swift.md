# write-swift

Swift · 等宽代码

> 来源：Emil Kowalski

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #FBF6F4 |
| text | #1A1512 |
| muted | #8A8078 |
| accent | #F05138 |
| accent2 | #7C3AED |

## 关键参数

- 质感类：mono
- 字体：mono
- 圆角：6px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* write-swift — mono */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #FBF6F4;
  --p-text: #1A1512;
  --p-muted: #8A8078;
  --p-accent: #F05138;
  --p-accent2: #7C3AED;
  --sg-radius: 6px;
  --sg-blur: 0px;
}
```