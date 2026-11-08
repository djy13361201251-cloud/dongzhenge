# 动真格 · UI 间距规范

> 本文件是构建期的硬约束，不是建议。`spacing.py` 会在每次 `python3 build.py` 时强制执法：
> 源 CSS 里写出非 4 倍数的间距会被自动改写到栅格上；改不掉的，构建直接失败。

## 1. 栅格基准：4px

所有**间距**属性必须是 4 的整数倍：

```
gap · row-gap · column-gap · grid-gap
padding · padding-top / right / bottom / left
margin  · margin-top / right / bottom / left
```

合法值：`0 4 8 12 16 20 24 28 32 36 40 48 56 64 …`

## 2. 取整规则

源里出现非栅格值时，构建期按下表改写（按设计惯例的取整带，不是四舍五入）：

| 原值 | 改写成 |
|---|---|
| 0 | 0 |
| 1–2px | 4px |
| 3–5px | 4px |
| 6–9px | 8px |
| 10–13px | 12px |
| 14–17px | 16px |
| 18–21px | 20px |
| 22–25px | 24px |

负值同理（`-6px → -8px`），用于兼容层的负边距。

**不参与换算**：`var()` / `calc()` / `env()` / `auto` / 百分比 / 字号 / 行高。

## 3. 语义层级（推荐值）

| 用途 | 值 |
|---|---|
| 元素内部细间距（图标与文字） | 4 / 8 |
| 同组元素之间 | 8 / 12 |
| 卡片内边距 | 12 / 16 |
| 分组之间（grp） | 16 / 20 |
| 面板左右内边距 | 16 |
| 面板底部留白 | 24 |
| 大区块之间 | 24 / 32 |
| 页面级边距 | 16 / 24 |

## 4. 圆角

圆角同样落在 4 的栅格上，但胶囊形（`999px`）和百分比（`50%`）保持原样。
常用：`8 / 12 / 16 / 20 / 24 / 28`。

## 5. 构建期执法

`build.py` 里有三步：

1. `rewrite_css()` —— 量化全部间距声明；
2. `rewrite_radius()` —— 量化圆角；
3. `self_check()` —— 扫最终产物（含 compat 层），发现漏网的非 4 倍数直接 `BUILD FAILED`。

失败信息形如：

```
BUILD FAILED: 间距未落在 4px 栅格上：padding-top:14px; gap:6px
```

此时不要改 `self_check`，改源头的 CSS。

## 6. 布局高度契约（避免底部被裁）

侧栏高度链必须成立，否则内容会撑出窗口：

```
.side        height:100% · min-height:0 · display:flex · overflow:hidden
  .insp      flex:1 · min-height:0 · display:flex · overflow:hidden
    #paneWrap display:flex · flex-direction:column · flex:1 · min-height:0 · overflow:hidden
      .pane   flex:1 · min-height:0 · overflow:auto
```

`#paneWrap` 一旦是 `display:block`，里面的 `.pane` 就拿不到 `flex:1`，内容按自身高度撑开，底部必然被裁。
