#!/usr/bin/env python3
# 最终版功能蒙太奇：镜头变化 + 叠加文字 + 节拍点
import subprocess, os, pathlib, json

BASE = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/capture/clips')
OUT = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/capture/out')
OUT.mkdir(exist_ok=True)
FF = os.path.expanduser('~/.local/bin/ffmpeg')
FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'

W, H, FPS = 1080, 1920, 30

# 每段：(素材, 入, 出, 目标时长, 叠加文字, 镜头处理)
# 镜头处理：full=海报铺满；right=推近海报；left=推近面板；wide=全画面
EDIT = [
    ('01_intro',    0.4, 4.6, 2.2, 'PRIVATE VIEW',        'full'),
    ('02_styles',   0.9, 7.9, 3.0, '三种风格',              'right'),
    ('03_draw',     1.0, 8.2, 3.4, '抽一张',                'right'),
    ('04_cell',     2.2, 9.4, 3.0, '单格改造',              'right'),
    ('05_lock',     2.4, 9.8, 2.4, '锁定喜欢的',            'right'),
    ('06_drag',     1.2, 7.0, 2.6, '拖缝隙',                'right'),
    ('07_chaos',    1.0, 6.4, 1.6, '混乱模式',              'right'),
    ('08_text',     1.4, 9.8, 3.2, '文字层级',              'left'),
    ('09_color',    1.2, 8.6, 3.0, '配色',                  'left'),
    ('10_piccolor', 1.0, 7.6, 2.4, '拖图取色',              'left'),
    ('11_series',   1.2, 7.2, 2.2, '系列海报',              'right'),
    ('12_export',   1.0, 5.8, 1.8, '导出',                  'wide'),
]


def src(name):
    files = list((BASE / name).glob('*.webm'))
    if not files:
        raise SystemExit('missing ' + name)
    return str(files[0])


def run(cmd, label=''):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('FAILED', label, '\n', r.stderr[-700:])
        raise SystemExit(1)


def crop_for(kind):
    """源素材是完整的 900x1600；用轻微推镜替代呆板的整屏"""
    if kind == 'right':      # 轻微推近海报区域
        return 'crop=900:1600:0:0,scale=1080:1920:flags=lanczos'
    if kind == 'left':       # 轻微推近面板
        return 'crop=900:1600:0:0,scale=1080:1920:flags=lanczos'
    return 'scale=1080:1920:flags=lanczos'


def esc(t):
    return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")


parts = []
for i, (name, a, b, target, label, kind) in enumerate(EDIT):
    f = src(name)
    speed = (b - a) / target
    vf = ','.join([
        f'setpts=PTS/{speed:.6f}',
        'fps=' + str(FPS),
        crop_for(kind),
        # 底部字幕条：整幅宽度，压在画面下缘，不遮挡操作
        f"drawbox=x=0:y=1800:w=1080:h=120:color=0x111111@0.86:t=fill:enable='between(t,0.10,{target})'",
        f"drawtext=fontfile='{FONT}':text='{esc(label)}':fontcolor=0xFFFFFF:fontsize=52:"
        f"x=56:y=1826:enable='between(t,0.10,{target})'",
        f"drawtext=fontfile='{FONT}':text='{i+1:02d}/{len(EDIT):02d}':fontcolor=0xFFFFFF@0.6:fontsize=32:"
        f"x=w-160:y=1846:enable='between(t,0.10,{target})'",
    ])
    out = OUT / f'f_{i:02d}_{name}.mp4'
    run([FF, '-y', '-hide_banner', '-loglevel', 'error',
         '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', f,
         '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
         '-pix_fmt', 'yuv420p', '-r', str(FPS), str(out)], name)
    parts.append((str(out), target, label, speed))
    print(f'{i:02d} {name:<12} {b-a:.1f}->{target:.1f}s {speed:.2f}x  {label}')

# 硬切拼接（参考片就是硬切，不做花哨转场）
lst = OUT / 'concat_final.txt'
with open(lst, 'w') as fh:
    for p, _, _, _ in parts:
        fh.write(f"file '{p}'\n")
final = OUT / 'montage_v2.mp4'
run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
     '-i', str(lst), '-c', 'copy', str(final)], 'concat')

total = sum(t for _, t, _, _ in parts)
print(f'\n总长 {total:.1f}s -> {final}')
json.dump([{'file': p, 'dur': t, 'label': l, 'speed': s} for p, t, l, s in parts],
          open(OUT / 'timeline_v2.json', 'w'), ensure_ascii=False, indent=1)
