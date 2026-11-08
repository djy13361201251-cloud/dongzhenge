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
    return js
