from playwright.sync_api import sync_playwright
import pathlib, os, shutil
URL = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html').as_uri()
d='/tmp/vid_q'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chromium-headless-shell')
    ctx = b.new_context(viewport={'width':360,'height':780}, device_scale_factor=3, is_mobile=True,
                        has_touch=True, record_video_dir=d, record_video_size={'width':1080,'height':2340})
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(2500)
    pg.wait_for_timeout(1500)
    pg.close(); ctx.close(); b.close()
f=[x for x in os.listdir(d) if x.endswith('.webm')][0]
print(f)
