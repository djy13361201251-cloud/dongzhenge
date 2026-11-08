from playwright.sync_api import sync_playwright
import pathlib, time
URL = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html').as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(channel='chromium-headless-shell')
    ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(URL); pg.wait_for_timeout(3000)
    print('viewport:', pg.evaluate('[innerWidth,innerHeight,devicePixelRatio]'))
    print('scrollW:', pg.evaluate('document.documentElement.scrollWidth'))
    t0=time.time(); n=30
    for i in range(n):
        pg.screenshot(path=f'/tmp/pw_{i:03d}.png')
    dt=time.time()-t0
    print(f'{n} shots in {dt:.2f}s -> {n/dt:.1f} fps')
    b.close()
