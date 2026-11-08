#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 动真格 单文件 H5 改造成符合小红书小工具容器规范的静态包。

改造项：
  1. 内联 <script> -> 外置经典脚本（容器 CSP 禁止内联）
  2. 内嵌 base64 字体(.otf/.ttf) -> 独立 .woff2 包内文件（容器只允许 woff/woff2）
  3. 移除外部域名样式表（Google Fonts），容器不联网
  4. 移除 artifact 运行时 window.claude、a[download] 下载，改用 saveImageToPhotosAlbum / postNote
  5. display:contents(Chrome 65) -> 直接作为 grid 容器
  6. flex gap / min() / max() / inset / 逻辑属性 / :focus-visible -> Chrome 61 基线回退
  7. flatMap(ES2019) -> 等价实现
"""
import re, os, sys, shutil

SRC = '../动真格上线/index.html'
OUT = 'dist'
ASSETS = os.path.join(OUT, 'assets')
COMPAT = []          # [(media, sel, body)]
DISPLAY = {}         # 选择器 -> display，用于识别媒体查询里的 .sliders 这类规则
DIRS = {}            # 选择器 -> (column, wrap)，同样需要跨媒体查询继承

def fail(msg):
    print('BUILD FAILED:', msg); sys.exit(1)

def must(old, new, text, label):
    if text.count(old) != 1:
        fail('%s: expected 1 match, got %d' % (label, text.count(old)))
    return text.replace(old, new)

os.makedirs(ASSETS, exist_ok=True)
src = open(SRC, encoding='utf-8').read()

styles = re.findall(r'<style[^>]*>(.*?)</style>', src, re.S)
scripts = [m.group(2) for m in re.finditer(r'<script([^>]*)>(.*?)</script>', src, re.S)]
if len(styles) != 2 or len(scripts) != 2:
    fail('unexpected block counts styles=%d scripts=%d' % (len(styles), len(scripts)))
main_css = max(styles, key=len)
s0, s1 = scripts

body_start = src.index('<div class="app">')
body_html = src[body_start:src.index('<script', body_start)].rstrip()

# ------------------------------------------------------------ CSS 变换器
def split_gap(val):
    g = val.split()
    return g[0], (g[1] if len(g) > 1 else g[0])   # row-gap, column-gap

def fix_rule(sel, body, media):
    nb = body
    sel_clean = sel.strip()
    is_flex = re.search(r'display\s*:\s*(inline-)?flex', body)
    is_grid = re.search(r'display\s*:\s*(inline-)?grid', body)
    # 媒体查询里的规则常常只写差异声明，display 要从基础规则继承
    if not is_flex and not is_grid:
        for one in [x.strip() for x in sel_clean.split(',') if x.strip()]:
            if DISPLAY.get(one):
                is_flex, is_grid = DISPLAY[one].endswith('flex'), DISPLAY[one].endswith('grid')
    # 只写 gap 差异声明、且基础规则未声明的容器，按缺省值 flex 处理（display:flex 是初始 display）
    if not is_flex and not is_grid and re.search(r'(?<![-\w])gap\s*:', body):
        if any(x.strip() not in DISPLAY for x in sel_clean.split(',') if x.strip()):
            is_flex = True

    # --- gap
    gm = re.search(r'(?<![-\w])gap\s*:\s*([^;]+)\s*(;|$)', nb)
    if gm:
        val = gm.group(1).strip()
        if is_grid:
            nb = nb[:gm.start()] + 'grid-gap:' + val + ';' + nb[gm.end():]
        elif is_flex:
            nb = nb[:gm.start()] + nb[gm.end():]
            dirs = re.findall(r'flex-(direction|flow)\s*:\s*([a-z\- ]+)', body)
            column = any('column' in d[1] for d in dirs)
            wrap = bool(re.search(r'flex-wrap\s*:\s*wrap', body)) or any('wrap' in d[1] for d in dirs)
            sels = [x.strip() for x in sel_clean.split(',') if x.strip()]
            if not dirs:
                # 媒体查询里的差异规则常常不带 direction，沿用基础规则
                for s in sels:
                    if s in DIRS:
                        column = column or DIRS[s][0]
                        wrap = wrap or DIRS[s][1]
            for s in sels:
                DIRS[s] = (column, wrap)
            row_gap, col_gap = split_gap(val)
            for s in [x.strip() for x in sel_clean.split(',') if x.strip()]:
                if s in ('html', 'body', '*'):
                    continue
                if column:
                    COMPAT.append((media, s + ' > * + *', 'margin-top:' + row_gap))
                elif wrap:
                    # 换行容器用负边距 + 全子项正边距，否则首行间距会翻倍
                    COMPAT.append((media, s, 'margin-top:-' + row_gap + ';margin-left:-' + col_gap))
                    COMPAT.append((media, s + ' > *', 'margin-top:' + row_gap + ';margin-left:' + col_gap))
                else:
                    COMPAT.append((media, s + ' > * + *', 'margin-left:' + col_gap))

    # --- inset: 四方向展开
    im = re.search(r'(?<![-\w])inset\s*:\s*([^;]+?)\s*(;|$)', nb)
    if im:
        parts = im.group(1).split()
        while len(parts) < 4:
            parts = parts + [parts[0] if len(parts) == 1 else parts[len(parts) // 2]]
        t, r, b, l = parts[:4]
        nb = nb[:im.start()] + 'top:%s;right:%s;bottom:%s;left:%s;' % (t, r, b, l) + nb[im.end():]

    # --- 逻辑属性 -> 物理属性
    def pair(prop_a, prop_b, val):
        v = val.split()
        return '%s:%s;%s:%s;' % (prop_a, v[0], prop_b, v[-1])
    nb = re.sub(r'padding-block\s*:\s*([^;]+?)\s*(;|$)', lambda m: pair('padding-top', 'padding-bottom', m.group(1)), nb)
    nb = re.sub(r'padding-inline\s*:\s*([^;]+?)\s*(;|$)', lambda m: pair('padding-left', 'padding-right', m.group(1)), nb)
    nb = re.sub(r'margin-block\s*:\s*([^;]+?)\s*(;|$)', lambda m: pair('margin-top', 'margin-bottom', m.group(1)), nb)
    nb = re.sub(r'margin-inline\s*:\s*([^;]+?)\s*(;|$)', lambda m: pair('margin-left', 'margin-right', m.group(1)), nb)

    # --- place-items
    nb = re.sub(r'place-items\s*:\s*([a-z\- ]+?)\s*(;|$)',
                lambda m: 'align-items:%s;justify-items:%s;' % (m.group(1).split()[0], m.group(1).split()[-1]), nb)

    # --- max(16px, env(safe-area-inset-*)) -> 基线值 + 容器注入变量
    nb = re.sub(r'padding-left\s*:\s*max\(\s*16px\s*,\s*env\(safe-area-inset-left\s*,\s*0px\)\s*\)\s*(;|$)',
                'padding-left:16px;padding-left:calc(16px + var(--safe-area-inset-left, env(safe-area-inset-left, 0px)));', nb)
    nb = re.sub(r'padding-right\s*:\s*max\(\s*16px\s*,\s*env\(safe-area-inset-right\s*,\s*0px\)\s*\)\s*(;|$)',
                'padding-right:16px;padding-right:calc(16px + var(--safe-area-inset-right, env(safe-area-inset-right, 0px)));', nb)

    # --- min()/max()/clamp() -> 等价的静态写法
    nb = re.sub(r'height\s*:\s*min\(\s*([\d.]+)vh\s*,\s*([\d.]+)px\s*\)\s*(;|$)',
                r'height:\1vh;max-height:\2px;', nb)

    # --- dvh -> vh 基线（旧内核会丢弃整条声明，必须保留前面的 100vh）
    nb = re.sub(r'(\d+(?:\.\d+)?)dvh', r'\1vh', nb)

    # --- :focus-visible -> 基线补 :focus
    if ':focus-visible' in sel_clean:
        base = ', '.join(x.strip().replace(':focus-visible', ':focus')
                         for x in sel_clean.split(',') if x.strip())
        COMPAT.append((media, base, nb))
    return nb

def transform(css, media=''):
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            out.append(css[i:]); break
        raw = css[i:j]
        # 选择器前的注释单独保留，不让它混进选择器
        lead = ''
        cm = re.match(r'\s*(/\*.*?\*/\s*)', raw, re.S)
        if cm:
            lead, raw = cm.group(1), raw[cm.end():]
        p = raw.strip()
        depth, k = 1, j + 1
        while k < n and depth > 0:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        if p.startswith('@media') or p.startswith('@supports'):
            inner = transform(body, (media + ';' + p) if media else p)
            out.append(lead + raw + '{' + inner + '}')
        elif p.startswith('@'):
            out.append(lead + raw + css[j:k])
        else:
            out.append(lead + raw + '{' + fix_rule(p, body, media) + '}')
        i = k
    return ''.join(out)

css = '[hidden]{display:none!important}\n' + main_css

# 先登记 display，后变换：媒体查询里的规则只写差异声明，需要继承基础规则
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
    d = re.search(r'display\s*:\s*([a-z\-]+)', m.group(2))
    if d:
        for one in [x.strip() for x in m.group(1).split(',') if x.strip()]:
            DISPLAY[one] = d.group(1)

# 字体：base64 内嵌 -> 独立 woff2
for fam in ('InterD', 'PoppinsT'):
    pat = re.compile(r'@font-face\{font-family:' + fam +
                     r';src:url\(data:[\w/+.-]+;base64,[A-Za-z0-9+/=\s]+\)\s*format\(\'[^\']+\'\)', re.S)
    if len(pat.findall(css)) != 1:
        fail('font-face %s not exactly once' % fam)
    css = pat.sub("@font-face{font-family:%s;src:url(./assets/%s.woff2) format('woff2')" % (fam, fam), css)

from restyle import RESTYLE
css = css + '\n' + RESTYLE
# 4px 栅格：先把源 CSS 的间距/圆角量化，再生成兼容层，避免兼容层里冒出新的非 4 倍数
from spacing import rewrite_css, rewrite_radius, self_check
css = rewrite_radius(rewrite_css(css))
css = transform(css)
# transform 会按原值重建 gap/inset 声明，最后再兜一次
# 补图形容器的行间距（子项是 SVG + 纯文本节点，> * + * 抓不到）
TEXT_NODE_FIX = [
    ('.brand > .mark', 'margin-right:10px'),
    ('.toggle > input[type=checkbox]', 'margin-right:8px'),
    ('.colors label > input[type=color]', 'margin-right:8px'),
    ('.result > b', 'margin-right:8px'),
    ('.lbl > small', 'margin-left:8px'),
    ('.seg button > svg', 'margin-bottom:6px'),
    ('.btn > svg', 'margin-right:7px'),
    ('.f > input, .f > select, .f > textarea', 'margin-top:6px'),
    ('.lvf > input, .lvf > textarea', 'margin-top:4px'),
]
for sel, decl in TEXT_NODE_FIX:
    COMPAT.append(('', sel, decl))

# 合并 compat：同 media + 同选择器后者覆盖（保持源顺序）
seen, ordered = {}, []
for media, sel, decl in COMPAT:
    key = (media, sel)
    if key in seen:
        ordered[seen[key]][2] = decl
    else:
        seen[key] = len(ordered)
        ordered.append([media, sel, decl])

compat_css = ['/* Chrome 61 基线层：替代 flex gap / :focus-visible / min() / max() / inset / 逻辑属性 */\n']
for media, sel, decl in ordered:
    rule = '%s{%s}' % (sel, decl if decl.endswith(';') else decl + ';')
    compat_css.append((media + '{' + rule + '}\n') if media else rule + '\n')

# 兼容层也可能带入间距（如负边距），合并后统一再量化一次并自检
compat_merged = ''.join(compat_css)
compat_merged = rewrite_css(compat_merged)
compat_css = [compat_merged]
css = rewrite_css(css)
self_check(css + '\n' + compat_merged, fail)

open(os.path.join(OUT, 'style.css'), 'w', encoding='utf-8').write(css)
open(os.path.join(OUT, 'compat.css'), 'w', encoding='utf-8').write(''.join(compat_css))

# ------------------------------------------------------------ JS 改造
js = s0.rstrip() + '\n\n' + s1

# flatMap (ES2019) -> ES2017
js = must(
    "  const mat=[0x00010000,0,0,0,0x00010000,0,0,0,0x40000000].flatMap(u32);",
    "  const mat=[].concat.apply([],[0x00010000,0,0,0,0x00010000,0,0,0,0x40000000].map(u32));",
    js, 'flatMap mat')
js = must("...keys.flatMap(u32)", "...[].concat.apply([],keys.map(u32))", js, 'flatMap keys')
js = must("...this.samples.flatMap(s=>u32(s.d.length))",
          "...[].concat.apply([],this.samples.map(s=>u32(s.d.length)))", js, 'flatMap samples')

# document.fonts 能力检测；在线字体已移除
js = must(
    "function loadFonts(){const s=JSON.stringify(S.text)+'%·'; return Promise.all([document.fonts.load('900 100px InterD'),document.fonts.load('900 100px PoppinsT'),document.fonts.load('900 100px \"Noto Sans SC\"',s),document.fonts.load('500 100px \"Noto Sans SC\"',s)]).catch(()=>{})}",
    "function loadFonts(){if(!document.fonts||typeof document.fonts.load!=='function') return Promise.resolve();"
    "return Promise.all([document.fonts.load('900 100px InterD'),document.fonts.load('900 100px PoppinsT')]).catch(function(){})}",
    js, 'loadFonts')

# 默认测试文案改成英文（标题 / 眉题 / 数字 / 按钮 / 信息栏都由 S.text 派生）
js = must(
    "text:{title:'WEEKEND\\nMARKET',lines:'11.08 周六\\n上海 · 西岸美术馆\\n免费入场\\n立即报名'}",
    "text:{title:'PRIVATE\\nVIEW',lines:'08 NOV · SAT\\nWEST BUND · SHANGHAI\\nBY INVITATION\\nRSVP NOW'}",
    js, 'default text')

# 正文模板用中文逗号拼接，英文文案改用英文逗号
js = must("b:L.join('，')}", "b:L.join(', ')}", js, 'body joiner')

# 文本色卡存储：容器 Storage(9.46+) 优先，localStorage 兜底
old = ("let MINE=[]; try{MINE=JSON.parse(localStorage.getItem('gedong-mine')||'[]')}catch(e){MINE=[]}\n"
       "function saveMine(){try{localStorage.setItem('gedong-mine',JSON.stringify(MINE.slice(0,24)))}catch(e){}}")
new = r"""// ---- 色卡存储：容器 Storage(9.46+) 优先，浏览器存储兜底
var MT=window.xhs&&window.xhs.miniTool;
var MINEKEY='gedong-mine';
function getClientVersion(bv){return Math.floor((Number(bv)||0)/1000)}
function readBuildVersion(opt){var e=opt&&opt.miniToolEnv; return Number(e&&e.buildVersion)||0}
function getBuildVersion(){
  var bv=readBuildVersion(window.xhs&&window.xhs.launchOptions);
  if(bv) return Promise.resolve(bv);
  if(!MT||typeof MT.getLaunchOptions!=='function') return Promise.resolve(0);
  return MT.getLaunchOptions().then(readBuildVersion,function(){return 0});
}
function parseMine(raw){try{var v=JSON.parse(raw); return Array.isArray(v)?v:[]}catch(e){return []}}
var MINE=[];
function loadMine(){
  function fromLocal(){try{return localStorage.getItem(MINEKEY)}catch(e){return null}}
  function done(raw){MINE=raw?parseMine(raw):[]; renderMine()}
  if(!MT||typeof MT.getStorage!=='function'){done(fromLocal()); return;}
  getBuildVersion().then(function(bv){
    if(getClientVersion(bv)>=9460) return MT.getStorage({key:MINEKEY}).then(function(r){return r&&r.data});
    return fromLocal();
  }).then(function(raw){ done(raw==null?fromLocal():raw); })
    .catch(function(){ done(fromLocal()); });
}
function saveMine(){
  var s; try{s=JSON.stringify(MINE.slice(0,24))}catch(e){return}
  try{localStorage.setItem(MINEKEY,s)}catch(e){}
  if(!MT||typeof MT.setStorage!=='function') return;
  getBuildVersion().then(function(bv){
    if(getClientVersion(bv)>=9460) return MT.setStorage({key:MINEKEY,data:s});
  }).catch(function(){});
}"""
js = must(old, new, js, 'palette storage')
js = must('renderMine();\n\n\nfunction paintRanges', 'loadMine();\n\n\nfunction paintRanges', js, 'loadMine call')

# 保存：容器禁用 a[download] / blob 下载
old = r"""// saving: artifact viewer -> downloads capability, standalone file -> link
let dl=null; if(window.claude&&window.claude.use) window.claude.use('downloads').then(d=>{dl=d}).catch(()=>{});
async function saveFile(name,blob){if(dl){try{await dl.save({filename:name,data:blob}); return 'saved'}catch(e){if(e&&e.code==='declined') return 'declined'; throw e}}
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove()},4000); return 'saved'}"""
new = r"""// saving: 容器不联网、禁用 a[download] 与 blob 下载，统一走端能力
function blobToDataURL(blob){return new Promise(function(res,rej){var f=new FileReader(); f.onload=function(){res(f.result)}; f.onerror=function(){rej(f.error||new Error('读取生成结果失败'))}; f.readAsDataURL(blob)})}
async function toLocalPath(blob){
  const data=await blobToDataURL(blob);
  if(MT&&typeof MT.writeTempFile==='function'){const r=await MT.writeTempFile({data:data}); return r&&r.filePath?r.filePath:data}
  return data;
}
async function saveFile(name,blob){
  if(!MT||typeof MT.saveImageToPhotosAlbum!=='function'){const e=new Error('当前容器不支持保存图片'); e.code='unsupported'; throw e}
  await MT.saveImageToPhotosAlbum({filePath:await toLocalPath(blob)});
  return 'saved';
}"""
js = must(old, new, js, 'saveFile')

# MP4：相册不支持视频，改走视频笔记发布页
js = must(
    """    const r=await saveFile(`动真格_${S.aspect.replace(':','x')}_${stamp()}.mp4`,blob);
    st.textContent=r==='saved'?`已导出 MP4（${(blob.size/1048576).toFixed(1)} MB）。`:'已取消保存，视频没有存下来。';""",
    """    const vp=await toLocalPath(blob);
    if(!MT||typeof MT.postNote!=='function') throw new Error('当前容器不支持发布视频笔记');
    await MT.postNote({pageType:'video_publish',mediaInfo:{video_resources:{video_url:vp}}});
    st.textContent=`已生成 MP4（${(blob.size/1048576).toFixed(1)} MB），正在打开发布页。`;""",
    js, 'mp4 save')

# 「下载离线版」被容器禁用（a[download]），改为保存当前帧到相册
m = re.search(r"\$\('tool'\)\.onclick=async\(\)=>\{.*?\};\n", js, re.S)
if not m:
    fail('tool handler not found')
js = js[:m.start()] + (
    "$('tool').onclick=async()=>{await loadFonts(); G.render(ctx,curT());"
    " const blob=await new Promise(r=>cv.toBlob(r,'image/png'));\n"
    "  try{const r=await saveFile('动真格_海报.png',blob); "
    "st.textContent=r==='saved'?'已保存当前帧到相册。':(r==='local'?'已下载到本地（浏览器预览模式）。':'已取消保存。')}"
    "catch(e){st.textContent='保存失败：'+(e.message||e.code)}};\n") + js[m.end():]

# display:contents -> 直接作为 grid 容器
js = must("const slw=$('sliders'), slw2=$('sliders2');", "const slw=$('sliders');", js, 'sliders refs')
js = must("(si<3?slw:slw2).appendChild(d)", "slw.appendChild(d)", js, 'sliders append')


# ============================================================ UI 修正补丁
# 1) 色卡改用渐变条渲染（不依赖子元素尺寸，避免偶发空白）
PAL_PRESET_OLD = "b.innerHTML=['ground','c1','c2','c3','c4'].map(k=>`<i style=\"background:${p[k]}\"></i>`).join('');"
PAL_PRESET_NEW = "b.style.backgroundImage='linear-gradient(90deg,'+['ground','c1','c2','c3','c4'].map((k,i,a)=>p[k]+' '+(i/a.length*100)+'%,'+p[k]+' '+((i+1)/a.length*100)+'%').join(',')+')';"
js = must(PAL_PRESET_OLD, PAL_PRESET_NEW, js, 'preset swatch gradient')

MINE_OLD = "function renderMine(){const m=$('mine'); m.innerHTML=''; $('mineGrp').hidden=!MINE.length;\n  MINE.forEach((p,idx)=>{const b_=document.createElement('button'); b_.type='button'; b_.className='sw'; b_.title=p.name; b_.setAttribute('aria-label','我的色卡 '+(idx+1)); b_.innerHTML=FK.map(k=>`<i style=\"background:${p[k]}\"></i>`).join('');\n    b_.onclick=()=>{pushUndo(); S.pal=Object.assign({},p); sync()};\n    b_.oncontextmenu=e=>{e.preventDefault(); MINE.splice(idx,1); saveMine(); renderMine()};\n    m.appendChild(b_)})}"
MINE_NEW = r"""function gradOf(p){var ks=['ground','c1','c2','c3','c4'], n=ks.length, st=[];
  for(var i=0;i<n;i++){var c=p[ks[i]]||'#ccc';
    st.push(c+' '+(i/n*100)+'%,'+c+' '+((i+1)/n*100)+'%')}
  return 'linear-gradient(90deg,'+st.join(',')+')'}
function delMine(idx){
  pushUndo();
  MINE.splice(idx,1); saveMine(); renderMine();
  if($('impMsg')) $('impMsg').textContent='已删除这张色卡。';
}
function renderMine(){
  var m=$('mine'); if(!m) return;
  m.innerHTML='';
  if($('mineGrp')) $('mineGrp').hidden=!MINE.length;
  MINE.forEach(function(p,idx){
    var wrap=document.createElement('div'); wrap.className='swwrap';
    var b_=document.createElement('button');
    b_.type='button'; b_.className='sw'; b_.title=p.name||'我的色卡';
    b_.setAttribute('aria-label','我的色卡 '+(idx+1));
    b_.style.backgroundImage=gradOf(p);
    b_.onclick=function(){ pushUndo(); S.pal=Object.assign({},p); sync() };
    b_.oncontextmenu=function(e){ e.preventDefault(); delMine(idx) };
    var x=document.createElement('button');
    x.type='button'; x.className='swdel';
    x.setAttribute('aria-label','删除第 '+(idx+1)+' 张色卡');
    x.innerHTML='<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">'
      +'<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
    x.onclick=function(e){ e.stopPropagation(); delMine(idx) };
    wrap.appendChild(b_); wrap.appendChild(x);
    m.appendChild(wrap);
  });
}"""
js = must(MINE_OLD, MINE_NEW, js, 'renderMine rewrite')

js = must("$('fSave').onclick=()=>{MINE.unshift(Object.assign({},S.pal,{name:'我的色卡'})); saveMine(); renderMine(); $('impMsg').textContent='已存入，右键可删除。'};",
          "$('fSave').onclick=()=>{MINE.unshift(Object.assign({},S.pal,{name:'我的色卡'})); saveMine(); renderMine(); $('impMsg').textContent='已存入，悬停色卡可删除。'};",
          js, 'fSave message')


# ============================================================ 每格绑定素材
# 渲染层：新增 'img' 类型，按格子索引从 CELLIMG 取素材
js = must("// ---------- product ----------\nlet IMG=null;",
          "// ---------- product ----------\nlet IMG=null; let CELLIMG={};",
          js, 'CELLIMG decl')

js = must("setImage:img=>{IMG=img;",
          "setCellImage:(i,im)=>{ if(im) CELLIMG[i]=im; else delete CELLIMG[i]; },"
          "setImage:img=>{IMG=img;",
          js, 'setCellImage api')

# 在 switch(type) 里加 img 分支（用 cover 铺满，保持原图比例）
_IMG_CASE = """    case 'img':{
      const im=CELLIMG[i]||(S.hero==='image'?IMG:null);
      if(im){
        const k=Math.max(w/im.width,h/im.height);
        const iw=im.width*k, ih=im.height*k;
        ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
        ctx.drawImage(im, x+(w-iw)/2, y+(h-ih)/2, iw, ih);
        ctx.restore();
      } else {
        ctx.save(); ctx.fillStyle=fg; ctx.globalAlpha=.35;
        ctx.font=font(lab,700); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('素材', cx, cy); ctx.restore();
      }
      break}
    case 'title':{"""
js = must("    case 'title':{\n      const ls=T.title.split('\\n');", _IMG_CASE + "\n      const ls=T.title.split('\\n');", js, 'img case')


# ============================================================ 单元格素材选择 UI
CELLIMG_UI = r"""
// ---- 每格素材：在弹窗里选这一格用哪个上传素材
function refreshPopImage(){
  var row=$('popImgRow'); if(!row) return;
  row.hidden = false;          // 常驻：点格子即可选素材或直接上传
  var ty=G.getTypes()[SEL];
  var box=$('popImgList'); box.innerHTML='';
  GALLERY.forEach(function(g,gi){
    var b=document.createElement('button');
    b.type='button'; b.className='pimg';
    b.style.backgroundImage='url('+g.src+')';
    b.setAttribute('aria-label','素材 '+(gi+1));
    var cur=G.getCellImage?G.getCellImage(SEL):null;
    if(cur===g.img) b.setAttribute('aria-pressed','true');
    b.onclick=function(){
      pushUndo();
      G.setCellImage(SEL, g.img);
      if(g.el){ try{g.el.play()}catch(e){} }
      if(G.getTypes()[SEL]!=='img'){ Object.assign(over(SEL),{type:'img'}) }
      sync(); syncPop(); refreshPopImage();
    };
    box.appendChild(b);
  });
  var none=document.createElement('button');
  none.type='button'; none.className='pimg none'; none.textContent='无';
  none.onclick=function(){ pushUndo(); G.setCellImage(SEL,null); syncPop(); refreshPopImage() };
  box.appendChild(none);
}
"""

# setCellImage 需要能读回来
js = must("setCellImage:(i,im)=>{ if(im) CELLIMG[i]=im; else delete CELLIMG[i]; },",
          "setCellImage:(i,im)=>{ if(im) CELLIMG[i]=im; else delete CELLIMG[i]; },"
          "getCellImage:i=>CELLIMG[i]||null,",
          js, 'getCellImage api')

# syncPop 末尾刷新素材行
js = must("  $('popHint').textContent=SWAP>=0?'再点另一格完成交换（Esc 取消）':(o.lock?'抽卡时这一格会保持现在的内容和颜色。':'');",
          "  $('popHint').textContent=SWAP>=0?'再点另一格完成交换（Esc 取消）':(o.lock?'抽卡时这一格会保持现在的内容和颜色。':'');\n  refreshPopImage();",
          js, 'refreshPopImage call')

# 下拉里加「图片素材」选项（仅当有上传素材）
js = must("const g3=document.createElement('optgroup'); g3.label='其他';",
          "if(GALLERY.length){const gi=document.createElement('optgroup'); gi.label='上传素材';"
          "const oi=document.createElement('option'); oi.value='img'; oi.textContent='图片素材'; gi.appendChild(oi); sel.appendChild(gi);}\n"
          "    const g3=document.createElement('optgroup'); g3.label='其他';",
          js, 'img option')

# 主视觉格下拉里也列出已上传素材
js = must("sel.value='hero:'+(S.hero==='auto'?'type':S.hero)}",
          "sel.value='hero:'+(S.hero==='auto'?'type':S.hero);"
          " if(GALLERY.length){const gi=document.createElement('optgroup'); gi.label='上传素材';"
          " GALLERY.forEach(function(g,gi2){const oi=document.createElement('option');"
          " oi.value='heroimg:'+gi2; oi.textContent='素材 '+(gi2+1)+(g.isVideo?'（视频）':''); gi.appendChild(oi)});"
          " sel.appendChild(gi);"
          " if(HERO_IMG){const at=GALLERY.findIndex(function(g){return g.img===HERO_IMG}); if(at>=0) sel.value='heroimg:'+at}}}",
          js, 'hero material option')

js = must("$(\'popType\').onchange=e=>{const v=e.target.value; if(v.startsWith(\'hero:\')){",
          "$(\'popType\').onchange=e=>{const v=e.target.value;"
          " if(v.startsWith(\'heroimg:\')){pushUndo(); applyGallery(+v.slice(8)); sync(); syncPop(); return}"
          " if(v.startsWith(\'hero:\')){",
          js, 'heroimg onchange')


# ============================================================ 上下文面板（替代浮层）
# 1) 弹窗改为右侧面板内的子视图，不再绝对定位覆盖画布
js = must("function openPop(i){flashTx(i); SEL=i; pop.hidden=false; $('popFields').dataset.for=''; syncPop()}",
          "function openPop(i){flashTx(i); SEL=i; pop.hidden=false; document.body.classList.add('editing');"
          " var ip=$('inspPop'); if(ip){ip.hidden=false}"
          " var pk=$('paneWrap'); if(pk){pk.hidden=true}"
          " if(typeof setRightTab==='function') setRightTab('pop');"
          " $('popFields').dataset.for=''; syncPop()}",
          js, 'openPop')

js = must("const stage=cv.parentElement, ov=$('ov'), pop=$('pop'), selbox=$('selbox');",
          "const stage=cv.parentElement, ov=$('ov'), pop=$('inspPop'), selbox=$('selbox');",
          js, 'pop ref')

js = must("function closePop(){SEL=-1; SWAP=-1; stage.classList.remove('swapping'); pop.hidden=true; selbox.hidden=true}",
          "function closePop(){SEL=-1; SWAP=-1; stage.classList.remove('swapping'); pop.hidden=true; selbox.hidden=true;"
          " document.body.classList.remove('editing');"
          " var ip=$('inspPop'); if(ip){ip.hidden=true}"
          " var pk=$('paneWrap'); if(pk){pk.hidden=false}"
          " if(typeof setRightTab==='function') setRightTab('back')}",
          js, 'closePop')

# 2) 不再给弹窗计算绝对坐标（画布不会被遮挡）
js = must("    pop.style.left=px+'px'; pop.style.top=py+'px'} else selbox.hidden=true;",
          "    if(false){} } else selbox.hidden=true;",
          js, 'pop positioning')


# ============================================================ 面板切换与返回
CTX_UI = r"""
// ---- 右侧上下文：整张海报 <-> 第 N 格
function setRightTab(mode){
  var tabs=$('tabs');
  if(tabs) tabs.classList.toggle('is-dim', mode==='pop');
}
$('popBack').onclick=function(){ closePop() };
// 点面板外（画布上别处）不关闭，避免误触丢上下文
"""

# 点击空白格不应打开空面板
js = must("cv.addEventListener('click',e=>{if(cv.__skipClick) return; const i=hit(e); if(i<0) return;",
          "cv.addEventListener('click',e=>{if(cv.__skipClick) return;"
          " const i=hit(e); if(i<0){ closePop(); return }",
          js, 'blank click closes')

# 把 CTX_UI 注入


# ============================================================ 字体上传 + 素材页精简
# 渲染层：允许替换主字族
js = must("function fam(){return isCute()?'PoppinsT':'InterD'}",
          "let CUSTOM_FONT=null;\nfunction fam(){return CUSTOM_FONT||(isCute()?'PoppinsT':'InterD')}",
          js, 'custom font family')
js = must("setImage:img=>{IMG=img;",
          "setFont:f=>{CUSTOM_FONT=f||null},getFont:()=>CUSTOM_FONT,"
          "setImage:img=>{IMG=img;",
          js, 'font api')

FONTS_UI = r"""
// ---- 字体上传：注册自定义字族，全局替换主字体
var FONTS=[];
function renderFonts(){
  var box=$('fontList'); if(!box) return;
  box.innerHTML='';
  var items=[{name:'默认',fam:null}].concat(FONTS);
  items.forEach(function(it,idx){
    var b=document.createElement('button');
    b.type='button'; b.className='fontitem';
    b.textContent=it.name;
    if(it.fam) b.style.fontFamily=it.fam;
    if((G.getFont()||null)===(it.fam||null)) b.setAttribute('aria-pressed','true');
    b.onclick=function(){
      G.setFont(it.fam||null);
      renderFonts();
      if(typeof loadFonts==='function') loadFonts();
      sync();
    };
    box.appendChild(b);
  });
}
$('fontFile').onchange=function(){
  var f=this.files&&this.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(){
    var fam='F'+(FONTS.length+1)+'_'+Date.now().toString(36);
    var ff=new FontFace(fam, 'url('+r.result+')');
    ff.load().then(function(loaded){
      document.fonts.add(loaded);
      FONTS.push({name:f.name.replace(/\.[^.]+$/,''), fam:fam});
      G.setFont(fam);
      renderFonts();
      if(typeof loadFonts==='function') loadFonts();
      sync();
      $('fontMsg').textContent='已载入「'+f.name+'」';
    }).catch(function(){
      $('fontMsg').textContent='这个字体文件读不了，换 ttf / otf / woff 试试';
    });
    $('fontFile').value='';
  };
  r.readAsDataURL(f);
};
renderFonts();
"""


# 主视觉控件已移除，脚本引用加容错
js = must("$('hero').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.v==='image'&&!hasImg){$('file').click(); return} morph(); S.hero=b.dataset.v; sync()});",
          "var _heroBox=$('hero'); if(_heroBox) _heroBox.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.v==='image'&&!hasImg){$('file').click(); return} morph(); S.hero=b.dataset.v; sync()});",
          js, 'hero bind')

js = must("  const hk=S.hero==='auto'?['type','arch','sun','stack'][S.seed%4]:S.hero; $('hero').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===hk));",
          "  const hk=S.hero==='auto'?['type','arch','sun','stack'][S.seed%4]:S.hero; var _hb=$('hero'); if(_hb) _hb.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===hk));",
          js, 'hero sync')

# 素材支持删除
MINE_DEL = r"""
// ---- 素材删除
function delAsset(idx){
  var g=GALLERY[idx]; if(!g) return;
  pauseAllVideos();
  if(g.el){ try{g.el.pause(); g.el.remove()}catch(e){} }
  if(g.timer) clearInterval(g.timer);
  GALLERY.splice(idx,1);
  if(HERO_IMG===g.img){ HERO_IMG=null; if(GALLERY.length) applyGallery(0); else { G.setImage(null); hasImg=false; S.hero='type'; morph(); sync() } }
  else { morph(); sync() }
  if(typeof refreshPopImage==='function') refreshPopImage();
  renderGallery();
  if($('assetMsg')) $('assetMsg').textContent='已删除该素材。';
}
"""

# 被移除的元素：绑定前判空
js = must("$('clear').onclick=clearImg; $('clear2').onclick=clearImg;",
          "if($('clear')) $('clear').onclick=clearImg; if($('clear2')) $('clear2').onclick=clearImg;",
          js, 'clear2 guard')




# ------------------------------------------------------------ 多图 + 全屏演示
MULTI_IMG = r"""

// ---- 多图 / 视频：视频用「元素直连」方式完整播放（不播放 data:/blob: 媒体源，
//      但允许把视频元素作为 canvas 的绘制源，海报每帧 drawImage 取当前画面）
var GALLERY=[];
var HERO_IMG=null;
var VID_FPS=10;

function pauseAllVideos(){
  GALLERY.forEach(function(g){ if(g.el){ try{g.el.pause()}catch(e){} } });
}
function renderGallery(){
  var box=$('gallery'); if(!box) return;
  box.innerHTML='';
  if(!GALLERY.length){box.hidden=true; return}
  box.hidden=false;
  GALLERY.forEach(function(g,i){
    var wrap=document.createElement('div'); wrap.className='gwrap';
    var b=document.createElement('button');
    b.type='button'; b.className='gitem'+(g.isVideo?' vid':'');
    b.setAttribute('aria-label','第 '+(i+1)+' 个'+(g.isVideo?'（视频）':''));
    b.style.backgroundImage='url('+g.src+')';
    if(HERO_IMG===g.img) b.setAttribute('aria-pressed','true');
    b.onclick=function(){ applyGallery(i) };
    var x=document.createElement('button');
    x.type='button'; x.className='gdel';
    x.setAttribute('aria-label','删除第 '+(i+1)+' 个素材');
    x.innerHTML='<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">'
      +'<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
    x.onclick=function(e){ e.stopPropagation(); delAsset(i) };
    wrap.appendChild(b); wrap.appendChild(x);
    box.appendChild(wrap);
  });
}
function applyGallery(i){
  var g=GALLERY[i]; if(!g) return;
  pauseAllVideos();
  HERO_IMG=g.img;
  G.setImage(g.img);
  hasImg=true;
  if(g.el){
    try{ g.el.currentTime=0; var pr=g.el.play(); if(pr&&pr.catch) pr.catch(function(){}); }catch(e){}
  } else if(g.frames && g.frames.length>1){
    var n=0;
    g.timer=setInterval(function(){
      n=(n+1)%g.frames.length;
      G.setImage(g.frames[n]);
    }, 1000/VID_FPS);
  }
  morph(); S.hero='image'; sync();
  ['thumb','thumb2'].forEach(function(id){var e=$(id); if(e){e.src=g.src; e.hidden=false}});
  if($('clear')) $('clear').hidden=false;
  if($('imgRow')) $('imgRow').hidden=false;
  renderGallery();
}
function readImageFile(f, cb){
  var r=new FileReader();
  r.onload=function(){
    var im=new Image();
    im.onload=function(){cb(null,{src:r.result,img:im})};
    im.onerror=function(){cb(new Error('图片解码失败'))};
    im.src=r.result;
  };
  r.onerror=function(){cb(new Error('文件读取失败'))};
  r.readAsDataURL(f);
}

// 主路径：视频元素直连。成功即可原帧率完整播放。
function readVideoNative(f, cb){
  var url;
  try{ url=URL.createObjectURL(f) }catch(e){ return cb(new Error('无法读取该视频')) }
  var v=document.createElement('video');
  v.muted=true; v.loop=true; v.autoplay=true;
  v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
  v.setAttribute('muted',''); v.preload='auto';
  v.style.cssText='position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  var settled=false;
  function ok(){
    if(settled) return; settled=true;
    v.setAttribute('width', v.videoWidth||720);
    v.setAttribute('height', v.videoHeight||720);
    var c=document.createElement('canvas'); c.width=200; c.height=200;
    var g2=c.getContext('2d'), vw=v.videoWidth||200, vh=v.videoHeight||200;
    try{
      var r=Math.max(200/vw,200/vh);
      g2.drawImage(v,(200-vw*r)/2,(200-vh*r)/2,vw*r,vh*r);
    }catch(e){}
    var thumb='';
    try{ thumb=c.toDataURL('image/jpeg',0.8) }catch(e){}
    try{ v.pause() }catch(e){}
    cb(null,{src:thumb, img:v, el:v, isVideo:true, objectUrl:url});
  }
  function fail(){
    if(settled) return; settled=true;
    try{ v.pause() }catch(e){}
    try{ v.removeAttribute('src'); v.load() }catch(e){}
    try{ v.remove() }catch(e){}
    try{URL.revokeObjectURL(url)}catch(e){}
    cb(new Error('video-element-failed'));
  }
  v.addEventListener('loadeddata', ok);
  v.addEventListener('canplay', ok);
  v.addEventListener('error', fail);
  setTimeout(function(){ if(!settled){ (v.readyState>=2)?ok():fail() } }, 4500);
  v.src=url;
  try{ var pr=v.play(); if(pr&&pr.catch) pr.catch(function(){}); }catch(e){}
}

// 兜底：抽帧（老内核或视频元素不可用时）
function readVideoFile(f, cb){
  var url;
  try{ url=URL.createObjectURL(f) }catch(e){ return cb(new Error('无法读取视频')) }
  var v=document.createElement('video');
  v.muted=true; v.playsInline=true; v.preload='auto'; v.src=url;
  var done=false;
  function fail(msg){ if(done) return; done=true; try{URL.revokeObjectURL(url)}catch(e){}; cb(new Error(msg)) }
  v.onerror=function(){ fail('这个视频浏览器解不开') };
  v.onloadedmetadata=function(){
    var dur=v.duration;
    if(!isFinite(dur)||dur<=0){ fail('读不到视频时长'); return }
    var N=Math.min(24, Math.max(1, Math.round(dur*VID_FPS)));
    var times=[], i;
    for(i=0;i<N;i++) times.push(Math.min(dur-0.02, dur*(i+0.5)/N));
    var cw=Math.min(1080, v.videoWidth||1080);
    var ch=Math.round(cw*(v.videoHeight||1080)/(v.videoWidth||1080));
    var c=document.createElement('canvas'); c.width=cw; c.height=ch;
    var g2=c.getContext('2d');
    var frames=[], idx=0;
    function grab(){ if(done) return; if(idx>=times.length) return finish(); v.currentTime=times[idx]; }
    function finish(){
      if(done) return; done=true;
      try{URL.revokeObjectURL(url)}catch(e){}
      if(!frames.length) return cb(new Error('没能取出画面'));
      var im=new Image();
      im.onload=function(){ cb(null,{src:frames[0].src, img:im, frames:frames.map(function(x){return x.img}), isVideo:true}) };
      im.onerror=function(){ cb(new Error('视频帧无法载入')) };
      im.src=frames[0].src;
    }
    v.onseeked=function(){
      if(done) return;
      try{
        g2.drawImage(v,0,0,cw,ch);
        var src=c.toDataURL('image/jpeg',0.86);
        var fim=new Image(); fim.src=src;
        frames.push({src:src,img:fim});
      }catch(e){}
      idx++;
      if(idx<times.length) grab(); else finish();
    };
    grab();
  };
  v.load();
  setTimeout(function(){ if(!done) fail('视频读取超时'); }, 8000);
}

function bindPicker(el){ if(!el) return; el.setAttribute('multiple',''); el.onchange=onPick };
$('file').setAttribute('multiple','');
$('file').onchange=onPick;
if($('filev')){ $('filev').setAttribute('multiple',''); $('filev').onchange=onPick; }
if($('fileall')){ $('fileall').setAttribute('multiple',''); $('fileall').onchange=onPick; }
if($('popFileAll')){ $('popFileAll').setAttribute('multiple',''); $('popFileAll').onchange=onPick; }
function onPick(ev){
  var input=ev&&ev.target?ev.target:$('file');
  var fs=[].slice.call(input.files||[]); if(!fs.length) return;
  var results=[], pending=fs.length, failed=[];
  fs.forEach(function(f,i){
    var isVideo=(f.type&&/^video\//.test(f.type))||/\.(mp4|mov|webm|m4v)$/i.test(f.name);
    function handle(err,item){
      if(err) failed.push(f.name);
      else { item.order=i; results.push(item); }
      if(--pending===0) finish();
    }
    if(!isVideo) return readImageFile(f, handle);
    readVideoNative(f, function(err,item){
      if(!err) return handle(null,item);
      readVideoFile(f, handle);       // 原生不可用则抽帧
    });
  });
  function finish(){
    results.sort(function(a,b){return a.order-b.order});
    if(!results.length){
      st.textContent='没能读取这些文件'+(failed.length?'：'+failed.join('、'):'');
      input.value=''; return;
    }
    var first=GALLERY.length;
    GALLERY=GALLERY.concat(results).slice(-12);
    applyGallery(Math.min(first, GALLERY.length-1));
    st.textContent=failed.length?('有 '+failed.length+' 个文件读不了：'+failed.join('、')):'';
    input.value='';
    renderGallery();
    if(typeof refreshPopImage==='function') refreshPopImage();
  }
}
var _clearImg=clearImg;
clearImg=function(){
  pauseAllVideos();
  GALLERY.forEach(function(g){ if(g.timer) clearInterval(g.timer); if(g.el){try{g.remove()}catch(e){}} });
  GALLERY=[]; HERO_IMG=null; _clearImg(); renderGallery();
};
if($('clear')) $('clear').onclick=clearImg;
if($('clear2')) $('clear2').onclick=clearImg;
renderGallery();
"""

FULLSCREEN = r"""
// ---- 全屏演示：容器内视觉全屏，只留海报（浏览器全屏 API 被容器禁用，改用 CSS）
var FS=false;
function setFull(on){
  FS=on;
  document.body.classList.toggle('stageonly', !!on);
  var b=$('fs');
  if(b){ b.setAttribute('aria-pressed', String(!!on)); b.textContent = on ? '退出演示' : '全屏演示' }
  setTimeout(fit, 40); setTimeout(fit, 260); setTimeout(fit, 700);
}

$('fs').onclick=function(){ setFull(!FS) };
document.addEventListener('keydown', function(e){
  if(e.key!=='Escape'||!FS) return;
  e.stopPropagation(); setFull(false);
}, true);
canvasTapIcon();
function canvasTapIcon(){
  var cv2=$('cv'); if(!cv2) return;
  cv2.addEventListener('dblclick', function(){ setFull(!FS) });
}
"""

# fit() 在演示模式下交给 CSS 控制，避免把画布又撑出视口
_OLD_FIT = "function fit(){const st=cv.parentElement; const cs=getComputedStyle(st);"
_NEW_FIT = "function fit(){if(document.body.classList.contains('stageonly')) return; const st=cv.parentElement; const cs=getComputedStyle(st);"
if js.count(_OLD_FIT) != 1:
    fail('fit() anchor not found')
js = js.replace(_OLD_FIT, _NEW_FIT)

# 必须在 IIFE 内部注入，$ / G / S 才可见
_TAIL = "G.drawBest(20261108,{tier:'SSR'}); sync(); loadFonts().then(()=>{requestAnimationFrame(loop)});\n})();"
if js.count(_TAIL) != 1:
    fail('IIFE tail anchor not found exactly once')
js = js.replace(_TAIL, "G.drawBest(20261108,{tier:'SSR'}); sync(); loadFonts().then(()=>{requestAnimationFrame(loop)});\n"
                        + MULTI_IMG + '\n' + FULLSCREEN + '\n' + CELLIMG_UI + '\n' + CTX_UI + '\n' + FONTS_UI + '\n' + MINE_DEL + "\n})();")

js = must("st.textContent=r==='saved'?'已导出当前帧。':'已取消保存。'",
          "st.textContent=r==='saved'?'已导出当前帧。':(r==='local'?'已下载到本地（浏览器预览模式）。':'已取消保存。')",
          js, 'png status text')

# ---- 去掉残留的旧上传绑定（会绕过素材库直接写入画面）
js = must("$('file').onchange=()=>{const f=$('file').files[0]; if(!f) return;",
          "if(false) $('file').onchange=()=>{const f=$('file').files[0]; if(!f) return;",
          js, 'legacy file handler')

# 格子渲染：不再回退到全局 IMG，避免影响其他格子
js = must("      const im=CELLIMG[i]||(S.hero==='image'?IMG:null);",
          "      const im=CELLIMG[i]||null;",
          js, 'img render fallback')

# ---- MP4：浏览器环境改为本地下载
js = must("""    const vp=await toLocalPath(blob);
    if(!MT||typeof MT.postNote!=='function') throw new Error('当前容器不支持发布视频笔记');
    await MT.postNote({pageType:'video_publish',mediaInfo:{video_resources:{video_url:vp}}});
    st.textContent=`已生成 MP4（${(blob.size/1048576).toFixed(1)} MB），正在打开发布页。`;""",
          """    if(!MT||typeof MT.postNote!=='function'){
      var rr=localDownload(`动真格_${S.aspect.replace(':','x')}_${stamp()}.mp4`,blob);
      if(rr!=='local') throw new Error('当前环境不支持保存视频');
      st.textContent=`已下载 MP4（${(blob.size/1048576).toFixed(1)} MB）。`;
    } else {
      const vp=await toLocalPath(blob);
      await MT.postNote({pageType:'video_publish',mediaInfo:{video_resources:{video_url:vp}}});
      st.textContent=`已生成 MP4（${(blob.size/1048576).toFixed(1)} MB），正在打开发布页。`;
    }""",
          js, 'mp4 local fallback')

# 字体支持删除（与色卡、素材一致）
js = must("""    if((G.getFont()||null)===(it.fam||null)) b.setAttribute('aria-pressed','true');""",
          """    if((G.getFont()||null)===(it.fam||null)) b.setAttribute('aria-pressed','true');
    var wrap=document.createElement('span'); wrap.className='fontwrap';
    var xx=null;
    if(it.fam){
      xx=document.createElement('button');
      xx.type='button'; xx.className='fontdel';
      xx.setAttribute('aria-label','删除字体 '+it.name);
      xx.innerHTML='<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">'
        +'<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
      xx.onclick=function(ev){
        ev.stopPropagation();
        if((G.getFont()||null)===it.fam){ G.setFont(null) }
        FONTS=FONTS.filter(function(x){return x.fam!==it.fam});
        renderFonts();
        if(typeof sync==='function') sync();
      };
    }""",
          js, 'font delete btn')

js = must("""    box.appendChild(b);
  });
}""",
          """    wrap.appendChild(b); if(xx) wrap.appendChild(xx);
    box.appendChild(wrap);
  });
}""",
          js, 'font wrap append')

# ============================================================ 上传不再自动填充
# 上传只入素材库，不改变画面；由用户点选或通过格子面板指定后才应用
js = must("""    var first=GALLERY.length;
    GALLERY=GALLERY.concat(results).slice(-12);
    applyGallery(Math.min(first, GALLERY.length-1));""",
          """    GALLERY=GALLERY.concat(results).slice(-12);
    // 不自动应用：只入库，等用户点选""",
          js, 'no auto apply')

# 双击全屏演示：移除
js = must("""canvasTapIcon();
function canvasTapIcon(){
  var cv2=$('cv'); if(!cv2) return;
  cv2.addEventListener('dblclick', function(){ setFull(!FS) });
}""",
          "// 双击不再触发全屏，避免误操作",
          js, 'remove dblclick fullscreen')

# 导出失败：saveImageToPhotosAlbum 需要本地文件路径，先落盘再保存
js = must("""async function saveFile(name,blob){
  if(!MT||typeof MT.saveImageToPhotosAlbum!=='function'){const e=new Error('当前容器不支持保存图片'); e.code='unsupported'; throw e}
  await MT.saveImageToPhotosAlbum({filePath:await toLocalPath(blob)});
  return 'saved';
}""",
          """// 容器内走端能力；浏览器打开时退回本地下载，方便预览
function localDownload(name,blob){
  try{
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){try{URL.revokeObjectURL(a.href); a.remove()}catch(e){}},4000);
    return 'local';
  }catch(e){ return 'fail' }
}
async function saveFile(name,blob){
  if(!MT || typeof MT.saveImageToPhotosAlbum!=='function'){
    var r=localDownload(name,blob);
    if(r==='local') return 'local';
    var e=new Error('当前环境不支持保存'); e.code='unsupported'; throw e;
  }
  var path=await toLocalPath(blob);
  try{ await MT.saveImageToPhotosAlbum({filePath:path}) }
  catch(err){ if(err && err.errMsg) throw new Error(err.errMsg); throw err }
  return 'saved';
}""",
          js, 'saveFile error detail')

# 导出/保存的失败提示更明确
js = must("catch(e){st.textContent='保存失败：'+(e.message||e.code)}};",
          "catch(e){st.textContent='保存失败：'+(e.message||e.code||'未知原因')+'（需在 App 内打开）'}};",
          js, 'save hint')

# ------------------------------------------------------------ 格子平等化 / 素材按 id 绑定
from cellfix import apply as cellfix_apply
js = cellfix_apply(js, must, fail)
# 不再有主视觉：heroKind 恒定，标题格的行为对所有格子一致
js = must("function heroKind(){if(S.hero==='bowls') S.hero='type'; if(S.hero==='image') return IMG?'image':'type'; if(S.hero!=='auto') return S.hero; return HEROES_AUTO[S.seed%HEROES_AUTO.length]}",
          "function heroKind(){return 'type'}   // 主视觉格已取消，所有格子平等",
          js, 'heroKind constant')

for bad, label in ((r'\beval\s*\(', 'eval'), (r'new\s+Function\s*\(', 'new Function'),
                   (r'\bfetch\s*\(', 'fetch'), (r'XMLHttpRequest', 'XHR'),
                   (r'requestFullscreen', 'fullscreen'), (r'new\s+Worker\s*\(', 'Worker'),
                   (r'navigator\.clipboard', 'clipboard'), (r'window\.claude', 'artifact runtime'),
                   (r'\.flatMap\s*\(', 'flatMap'), (r'display:contents', 'display:contents')):
    if re.search(bad, js):
        fail('forbidden pattern remains in JS: ' + label)

open(os.path.join(OUT, 'app.bundle.js'), 'w', encoding='utf-8').write(js)

# ------------------------------------------------------------ index.html
# 去掉 display:contents 的两层包装，sliders 直接做 grid 容器
body_html = body_html.replace(
    '<div class="sliders"><div id="sliders" style="display:contents"></div><div id="sliders2" style="display:contents"></div></div>',
    '<div class="sliders" id="sliders"></div>')
if 'display:contents' in body_html:
    fail('display:contents still in markup')
body_html = body_html.replace(
    '<span class="lbl">离线使用</span><button class="btn sm" id="tool" type="button" style="align-self:flex-start">下载离线版</button>',
    '<span class="lbl">保存作品</span><button class="btn sm" id="tool" type="button" style="align-self:flex-start">保存当前帧到相册</button>')

# 多图：文件框支持多选，加缩略图列表
body_html = body_html.replace(
    '<input type="file" id="file" accept="image/png,image/webp,image/jpeg" hidden>',
    '<input type="file" id="file" accept="image/png,image/webp,image/jpeg" multiple hidden>')
body_html = body_html.replace(
    '<span class="lbl">主视觉图片</span><div class="row">',
    '<span class="lbl">主视觉图片<small>可多选，点缩略图切换</small></span>'
    '<div class="gallery" id="gallery" hidden></div>'
    '<div class="row">')
if 'id="gallery"' not in body_html:
    fail('gallery markup not injected')

# tab 改名：文字 -> 内容
body_html = body_html.replace('data-p="p-text">文字</button>', 'data-p="p-text">内容</button>')
if 'data-p="p-text">内容</button>' not in body_html:
    fail('tab rename failed')

# 把「主视觉图片」这一组挪到内页面板最前面，并拆成 照片 / 视频 两个入口
OLD_IMG_GRP = ('<div class="grp"><span class="lbl">主视觉图片<small>可多选，点缩略图切换</small></span>'
               '<div class="gallery" id="gallery" hidden></div>'
               '<div class="row"><img class="thumb" id="thumb" alt="" hidden>'
               '<label class="btn sm" for="file">上传主视觉图片</label>'
               '<input type="file" id="file" accept="image/png,image/webp,image/jpeg" multiple hidden>'
               '<button class="btn sm" id="clear" type="button" hidden>移除</button></div></div>')
NEW_IMG_GRP = ('<div class="grp"><span class="lbl">上传素材<small>照片与视频可混选</small></span>'
               '<div class="gallery" id="gallery" hidden></div>'
               '<div class="row"><img class="thumb" id="thumb" alt="" hidden>'
               '<label class="btn sm" for="fileall" data-kind="all">上传图片或视频</label>'
               '<input type="file" id="fileall" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v" multiple hidden>'
               '<input type="file" id="file" accept="image/png,image/jpeg,image/webp" multiple hidden>'
               '<input type="file" id="filev" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" multiple hidden>'
               '<button class="btn sm" id="clear" type="button" hidden>清空</button>'
               '<button class="btn sm" id="lockAll" type="button" hidden>全部锁定</button></div>'
               '<p class="hint" id="assetMsg"></p></div>')
if OLD_IMG_GRP not in body_html:
    fail('image group markup not found')
body_html = body_html.replace(OLD_IMG_GRP, '')
# 插到 p-text 面板开头
_marker = '<div class="pane" id="p-text" hidden>'
if _marker not in body_html:
    fail('p-text pane marker missing')
body_html = body_html.replace(_marker, _marker + '\n          ' + NEW_IMG_GRP, 1)

# 弹窗里加「用哪个素材」一栏
body_html = body_html.replace(
    '<label class="f">这一格放什么<select id="popType"></select></label>',
    '<label class="f">这一格放什么<select id="popType"></select></label>'
    '<div class="grp" id="popImgRow" hidden><span class="lbl">用哪个素材</span>'
    '<div class="popimgs" id="popImgList"></div></div>')
if 'id="popImgRow"' not in body_html:
    fail('popup image row not injected')


# ---- 把浮层搬进右侧面板，做成上下文视图
import re as _re

def _extract_div(html, start_idx):
    """按 <div> 配对取出完整块"""
    depth = 0
    k = start_idx
    pat = _re.compile(r'<div\b|</div>')
    while True:
        m = pat.search(html, k)
        if not m:
            return html[start_idx:], len(html)
        if m.group(0) == '<div':
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return html[start_idx:m.end()], m.end()
        k = m.end()

_pop_i = body_html.find('<div class="pop" id="pop"')
if _pop_i < 0:
    fail('popup block not found')
_pop_block, _pop_end = _extract_div(body_html, _pop_i)
body_html = body_html[:_pop_i] + body_html[_pop_end:]

# 去掉 role=dialog，改成面板
_pop_inner = _pop_block
_pop_inner = _pop_inner.replace('<div class="pop" id="pop" hidden role="dialog" aria-label="编辑格子">',
                                '<div class="inspview" id="inspPop" hidden>')
_pop_inner = _pop_inner.replace(
    '<div class="pophead"><span id="popTitle">格子</span>',
    '<div class="pophead"><button class="popback" id="popBack" type="button">← 整张海报</button>'
    '<span id="popTitle">格子</span>')
if 'id="inspPop"' not in _pop_inner:
    fail('inspview rewrite failed')

# 在 aside 里包一层 paneWrap，并注入上下文视图
_aside_open = '<aside class="cell insp">'
if _aside_open not in body_html:
    fail('aside not found')
body_html = body_html.replace(_aside_open,
    _aside_open + '\n        ' + _pop_inner + '\n        <div id="paneWrap">', 1)
# 关闭 paneWrap：aside 结束前
_aside_close = '</aside>'
_last = body_html.rfind(_aside_close)
body_html = body_html[:_last] + '</div>\n      ' + body_html[_last:]

# 原 pop 里的那些 id 在面板里继续可用；补一个返回按钮的绑定


# ============================================================ 页签重组：任务导向
# 版式 / 配色 / 文案 / 素材；「更多」解散：动画并入版式，保存并入顶部
body_html = body_html.replace(
    '<button type="button" role="tab" data-p="p-text">内容</button>',
    '<button type="button" role="tab" data-p="p-text">文案</button>'
    '<button type="button" role="tab" data-p="p-assets">素材</button>')
if 'data-p="p-assets"' not in body_html:
    fail('assets tab not injected')

# 去掉「更多」页签
body_html = body_html.replace(
    '<button type="button" role="tab" data-p="p-more">更多</button>', '')
if '数据-p="p-more"' in body_html or 'data-p="p-more">更多' in body_html:
    fail('more tab still present')

# 把「动画」两组从 p-more 剪出来，移进 p-layout 末尾
import re as _re2
_am = _re2.search(r'<div class="grp"><span class="lbl">动画</span>.*?id="grain"[^>]*>\s*</div>\s*</div>\s*</div>', body_html, _re2.S)
if not _am:
    fail('animation group not found')
_anim = _am.group(0)
body_html = body_html[:_am.start()] + body_html[_am.end():]

# 整个 p-more 面板删掉
_m = _re2.search(r'<div class="pane" id="p-more"[^>]*>.*?</div>\s*</div>\s*</div>', body_html, _re2.S)
if not _m:
    fail('p-more pane not found')
body_html = body_html[:_m.start()] + body_html[_m.end():]

# 动画组插到 p-layout 的收尾（版式面板最后一个 grp 之后）
_pl = body_html.find('<div class="pane" id="p-layout"')
if _pl < 0:
    fail('p-layout not found')
# 插到 p-layout 内部末尾：找到 p-layout 开始后的第一个 pane 边界
_pc = body_html.find('<div class="pane" id="p-color"', _pl)
if _pc < 0:
    fail('p-color not found')
_layout_close = body_html.rfind('</div>', _pl, _pc)
if _layout_close < 0:
    fail('p-layout close not found')
body_html = body_html[:_layout_close] + '          ' + _anim + '\n        ' + body_html[_layout_close:]

# 上传素材从「文案」移到新的「素材」面板
_assets_grp_start = body_html.find('<div class="grp"><span class="lbl">上传素材')
if _assets_grp_start < 0:
    fail('asset group not found')
# 结束锚点必须精确到素材组自己的收尾，否则会把下一组（画面里的文字）一起切走
_anchor = 'id="assetMsg"></p></div>'
_assets_grp_end = body_html.find(_anchor, _assets_grp_start)
if _assets_grp_end < 0:
    fail('asset group end not found')
_assets_grp_end += len(_anchor)
_assets_block = body_html[_assets_grp_start:_assets_grp_end]
body_html = body_html[:_assets_grp_start] + body_html[_assets_grp_end:]

# 新素材面板插在文案面板之前
_pt = body_html.find('<div class="pane" id="p-text"')
body_html = (body_html[:_pt]
             + '<div class="pane" id="p-assets" hidden>' + _assets_block + '</div>\n        '
             + body_html[_pt:])

# 保存作品按钮移到顶栏（导出旁）
_save_btn = ('<div class="grp"><span class="lbl">保存作品</span>'
             '<button class="btn sm" id="tool" type="button" style="align-self:flex-start">'
             '保存当前帧到相册</button></div>')
body_html = body_html.replace(_save_btn, '')
body_html = body_html.replace(
    '<button class="btn" id="png" type="button">导出 PNG</button>',
    '<button class="btn" id="tool" type="button" hidden>存到相册</button>'
    '<button class="btn" id="png" type="button">导出 PNG</button>')
if 'id="tool"' not in body_html:
    fail('save button not moved')


# ---- 素材面板只留上传；格子面板内加素材选择 + 直接上传
# 1) 素材面板：去掉动画（已移走），保留上传组即可（已在上一步完成）
# 2) 字体选择放进「文案」面板顶部
_font_grp = ('<div class="grp"><span class="lbl">字体<small>上传 ttf / otf / woff</small></span>'
             '<div class="fontlist" id="fontList"></div>'
             '<div class="row">'
             '<label class="btn sm" for="fontFile">上传字体</label>'
             '<input type="file" id="fontFile" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden>'
             '<span class="hint" id="fontMsg"></span>'
             '</div></div>')
_pt2 = body_html.find('<div class="pane" id="p-text"')
if _pt2 < 0:
    fail('p-text not found')
_after = body_html.find('>', _pt2) + 1
body_html = body_html[:_after] + '\n          ' + _font_grp + body_html[_after:]

# 3) 格子面板里的素材行：加「直接上传」入口
_old_row = '<div class="popimgs" id="popImgList"></div></div>'
_new_row = ('<div class="popimgs" id="popImgList"></div>'
            '<div class="row" style="margin-top:8px">'
            '<label class="btn sm" for="popFileAll">上传素材</label>'
            '<input type="file" id="popFileAll" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v" multiple hidden>'
            '</div></div>')
if _old_row not in body_html:
    fail('pop row anchor missing')
body_html = body_html.replace(_old_row, _new_row)


# ---- 去掉「主视觉」整组（已被素材 + 单格编辑覆盖）
import re as _re3
_mh = _re3.search(r'<div class="grp"><span class="lbl">主视觉</span>.*?</div></div>', body_html, _re3.S)
if not _mh:
    fail('hero group not found in markup')
body_html = body_html[:_mh.start()] + body_html[_mh.end():]

# 隐藏残留的 hero 控件引用（脚本里若找不到元素需容错）

# 全屏演示按钮
body_html = body_html.replace(
    '<button class="btn" id="png" type="button">导出 PNG</button>',
    '<button class="btn" id="fs" type="button" aria-pressed="false">全屏演示</button>'
    '<button class="btn" id="png" type="button">导出 PNG</button>')
if 'id="fs"' not in body_html:
    fail('fullscreen button not injected')

html = (
    '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n'
    '<meta charset="UTF-8" />\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, '
    'user-scalable=no, viewport-fit=cover" />\n'
    '<title>动真格</title>\n'
    '<link rel="stylesheet" href="./style.css" />\n'
    '<link rel="stylesheet" href="./compat.css" />\n'
    '</head>\n<body>\n' + body_html + '\n'
    '<script src="./app.bundle.js"></script>\n</body>\n</html>\n'
)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)

for fam in ('InterD', 'PoppinsT'):
    shutil.copyfile('build/%s.woff2' % fam, os.path.join(ASSETS, fam + '.woff2'))

print('build ok — compat 规则 %d 条' % len(ordered))
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    if os.path.isfile(p):
        print('  %-22s %8.1f KiB' % (f, os.path.getsize(p) / 1024))
for f in sorted(os.listdir(ASSETS)):
    print('  assets/%-15s %8.1f KiB' % (f, os.path.getsize(os.path.join(ASSETS, f)) / 1024))
