# impeccable

设计工程 · 精密层级

> 来源：Impeccable

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #FFFFFF |
| surface | #F4F7F5 |
| text | #101512 |
| muted | #78857E |
| accent | #10B981 |
| accent2 | #0F766E |

## 关键参数

- 质感类：layer
- 字体：sans
- 圆角：8px
- 毛玻璃：0px
- 深色底：否

## 应用 CSS

```css
/* impeccable — layer */
.aek-stage {
  --p-bg: #FFFFFF;
  --p-surface: #F4F7F5;
  --p-text: #101512;
  --p-muted: #78857E;
  --p-accent: #10B981;
  --p-accent2: #0F766E;
  --sg-radius: 8px;
  --sg-blur: 0px;
}
```