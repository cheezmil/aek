# internal-comms

内部沟通 · 克制通讯

> 来源：Anthropic 官方

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F6F1F5 |
| text | #1D1C1D |
| muted | #8B8089 |
| accent | #4A154B |
| accent2 | #1264A3 |

## 关键参数

- 质感类：minimal
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* internal-comms — minimal */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F6F1F5;
  --p-text: #1D1C1D;
  --p-muted: #8B8089;
  --p-accent: #4A154B;
  --p-accent2: #1264A3;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```