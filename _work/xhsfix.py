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
function mt(){ var m=window.xhs&&window.xhs.miniTool; if(m){ MT=m; IN_XHS=true } return MT }
function waitMT(ms){ return new Promise(function(res){ var t0=Date.now();
  (function tick(){ if(mt()||Date.now()-t0>ms) return res(MT); setTimeout(tick,100) })() }) }
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
if(IN_XHS){ ['fileall','popFileAll'].forEach(function(id){ var e=document.getElementById(id); if(!e) return; e.setAttribute('accept','image/*');
  var lb=e.parentNode; if(lb&&lb.firstChild&&lb.firstChild.nodeType===3) lb.firstChild.nodeValue=id==='fileall'?'上传图片':'上传图片';
  // 视频单独一个入口
  var vl=document.createElement('label'); vl.className='btn sm filebtn'; vl.appendChild(document.createTextNode('上传视频'));
  var vi=document.createElement('input'); vi.type='file'; vi.id=id+'V'; vi.className='fileov'; vi.setAttribute('accept','video/*');
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
  await waitMT(IN_XHS?2000:0);
  if(!MT || typeof MT.saveImageToPhotosAlbum!=='function'){
    if(IN_XHS) throw new Error('小红书保存接口未就绪，请把小红书更新到最新版后重试');
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
        "  if(exporting) return; await waitMT(IN_XHS?2000:0);\n"
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
    if(IN_XHS) throw new Error('小红书保存接口未就绪，请更新小红书后重试');
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
var FS_ROOT=null, FS_CHUNK=0;
async function fsPrep(){
  if(FS_ROOT) return true;
  if(typeof MT.writeFile!=='function'||typeof MT.appendFile!=='function') return false;
  var lo=(window.xhs&&window.xhs.launchOptions)||(typeof MT.getLaunchOptions==='function'?await MT.getLaunchOptions():null);
  FS_ROOT=lo&&lo.miniToolEnv&&lo.miniToolEnv.userDataPath; if(!FS_ROOT) return false;
  try{ var info=await MT.getFileStorageInfo(); FS_CHUNK=info&&info.writeChunkMaxBytes||0 }catch(e){}
  if(!FS_CHUNK) FS_CHUNK=512*1024;
  try{ await MT.mkdir({dirPath:FS_ROOT+'/media',recursive:true}) }catch(e){}
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
async function readVideoViaTemp(f, cb){
  var why=[];
  try{
    if(await fsPrep()){
      var ext=(/\.(mov|m4v|webm)$/i.exec(f.name)||['.mp4'])[0].toLowerCase();
      var path=FS_ROOT+'/media/v'+Date.now()+ext;
      var step=Math.max(3*1024,Math.floor(FS_CHUNK/4)*3);           // base64 膨胀 4/3，按 3 字节对齐
      for(var pos=0;pos<f.size;pos+=step){
        var b64=await sliceB64(f,pos,Math.min(f.size,pos+step));
        if(pos===0) await MT.writeFile({filePath:path,data:b64,encoding:'base64'});
        else await MT.appendFile({filePath:path,data:b64,encoding:'base64'});
        if(typeof st!=='undefined') st.textContent='正在读取视频 '+Math.round(Math.min(1,(pos+step)/f.size)*100)+'%';
      }
      return playFromPath(path,function(e,it){ if(!e) return cb(null,it); why.push('文件句柄'+e.message); tempWay() });
    }
    why.push('文件系统不可用');
  }catch(e){ why.push(errText(e)) }
  tempWay();
  function tempWay(){
    if(typeof MT.writeTempFile!=='function') return cb(new Error(why.join('；')));
    var r=new FileReader(); r.onerror=function(){ cb(new Error('读取失败')) };
    r.onload=function(){ MT.writeTempFile({data:r.result}).then(function(t){
      if(!t||!t.filePath) return cb(new Error(why.concat('临时文件写入失败').join('；')));
      playFromPath(t.filePath,function(e,it){ e?cb(new Error(why.concat('临时文件'+e.message).join('；'))):cb(null,it) });
    },function(e){ cb(new Error(why.concat(errText(e)).join('；'))) }) };
    r.readAsDataURL(f);
  }
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
    return js
