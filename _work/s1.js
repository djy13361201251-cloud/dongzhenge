
(function(){
const G=GRIDKIT, S=G.S, cv=document.getElementById('cv'), ctx=cv.getContext('2d');
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches, t0=performance.now(), tPause=3.0, exporting=false;
const $=id=>document.getElementById(id);
function curT(){return playing?((performance.now()-t0)/1000)%S.dur:Math.min(tPause,S.dur)}
function morph(){G.startMorph(G.getRects().map(r=>Object.assign({},r)),performance.now())}
// aspect
const asp=$('aspect'); Object.keys(G.SIZES).forEach(k=>{const b=document.createElement('button'); b.type='button'; b.dataset.v=k; {const [rw,rh]=k.split(':').map(Number); const sc=24/Math.max(rw,rh); b.innerHTML=`<svg viewBox="0 0 24 24"><rect x="${(24-rw*sc)/2}" y="${(24-rh*sc)/2}" width="${rw*sc}" height="${rh*sc}" rx="3"/></svg>${k}`} b.onclick=()=>{
  const [ow,oh]=G.size(); S.aspect=k; const [w,h]=G.size(); // keep cells roughly square when the frame changes shape
  S.cols=Math.max(4,Math.min(16,Math.round(S.rows*(w/h)*(S.cols/S.rows)/(ow/oh)))); sync()}; asp.appendChild(b)});
// style
$('style').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.style=b.dataset.v; if(S.style==='cute'&&S.radius<14) S.radius=30; if(S.style==='spec'&&S.radius>12) S.radius=4; if(S.style==='chaos'&&S.gutter<14) S.gutter=18; sync()});
// hero
let hasImg=false;
$('hero').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.v==='image'&&!hasImg){$('file').click(); return} morph(); S.hero=b.dataset.v; sync()});
// palettes
const pre=$('presets'); Object.entries(G.PRESETS).forEach(([id,p])=>{const b=document.createElement('button'); b.type='button'; b.className='sw'; b.dataset.v=id; b.title=p.name; b.setAttribute('aria-label','配色：'+p.name); b.innerHTML=['ground','c1','c2','c3','c4'].map(k=>`<i style="background:${p[k]}"></i>`).join(''); b.onclick=()=>{pushUndo(); S.pal=Object.assign({},p); sync()}; pre.appendChild(b)});
const COLS=[['ground','底'],['paper','纸'],['ink','墨'],['c1','色1'],['c2','色2'],['c3','色3'],['c4','色4']];
const TCOLS=[['paper','浅色字 / 纸'],['ink','深色字 / 墨']];
const colw=$('colors'); TCOLS.forEach(([k,l])=>{const lb=document.createElement('label'); const i=document.createElement('input'); i.type='color'; i.id='c-'+k; i.oninput=()=>{S.pal[k]=i.value; S.pal.name='自定义'; syncChips()}; lb.appendChild(i); lb.append(l); colw.appendChild(lb)});
// sliders
const SL=[['count','格子数',3,28],['textMix','文字 %',0,80],['plainMix','纯色块 %',0,80],['cols','列数',3,16],['rows','行数',2,14],['variance','大小差异',0,100],['bias','竖 ↔ 横',-100,100],['gutter','间距',0,48],['pad','外边距',0,120],['radius','圆角',0,80]];
const slw=$('sliders'), slw2=$('sliders2'); SL.forEach(([k,l,mn,mx],si)=>{const d=document.createElement('div'); d.className='mini'; d.innerHTML=`<span>${l}<output id="o-${k}"></output></span><input type="range" id="s-${k}" min="${mn}" max="${mx}" step="1" aria-label="${l}">`; (si<3?slw:slw2).appendChild(d);
  const i=d.querySelector('input'); i.oninput=()=>{if(k!=='radius') morph(); S[k]=+i.value; $('o-'+k).textContent=i.value}});
// text
['title','lines'].forEach(k=>{const i=$('t-'+k); i.oninput=()=>{S.text[k]=i.value; loadFonts()}});
// image
$('file').onchange=()=>{const f=$('file').files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{const im=new Image(); im.onload=()=>{G.setImage(im); hasImg=true; morph(); S.hero='image'; sync(); ['thumb','thumb2'].forEach(id=>{$(id).src=r.result}); $('thumb').hidden=false; $('clear').hidden=false; $('imgRow').hidden=false}; im.src=r.result}; r.readAsDataURL(f)};
function clearImg(){G.setImage(null); hasImg=false; morph(); if(S.hero==='image') S.hero='type'; sync(); $('thumb').hidden=true; $('clear').hidden=true; $('imgRow').hidden=true; $('file').value=''}
$('clear').onclick=clearImg; $('clear2').onclick=clearImg;
// motion
$('shuffle').onchange=e=>{S.shuffle=e.target.checked};
$('dur').oninput=e=>{S.dur=+e.target.value; $('o-dur').textContent=S.dur+'s'};
$('grain').oninput=e=>{S.grain=e.target.value/100; $('o-grain').textContent=e.target.value};
// actions
$('rand').onclick=drawOne;
$('relay').onclick=()=>{pushUndo(); morph(); closePop(); S.seed+=2; S.cseed+=3; S.cells=null; sync()};
$('play').onclick=()=>{if(playing){tPause=curT(); playing=false} else {t0=performance.now()-tPause*1000; playing=true} $('play').textContent=playing?'❚❚':'▶'};
$('scrub').oninput=()=>{playing=false; $('play').textContent='▶'; tPause=$('scrub').value/1000*S.dur};
function syncChips(){pre.querySelectorAll('.sw').forEach(b=>{const p=G.PRESETS[b.dataset.v]; b.setAttribute('aria-pressed',COLS.every(([k])=>p[k].toLowerCase()===S.pal[k].toLowerCase()))})}
function sync(){setTimeout(paintRanges,0);
  asp.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===S.aspect));
  $('style').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===S.style));
  const hk=S.hero==='auto'?['type','arch','sun','stack'][S.seed%4]:S.hero; $('hero').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===hk));
  TCOLS.forEach(([k])=>{$('c-'+k).value=S.pal[k]}); FK.forEach(k=>{$('f-'+k).value=S.pal[k]}); syncChips();
  SL.forEach(([k])=>{$('s-'+k).value=S[k]; $('o-'+k).textContent=S[k]});
  const sp=$('strip').children; FK.forEach((k,j)=>{sp[j].style.background=S.pal[k]}); const mk=$('mark').children; ['c1','c2','c3','c4'].forEach((k,j)=>{mk[j].style.background=S.pal[k]});
  ['title','lines'].forEach(k=>{if(document.activeElement!==$('t-'+k)) $('t-'+k).value=S.text[k]});
}
function loadFonts(){const s=JSON.stringify(S.text)+'%·'; return Promise.all([document.fonts.load('900 100px InterD'),document.fonts.load('900 100px PoppinsT'),document.fonts.load('900 100px "Noto Sans SC"',s),document.fonts.load('500 100px "Noto Sans SC"',s)]).catch(()=>{})}
function fit(){const st=cv.parentElement; const cs=getComputedStyle(st); const bw=st.clientWidth-(window.innerWidth<=1000?28:44), bh=window.innerWidth<=1000?window.innerHeight*0.7:st.clientHeight-44; const [w,h]=G.size(); const k=Math.min(bw/w,bh/h); cv.style.width=Math.floor(w*k)+'px'; cv.style.height=Math.floor(h*k)+'px'}
window.addEventListener('resize',fit);
let lastAsp='';
function loop(){if(S.aspect!==lastAsp){lastAsp=S.aspect; requestAnimationFrame(fit)} if(!exporting){const t=curT(); G.render(ctx,t,{now:performance.now(),live:true}); if(document.activeElement!==$('scrub')){$('scrub').value=Math.round(t/S.dur*1000); $('scrub').style.setProperty('--p',(t/S.dur*100)+'%')} $('time').textContent=`${t.toFixed(1)}s`} drawOverlay(); requestAnimationFrame(loop)}
$('play').textContent=playing?'❚❚':'▶';
// saving: artifact viewer -> downloads capability, standalone file -> link
let dl=null; if(window.claude&&window.claude.use) window.claude.use('downloads').then(d=>{dl=d}).catch(()=>{});
async function saveFile(name,blob){if(dl){try{await dl.save({filename:name,data:blob}); return 'saved'}catch(e){if(e&&e.code==='declined') return 'declined'; throw e}}
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove()},4000); return 'saved'}
const st=$('status'), prog=$('prog');
function stamp(){const d=new Date(); return `${d.getMonth()+1}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`}
$('png').onclick=async()=>{await loadFonts(); G.render(ctx,curT()); const blob=await new Promise(r=>cv.toBlob(r,'image/png')); try{const r=await saveFile(`动真格_${S.aspect.replace(':','x')}_${stamp()}.png`,blob); st.textContent=r==='saved'?'已导出当前帧。':'已取消保存。'}catch(e){st.textContent='导出失败：'+(e.message||e.code)}};
$('mp4').onclick=async()=>{
  if(exporting) return; if(!window.VideoEncoder){st.textContent='这个浏览器不支持逐帧编码，请换用 Chrome 或 Edge。'; return}
  await loadFonts(); exporting=true; $('mp4').disabled=true; prog.style.width='0%';
  try{
    const [W,H]=G.size(), fps=60, n=Math.round(S.dur*fps);
    let cfg=null; for(const c of ['avc1.64002A','avc1.640028','avc1.4D402A','avc1.42E01F']){const k={codec:c,width:W,height:H,bitrate:18e6,framerate:fps,avc:{format:'avc'}}; try{if((await VideoEncoder.isConfigSupported(k)).supported){cfg=k;break}}catch(e){}}
    if(!cfg) throw new Error('这个浏览器不支持 H.264 编码。');
    const mux=new MiniMP4.Muxer(W,H,fps); let err=null; const enc=new VideoEncoder({output:(c,m)=>mux.add(c,m),error:e=>{err=e}}); enc.configure(cfg);
    for(let i=0;i<n;i++){if(err) throw err; G.render(ctx,i/fps); const fr=new VideoFrame(cv,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)}); enc.encode(fr,{keyFrame:i%120===0}); fr.close();
      while(enc.encodeQueueSize>8) await new Promise(r=>setTimeout(r,4));
      if(i%6===0){prog.style.width=(i/n*100).toFixed(1)+'%'; st.textContent=`正在编码第 ${i} / ${n} 帧`; await new Promise(r=>setTimeout(r,0))}}
    await enc.flush(); enc.close(); const blob=mux.finish(); prog.style.width='100%';
    const r=await saveFile(`动真格_${S.aspect.replace(':','x')}_${stamp()}.mp4`,blob);
    st.textContent=r==='saved'?`已导出 MP4（${(blob.size/1048576).toFixed(1)} MB）。`:'已取消保存，视频没有存下来。';
  }catch(e){st.textContent='导出失败：'+(e.message||e.code||e)}
  exporting=false; $('mp4').disabled=false;
};
// tabs
$('tabs').querySelectorAll('button').forEach((b,bi)=>b.onclick=()=>{$('tabs').style.setProperty('--i',bi);$('tabs').querySelectorAll('button').forEach(x=>{x.setAttribute('aria-selected',x===b); $(x.dataset.p).hidden=x!==b})});
// space = draw
document.addEventListener('keydown',e=>{if(e.code!=='Space') return; const tg=e.target; if(tg&&(tg.tagName==='INPUT'||tg.tagName==='TEXTAREA'||tg.tagName==='BUTTON'||tg.isContentEditable)) return; e.preventDefault(); drawOne()});
$('tool').onclick=async()=>{try{const r=await saveFile('动真格.html',new Blob(['<!doctype html>\n'+document.documentElement.outerHTML],{type:'text/html'})); st.textContent=r==='saved'?'已下载，双击用浏览器打开就能用。':'已取消保存。'}catch(e){st.textContent='下载失败：'+(e.message||e.code)}};


// ---- five-colour picker + import
const FK=['ground','c1','c2','c3','c4'];
const hx=h=>{h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16))};
const toH=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const lumi=h=>{const [r,g,b_]=hx(h).map(v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return 0.2126*r+0.7152*g+0.0722*b_};
const mix=(a,b_,t)=>{const A=hx(a),B=hx(b_); return toH(A.map((v,i)=>v+(B[i]-v)*t))};
function fromFive(cols,name){
  const c=cols.slice(0,5); while(c.length<5){const base=c[c.length-1]||'#FF6F59'; c.push(mix(base,c.length%2?'#ffffff':'#000000',0.35))}
  const byL=c.slice().sort((a,b_)=>lumi(a)-lumi(b_));
  const dark=byL[0], light=byL[4];
  const ink=lumi(dark)<0.06?dark:mix(dark,'#0b0b10',0.75);
  const paper=lumi(light)>0.75?light:mix(light,'#ffffff',0.85);
  return {name:name||'自选',ground:c[0],c1:c[1],c2:c[2],c3:c[3],c4:c[4],paper,ink};
}
const five=$('five');
FK.forEach((k,idx)=>{const lb=document.createElement('label'); const i=document.createElement('input'); i.type='color'; i.id='f-'+k; i.setAttribute('aria-label',idx?'格子色 '+idx:'底色');
  i.oninput=()=>{const cols=FK.map(q=>$('f-'+q).value); const keep={paper:S.pal.paper,ink:S.pal.ink}; S.pal=fromFive(cols,'自选'); if(S.pal.__lockText) Object.assign(S.pal,keep); sync()};
  lb.appendChild(i); five.appendChild(lb)});
$('fShuffle').onclick=()=>{pushUndo(); const cols=FK.map(q=>S.pal[q]); cols.push(cols.shift()); S.pal=Object.assign(fromFive(cols,S.pal.name),{}); sync()};
// my palettes (this browser only)
let MINE=[]; try{MINE=JSON.parse(localStorage.getItem('gedong-mine')||'[]')}catch(e){MINE=[]}
function saveMine(){try{localStorage.setItem('gedong-mine',JSON.stringify(MINE.slice(0,24)))}catch(e){}}
function renderMine(){const m=$('mine'); m.innerHTML=''; $('mineGrp').hidden=!MINE.length;
  MINE.forEach((p,idx)=>{const b_=document.createElement('button'); b_.type='button'; b_.className='sw'; b_.title=p.name; b_.setAttribute('aria-label','我的色卡 '+(idx+1)); b_.innerHTML=FK.map(k=>`<i style="background:${p[k]}"></i>`).join('');
    b_.onclick=()=>{pushUndo(); S.pal=Object.assign({},p); sync()};
    b_.oncontextmenu=e=>{e.preventDefault(); MINE.splice(idx,1); saveMine(); renderMine()};
    m.appendChild(b_)})}
$('fSave').onclick=()=>{MINE.unshift(Object.assign({},S.pal,{name:'我的色卡'})); saveMine(); renderMine(); $('impMsg').textContent='已存入，右键可删除。'};
function applyImport(cols,src){if(!cols.length){$('impMsg').textContent='没有找到色号。'; return} pushUndo(); morph(); S.pal=fromFive(cols,'导入'); sync(); $('impMsg').textContent=`已从${src}导入 ${Math.min(cols.length,5)} 色。`}
$('impGo').onclick=()=>{const t=$('impText').value; const m=t.match(/#?\b([0-9a-f]{6}|[0-9a-f]{3})\b/gi)||[]; applyImport(m.map(s=>'#'+s.replace('#','')),'色号')};
$('impText').onkeydown=e=>{if(e.key==='Enter') $('impGo').click()};
$('impImg').onchange=()=>{const f=$('impImg').files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{const im=new Image(); im.onload=()=>{
  const c=document.createElement('canvas'); const k=Math.min(1,96/Math.max(im.width,im.height)); c.width=Math.max(1,Math.round(im.width*k)); c.height=Math.max(1,Math.round(im.height*k)); const g=c.getContext('2d'); g.drawImage(im,0,0,c.width,c.height);
  const d=g.getImageData(0,0,c.width,c.height).data; const px=[]; for(let i=0;i<d.length;i+=4){if(d[i+3]>200) px.push([d[i],d[i+1],d[i+2]])}
  // k-means, then pick 5 distinct centres by size; most common one becomes the ground
  const K=10; let cen=[]; for(let i=0;i<K;i++) cen.push(px[Math.floor((i+0.5)/K*px.length)]||[128,128,128]);
  let lab=new Array(px.length).fill(0);
  for(let it=0;it<12;it++){px.forEach((p,i)=>{let bi=0,bd=1e9; cen.forEach((q,j)=>{const dd=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2; if(dd<bd){bd=dd;bi=j}}); lab[i]=bi});
    const s=cen.map(()=>[0,0,0,0]); px.forEach((p,i)=>{const a=s[lab[i]]; a[0]+=p[0];a[1]+=p[1];a[2]+=p[2];a[3]++}); cen=s.map((a,j)=>a[3]?[a[0]/a[3],a[1]/a[3],a[2]/a[3]]:cen[j])}
  const cnt=cen.map((_,j)=>lab.filter(v=>v===j).length); const sat=q=>(Math.max(...q)-Math.min(...q))/255; const sc=cen.map((q,j)=>cnt[j]*(0.35+sat(q)*2.5)); const ord=[...cen.keys()].sort((a,b_)=>sc[b_]-sc[a]);
  const out=[]; for(const j of ord){const q=cen[j]; if(out.every(o=>Math.hypot(o[0]-q[0],o[1]-q[1],o[2]-q[2])>75)) out.push(q); if(out.length===5) break}
  applyImport(out.map(toH),'图片'); $('impImg').value=''}; im.src=r.result}; r.readAsDataURL(f)};
renderMine();


function paintRanges(){document.querySelectorAll('input[type=range]').forEach(el=>{const p=(el.value-el.min)/(el.max-el.min)*100; el.style.setProperty('--p',p+'%')})}
document.addEventListener('input',e=>{if(e.target.type==='range') paintRanges()});
// ---- per-cell editing
const TXN=G.TXL; const DN={letter:'大字母',plain:'纯色块',halftone:'点阵渐变',lens:'网格镜片',bands:'彩条',dial:'仪表',swatch:'色条',dots:'圆点',shape:'变形图形',stripes:'斜纹',face:'表情 / 箭头',sparkle:'星星',checker:'棋盘格',wave:'波浪'};
const TN=Object.assign({},...Object.entries(TXN).map(([k,v])=>({['tx:'+k]:v.name})),DN);
const HN={type:'大字',arch:'彩虹',sun:'太阳',stack:'几何',image:'图片'};
let SEL=-1, SWAP=-1;
const stage=cv.parentElement, ov=$('ov'), pop=$('pop'), selbox=$('selbox');
function canvasBox(){const sr=stage.getBoundingClientRect(), cr=cv.getBoundingClientRect(); return {x:cr.left-sr.left,y:cr.top-sr.top,k:cr.width/cv.width}}
function hit(e){const cr=cv.getBoundingClientRect(); const x=(e.clientX-cr.left)*cv.width/cr.width, y=(e.clientY-cr.top)*cv.height/cr.height; const R=G.getRects();
  let best=-1, ba=1e18; R.forEach((r,i)=>{if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){const a=r.w*r.h; if(a<ba){ba=a;best=i}}}); return best}
function over(i){return S.over[i]||(S.over[i]={})}
function setOver(i,patch){pushUndo(); Object.assign(over(i),patch); syncPop()}
cv.addEventListener('click',e=>{if(cv.__skipClick) return; const i=hit(e); if(i<0) return;
  if(SWAP>=0){if(i!==SWAP){pushUndo(); const ty=G.getTypes(), fi=G.getFills(); const a=Object.assign({},S.over[SWAP]||{}), b_=Object.assign({},S.over[i]||{});
      S.over[SWAP]=Object.assign(b_,{type:ty[i],fill:fi[i]}); S.over[i]=Object.assign(a,{type:ty[SWAP],fill:fi[SWAP]}); SEL=i}
    SWAP=-1; stage.classList.remove('swapping'); openPop(SEL); return}
  openPop(i)});
function openPop(i){flashTx(i); SEL=i; pop.hidden=false; $('popFields').dataset.for=''; syncPop()}
function closePop(){SEL=-1; SWAP=-1; stage.classList.remove('swapping'); pop.hidden=true; selbox.hidden=true}
$('popClose').onclick=closePop;
document.addEventListener('keydown',e=>{if(e.key==='Escape') closePop()});
function syncPop(){if(SEL<0) return; const ty=G.getTypes()[SEL], fi=G.getFills()[SEL]; const isHero=ty==='prod'; const o=S.over[SEL]||{};
  $('popTitle').textContent=isHero?'主视觉格':(TN[ty]||'格子');
  const sel=$('popType'); sel.innerHTML='';
  if(isHero){Object.entries(HN).forEach(([k,v])=>{if(k==='image'&&!hasImg) return; const op=document.createElement('option'); op.value='hero:'+k; op.textContent=v; sel.appendChild(op)}); sel.value='hero:'+(S.hero==='auto'?'type':S.hero)}
  else {const g1=document.createElement('optgroup'); g1.label='文字板式'; Object.entries(TXN).forEach(([k,v])=>{const op=document.createElement('option'); op.value='tx:'+k; op.textContent=v.name; g1.appendChild(op)}); sel.appendChild(g1);
    const g2=document.createElement('optgroup'); g2.label='图形装饰'; Object.entries(DN).forEach(([k,v])=>{const op=document.createElement('option'); op.value=k; op.textContent=v; g2.appendChild(op)}); sel.appendChild(g2);
    const g3=document.createElement('optgroup'); g3.label='其他'; const op=document.createElement('option'); op.value='prod'; op.textContent='设为主视觉'; g3.appendChild(op); sel.appendChild(g3); sel.value=ty}
  const isTx=!isHero&&ty.startsWith('tx:'); $('popText').hidden=!isTx;
  if(isTx){const l=ty.slice(3); const cur=G.txContent(l,SEL); const pf=$('popFields');
    if(pf.dataset.for!==SEL+'|'+ty){pf.innerHTML=''; pf.dataset.for=SEL+'|'+ty;
      TXN[l].f.forEach(([k,lab,multi])=>{const lb=document.createElement('label'); lb.className='f'; lb.textContent=lab; const inp=document.createElement(multi?'textarea':'input'); if(!multi) inp.type='text'; inp.id='pf-'+k; inp.value=cur[k]||'';
        inp.addEventListener('focus',()=>{if(!inp.__u){pushUndo(); inp.__u=1}}); inp.addEventListener('blur',()=>{inp.__u=0});
        inp.oninput=()=>{const o=over(SEL); o.txt=Object.assign({},o.txt||{},{[k]:inp.value}); loadFonts()}; lb.appendChild(inp); pf.appendChild(lb)})}
    $('popAlign').querySelectorAll('button').forEach(bt=>bt.setAttribute('aria-pressed',String((o.al||'')===bt.dataset.v)));
    $('popSize').querySelectorAll('button').forEach(bt=>bt.setAttribute('aria-pressed',String(String(o.sz||0)===bt.dataset.v)))}
  const pc=$('popCols'); pc.innerHTML=''; ['ground','paper','ink','c1','c2','c3','c4'].forEach(k=>{const c=S.pal[k]; const bt=document.createElement('button'); bt.type='button'; bt.style.background=c; bt.setAttribute('aria-label','颜色 '+k); bt.setAttribute('aria-pressed',String(c.toLowerCase()===String(fi).toLowerCase())); bt.onclick=()=>setOver(SEL,{fill:c}); pc.appendChild(bt)});
  $('popLock').setAttribute('aria-pressed',String(!!o.lock)); $('popLock').textContent=o.lock?'已锁定':'锁定';
  $('popHint').textContent=SWAP>=0?'再点另一格完成交换（Esc 取消）':(o.lock?'抽卡时这一格会保持现在的内容和颜色。':'');
}
$('popAlign').querySelectorAll('button').forEach(bt=>bt.onclick=()=>setOver(SEL,{al:bt.dataset.v||undefined}));
$('popSize').querySelectorAll('button').forEach(bt=>bt.onclick=()=>setOver(SEL,{sz:+bt.dataset.v}));
$('popType').onchange=e=>{const v=e.target.value; if(v.startsWith('hero:')){pushUndo(); morph(); S.hero=v.slice(5); sync(); syncPop(); return}
  if(v==='prod'){pushUndo(); const ty=G.getTypes(); const old=ty.indexOf('prod'); if(old>=0) over(old).type=G.baseTypes()[SEL]==='prod'?'plain':(G.baseTypes()[SEL]||'plain'); over(SEL).type='prod'; syncPop(); return}
  setOver(SEL,{type:v})};
$('popNext').onclick=()=>{const ty=G.getTypes()[SEL]; if(ty==='prod'){const ks=Object.keys(HN).filter(k=>k!=='image'||hasImg); const cur=S.hero==='auto'?'type':S.hero; pushUndo(); S.hero=ks[(ks.indexOf(cur)+1)%ks.length]; sync(); syncPop(); return}
  const pool=Object.keys(TN).filter(k=>k!==ty); setOver(SEL,{type:pool[Math.floor(Math.random()*pool.length)]})};
$('popLock').onclick=()=>{const ty=G.getTypes()[SEL], fi=G.getFills()[SEL]; const o=S.over[SEL]||{}; if(o.lock) setOver(SEL,{lock:false}); else setOver(SEL,{lock:true,type:ty,fill:fi})};
$('popSwap').onclick=()=>{SWAP=SEL; stage.classList.add('swapping'); syncPop()};
$('popReset').onclick=()=>{pushUndo(); delete S.over[SEL]; $('popFields').dataset.for=''; syncPop()};

// ---- text pane: one card per text cell, matching the poster's own hierarchy
const LV={k:['lv-k','眉题'],h:['lv-h','主标题'],s:['lv-s','副标题'],b:['lv-b','正文']};
const LVSPEC={stat:{h:['lv-h','数字'],s:['lv-s','说明']},cta:{h:['lv-btn','按钮']},badge:{h:['lv-s','徽章']},ticker:{h:['lv-s','滚动']},vert:{h:['lv-h','竖排']},promo:{k:['lv-btn','按钮']},quote:{s:['lv-b','署名']},body:{h:['lv-s','小标题']}};
let HOV=-1, txKey='';
const txl=$('txlist');
function autoH(el){if(el.tagName==='TEXTAREA'){el.style.height='auto'; el.style.height=el.scrollHeight+2+'px'}}
function txCells(){const ty=G.getTypes(), cells=G.getCells(); const out=[];
  ty.forEach((t,i)=>{if(t&&t.startsWith('tx:')&&TXN[t.slice(3)]) out.push({i,l:t.slice(3)}); else if(t==='prod'&&G.heroKind()==='type') out.push({i,l:'@hero'})});
  out.sort((a,b_)=>{const A=cells[a.i]||{x:0,y:0},B=cells[b_.i]||{x:0,y:0}; return (A.y-B.y)||(A.x-B.x)}); return out}
function buildTx(){if($('p-text').hidden) return; if(txl.contains(document.activeElement)) return;
  const L=txCells(); const fi=G.getFills(); const key=JSON.stringify([L,S.text,L.map(c=>(S.over[c.i]||{}).txt||0),fi]); if(key===txKey) return; txKey=key;
  txl.innerHTML=''; if(!L.length){txl.innerHTML='<p class="hint">这张没有文字格。点画面上任意一格，把它换成文字板式。</p>'; return}
  L.forEach(({i,l})=>{const c=document.createElement('div'); c.className='txc'; c.dataset.i=i;
    const name=l==='@hero'?'主视觉大字':TXN[l].name;
    c.innerHTML=`<div class="txh"><i style="background:${fi[i]}"></i><span>${name}</span><button type="button">更多设置</button></div>`;
    c.querySelector('button').onclick=()=>openPop(i);
    const fields=l==='@hero'?[['h','主标题',1]]:TXN[l].f; const cur=l==='@hero'?{h:S.text.title}:G.txContent(l,i);
    fields.forEach(([k,lab,multi])=>{const [cls,tag]=(LVSPEC[l]&&LVSPEC[l][k])||LV[k]; const row=document.createElement('label'); row.className='lvf '+cls; row.innerHTML=`<em>${tag}</em>`; row.title=lab;
      const inp=document.createElement(multi?'textarea':'input'); if(!multi) inp.type='text'; else inp.rows=1; inp.value=cur[k]||''; inp.setAttribute('aria-label',name+' · '+lab);
      inp.addEventListener('focus',()=>{if(!inp.__u){pushUndo(); inp.__u=1}}); inp.addEventListener('blur',()=>{inp.__u=0; txKey=''});
      inp.oninput=()=>{autoH(inp); if(l==='@hero'){S.text.title=inp.value; sync()} else {const o=over(i); o.txt=Object.assign({},o.txt||{},{[k]:inp.value}); if(SEL===i){$('popFields').dataset.for=''; syncPop()}} loadFonts()};
      row.appendChild(inp); c.appendChild(row)});
    c.onmouseenter=()=>{HOV=i; c.classList.add('on')}; c.onmouseleave=()=>{HOV=-1; c.classList.remove('on')};
    c.addEventListener('focusin',()=>{HOV=i; c.classList.add('on')}); c.addEventListener('focusout',()=>{HOV=-1; c.classList.remove('on')});
    txl.appendChild(c)});
  txl.querySelectorAll('textarea').forEach(autoH)}
function flashTx(i){if($('p-text').hidden) return; buildTx(); const c=txl.querySelector(`.txc[data-i="${i}"]`); if(!c) return; c.scrollIntoView({block:'nearest',behavior:'smooth'}); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash')}
setInterval(buildTx,250);
// overlay follows the animated cells
let pins=[];
function drawOverlay(){const R=G.getRects(); const b_=canvasBox();
  if(SEL>=0&&R[SEL]){const r=R[SEL]; selbox.hidden=false; Object.assign(selbox.style,{left:(b_.x+r.x*b_.k-3)+'px',top:(b_.y+r.y*b_.k-3)+'px',width:(r.w*b_.k+6)+'px',height:(r.h*b_.k+6)+'px'});
    const pw=272, ph=pop.offsetHeight||260; let px=b_.x+(r.x+r.w)*b_.k+10, py=b_.y+r.y*b_.k; if(px+pw>stage.clientWidth-6) px=b_.x+r.x*b_.k-pw-10; if(px<6) px=Math.min(stage.clientWidth-pw-6,b_.x+r.x*b_.k+10); py=Math.max(6,Math.min(py,stage.clientHeight-ph-6));
    pop.style.left=px+'px'; pop.style.top=py+'px'} else selbox.hidden=true;
  const hb=$('hovbox'); if(HOV>=0&&HOV!==SEL&&R[HOV]){const r=R[HOV]; hb.hidden=false; Object.assign(hb.style,{left:(b_.x+r.x*b_.k-3)+'px',top:(b_.y+r.y*b_.k-3)+'px',width:(r.w*b_.k+6)+'px',height:(r.h*b_.k+6)+'px'})} else hb.hidden=true;
  const L=Object.entries(S.over).filter(([i,o])=>o&&o.lock).map(([i])=>+i);
  while(pins.length<L.length){const d=document.createElement('div'); d.className='lockpin'; d.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>'; ov.appendChild(d); pins.push(d)}
  pins.forEach((d,k)=>{const i=L[k]; if(i===undefined||!R[i]){d.hidden=true; return} d.hidden=false; d.style.left=(b_.x+(R[i].x+R[i].w)*b_.k-26)+'px'; d.style.top=(b_.y+R[i].y*b_.k+4)+'px'})}


// ---- resize cells by dragging the gaps between them
const EDGE=12; let DRAG=null, downPt=null;
function toCanvas(e){const cr=cv.getBoundingClientRect(); return {x:(e.clientX-cr.left)*cv.width/cr.width, y:(e.clientY-cr.top)*cv.height/cr.height, k:cr.width/cv.width}}
function findEdge(pt){const cells=G.getCells(); const px=cells.map(c=>G.cellPx(c)); const tol=EDGE/pt.k; const g=S.gutter;
  for(let i=0;i<cells.length;i++){const r=px[i];
    const inY=pt.y>r.y-tol&&pt.y<r.y+r.h+tol, inX=pt.x>r.x-tol&&pt.x<r.x+r.w+tol;
    if(inY&&Math.abs(pt.x-(r.x+r.w+g/2))<tol+g/2&&cells[i].x+cells[i].w<S.cols-0.01) return {dir:'v',line:cells[i].x+cells[i].w,seed:i,cells};
    if(inX&&Math.abs(pt.y-(r.y+r.h+g/2))<tol+g/2&&cells[i].y+cells[i].h<S.rows-0.01) return {dir:'h',line:cells[i].y+cells[i].h,seed:i,cells}}
  return null}
const near=(a,b_)=>Math.abs(a-b_)<0.001;
function edgeGroup(E){const c=E.cells; const v=E.dir==='v'; const A=[],B=[]; // A: cells ending at the line, B: cells starting at it
  let lo=v?c[E.seed].y:c[E.seed].x, hi=lo+(v?c[E.seed].h:c[E.seed].w); let changed=true; const inA=new Set([E.seed]), inB=new Set();
  while(changed){changed=false; c.forEach((q,i)=>{const s0=v?q.y:q.x, s1=s0+(v?q.h:q.w); if(s1<=lo+0.001||s0>=hi-0.001) return;
    if(!inA.has(i)&&near(v?q.x+q.w:q.y+q.h,E.line)){inA.add(i); changed=true} if(!inB.has(i)&&near(v?q.x:q.y,E.line)){inB.add(i); changed=true}
    if(inA.has(i)||inB.has(i)){if(s0<lo-0.001){lo=s0; changed=true} if(s1>hi+0.001){hi=s1; changed=true}}})}
  return {A:[...inA],B:[...inB]}}
cv.addEventListener('pointermove',e=>{if(DRAG){const pt=toCanvas(e); const u=G.unit(); const v=DRAG.dir==='v'; const d=((v?pt.x:pt.y)-DRAG.start)/(v?u.ux:u.uy);
    let nl=Math.round((DRAG.line+d)*4)/4; const c=DRAG.orig; let mn=-1e9, mx=1e9;
    DRAG.g.A.forEach(i=>{mn=Math.max(mn,(v?c[i].x:c[i].y)+0.5)}); DRAG.g.B.forEach(i=>{mx=Math.min(mx,(v?c[i].x+c[i].w:c[i].y+c[i].h)-0.5)}); nl=Math.max(mn,Math.min(mx,nl));
    const cells=c.map(q=>Object.assign({},q)); DRAG.g.A.forEach(i=>{if(v) cells[i].w=nl-cells[i].x; else cells[i].h=nl-cells[i].y}); DRAG.g.B.forEach(i=>{if(v){const r=cells[i].x+cells[i].w; cells[i].x=nl; cells[i].w=r-nl} else {const r=cells[i].y+cells[i].h; cells[i].y=nl; cells[i].h=r-nl}});
    G.setCells(cells); DRAG.moved=true; return}
  const E=SWAP<0?findEdge(toCanvas(e)):null; cv.style.cursor=E?(E.dir==='v'?'col-resize':'row-resize'):''});
cv.addEventListener('pointerdown',e=>{downPt=[e.clientX,e.clientY]; const pt=toCanvas(e); const E=SWAP<0?findEdge(pt):null; if(!E) return;
  pushUndo(); const g=edgeGroup(E); DRAG={dir:E.dir,line:E.line,start:E.dir==='v'?pt.x:pt.y,orig:E.cells,g,moved:false}; cv.setPointerCapture(e.pointerId);
  playing=false; tPause=Math.max(tPause,Math.min(S.dur*0.45,G.shuffleT()-0.05)); if(S.shuffle&&tPause<2.2) tPause=2.2; $('play').textContent='▶'; e.preventDefault()});
cv.addEventListener('pointerup',e=>{if(DRAG){const m=DRAG.moved; DRAG=null; if(!m) UNDO.pop(); cv.__skipClick=true; setTimeout(()=>{cv.__skipClick=false},0)}});

// ---- undo stack
const UNDO=[]; function pushUndo(){UNDO.push(G.getStyle()); if(UNDO.length>30) UNDO.shift(); $('undo').disabled=false}
$('undo').onclick=()=>{const s=UNDO.pop(); if(!s) return; morph(); G.setStyle(s); sync(); if(SEL>=0) syncPop(); $('undo').disabled=!UNDO.length};
// ---- one-tap draw
function roll(r){return r<0.06?'SSR':r<0.2?'SR':r<0.5?'R':'N'}
function drawOne(){
  pushUndo(); const tier=roll(Math.random()); t0=performance.now(); tPause=0; playing=true; $('play').textContent='❚❚';
  const lk=G.lockedCount(); G.drawBest(Math.floor(Math.random()*1e9),{tier,keepPal:$('keepPal').checked}); sync(); loadFonts(); if(SEL>=0) syncPop();
  const d=$('draw'); d.hidden=false; d.dataset.tier=tier; $('dTier').textContent=tier;
  $('dName').textContent=`${S.pal.name||'自定义'} · ${({cute:'可爱',spec:'规整',chaos:'混乱'})[S.style]}`+(lk?` · 保留 ${lk} 格`:'');
  d.style.animation='none'; void d.offsetWidth; d.style.animation='';
  const stp=$('strip'); stp.classList.remove('go'); void stp.offsetWidth; stp.classList.add('go');
  const rs=$('result'); rs.dataset.tier=tier; rs.innerHTML=`<b>${tier}</b>`; rs.append($('dName').textContent);
  clearTimeout(window.__bt); window.__bt=setTimeout(()=>{d.hidden=true},2600);
}
G.drawBest(20261108,{tier:'SSR'}); sync(); loadFonts().then(()=>{requestAnimationFrame(loop)});
})();
