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
// 小红书真机：data:/blob: 图片可能被容器拦截，相册照片「读取不了」。
// 依次尝试：data URL → blob URL → createImageBitmap → 写成本地临时文件再加载；
// 解码成功后一律画到 canvas 上（canvas 可直接画进海报、可取色），缩略图在容器内用临时文件路径。
function inMT(){ return (typeof mt==='function')&&mt()&&typeof MT.writeTempFile==='function' }
function loadImg(src,ok,bad){ var im=new Image(); im.onload=function(){ ok(im) }; im.onerror=function(){ bad('加载失败') }; im.src=src }
function toCanvas(source,w,h){
  var k=Math.min(1,IMG_MAX/Math.max(w,h));
  var c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
  c.getContext('2d').drawImage(source,0,0,c.width,c.height); return c;
}
// source 已解码：转成 {src,img}。src 给缩略图用，img 给画布用
function finish(source,w,h,type,cb,why){
  var c; try{ c=toCanvas(source,w,h) }catch(e){ return cb(new Error('图片解码失败（'+why.concat('画布').join('；')+'）')) }
  var src=null; try{ src=c.toDataURL(type==='image/png'?'image/png':'image/jpeg',0.9) }catch(e){}
  if(!src) return cb(null,{src:'',img:c});
  if(!inMT()) return loadImg(src,function(im){ cb(null,{src:src,img:im}) },function(){ cb(null,{src:src,img:c}) });
  // 容器内：缩略图走本地文件路径（data: 可能显示不了），画布用 canvas
  loadImg(src,function(){ cb(null,{src:src,img:c}) },function(){
    MT.writeTempFile({data:src}).then(function(t){ cb(null,{src:(t&&t.filePath)||src,img:c}) },function(){ cb(null,{src:src,img:c}) });
  });
}
function readImageFile(f, cb){
  var why=[], type=f.type||'image/jpeg', dataURL=null;
  function fail(){ cb(new Error('照片读取不了（'+why.join('；')+'）')) }
  function viaTemp(){
    if(!inMT()||!dataURL){ why.push('临时文件不可用'); return fail() }
    MT.writeTempFile({data:dataURL}).then(function(t){
      if(!t||!t.filePath){ why.push('临时文件无路径'); return fail() }
      loadImg(t.filePath,function(im){
        var w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
        var c; try{ c=toCanvas(im,w,h); c.getContext('2d').getImageData(0,0,1,1) }catch(e){ return cb(null,{src:t.filePath,img:im}) }
        cb(null,{src:t.filePath,img:c});
      },function(){ why.push('本地文件加载失败'); fail() });
    },function(e){ why.push('写临时文件失败'+((e&&e.errMsg)?':'+e.errMsg:'')); fail() });
  }
  function viaBitmap(){
    if(typeof createImageBitmap!=='function'){ why.push('无位图解码'); return viaTemp() }
    createImageBitmap(f).then(function(bm){ finish(bm,bm.width,bm.height,'image/jpeg',cb,why) },
                              function(){ why.push('位图解码失败'); viaTemp() });
  }
  function viaBlob(){
    var u=null; try{ u=URL.createObjectURL(f) }catch(e){}
    if(!u){ why.push('blob 不可用'); return viaBitmap() }
    loadImg(u,function(im){ finish(im,im.naturalWidth||im.width,im.naturalHeight||im.height,type,cb,why); setTimeout(function(){ try{URL.revokeObjectURL(u)}catch(e){} },3000) },
              function(){ why.push('blob 加载失败'); try{URL.revokeObjectURL(u)}catch(e){} viaBitmap() });
  }
  var r=new FileReader();
  r.onload=function(){
    dataURL=r.result;
    loadImg(dataURL,function(im){
      var w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
      if(!inMT()&&Math.max(w,h)<=IMG_MAX) return cb(null,{src:dataURL,img:im});
      finish(im,w,h,type,cb,why);
    },function(){ why.push('data 加载失败'); viaBlob() });
  };
  r.onerror=function(){ why.push('文件读取失败'); viaBlob() };
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
              "$('impImg').onchange=()=>{const f=$('impImg').files[0]; if(!f){ st.textContent='没有选到图片'; return } st.textContent='正在读取图片取色…';"
              " readImageFile(f,function(err,res){ if(err||!res){ st.textContent='取色失败：'+((err&&err.message)||'图片读取不了'); $('impImg').value=''; return } const im=res.img; try{ (()=>{",
              js, 'impImg robust')
    js = must("  applyImport(out.map(toH),'图片'); $('impImg').value=''}; im.src=r.result}; r.readAsDataURL(f)};",
              "  applyImport(out.map(toH),'图片'); $('impImg').value=''; st.textContent='已从图片取色'})() }catch(e){ st.textContent='取色失败：'+((e&&e.message)||e); $('impImg').value='' } })};",
              js, 'impImg tail')
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
