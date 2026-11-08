from playwright.sync_api import sync_playwright
import pathlib, json
URL = pathlib.Path('/Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html').as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(channel='chromium-headless-shell')
    ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(2500)
    def grab(sel):
        return pg.evaluate("""(sel) => Array.from(document.querySelectorAll(sel)).map(e=>{
          const r=e.getBoundingClientRect();
          return {id:e.id, cls:(typeof e.className==='string'?e.className:''), txt:(e.textContent||'').trim().slice(0,10),
                  x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), w:Math.round(r.width), h:Math.round(r.height),
                  vis:r.width>0&&r.height>0 && r.bottom>0 && r.top<innerHeight};
        })""", sel)
    data = {
      'tabs': grab('#tabs button'),
      'style': grab('#style button'),
      'aspect': grab('#aspect button'),
      'hero': grab('#hero button'),
      'dock_btns': grab('.dock button'),
      'drawbtn': grab('#rand'),
      'presets': grab('#presets button'),
      'canvas': grab('#cv'),
      'tabsBox': grab('#tabs'),
    }
    json.dump(data, open('ui.json','w'), ensure_ascii=False, indent=1)
    for k,v in data.items():
        print(f"== {k}")
        for e in v: print(f"   {e['id'] or e['cls']:<16} '{e['txt']}'  ({e['x']},{e['y']}) {e['w']}x{e['h']} vis={e['vis']}")
    # 测试点击 tab
    pg.click('#tabs button:nth-child(2)')
    pg.wait_for_timeout(400)
    vis = pg.evaluate("Array.from(document.querySelectorAll('.pane')).map(p=>p.id+':'+(p.hidden?'hidden':'shown'))")
    print('after tab2 click:', vis)
    b.close()
