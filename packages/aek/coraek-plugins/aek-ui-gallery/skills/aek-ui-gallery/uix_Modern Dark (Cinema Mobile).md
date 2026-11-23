# Modern Dark (Cinema Mobile)

Developer tools, pro productivity apps, fintech/trading dashboards, media/streaming platf…

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #EDEDEF |
| surface | #dfdfe1 |
| text | #020203 |
| muted | #6c6c6d |
| accent | #5E6AD2 |
| accent2 | #050506 |

## 关键参数

- 质感类：glass
- 字体：sans
- 圆角：12px
- 毛玻璃：16px
- 深色底：否

## 应用 CSS

```css
/* Modern Dark (Cinema Mobile) — glass */
.aek-stage {
  --p-bg: #EDEDEF;
  --p-surface: #dfdfe1;
  --p-text: #020203;
  --p-muted: #6c6c6d;
  --p-accent: #5E6AD2;
  --p-accent2: #050506;
  --sg-radius: 12px;
  --sg-blur: 16px;
}
```