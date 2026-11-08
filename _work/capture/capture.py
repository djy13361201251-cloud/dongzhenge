#!/usr/bin/env python3
# 脚本驱动录制：把口播里提到的每个功能各录成一段独立素材
import pathlib, os, shutil, sys
from playwright.sync_api import sync_playwright

DIST = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html')
URL = DIST.as_uri()
OUT = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/capture/clips')

VIEW = {'width': 900, 'height': 1600}
DPR = 1
VSIZE = {'width': 900, 'height': 1600}

# 假光标 + 点击涟漪：headless 不录系统光标，观众需要看见"手在哪"
OVERLAY = """
(function(){
  if(document.getElementById('__cur')) return;
  const c=document.createElement('div'); c.id='__cur';
  c.style.cssText='position:fixed;left:-100px;top:-100px;width:28px;height:28px;border-radius:50%;'
    +'border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.5),0 3px 10px rgba(0,0,0,.35);'
    +'pointer-events:none;z-index:999999;transform:translate(-50%,-50%);transition:transform .05s linear';
  const dot=document.createElement('div');
  dot.style.cssText='position:absolute;left:50%;top:50%;width:7px;height:7px;border-radius:50%;'
    +'background:#111;transform:translate(-50%,-50%)';
  c.appendChild(dot); document.body.appendChild(c);
  const st=document.createElement('style');
  st.textContent='@keyframes __rip{0%{transform:translate(-50%,-50%) scale(.35);opacity:.95}'
    +'100%{transform:translate(-50%,-50%) scale(2.6);opacity:0}}';
  document.head.appendChild(st);
  let x=-100,y=-100;
  document.addEventListener('mousemove',e=>{x=e.clientX;y=e.clientY;
    c.style.left=x+'px'; c.style.top=y+'px';
    c.style.transform='translate(-50%,-50%) scale(1.14)';},true);
  document.addEventListener('mousedown',e=>{
    const r=document.createElement('div');
    r.style.cssText='position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;width:64px;height:64px;'
      +'border-radius:50%;border:3px solid #111;pointer-events:none;z-index:999998;'
      +'transform:translate(-50%,-50%);animation:__rip .55s ease-out forwards';
    document.body.appendChild(r); setTimeout(()=>r.remove(),600);
    c.style.transform='translate(-50%,-50%) scale(.86)';
  },true);
  document.addEventListener('mouseup',e=>{c.style.transform='translate(-50%,-50%) scale(1.14)'},true);
  setTimeout(()=>{c.style.transform='translate(-50%,-50%) scale(1)';},80);
})();
"""


def human_click(pg, x, y, pause=0.18):
    """带移动轨迹的点击，避免瞬移"""
    pg.mouse.move(x, y, steps=12)
    pg.wait_for_timeout(int(pause * 1000))
    pg.mouse.down()
    pg.wait_for_timeout(70)
    pg.mouse.up()


def scroll_to(pg, selector, offset=-120, smooth=True):
    pg.evaluate("""([sel,off,smooth]) => {
        const el = document.querySelector(sel);
        if(!el) return;
        const r = el.getBoundingClientRect();
        window.scrollTo({top: window.scrollY + r.top + off, behavior: smooth ? 'smooth':'auto'});
    }""", [selector, offset, smooth])


def center(pg, selector):
    return pg.evaluate("""(sel)=>{
        const el=document.querySelector(sel); if(!el) return null;
        const r=el.getBoundingClientRect();
        return {x:r.x+r.width/2, y:r.y+r.height/2, w:r.width, h:r.height};
    }""", selector)


def canvas_click(pg, fx, fy, pause=0.25):
    """在画布 (0..1) 相对坐标处点击"""
    box = pg.evaluate("""()=>{const c=document.getElementById('cv');const r=c.getBoundingClientRect();
        return {x:r.x,y:r.y,w:r.width,h:r.height};}""")
    x = box['x'] + box['w'] * fx
    y = box['y'] + box['h'] * fy
    human_click(pg, x, y, pause)
    return (x, y)


# ---------------------------------------------------------------- 分镜
def seg_intro(pg):
    pg.wait_for_timeout(900)
    pg.mouse.move(200, 300, steps=20)
    pg.wait_for_timeout(700)


def click_js(pg, sel, text):
    """不滚动、直接触发按钮，保证海报始终在画面里"""
    ok = pg.evaluate("""([sel,txt])=>{
        const b=[...document.querySelectorAll(sel)].find(e=>(e.textContent||'').trim()===txt);
        if(!b) return false; b.click(); return true;
    }""", [sel, text])
    pg.wait_for_timeout(700)
    return ok


def seg_styles(pg):
    pg.wait_for_timeout(700)
    for nm in ('可爱', '规整', '混乱'):
        click_js(pg, '#style button', nm)
        pg.wait_for_timeout(200)
    click_js(pg, '#style button', '规整')
    pg.wait_for_timeout(900)


def seg_draw(pg):
    scroll_to(pg, 'body', 92, smooth=False)
    pg.wait_for_timeout(500)
    bb = pg.locator('#rand').bounding_box()
    x, y = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
    pg.mouse.move(x, y, steps=10)
    for i in range(14):
        pg.mouse.down(); pg.wait_for_timeout(40); pg.mouse.up()
        pg.wait_for_timeout(150 if i < 10 else 420)
    pg.wait_for_timeout(900)


def pick_non_hero(pg):
    """点一个非主视觉格，避免下拉只有 4 项的主视觉格"""
    for fx, fy in ((0.75, 0.62), (0.72, 0.25), (0.30, 0.22), (0.25, 0.72)):
        canvas_click(pg, fx, fy, 0.3)
        pg.wait_for_timeout(500)
        title = pg.evaluate("()=>document.getElementById('popTitle').textContent")
        if title and title != '主视觉格':
            return True
        pg.evaluate("()=>{const b=document.getElementById('popClose'); if(b) b.click();}")
        pg.wait_for_timeout(300)
    return False


def set_select(pg, sel_id, value):
    """直接派发 change，避免 select_option 在重渲染时卡住"""
    ok = pg.evaluate("""([id,v])=>{
        const el=document.getElementById(id); if(!el) return false;
        el.value=v;
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return el.value===v;
    }""", [sel_id, value])
    pg.wait_for_timeout(650)
    return ok


def seg_cell(pg):
    pg.wait_for_timeout(400)
    if not pick_non_hero(pg):
        return
    pg.wait_for_timeout(600)
    opts = pg.evaluate("()=>[...document.querySelectorAll('#popType option')].map(o=>o.value)")
    tx = [v for v in opts if v.startswith('tx:')]
    if len(tx) > 3:
        set_select(pg, 'popType', tx[1]); pg.wait_for_timeout(400)
        set_select(pg, 'popType', tx[6] if len(tx) > 6 else tx[-1])
    # 换颜色
    pg.evaluate("""()=>{
        const b=document.querySelectorAll('#popCols button');
        if(b.length>2){const r=b[2].getBoundingClientRect();
          window.__cc=[r.x+r.width/2, r.y+r.height/2]; b[2].click();}
    }""")
    pg.wait_for_timeout(200)
    cc = pg.evaluate("()=>window.__cc||null")
    if cc:
        pg.mouse.move(cc[0], cc[1], steps=10)
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(500)
    cb = pg.locator('#popClose').bounding_box()
    if cb:
        human_click(pg, cb['x'] + cb['width'] / 2, cb['y'] + cb['height'] / 2)
    pg.wait_for_timeout(1100)


def seg_lock(pg):
    scroll_to(pg, 'body', 10, smooth=False)
    pg.wait_for_timeout(400)
    canvas_click(pg, 0.5, 0.45, 0.3)
    pg.wait_for_timeout(600)
    bb = pg.locator('#popLock').bounding_box()
    human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    pg.wait_for_timeout(600)
    bb = pg.locator('#popClose').bounding_box()
    human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    pg.wait_for_timeout(400)
    pg.wait_for_timeout(400)
    rb = pg.locator('#rand').bounding_box()
    rx, ry = rb['x'] + rb['width'] / 2, rb['y'] + rb['height'] / 2
    pg.mouse.move(rx, ry, steps=8)
    for i in range(5):
        pg.mouse.down(); pg.wait_for_timeout(40); pg.mouse.up()
        pg.wait_for_timeout(330)
    pg.wait_for_timeout(700)


def seg_drag(pg):
    scroll_to(pg, 'body', 40, smooth=False)
    pg.wait_for_timeout(400)
    box = pg.evaluate("""()=>{const c=document.getElementById('cv');const r=c.getBoundingClientRect();
        return {x:r.x,y:r.y,w:r.width,h:r.height};}""")
    # 竖直缝隙：画布纵向 40% 处、横向 50% 附近
    x = box['x'] + box['w'] * 0.5
    y = box['y'] + box['h'] * 0.4
    pg.mouse.move(x, y, steps=14)
    pg.wait_for_timeout(500)
    pg.mouse.down()
    pg.wait_for_timeout(160)
    for i in range(1, 15):
        pg.mouse.move(x - i * 4.5, y, steps=2)
        pg.wait_for_timeout(45)
    pg.wait_for_timeout(350)
    pg.mouse.up()
    pg.wait_for_timeout(900)


def seg_chaos(pg):
    pg.wait_for_timeout(600)
    click_js(pg, '#style button', '混乱')
    pg.wait_for_timeout(1600)


def seg_text(pg):
    scroll_to(pg, '#tabs', -90)
    pg.wait_for_timeout(500)
    bb = pg.locator('#tabs button').nth(2).bounding_box()
    human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    pg.wait_for_timeout(700)
    scroll_to(pg, '#p-text', -80)
    pg.wait_for_timeout(600)
    f = pg.locator('#t-title')
    f.click()
    pg.wait_for_timeout(250)
    f.press('Meta+a')
    pg.keyboard.type('PRIVATE VIEW', delay=55)
    pg.wait_for_timeout(450)
    f2 = pg.locator('#t-lines')
    if f2.count():
        f2.click()
        pg.wait_for_timeout(200)
        f2.press('Meta+a')
        pg.keyboard.type('08 NOV SAT\nWEST BUND\nRSVP NOW', delay=45)
    pg.wait_for_timeout(900)


def seg_color(pg):
    scroll_to(pg, '#tabs', -90)
    pg.wait_for_timeout(450)
    bb = pg.locator('#tabs button').nth(1).bounding_box()
    human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    pg.wait_for_timeout(700)
    scroll_to(pg, '#p-color', -70)
    pg.wait_for_timeout(700)
    pre = pg.locator('#presets button')
    if pre.count() > 5:
        bb = pre.nth(3).bounding_box()
        human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        pg.wait_for_timeout(800)
        bb = pre.nth(9).bounding_box()
        human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        pg.wait_for_timeout(900)
    five = pg.locator('#five input[type=color]')
    if five.count() >= 2:
        pg.evaluate("""()=>{
          const ins=[...document.querySelectorAll('#five input[type=color]')];
          ins[0].value='#1B4DFF'; ins[0].dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        pg.wait_for_timeout(700)
        pg.evaluate("""()=>{
          const ins=[...document.querySelectorAll('#five input[type=color]')];
          ins[2].value='#FF3D6E'; ins[2].dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        pg.wait_for_timeout(900)


def seg_pic_color(pg):
    scroll_to(pg, '#tabs', -90)
    pg.wait_for_timeout(400)
    bb = pg.locator('#tabs button').nth(1).bounding_box()
    human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    pg.wait_for_timeout(600)
    scroll_to(pg, '#impImg', -160)
    pg.wait_for_timeout(600)
    src = '/tmp/palette_src.png'
    if os.path.exists(src):
        pg.set_input_files('#impImg', src)
        pg.wait_for_timeout(1600)
    pg.wait_for_timeout(800)


def seg_series(pg):
    scroll_to(pg, '#aspect', -220)
    pg.wait_for_timeout(600)
    for nm in ['4:5', '1:1', '16:9', '9:16']:
        b = pg.locator('#aspect button', has_text=nm).first
        if not b.count():
            continue
        bb = b.bounding_box()
        human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        pg.wait_for_timeout(520)
    pg.wait_for_timeout(700)


def seg_export(pg):
    scroll_to(pg, 'body', 0, smooth=False)
    pg.evaluate('window.scrollTo({top:0,behavior:"smooth"})')
    pg.wait_for_timeout(700)
    bb = pg.locator('#png').bounding_box()
    human_click(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    pg.wait_for_timeout(1400)


SEGMENTS = {
    '01_intro': seg_intro,
    '02_styles': seg_styles,
    '03_draw': seg_draw,
    '04_cell': seg_cell,
    '05_lock': seg_lock,
    '06_drag': seg_drag,
    '07_chaos': seg_chaos,
    '08_text': seg_text,
    '09_color': seg_color,
    '10_piccolor': seg_pic_color,
    '11_series': seg_series,
    '12_export': seg_export,
}


WIDE = {'width': 1000, 'height': 760}
WIDE_OUT = {'width': 2000, 'height': 1520}
WIDE_SEGMENTS = set()


def record(name, fn):
    wide = name in WIDE_SEGMENTS
    d = OUT / name
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chromium-headless-shell')
        ctx = b.new_context(viewport=(WIDE if wide else VIEW), device_scale_factor=(2 if wide else DPR),
                            is_mobile=not wide, has_touch=True,
                            record_video_dir=str(d), record_video_size=(WIDE_OUT if wide else VSIZE))
        pg = ctx.new_page()
        pg.goto(URL)
        pg.set_default_timeout(6000)
        pg.wait_for_timeout(2200)
        pg.evaluate(OVERLAY)
        try:
            fn(pg)
        except Exception as e:
            print(f'  [{name}] 动作异常: {type(e).__name__}: {str(e)[:110]}')
            pg.wait_for_timeout(400)
        pg.wait_for_timeout(300)
        pg.close(); ctx.close(); b.close()
    files = list(d.glob('*.webm'))
    return files[0] if files else None


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[1:] if len(sys.argv) > 1 else list(SEGMENTS)
    for name in only:
        if name not in SEGMENTS:
            print('skip unknown', name); continue
        f = record(name, SEGMENTS[name])
        print('done', name, '->', f.name if f else 'NO FILE')
