# 3D/Isometric

Tech gaming architecture firms

> 来源：UI/UX Pro Max

## 使用方法

这是一套 AEK 风格画廊 UI 皮肤。应用方式：把下面「应用 CSS」整段复制到你的工程（或 AEK 壳的样式注入处），它会以 `.aek-stage` 作用域设置 6 个 `--p-*` 调色变量 + 圆角 / 毛玻璃，UI 即呈现该质感。

## 配色（6 槽）

| 角色 | 色值 |
| ---- | ---- |
| bg | #020203 |
| surface | #141415 |
| text | #EDEDEF |
| muted | #838385 |
| accent | #5E6AD2 |
| accent2 | #3E468A |

## 关键参数

- 质感类：cinema
- 字体：sans
- 圆角：12px
- 毛玻璃：0px
- 深色底：是

## 应用 CSS

```css
/* 3D/Isometric — cinema (dark) */
.aek-stage {
  --p-bg: #020203;
  --p-surface: #141415;
  --p-text: #EDEDEF;
  --p-muted: #838385;
  --p-accent: #5E6AD2;
  --p-accent2: #3E468A;
  --sg-radius: 12px;
  --sg-blur: 0px;
}
```