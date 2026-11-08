from playwright.sync_api import sync_playwright
import pathlib, os, shutil
URL = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html').as_uri()
for tag,(w,h,dpr,ow,oh) in {'hi':(390,844,3,1080,2338)}.items():
    d=f'/tmp/vid_{tag}'
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chromium-headless-shell')
        ctx = b.new_context(viewport={'width':w,'height':h}, device_scale_factor=dpr, is_mobile=True,
                            has_touch=True, record_video_dir=d, record_video_size={'width':ow,'height':oh})
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(2500)
        pg.wait_for_timeout(1500)
        pg.close(); ctx.close(); b.close()
    print(tag, os.listdir(d))
