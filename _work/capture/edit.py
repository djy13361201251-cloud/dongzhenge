#!/usr/bin/env python3
# 按口播时间轴把 12 段素材剪成功能蒙太奇
# 每段：取哪一段、用什么速度、是否需要裁切
import subprocess, os, json, pathlib

BASE = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/capture/clips')
OUT = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/capture/out')
OUT.mkdir(exist_ok=True)
FF = os.path.expanduser('~/.local/bin/ffmpeg')

# 口播里每个功能的起止，取自转写时间戳
# (源素材, 源入点, 源出点, 目标时长, 说明)
EDIT = [
    ('01_intro',    0.4, 4.6,  2.2, '出场：海报在动'),
    ('02_styles',   1.6, 7.8,  3.2, '三种风格连切'),
    ('03_draw',     1.2, 8.0,  3.6, '抽卡'),
    ('04_cell',     2.4, 9.4,  3.2, '单格改造'),
    ('05_lock',     2.6, 9.8,  2.6, '锁定 + 再抽'),
    ('06_drag',     1.4, 7.0,  2.8, '拖缝隙'),
    ('07_chaos',    1.6, 6.4,  1.8, '混乱模式'),
    ('08_text',     1.6, 9.6,  3.4, '文字层级'),
    ('09_color',    1.4, 8.6,  3.2, '配色'),
    ('10_piccolor', 1.2, 7.6,  2.6, '拖图取色'),
    ('11_series',   1.4, 7.2,  2.4, '系列海报'),
    ('12_export',   1.2, 5.6,  2.0, '导出'),
]


def src(name):
    files = list((BASE / name).glob('*.webm'))
    if not files:
        raise SystemExit('missing ' + name)
    return str(files[0])


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('FAILED:', ' '.join(cmd[:6]), '\n', r.stderr[-800:])
        raise SystemExit(1)
    return r


parts = []
for i, (name, a, b, target, label) in enumerate(EDIT):
    f = src(name)
    # 变速让源区间压到目标时长
    speed = (b - a) / target
    vf = f"setpts=PTS/{speed:.6f},fps=30,scale=1080:1920"
    out = OUT / f'seg_{i:02d}_{name}.mp4'
    run([FF, '-y', '-hide_banner', '-loglevel', 'error',
         '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', f,
         '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
         '-pix_fmt', 'yuv420p', '-r', '30', str(out)])
    parts.append((str(out), target, label, speed))
    print(f'{i:02d} {name:<12} {b-a:.1f}s -> {target:.1f}s  ({speed:.2f}x)  {label}')

# 拼接
lst = OUT / 'concat.txt'
with open(lst, 'w') as fh:
    for p, _, _, _ in parts:
        fh.write(f"file '{p}'\n")
final = OUT / 'montage_v1.mp4'
run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
     '-i', str(lst), '-c', 'copy', str(final)])

total = sum(t for _, t, _, _ in parts)
print(f'\n总时长 {total:.1f}s -> {final}')
json.dump([{'file': p, 'dur': t, 'label': l, 'speed': s} for p, t, l, s in parts],
          open(OUT / 'timeline.json', 'w'), ensure_ascii=False, indent=1)
