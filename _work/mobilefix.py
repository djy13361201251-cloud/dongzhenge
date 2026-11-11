# -*- coding: utf-8 -*-
"""手机端：上传可靠性 + 容器导航避让 + 窄屏顶栏

1. 上传：文件 input 不再 hidden 后靠 label 转发，而是透明铺满在按钮上，
   手指点到的就是 input 本身（部分 Android WebView 不转发 label 点击）。
   accept 改成 image/*,video/*，避免 iOS 把 HEIC / 实况照片置灰。
2. 读图：大图先缩到长边 2048 再入库（12MP 原图在 WebView 里容易吃满内存）；
   Image 解不开时退到 createImageBitmap 再试一次。
3. 反馈：上传进度和失败原因写进素材面板 / 格子面板，手机上不再“没反应”。
4. 容器内（小红书）顶部让出状态栏 + 导航胶囊，底部让出 Home 指示条。
"""
import re

ACCEPT_MEDIA = 'image/*,video/*'


def fix_markup(html, fail):
    # label[for=X] + <input type=file id=X ... hidden>  ->  label 包住透明 input
    pat = re.compile(r'<label class="btn sm" for="(\w+)"([^>]*)>([^<]*)</label>'
                     r'(<input type="file" id="\1"[^>]*?) hidden>')
    n = [0]

    def one(m):
        n[0] += 1
        fid, attrs, text, inp = m.group(1), m.group(2), m.group(3), m.group(4)
        if fid in ('fileall', 'popFileAll'):
            inp = re.sub(r'accept="[^"]*"', 'accept="%s"' % ACCEPT_MEDIA, inp)
        return ('<label class="btn sm filebtn"%s>%s%s class="fileov"></label>'
                % (attrs, text, inp))

    html = pat.sub(one, html)
    if n[0] < 4:
        fail('file inputs not rewritten (%d)' % n[0])
    return html


def apply(js, must, fail):
    # 尽早标记运行环境：小红书容器内才需要让出导航胶囊
    js = ("try{if((window.xhs&&window.xhs.miniTool)||/xhs|xiaohongshu|discover\\//i.test(navigator.userAgent))"
          "document.documentElement.className+=' in-xhs'}catch(e){}\n") + js

    js = must(
        """function readImageFile(f, cb){
  var r=new FileReader();
  r.onload=function(){
    var im=new Image();
    im.onload=function(){cb(null,{src:r.result,img:im})};
    im.onerror=function(){cb(new Error('图片解码失败'))};
    im.src=r.result;
  };
  r.onerror=function(){cb(new Error('文件读取失败'))};
  r.readAsDataURL(f);
}""",
        r"""var IMG_MAX=2048;
// 画到 canvas 上缩放，返回 {src,img}
function shrinkTo(source,w,h,type,cb){
  var k=Math.min(1,IMG_MAX/Math.max(w,h));
  var c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
  try{ c.getContext('2d').drawImage(source,0,0,c.width,c.height) }catch(e){ return cb(new Error('图片解码失败')) }
  var src; try{ src=c.toDataURL(type==='image/png'?'image/png':'image/jpeg',0.9) }catch(e){ return cb(new Error('图片解码失败')) }
  var im=new Image();
  im.onload=function(){ cb(null,{src:src,img:im}) };
  im.onerror=function(){ cb(new Error('图片解码失败')) };
  im.src=src;
}
function readImageFile(f, cb){
  var r=new FileReader();
  function viaBitmap(){
    if(typeof createImageBitmap!=='function') return cb(new Error('格式不支持'));
    createImageBitmap(f).then(function(bm){ shrinkTo(bm,bm.width,bm.height,'image/jpeg',cb) },
                              function(){ cb(new Error('格式不支持')) });
  }
  r.onload=function(){
    var im=new Image();
    im.onload=function(){
      var w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
      if(Math.max(w,h)<=IMG_MAX) return cb(null,{src:r.result,img:im});
      shrinkTo(im,w,h,f.type,cb);
    };
    im.onerror=viaBitmap;
    im.src=r.result;
  };
  r.onerror=function(){ cb(new Error('文件读取失败')) };
  r.readAsDataURL(f);
}""",
        js, 'readImageFile robust')

    # 进度 / 失败原因写到用户看得见的地方
    js = must(
        "  var results=[], pending=fs.length, failed=[];",
        "  var results=[], pending=fs.length, failed=[];\n"
        "  function say(t){ st.textContent=t; var a=$('assetMsg'); if(a) a.textContent=t;"
        " if(input.id==='popFileAll'){ var p=$('popHint'); if(p) p.textContent=t } }\n"
        "  say('正在读取 '+fs.length+' 个文件…');",
        js, 'upload progress')

    js = must(
        "      st.textContent='没能读取这些文件'+(failed.length?'：'+failed.join('、'):'');",
        "      say('没能读取这些文件'+(failed.length?'：'+failed.join('、'):'')+'。请换 JPG / PNG 图片或 MP4 视频再试。');",
        js, 'upload fail msg')

    js = must(
        "    st.textContent=failed.length?('有 '+failed.length+' 个文件读不了：'+failed.join('、')):'';",
        "    say(failed.length?('已添加 '+results.length+' 个，有 '+failed.length+' 个读不了：'+failed.join('、'))"
        ":('已添加 '+results.length+' 个素材。'+(input.id==='popFileAll'?'':'点画面里的格子即可放进去。')));",
        js, 'upload ok msg')
        # ---- 中途自动变换不再被“碰过缝隙”关掉
    # 原逻辑：只要拖过缝隙（S.cells 被改），B=A 的副本，之后每轮都不变换。
    # 改为：B 仍按调整后的 A 重新映射，用户调的尺寸保留在前半段，后半段照常变换。
    js = must("  CACHE={key,A,B:edited?A.map(c=>Object.assign({},c)):Bm,types}; return CACHE;",
              "  CACHE={key,A,B:Bm,types}; return CACHE;",
              js, 'keep shuffle after edit')

    # 按下缝隙不再立刻暂停；真的拖动超过 6px 才进入拖动并暂停
    js = must("  playing=false; tPause=Math.max(tPause,Math.min(S.dur*0.45,G.shuffleT()-0.05)); "
              "if(S.shuffle&&tPause<2.2) tPause=2.2; $('play').textContent='▶'; e.preventDefault()});",
              "  e.preventDefault()});",
              js, 'no pause on press')
    js = must("cv.addEventListener('pointermove',e=>{if(DRAG){const pt=toCanvas(e);",
              "cv.addEventListener('pointermove',e=>{if(DRAG){"
              "if(!DRAG.moved){ if(!downPt||Math.hypot(e.clientX-downPt[0],e.clientY-downPt[1])<6) return;"
              " playing=false; tPause=Math.max(tPause,Math.min(S.dur*0.45,G.shuffleT()-0.05));"
              " if(S.shuffle&&tPause<2.2) tPause=2.2; $('play').textContent='▶' }"
              " const pt=toCanvas(e);",
              js, 'drag threshold')
        # ---- 手机首屏：画布 + 抽一张 必须同屏
    # 1) ≤640px 时把 全屏演示 / 导出 挪到「抽一张」那张卡片底部；宽屏再挪回顶栏
    # 2) 画布高度按「抽一张」底边能落在屏幕内来反推
    js = must(
        "bh=window.innerWidth<=1000?window.innerHeight*0.7:st.clientHeight-44;",
        "bh=window.innerWidth<=1000?mobileBH():st.clientHeight-44;",
        js, 'fit mobile height')
    js = must(
        "function fit(){",
        r"""function setAppH(){ document.documentElement.style.setProperty('--appH', window.innerHeight+'px') }
setAppH(); window.addEventListener('resize', setAppH);
window.addEventListener('orientationchange', function(){ setTimeout(function(){ setAppH(); if(typeof fit==='function') fit() }, 300) });
function mobileBH(){
  if(!cv.offsetHeight||window.innerWidth>640) return window.innerHeight*0.7;
  // 画布固定在上半屏：给下面的操作区至少留 32% 屏高（≥220px），其余都给画布
  var desk=document.querySelector('.desk');
  var cr=cv.getBoundingClientRect(), dk=desk?desk.getBoundingClientRect():cr;
  var above=cr.top, below=dk.bottom-cr.bottom;     // 都与画布高度无关
  var sideMin=Math.max(220, Math.round(window.innerHeight*0.32))+12;
  var avail=window.innerHeight-above-below-sideMin;
  return Math.max(220, Math.min(window.innerHeight*0.62, avail));
}
// 点画面里的格子 → 操作区滚到格子面板，面板马上可见
cv.addEventListener('click', function(){ if(window.innerWidth>640) return;
  setTimeout(function(){ var sd=document.querySelector('.side'), pp=$('inspPop'); if(sd&&pp&&!pp.hidden) sd.scrollTop+=pp.getBoundingClientRect().top-sd.getBoundingClientRect().top-12 }, 0) });
var ACT_IDS=['fs','png','mp4'];
function placeActions(){
  var mobile=window.innerWidth<=640;
  var top=document.querySelector('.top'), dc=document.querySelector('.drawc');
  if(!top||!dc) return;
  var row=document.getElementById('acts');
  if(!row){ row=document.createElement('div'); row.id='acts'; row.className='acts'; }
  if(mobile){
    if(row.parentNode!==dc) dc.appendChild(row);
    ACT_IDS.forEach(function(id){ var b=document.getElementById(id); if(b) row.appendChild(b) });
  } else {
    ACT_IDS.forEach(function(id){ var b=document.getElementById(id); if(b) top.appendChild(b) });
    if(row.parentNode) row.parentNode.removeChild(row);
  }
}
placeActions();
window.addEventListener('resize',function(){ placeActions() });
function fit(){""",
        js, 'place actions')
        # 全屏演示时侧栏被隐藏：把「退出演示」按钮临时挂到 body 上，退出后放回原位
    js = must("  FS=on;\n  document.body.classList.toggle('stageonly', !!on);",
              "  FS=on;\n  document.body.classList.toggle('stageonly', !!on);\n"
              "  if(on){ var fb=$('fs'); if(fb) document.body.appendChild(fb) }"
              " else if(typeof placeActions==='function'){ placeActions() }",
              js, 'fs button survives stageonly')
        # 画布与「抽一张」的距离会随画布高度变化（容器有 max-height），单次推算不可靠：
    # 设定后实测「抽一张」底边，超出屏幕就按超出量缩画布，最多三轮收敛。
    js = must(
        "cv.style.width=Math.floor(w*k)+'px'; cv.style.height=Math.floor(h*k)+'px'}",
        "cv.style.width=Math.floor(w*k)+'px'; cv.style.height=Math.floor(h*k)+'px';\n"
        "  if(window.innerWidth<=640){ var rb=document.querySelector('.desk'); var ch=Math.floor(h*k);\n"
        "    for(var it=0; it<3 && rb; it++){\n"
        "      var over=rb.getBoundingClientRect().bottom-(window.innerHeight-Math.max(220,Math.round(window.innerHeight*0.32))-12);\n"
        "      if(over<=1) break;\n"
        "      ch=Math.max(220, ch-Math.ceil(over)); if(ch===220&&it>0) break;\n"
        "      cv.style.height=ch+'px'; cv.style.width=Math.floor(ch*w/h)+'px';\n"
        "    } }\n"
        "}",
        js, 'fit converge on mobile')
    # ---- 真机扫码：上传 / 取色按钮点不开
    # 1.10 起操作区是独立滚动容器，iOS 真机上透明覆盖的 input 命中区域可能错位。
    # 兜底：点到按钮（label）但没点中 input 时，脚本主动打开选择器；选完立刻提示，便于判断卡在哪一步。
    # 取色读图失败（HEIC 等）时给出提示，不再静默。
    js = must("$('impImg').onchange=()=>{const f=$('impImg').files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{const im=new Image(); im.onload=()=>{",
              "$('impImg').onchange=()=>{const f=$('impImg').files[0]; if(!f){ st.textContent='没有选到图片'; return } st.textContent='正在读取图片取色…'; const r=new FileReader(); r.onerror=()=>{st.textContent='取色失败：图片读取失败'}; r.onload=()=>{const im=new Image(); im.onerror=()=>{ if(typeof readImageFile==='function') readImageFile(f,function(err,res){ if(err||!res){ st.textContent='取色失败：这张图片格式读不了，换一张 JPG / PNG 试试'; return } im.onerror=null; im.src=res.src }); else st.textContent='取色失败：图片格式不支持' }; im.onload=()=>{",
              js, 'impImg robust')
    js = js.rstrip()
    i = js.rfind('})();')
    js = js[:i] + r"""
// 上传按钮兜底：label 内点击未命中 input 时主动 click()
(function(){
  document.addEventListener('click',function(e){
    var lb=e.target&&e.target.closest?e.target.closest('label.filebtn'):null; if(!lb) return;
    var inp=lb.querySelector('input[type=file]'); if(!inp||e.target===inp) return;
    e.preventDefault(); try{ inp.click() }catch(err){}
  },true);
  document.addEventListener('change',function(e){
    var t=e.target; if(!t||t.type!=='file') return;
    var n=t.files?t.files.length:0; if(!n&&st) st.textContent='没有选到文件';
  },true);
})();
})();
"""
    return js
