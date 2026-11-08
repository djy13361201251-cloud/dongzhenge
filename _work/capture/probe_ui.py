from playwright.sync_api import sync_playwright
import pathlib, json
URL = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html').as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(channel='chromium-headless-shell')
    ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(2500)
    info = pg.evaluate("""() => {
      const out = {};
      const grab = (sel) => Array.from(document.querySelectorAll(sel)).map(e => {
        const r = e.getBoundingClientRect();
        return {id:e.id, cls:e.className, txt:(e.textContent||'').trim().slice(0,12),
                x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), w:Math.round(r.width), h:Math.round(r.height), vis:r.width>0&&r.height>0};
      });
      out.tabs = grab('#tabs button');
      out.style = grab('#style button');
      out.aspect = grab('#aspect button');
      out.hero = grab('#hero button');
      out.actions = grab('#dock button, .dock .btn');
      out.canvas = grab('#cv');
      out.panes = grab('.pane');
      return out;
    }""")
    print(json.dumps(info, ensure_ascii=False, indent=1)[:3000])
    b.close()
