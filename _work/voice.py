# -*- coding: utf-8 -*-
"""口播模式（网页版）

把一段带画面的口播视频设为「口播」：
  · 它成为主时间轴：播放 / 暂停 / 进度条都控制这段视频，声音打开；
  · 口播所在的格子永远可见，不参与每次卡点的入场动画；
  · 卡点 = 记录当前整张海报（G.getStyle 快照）。播到卡点时刻，海报瞬间换成记录的样子并重放入场动画；
  · 导出 MP4 时按口播时长实时录制，画面 + 原声一起写进文件。
小红书容器内视频素材仍在测试中，口播模式只在网页版出现。
"""


def apply(js, must, fail):
    # ---- 引擎：口播格子跳过入场动画（delay 设为负值即一直完整显示）
    js = must("    const delay=0.1+d*0.7; const type=TY[i];",
              "    let delay=0.1+d*0.7; const type=TY[i]; if(VO_AID&&S.over[i]&&S.over[i].aid===VO_AID) delay=-30;",
              js, 'vo cell no entry')
    js = must("let ASSETS={};", "let ASSETS={}; let VO_AID=null;", js, 'vo aid decl')
    js = must("dropAsset:id=>{", "setVoAid:id=>{ VO_AID=id||null },dropAsset:id=>{", js, 'vo aid api')

    # ---- 时间轴：有口播时以口播视频为准
    js = must("function curT(){return playing?",
              "function curT(){if(VO) return voT(); return playing?", js, 'curT vo')
    js = must("$('scrub').value=Math.round(t/S.dur*1000); $('scrub').style.setProperty('--p',(t/S.dur*100)+'%')} $('time').textContent=`${t.toFixed(1)}s`",
              "var fr=VO?voFrac():t/S.dur; $('scrub').value=Math.round(fr*1000); $('scrub').style.setProperty('--p',(fr*100)+'%')} $('time').textContent=VO?voLabel():`${t.toFixed(1)}s`",
              js, 'loop scrub vo')
    js = must("$('play').onclick=()=>{if(playing)",
              "$('play').onclick=()=>{if(VO){ voToggle(); return } if(playing)", js, 'play vo')
    js = must("$('scrub').oninput=()=>{playing=false;",
              "$('scrub').oninput=()=>{if(VO){ var d=VO.el.duration||0; if(d&&isFinite(d)) VO.el.currentTime=$('scrub').value/1000*d; return } playing=false;",
              js, 'scrub vo')
    js = must("$('mp4').onclick=async()=>{\n",
              "$('mp4').onclick=async()=>{\n  if(VO){ return exportVO() }\n", js, 'mp4 vo')

    code = r"""

// ================================================================ 口播模式
var VO=null, CUES=[], CUE_I=-2;
function fmtT(x){ x=Math.max(0,x||0); var m=Math.floor(x/60), s=x-m*60; return (m?m+':'+(s<10?'0':''):'')+s.toFixed(1)+(m?'':'s') }
function cueIndex(vt){ var k=-1; for(var i=0;i<CUES.length;i++){ if(CUES[i].t<=vt+0.02) k=i; else break } return k }
function voT(){
  var v=VO.el, vt=v.currentTime||0, k=cueIndex(vt);
  if(k!==CUE_I){ CUE_I=k; if(k>=0){ G.setStyle(CUES[k].snap); G.setVoAid(VO.g.id); if(typeof sync==='function') sync(); renderCues() } }
  var start=k>=0?CUES[k].t:0, pt=((vt-start)%S.dur+S.dur)%S.dur;
  if(v.paused && !exporting) pt=Math.max(pt,2.2);    // 暂停编辑时显示完整入场后的画面
  return pt;
}
function voFrac(){ var d=VO.el.duration; return d&&isFinite(d)?(VO.el.currentTime||0)/d:0 }
function voLabel(){ var d=VO.el.duration; return fmtT(VO.el.currentTime)+(d&&isFinite(d)?' / '+fmtT(d):'') }
function voToggle(){ var v=VO.el; if(v.paused){ if(VO.ac&&VO.ac.state==='suspended') VO.ac.resume(); var p=v.play(); if(p&&p.catch) p.catch(function(){}) } else v.pause(); syncPlayBtn() }
function syncPlayBtn(){ var b=$('play'); if(b&&VO) b.textContent=VO.el.paused?'▶':'❚❚' }

function setVO(g){
  if(!g||!g.el) return;
  if(VO&&VO.el!==g.el){ try{ VO.el.muted=true }catch(e){} }
  var v=g.el;
  VO={g:g, el:v, ac:VO&&VO.el===v?VO.ac:null};
  // 声音走 WebAudio：预览能听到，导出时也能取到音轨
  if(!g.ac){ try{ var AC=window.AudioContext||window.webkitAudioContext; g.ac=new AC(); g.src=g.ac.createMediaElementSource(v);
    g.dst=g.ac.createMediaStreamDestination(); g.src.connect(g.ac.destination); g.src.connect(g.dst) }catch(e){ g.ac=null } }
  VO.ac=g.ac;
  v.muted=false; v.removeAttribute('muted'); v.loop=true; v.volume=1;
  G.pinAsset(g.id); G.setVoAid(g.id);
  CUES=[{t:0, snap:G.getStyle()}]; CUE_I=0;
  try{ v.currentTime=0 }catch(e){}
  if(VO.ac&&VO.ac.state==='suspended') VO.ac.resume();
  var p=v.play(); if(p&&p.catch) p.catch(function(){});
  document.body.classList.add('vo-on');
  renderCues(); syncPlayBtn();
  st.textContent='已设为口播：进度条现在控制这段视频。暂停在想切换的时刻，调好海报后点「在此卡点」。';
}
function clearVO(){
  if(!VO) return;
  try{ VO.el.muted=true; VO.el.loop=true }catch(e){}
  G.setVoAid(null); VO=null; CUES=[]; CUE_I=-2;
  document.body.classList.remove('vo-on');
  t0=performance.now(); playing=true; $('play').textContent='❚❚';
  renderCues();
}
function addCue(){
  if(!VO) return;
  var t=Math.round((VO.el.currentTime||0)*10)/10, snap=G.getStyle();
  var at=-1; for(var i=0;i<CUES.length;i++) if(Math.abs(CUES[i].t-t)<0.15) at=i;
  if(at>=0) CUES[at].snap=snap; else { CUES.push({t:t,snap:snap}); CUES.sort(function(a,b){return a.t-b.t}) }
  CUE_I=cueIndex(VO.el.currentTime||0);
  renderCues();
  st.textContent=(at>=0?'已更新 ':'已添加 ')+fmtT(t)+' 的卡点。';
}
function delCue(k){ if(k<=0||!CUES[k]) return; CUES.splice(k,1); CUE_I=-2; renderCues() }
var STN={cute:'可爱',spec:'规整',chaos:'混乱'};
function renderCues(){
  var row=$('vorow'), marks=$('cuemarks');
  if(!row) return;
  row.hidden=!VO; if(marks) marks.hidden=!VO;
  if(!VO) return;
  var list=$('cuelist'); list.innerHTML='';
  var d=VO.el.duration;
  if(marks){ marks.innerHTML=''; CUES.forEach(function(c){ if(!(d&&isFinite(d))) return; var m=document.createElement('i'); m.style.left=(c.t/d*100)+'%'; marks.appendChild(m) }) }
  CUES.forEach(function(c,k){
    var w=document.createElement('span'); w.className='cue'+(k===CUE_I?' on':'');
    var b=document.createElement('button'); b.type='button';
    b.textContent=fmtT(c.t)+' · '+(STN[c.snap.style]||'')+(c.snap.pal&&c.snap.pal.name?' · '+c.snap.pal.name:'');
    b.onclick=function(){ VO.el.currentTime=c.t+0.01; VO.el.pause(); CUE_I=-2; syncPlayBtn() };
    w.appendChild(b);
    if(k>0){ var x=document.createElement('button'); x.type='button'; x.className='cuedel'; x.setAttribute('aria-label','删除卡点'); x.textContent='×';
      x.onclick=function(e){ e.stopPropagation(); delCue(k) }; w.appendChild(x) }
    list.appendChild(w);
  });
}
// 卡点工具条：进度条下方
(function(){
  var dock=document.querySelector('.dock'), sw=document.querySelector('.scrubw');
  if(!dock||!sw) return;
  var marks=document.createElement('div'); marks.className='cuemarks'; marks.id='cuemarks'; marks.hidden=true;
  var sc=$('scrub'); if(sc&&sc.parentNode){ var wrap=document.createElement('div'); wrap.className='scrubwrap'; sc.parentNode.insertBefore(wrap,sc); wrap.appendChild(sc); wrap.appendChild(marks) }
  var row=document.createElement('div'); row.className='vorow'; row.id='vorow'; row.hidden=true;
  row.innerHTML='<div class="vobar"><span class="votag">口播</span><button class="btn sm ink" id="cueAdd" type="button">在此卡点</button>'
    +'<button class="btn sm" id="voOff" type="button">取消口播</button></div><div class="cuelist" id="cuelist"></div>';
  dock.insertBefore(row, sw.nextSibling);
  $('cueAdd').onclick=addCue; $('voOff').onclick=clearVO;
  setInterval(function(){ if(VO){ var b=$('cueAdd'); if(b) b.textContent='在 '+fmtT(VO.el.currentTime)+' 卡点'; syncPlayBtn() } },200);
})();
// 格子面板：选中的是视频素材时出现「设为口播」
var _rpi=refreshPopImage;
refreshPopImage=function(){
  _rpi();
  var row=$('popImgRow'); if(!row||IN_XHS) return;
  var b=$('voSet'); if(!b){ b=document.createElement('button'); b.type='button'; b.className='btn sm ink'; b.id='voSet'; b.style.marginTop='8px'; row.appendChild(b) }
  var o=SEL>=0?S.over[SEL]:null, g=o&&o.aid?assetById(o.aid):null;
  b.hidden=!(g&&g.isVideo&&g.el);
  if(!b.hidden){ var isVo=VO&&VO.g===g; b.textContent=isVo?'取消口播':'设为口播（带声音，作为时间轴）'; b.onclick=function(){ if(VO&&VO.g===g) clearVO(); else setVO(g); refreshPopImage() } }
};
// 删掉 / 清空素材时，口播一起结束
var _delA=delAsset; delAsset=function(idx){ var g=GALLERY[idx]; if(VO&&g&&VO.g===g) clearVO(); _delA(idx) };
var _clrI=clearImg; clearImg=function(){ if(VO) clearVO(); _clrI() };
if($('clear')) $('clear').onclick=clearImg;

// 导出：按口播时长实时录制，画面 + 原声
async function exportVO(){
  if(exporting) return;
  var g=VO.g, v=VO.el, d=v.duration;
  if(!(d&&isFinite(d))){ st.textContent='导出失败：读不到口播时长'; return }
  var types=['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  var mime=window.MediaRecorder&&cv.captureStream?types.filter(function(t){ try{return MediaRecorder.isTypeSupported(t)}catch(e){return false} })[0]:null;
  if(!mime){ st.textContent='导出失败：这个浏览器不支持录制，请用最新版 Chrome'; return }
  await loadFonts(); exporting=true; $('mp4').disabled=true; prog.style.width='0%';
  try{
    if(g.ac&&g.ac.state==='suspended') await g.ac.resume();
    v.pause(); v.loop=false; v.currentTime=0;
    await new Promise(function(r){ var done=false; function ok(){ if(!done){ done=true; r() } } v.addEventListener('seeked',ok,{once:true}); setTimeout(ok,800) });
    CUE_I=-2;
    var tracks=cv.captureStream(30).getVideoTracks();
    if(g.dst) tracks=tracks.concat(g.dst.stream.getAudioTracks());
    var stream=new MediaStream(tracks), chunks=[];
    var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:12e6,audioBitsPerSecond:192000});
    rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data) };
    var stopped=new Promise(function(r){ rec.onstop=r });
    rec.start(500);
    await v.play();
    await new Promise(function(res){ (function fr(){
      G.render(ctx,curT(),{now:performance.now(),live:true});
      prog.style.width=Math.min(100,v.currentTime/d*100).toFixed(1)+'%';
      st.textContent='正在录制 '+fmtT(v.currentTime)+' / '+fmtT(d)+'（实时录制，请保持此页在前台）';
      if(v.ended||v.currentTime>=d-0.02) res(); else requestAnimationFrame(fr) })() });
    rec.stop(); await stopped; tracks.forEach(function(t){ if(t.kind==='video') t.stop() });
    var ext=/mp4/.test(mime)?'mp4':'webm';
    var blob=new Blob(chunks,{type:mime.split(';')[0]});
    prog.style.width='100%';
    if(localDownload(`动真格_口播_${stamp()}.${ext}`,blob)!=='local') throw new Error('当前环境不支持保存视频');
    st.textContent=`已导出带声音的 ${ext.toUpperCase()}（${(blob.size/1048576).toFixed(1)} MB）`+(ext==='webm'?'，剪映等软件可直接导入':'')+'。';
  }catch(e){ st.textContent='导出失败：'+((e&&e.message)||e) }
  v.loop=true; exporting=false; $('mp4').disabled=false; CUE_I=-2; syncPlayBtn();
}
"""
    i = js.rstrip().rfind('})();')
    if i < 0:
        fail('bundle tail not found')
    js = js[:i] + code + '\n})();\n'
    return js
