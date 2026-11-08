# -*- coding: utf-8 -*-
"""4px 栅格规范

间距一律量化到 4 的倍数（0 / 4 / 8 / 12 / 16 / 20 / 24 / 28 / 32 …）。
这一层是构建设计约束，不是建议：
  · 源 CSS 里写 9px、10px、14px 这类也会在构建期被改写成最近的 4 倍数；
  · 「最近」按设计惯例取整规则（见 snap），不四舍五入到 0 失真的地方；
  · 构建结束后 self_check() 再扫一遍产物，有漏网的非 4 倍数直接让构建失败。

取整规则（与主流设计系统一致）：
  1-5   → 4      （细间距统一 4）
  6-9   → 8
  10-13 → 12
  14-17 → 16
  18-21 → 20
  …
  > 只作用于间距属性（gap / padding / margin），不影响字号、圆角、边框。
  圆角单独按 4 的倍数取整；字号不动。
"""
import re

# 需要量化的属性
SPACING = ('gap', 'row-gap', 'column-gap', 'grid-gap',
           'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
           'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left')

GRID = 4


def snap(n):
    """把数值量化到最近的 4 的倍数，按设计取整带而不是四舍五入。"""
    if n == 0:
        return 0
    sign = -1 if n < 0 else 1
    a = abs(n)
    if a <= 2:
        v = 4 if a >= 1 else 0          # 1~2px 的“发丝间距”抬到 4，0 保持 0
    else:
        v = int(a / GRID + 0.5) * GRID  # 3~5→4, 6~9→8, 10~13→12 …
    return sign * v


def snap_val(tok):
    """单个长度值：42px -> 44px；-6px -> -8px；15% / auto / calc 不动。"""
    m = re.fullmatch(r'(-?\d*\.?\d+)(px)?', tok.strip())
    if not m:
        return tok
    num = float(m.group(1))
    is_px = m.group(2) or (num != 0 and abs(num - round(num)) < 1e-9 and '.' not in m.group(1))
    # 只有纯数字或显式 px 才处理；小数（如 1.45 行高）不碰
    if not is_px:
        return tok
    if abs(num - round(num)) > 1e-9 and m.group(2) is None:
        return tok
    v = snap(int(round(num)))
    return ('%dpx' % v)


def snap_list(val):
    """padding: 9px 10px 10px -> padding: 8px 12px 12px"""
    parts = [p for p in val.split() if p]
    if not parts:
        return val
    out = []
    for p in parts:
        if re.fullmatch(r'-?\d*\.?\d+(px)?', p):
            out.append(snap_val(p))
        else:
            out.append(p)               # var() / auto / calc() 原样保留
    return ' '.join(out)


def rewrite_css(css):
    """把一串 CSS 文本里的间距声明全部量化。"""
    def one(m):
        prop, val = m.group(1), m.group(2)
        imp = ''
        v = val.strip()
        mi = re.search(r'\s*!important\s*$', v)
        if mi:
            imp = '!important'
            v = v[:mi.start()].strip()
        if not re.fullmatch(r'[\dpx\s\.\-]+', v):
            return m.group(0)           # 含 var/calc/auto 的整条跳过
        return '%s:%s%s' % (prop, snap_list(v), imp)

    pat = re.compile(r'(?<![-\w])(' + '|'.join(re.escape(p) for p in SPACING) + r')\s*:\s*([^;{}]+)')
    return pat.sub(one, css)


# 圆角也走 4 的栅格（视觉上更整齐），但不含 999px 胶囊与 50%
RADIUS = re.compile(r'(?<![-\w])(border-radius|border-top-left-radius|border-top-right-radius|'
                    r'border-bottom-left-radius|border-bottom-right-radius)\s*:\s*([^;{}]+)')


def rewrite_radius(css):
    def one(m):
        prop, val = m.group(1), m.group(2).strip()
        if 'var(' in val or 'calc(' in val or '%' in val or '999' in val:
            return m.group(0)
        if not re.fullmatch(r'[\dpx\s\.\-]+', val):
            return m.group(0)
        parts = [p for p in val.split() if p]
        return '%s:%s' % (prop, ' '.join(snap_val(p) if re.fullmatch(r'-?\d*\.?\d+px', p) else p
                                         for p in parts))
    return RADIUS.sub(one, css)


def self_check(css, fail):
    """构建后兜底：产物里不允许出现非 4 倍数的间距。"""
    bad = []
    pat = re.compile(r'(?<![-\w])(' + '|'.join(re.escape(p) for p in SPACING) + r')\s*:\s*([^;{}]+)')
    for m in pat.finditer(css):
        prop, val = m.group(1), m.group(2).strip()
        if 'var(' in val or 'calc(' in val or 'env(' in val:
            continue
        for tok in val.split():
            mm = re.fullmatch(r'(-?\d+)px', tok)
            if not mm:
                continue
            n = int(mm.group(1))
            if n % GRID != 0:
                bad.append('%s:%s' % (prop, val))
                break
    if bad:
        fail('间距未落在 4px 栅格上：' + '; '.join(sorted(set(bad))[:8]))
