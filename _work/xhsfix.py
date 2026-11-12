# -*- coding: utf-8 -*-
"""小红书容器适配

1. 端能力延迟获取：window.xhs 可能晚于脚本注入，导出时再取，并最多等 2 秒；
   在小红书里拿不到端能力时明确报错，不再误走「浏览器下载」（容器禁用，表现为没反应）。
2. 存相册：先按文档直接传 data URI，失败再走 writeTempFile 路径，再失败降为 JPEG 重试，并显示端上 errMsg。
3. 导出 MP4：没有 VideoEncoder 时退到 MediaRecorder（仅接受 mp4）；容器内用 30 帧 / 8Mbps 控制体积。
4. 视频素材：容器禁止 blob:/data: 媒体，改为 writeTempFile 落成本地文件再播放；仍失败给出明确说明。
5. 容器内选择器只请求图片（accept="image/*"），避免系统选择器把混合类型判为无法识别。
6. 手机上状态栏文字是隐藏的：所有状态消息同时以浮动提示显示。
7. 上传失败写清楚：文件名、类型、大小、失败环节。
"""


def apply(js, must, fail):
    js = must(
        "var MT=window.xhs&&window.xhs.miniTool;",
        r"""var MT=window.xhs&&window.xhs.miniTool;
var IN_XHS=!!MT||/xhs|xiaohongshu|discover\//i.test(navigator.userAgent);
var MT_SEEN = MT?('已有:'+Object.keys(MT).length+'项'):'未注入';
function mt(){ var m=window.xhs&&window.xhs.miniTool; if(m){ MT=m; IN_XHS=true; MT_SEEN='已有:'+Object.keys(m).length+'项' } return MT }
// 容器注入的时机不确定：一直等到接口出现（最多 8 秒），期间不打断
function waitMT(ms){ ms=ms||15000; return new Promise(function(res){ var t0=Date.now();
  (function tick(){ if(mt()&&typeof MT.saveImageToPhotosAlbum==='function') return res(MT);
    if(Date.now()-t0>ms) return res(MT); setTimeout(tick,120) })() }) }
function mtDiag(){
  var x=window.xhs, k=[], hits=[];
  k.push(x?('window.xhs 存在'):'window.xhs 不存在');
  k.push(MT_SEEN);
  if(x) k.push('xhs 字段:'+Object.keys(x).join(','));
  try{ for(var q in window){ if(/xhs|mini|bridge|native/i.test(q)) hits.push(q) } }catch(e){}
  k.push('全局可疑键:'+(hits.slice(0,8).join(',')||'无'));
  k.push('UA:'+(navigator.userAgent||''));
  return k.join(' | ')
}
function errText(e){ return (e&&(e.errMsg||e.message||e.code))||String(e) }
// 手机上 #status 不可见：任何状态文字同时浮出提示
(function(){
  var s=document.getElementById('status'); if(!s||!window.MutationObserver) return;
  var box=document.createElement('div'); box.className='toast'; box.setAttribute('role','status'); document.body.appendChild(box);
  var tm=0;
  new MutationObserver(function(){ var t=s.textContent.trim(); if(!t||/^\d+p\s*·/.test(t)) return;
    box.textContent=t; box.classList.add('on'); clearTimeout(tm);
    tm=setTimeout(function(){ box.classList.remove('on') }, /失败|无法|不支持|读不了/.test(t)?6000:2600) })
    .observe(s,{childList:true,characterData:true,subtree:true});
})();
// 容器内只请求图片，系统选择器最稳
if(IN_XHS){ var mb4=document.getElementById('mp4'); if(mb4) mb4.textContent='导出动图'; }
if(IN_XHS){ ['fileall','popFileAll'].forEach(function(id){ var e=document.getElementById(id); if(!e) return; e.setAttribute('accept','image/*');
  var lb=e.parentNode; if(lb&&lb.firstChild&&lb.firstChild.nodeType===3) lb.firstChild.nodeValue=id==='fileall'?'上传图片':'上传图片';
  // 视频单独一个入口
  var vl=document.createElement('label'); vl.className='btn sm filebtn'; vl.appendChild(document.createTextNode('上传视频')); var bt=document.createElement('span'); bt.className='beta'; bt.textContent='测试中'; vl.appendChild(bt); vl.title='小红书内视频素材功能测试中，可能读取失败';
  var vi=document.createElement('input'); vi.type='file'; vi.id=id+'V'; vi.className='fileov'; vi.setAttribute('accept','video/*');
  vi.disabled=true; vl.className+=' off'; vl.setAttribute('aria-disabled','true'); vl.title='小红书内暂不支持播放视频素材，请在网页版使用';
  vl.appendChild(vi); if(lb&&lb.parentNode) lb.parentNode.insertBefore(vl, lb.nextSibling);
  setTimeout(function(){ vi.onchange=function(ev){ if(id==='popFileAll'){ Object.defineProperty(ev,'target',{value:{id:'popFileAll',files:vi.files,set value(x){vi.value=x}}}) } onPick(ev) } },0) }) }""",
        js, 'lazy MT + toast')

    js = must(
        "async function saveFile(name,blob){\n"
        "  if(!MT || typeof MT.saveImageToPhotosAlbum!=='function'){\n"
        "    var r=localDownload(name,blob);\n"
        "    if(r==='local') return 'local';\n"
        "    var e=new Error('当前环境不支持保存'); e.code='unsupported'; throw e;\n"
        "  }\n"
        "  var path=await toLocalPath(blob);\n"
        "  try{ await MT.saveImageToPhotosAlbum({filePath:path}) }\n"
        "  catch(err){ if(err && err.errMsg) throw new Error(err.errMsg); throw err }\n"
        "  return 'saved';\n"
        "}",
        r"""async function saveFile(name,blob){
  if(IN_XHS) await waitMT(15000);
  if(!MT || typeof MT.saveImageToPhotosAlbum!=='function'){
    if(IN_XHS) throw new Error('小红书接口未就绪（'+mtDiag()+'）');
    var r=localDownload(name,blob);
    if(r==='local') return 'local';
    var e=new Error('当前环境不支持保存'); e.code='unsupported'; throw e;
  }
  var tries=[];
  var data=await blobToDataURL(blob);
  async function attempt(d){
    try{ await MT.saveImageToPhotosAlbum({filePath:d}); return true }catch(e){ tries.push(errText(e)) }
    if(typeof MT.writeTempFile==='function'){
      try{ var t=await MT.writeTempFile({data:d}); if(t&&t.filePath){ await MT.saveImageToPhotosAlbum({filePath:t.filePath}); return true } }
      catch(e){ tries.push(errText(e)) }
    }
    return false;
  }
  if(await attempt(data)) return 'saved';
  if(/cancel|取消|auth|权限|deny/i.test(tries.join(' '))) throw new Error('没有相册权限：请在系统设置里允许小红书访问相册（'+tries[0]+'）');
  try{ if(await attempt(cv.toDataURL('image/jpeg',0.92))) return 'saved' }catch(e){}
  throw new Error(tries.slice(-2).join(' / ')||'保存失败');
}""",
        js, 'saveFile robust')

    # toLocalPath 也要延迟拿端能力
    js = must("async function toLocalPath(blob){\n  const data=await blobToDataURL(blob);",
              "async function toLocalPath(blob){\n  mt(); const data=await blobToDataURL(blob);",
              js, 'toLocalPath lazy')

    # ---- MP4：VideoEncoder 不可用时退到 MediaRecorder
    js = must(
        "  if(exporting) return; if(!window.VideoEncoder){st.textContent='这个浏览器不支持逐帧编码，请换用 Chrome 或 Edge。'; return}",
        "  if(exporting) return; await waitMT(IN_XHS?15000:0); if(IN_XHS) return exportGIF();\n"
        "  if(!window.VideoEncoder){ return recordMP4() }",
        js, 'mp4 fallback entry')
    js = must("    const [W,H]=G.size(), fps=60, n=Math.round(S.dur*fps);",
              "    const [W,H]=G.size(), fps=IN_XHS?30:60, n=Math.round(S.dur*fps);", js, 'mp4 fps')
    js = must("const k={codec:c,width:W,height:H,bitrate:18e6,",
              "const k={codec:c,width:W,height:H,bitrate:IN_XHS?8e6:18e6,", js, 'mp4 bitrate')
    js = must(
        "    if(!MT||typeof MT.postNote!=='function'){\n"
        "      var rr=localDownload(`动真格_${S.aspect.replace(':','x')}_${stamp()}.mp4`,blob);",
        "    await deliverMP4(blob); if(false){\n"
        "      var rr=localDownload(`动真格_${S.aspect.replace(':','x')}_${stamp()}.mp4`,blob);",
        js, 'mp4 deliver')
    js = must("    } else {\n      const vp=await toLocalPath(blob);",
              "    } else if(false){\n      const vp=await toLocalPath(blob);", js, 'mp4 old branch off')
    js = must(
        "// tabs\n$('tabs')",
        r"""async function deliverMP4(blob){
  var mb=(blob.size/1048576).toFixed(1);
  if(!MT||typeof MT.saveImageToPhotosAlbum!=='function'){
    if(IN_XHS) throw new Error('小红书接口未就绪（'+mtDiag()+'）');
    if(localDownload(`动真格_${S.aspect.replace(':','x')}_${stamp()}.mp4`,blob)!=='local') throw new Error('当前环境不支持保存视频');
    st.textContent=`已下载 MP4（${mb} MB）。`; return;
  }
  st.textContent=`视频已生成（${mb} MB），正在保存到相册…`;
  var data=await blobToDataURL(blob), errs=[];
  var paths=[];
  if(typeof MT.writeTempFile==='function'){ try{ var t=await MT.writeTempFile({data:data}); if(t&&t.filePath) paths.push(t.filePath) }catch(e){ errs.push(errText(e)) } }
  paths.push(data);
  for(var k=0;k<paths.length;k++){
    try{ var r=await MT.saveImageToPhotosAlbum({filePath:paths[k]});
      if(r&&r.errMsg&&/fail/i.test(r.errMsg)) throw r;
      st.textContent=`已保存 MP4 到相册（${mb} MB）。`; return }
    catch(e){ errs.push(errText(e)) }
  }
  throw new Error('小红书暂未开放视频存相册（'+(errs[errs.length-1]||'不支持')+'）。PNG 可正常保存；视频请在网页版导出 MP4');
}
// ---- GIF 动图编码（小红书相册只收图片：用会动的 GIF 代替 MP4）
function GifWriter(w,h){
  var chunks=[], buf=new Uint8Array(1<<16), n=0;
  function flush(){ chunks.push(buf.slice(0,n)); n=0 }
  function b(x){ if(n===buf.length) flush(); buf[n++]=x }
  function w16(x){ b(x&255); b((x>>8)&255) }
  function str(t){ for(var i=0;i<t.length;i++) b(t.charCodeAt(i)) }
  this.header=function(pal){ str('GIF89a'); w16(w); w16(h); b(0xF7); b(0); b(0);
    for(var i=0;i<256;i++){ var c=pal[i]||0; b((c>>16)&255); b((c>>8)&255); b(c&255) }
    b(0x21); b(0xFF); b(11); str('NETSCAPE2.0'); b(3); b(1); w16(0); b(0) };
  this.frame=function(idx,delay,tr){
    b(0x21); b(0xF9); b(4); b(tr?5:4); w16(delay); b(tr?255:0); b(0);
    b(0x2C); w16(0); w16(0); w16(w); w16(h); b(0);
    // LZW
    var min=8, clear=256, eoi=257, size=min+1, next=258, dict=new Map(), cur=0, bits=0, out=[], blk=[];
    function emit(code){ cur|=code<<bits; bits+=size; while(bits>=8){ blk.push(cur&255); cur>>=8; bits-=8; if(blk.length===255){ out.push(blk); blk=[] } } }
    b(min); emit(clear);
    var pre=idx[0];
    for(var i=1;i<idx.length;i++){ var k=idx[i], key=pre*256+k, v=dict.get(key);
      if(v!==undefined){ pre=v; continue }
      emit(pre);
      if(next<4096){ dict.set(key,next++); if(next>(1<<size)&&size<12) size++ }
      else { emit(clear); dict.clear(); next=258; size=min+1 }
      pre=k }
    emit(pre); emit(eoi); if(bits>0) blk.push(cur&255); if(blk.length) out.push(blk);
    for(var j=0;j<out.length;j++){ b(out[j].length); for(var q=0;q<out[j].length;q++) b(out[j][q]) }
    b(0) };
  this.end=function(){ b(0x3B); flush(); return new Blob(chunks,{type:'image/gif'}) };
}
async function exportGIF(){
  if(exporting) return;
  await loadFonts(); exporting=true; $('mp4').disabled=true; prog.style.width='0%';
  try{
    var sz=G.size(), W=540, H=Math.round(540*sz[1]/sz[0]); H-=H%2;
    var fps=12, n=Math.round(S.dur*fps), delay=Math.round(100/fps);
    var c=document.createElement('canvas'); c.width=W; c.height=H; var g=c.getContext('2d');
    var grain0=S.grain; S.grain=0;   // 动态颗粒每帧都变，GIF 压不动，导出时临时关掉
    function grab(t){ G.render(ctx,t); g.drawImage(cv,0,0,W,H); return g.getImageData(0,0,W,H).data }
    // 调色板：抽 8 帧做 15 位色直方图，取最常用的 256 色（海报是平涂色块，效果稳定）
    var hist=new Uint32Array(32768);
    for(var s0=0;s0<8;s0++){ var d=grab(S.dur*s0/8); for(var p=0;p<d.length;p+=8) hist[((d[p]>>3)<<10)|((d[p+1]>>3)<<5)|(d[p+2]>>3)]++ }
    var keys=[]; for(var k=0;k<32768;k++) if(hist[k]) keys.push(k);
    keys.sort(function(a,b2){ return hist[b2]-hist[a] }); keys=keys.slice(0,255);
    var pal=keys.map(function(k){ return (((k>>10)&31)<<19)|(((k>>5)&31)<<11)|((k&31)<<3) });
    var lut=new Int16Array(32768).fill(-1);
    function near(key){ var r=(key>>10)&31,gg=(key>>5)&31,bb=key&31,best=0,bd=1e9;
      for(var i=0;i<keys.length;i++){ var q=keys[i],dr=((q>>10)&31)-r,dg=((q>>5)&31)-gg,db=(q&31)-bb,dd=dr*dr*3+dg*dg*4+db*db*2; if(dd<bd){bd=dd;best=i; if(!dd) break} }
      return best }
    var gw=new GifWriter(W,H); gw.header(pal);
    var idx=new Uint8Array(W*H), prev=new Uint8Array(W*H), out=new Uint8Array(W*H);
    for(var f=0;f<n;f++){
      var px=grab(f/fps);
      for(var i2=0,p2=0;i2<idx.length;i2++,p2+=4){ var key=((px[p2]>>3)<<10)|((px[p2+1]>>3)<<5)|(px[p2+2]>>3); var v=lut[key]; if(v<0){ v=near(key); lut[key]=v } idx[i2]=v }
      // 与上一帧相同的像素标成透明，只写变化部分
      if(f===0){ gw.frame(idx,delay,false) }
      else { for(var j=0;j<idx.length;j++) out[j]=idx[j]===prev[j]?255:idx[j]; gw.frame(out,delay,true) }
      var tmp=prev; prev=idx; idx=tmp;
      if(f%3===0){ prog.style.width=(f/n*100).toFixed(1)+'%'; st.textContent='正在生成动图 '+f+' / '+n+' 帧'; await new Promise(function(r){setTimeout(r,0)}) }
    }
    S.grain=grain0;
    var blob=gw.end(); prog.style.width='100%';
    var mb=(blob.size/1048576).toFixed(1);
    st.textContent='动图已生成（'+mb+' MB），正在保存到相册…';
    await waitMT(IN_XHS?15000:0);
    if(!MT || typeof MT.saveImageToPhotosAlbum!=='function') throw new Error('小红书接口未就绪（'+mtDiag()+'）');
    var data=await blobToDataURL(blob), tried=[];
    try{ var r=await MT.saveImageToPhotosAlbum({filePath:data});
      if(r&&r.errMsg&&/fail/i.test(r.errMsg)) throw r;
      st.textContent='已保存动图到相册（'+mb+' MB）。'; return }
    catch(e){ tried.push(errText(e)) }
    if(typeof MT.writeTempFile==='function'){
      try{ var t=await MT.writeTempFile({data:data});
        if(t&&t.filePath){ await MT.saveImageToPhotosAlbum({filePath:t.filePath});
          st.textContent='已保存动图到相册（'+mb+' MB）。'; return } }
      catch(e){ tried.push(errText(e)) }
    }
    throw new Error(tried.slice(-2).join(' / ')||'保存失败');
  }catch(e){ if(typeof grain0!=='undefined') S.grain=grain0; st.textContent='导出失败：'+errText(e) }
  exporting=false; $('mp4').disabled=false;
}
// 无 WebCodecs 时：实时录制画布（只接受 mp4，容器不收 webm）
async function recordMP4(){
  var types=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4'];
  var mime=window.MediaRecorder&&cv.captureStream?types.filter(function(t){ try{return MediaRecorder.isTypeSupported(t)}catch(e){return false} })[0]:null;
  if(!mime){ st.textContent='导出失败：当前系统版本不支持在页面内生成 MP4（需要 iOS 14.3+ 或较新的安卓系统）。可先导出 PNG。'; return }
  await loadFonts(); exporting=true; $('mp4').disabled=true; prog.style.width='0%';
  try{
    var stream=cv.captureStream(30), chunks=[];
    var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8e6});
    rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data) };
    var done=new Promise(function(r){ rec.onstop=r });
    var t0=performance.now(), dur=S.dur*1000;
    rec.start(250);
    await new Promise(function(res){ (function fr(){ var el=performance.now()-t0; G.render(ctx,Math.min(el/1000,S.dur));
      prog.style.width=Math.min(100,el/dur*100).toFixed(1)+'%'; st.textContent='正在录制 '+Math.min(S.dur,el/1000).toFixed(1)+' / '+S.dur+' 秒';
      if(el<dur) requestAnimationFrame(fr); else res() })() });
    rec.stop(); await done; stream.getTracks().forEach(function(t){t.stop()});
    prog.style.width='100%';
    await deliverMP4(new Blob(chunks,{type:'video/mp4'}));
  }catch(e){ st.textContent='导出失败：'+errText(e) }
  exporting=false; $('mp4').disabled=false;
}
// tabs
$('tabs')""",
        js, 'mp4 helpers')

    # ---- 上传失败写清原因
    js = must(
        "      if(err) failed.push(f.name);",
        "      if(err) failed.push(f.name+'（'+(f.type||'未知类型')+'，'+(f.size/1048576).toFixed(1)+'MB，'+(err.message||'读取失败')+'）');",
        js, 'upload diagnostics')

    # ---- 视频素材：容器禁 blob 媒体，失败后落成临时文件再播放
    js = must(
        "    readVideoNative(f, function(err,item){\n"
        "      if(!err) return handle(null,item);\n"
        "      readVideoFile(f, handle);       // 原生不可用则抽帧\n"
        "    });",
        "    readVideoNative(f, function(err,item){\n"
        "      if(!err) return handle(null,item);\n"
        "      if(mt()&&typeof MT.writeTempFile==='function') return readVideoViaTemp(f, function(e2,it2){\n"
        "        if(!e2) return handle(null,it2);\n"
        "        handle(new Error('小红书内读取视频失败：'+e2.message));\n"
        "      });\n"
        "      readVideoFile(f, handle);       // 原生不可用则抽帧\n"
        "    });",
        js, 'video via temp')
    js = must(
        "// 主路径：视频元素直连。成功即可原帧率完整播放。",
        r"""// 容器禁 blob:/data: 媒体，但文件系统写入的文件句柄可作为 video.src（客户端 9.49+）
var FS_ROOT=null, FS_CHUNK=0, LIVE_MEDIA={};
async function storageDiag(){
  try{ var i=await MT.getFileStorageInfo(); var mb=function(x){ return (x/1048576).toFixed(1) };
    return '存储 '+mb(i.usedBytes||0)+'/'+mb(i.limitBytes||0)+'MB，'+(i.fileCount||0)+' 个文件，临时 '+mb(i.tmpUsedBytes||0)+'MB，单次写入上限 '+mb(i.writeChunkMaxBytes||0)+'MB' }
  catch(e){ return '读不到存储信息 '+errText(e) }
}
async function cleanMedia(why){
  if(typeof MT.readDir!=='function'||typeof MT.unlink!=='function') return;
  var dirs=[FS_ROOT+'/media',FS_ROOT], n=0;
  for(var d=0;d<dirs.length;d++){
    try{ var r=await MT.readDir({dirPath:dirs[d]}); var fl=(r&&r.files)||[];
      for(var k=0;k<fl.length;k++){ var name=typeof fl[k]==='string'?fl[k]:(fl[k].name||fl[k].path||''); if(!/\.mp4$/i.test(name)) continue;
        var fp=name.indexOf('/')>=0?name:dirs[d]+'/'+name; if(LIVE_MEDIA[fp]) continue;
        try{ await MT.unlink({filePath:fp}); n++ }catch(e){} } }catch(e){}
  }
  if(n) why.push('已清理旧视频 '+n+' 个');
}
var FS_MKDIR_ERR='';
async function fsPrep(){
  if(FS_ROOT) return true;
  if(typeof MT.writeFile!=='function'||typeof MT.appendFile!=='function') return false;
  var lo=(window.xhs&&window.xhs.launchOptions)||(typeof MT.getLaunchOptions==='function'?await MT.getLaunchOptions():null);
  FS_ROOT=lo&&lo.miniToolEnv&&lo.miniToolEnv.userDataPath; if(!FS_ROOT) return false;
  try{ var info=await MT.getFileStorageInfo(); FS_CHUNK=info&&info.writeChunkMaxBytes||0 }catch(e){}
  if(!FS_CHUNK) FS_CHUNK=512*1024;
  try{ await MT.mkdir({dirPath:FS_ROOT+'/media',recursive:true}) }catch(e){ FS_MKDIR_ERR=errText(e) }
  return true;
}
function sliceB64(f,start,end){ return new Promise(function(res,rej){ var r=new FileReader();
  r.onload=function(){ var s=String(r.result); res(s.slice(s.indexOf(',')+1)) }; r.onerror=function(){ rej(new Error('读取失败')) };
  r.readAsDataURL(f.slice(start,end)) }) }
function playFromPath(path,cb){
  var v=document.createElement('video'); v.muted=true; v.loop=true; v.autoplay=true;
  v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline',''); v.preload='auto';
  v.style.cssText='position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  var ok=false;
  function good(){ if(ok) return; ok=true;
    var c=document.createElement('canvas'); c.width=200; c.height=200; var thumb='';
    try{ var vw=v.videoWidth||200, vh=v.videoHeight||200, k=Math.max(200/vw,200/vh); c.getContext('2d').drawImage(v,(200-vw*k)/2,(200-vh*k)/2,vw*k,vh*k); thumb=c.toDataURL('image/jpeg',0.8) }catch(e){}
    cb(null,{src:thumb,img:v,el:v,isVideo:true}) }
  v.addEventListener('loadeddata',good); v.addEventListener('canplay',good);
  v.addEventListener('error',function(){ if(!ok){ ok=true; try{v.remove()}catch(e){} cb(new Error('播放失败')) } });
  setTimeout(function(){ if(!ok){ if(v.readyState>=2) good(); else { ok=true; try{v.remove()}catch(e){} cb(new Error('超时')) } } },6000);
  v.src=path; try{ var p=v.play(); if(p&&p.catch) p.catch(function(){}) }catch(e){}
}
function playP(path){ return new Promise(function(res,rej){ playFromPath(path,function(e,it){ e?rej(e):res(it) }) }) }
function readAsMp4URL(f){ return new Promise(function(res,rej){ var r=new FileReader();
  r.onload=function(){ res(String(r.result).replace(/^data:[^;,]*/,'data:video/mp4')) }; r.onerror=function(){ rej(new Error('读取失败')) }; r.readAsDataURL(f) }) }
async function readVideoViaTemp(f, cb){
  var why=[];
  if(typeof st!=='undefined') st.textContent='正在读取视频…';
  // ① 整个写成临时文件 → saveFile 移到持久目录 → 用持久文件句柄播放（不依赖 appendFile）
  try{
    if(typeof MT.writeTempFile==='function'){
      var du=await readAsMp4URL(f);
      var t=await MT.writeTempFile({data:du}); du=null;
      if(!t||!t.filePath) throw new Error('临时文件写入失败');
      if(typeof MT.saveFile==='function'){
        try{
          var ok=await fsPrep();
          var sv=await MT.saveFile(ok?{tempFilePath:t.filePath,filePath:FS_ROOT+'/media/v'+Date.now()+'.mp4'}:{tempFilePath:t.filePath});
          var sp=sv&&(sv.savedFilePath||sv.filePath);
          if(sp){ LIVE_MEDIA[sp]=1; try{ return cb(null,await playP(sp)) }catch(e){ why.push('持久文件'+e.message) } }
          else why.push('saveFile 无返回路径');
        }catch(e){ why.push('saveFile '+errText(e)) }
      }
      try{ return cb(null,await playP(t.filePath)) }catch(e){ why.push('临时文件'+e.message) }
    } else why.push('无 writeTempFile');
  }catch(e){ why.push(errText(e)) }
  // ② saveFile 不指定目标路径（由端上决定持久位置）
  try{
    if(t&&t.filePath&&typeof MT.saveFile==='function'){
      var sv2=await MT.saveFile({tempFilePath:t.filePath}); var sp2=sv2&&(sv2.savedFilePath||sv2.filePath);
      if(sp2){ LIVE_MEDIA[sp2]=1; try{ return cb(null,await playP(sp2)) }catch(e){ why.push('默认持久文件'+e.message) } }
    }
  }catch(e){ why.push('saveFile(默认) '+errText(e)) }
  // ③ 清掉以前失败留下的视频文件，再一次性 writeFile 整个文件（不用 appendFile）
  try{
    if(await fsPrep()){
      await cleanMedia(why);
      var b64all=await sliceB64(f,0,f.size);
      var tries=[FS_ROOT+'/media/v'+Date.now()+'.mp4', FS_ROOT+'/v'+Date.now()+'.mp4'];
      for(var q=0;q<tries.length;q++){
        try{ await MT.writeFile({filePath:tries[q],data:b64all,encoding:'base64'});
             LIVE_MEDIA[tries[q]]=1; var it=await playP(tries[q]); b64all=null; return cb(null,it) }
        catch(e){ why.push((q?'根目录':'media')+'整写 '+errText(e)) }
      }
      b64all=null;
    }
  }catch(e){ why.push('整写 '+errText(e)) }
  why.push(await storageDiag()); if(FS_MKDIR_ERR) why.push('建目录失败 '+FS_MKDIR_ERR);
  cb(new Error(why.join('；')));
}
// 主路径：视频元素直连。成功即可原帧率完整播放。""",
        js, 'readVideoViaTemp')
    js = must("$('png').onclick=async()=>{await loadFonts();",
              "$('png').onclick=async()=>{st.textContent='正在生成图片…'; await loadFonts();", js, 'png progress')
    js = must("$('fs').onclick=function(){ setFull(!FS) };",
              "$('fs').onclick=function(){ setFull(!FS) };\n"
              "document.addEventListener('click',function(e){ if(!FS) return; var t=e.target;"
              " if(t&&t.id!=='fs'&&t.closest&&t.closest('.stage,.desk,canvas')){ e.stopPropagation(); e.preventDefault(); setFull(false) } },true);",
              js, 'tap to exit fullscreen')
    # 箭头：横杆方头会戳出尖端并与箭头斜线叠出缺口 → 横杆平头收短，箭头单独尖角接合
    js = must("ctx.strokeStyle=fg; ctx.lineWidth=Math.max(4,m*0.05); ctx.lineCap='square'; ctx.beginPath(); ctx.moveTo(-L,0); ctx.lineTo(L,0); ctx.moveTo(L*0.35,-L*0.65); ctx.lineTo(L,0); ctx.lineTo(L*0.35,L*0.65); ctx.stroke()}", "ctx.strokeStyle=fg; const lw=Math.max(4,m*0.05); ctx.lineWidth=lw; ctx.miterLimit=10; ctx.lineCap='butt'; ctx.lineJoin='miter'; ctx.beginPath(); ctx.moveTo(-L,0); ctx.lineTo(L-lw*0.5,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(L*0.35,-L*0.65); ctx.lineTo(L,0); ctx.lineTo(L*0.35,L*0.65); ctx.stroke()}", js, 'arrow tip')
    return js
