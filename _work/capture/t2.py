from playwright.sync_api import sync_playwright
import pathlib, time, os
URL = pathlib.Path('/Users/daiJingyi/Desktop/软糖动效素材包/_work/dist/index.html').as_uri()
URL = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html').as_uri()
os.makedirs('/tmp/vidtest', exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chromium-headless-shell')
    ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        record_video_dir='/tmp/vidtest', record_video_size={'width':780,'height':1688})
    pg = ctx.new_page()
    pg.goto(URL); pg.wait_for_timeout(2500)
    # 模拟一段时间内的自然播放
    pg.wait_for_timeout(2000)
    pg.close(); ctx.close(); b.close()
print(os.listdir('/tmp/vidtest'))
