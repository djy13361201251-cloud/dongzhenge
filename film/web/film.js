// 动真格 · 口播成片导演脚本 v2
// 海报是主角：卖点写在海报里（大标题 / 滚动字 / 按钮），人脸只是右上角的一格。
// 逐帧调用 FILM.frame(n) → 第 n 帧（30fps，1080×1920）。卡点时间全部来自 words.json（逐字时间）。
(function(){
const G=window.GRIDKIT, S=G.S, W=1080, H=1920, FPS=30;
const pc=document.createElement('canvas'); pc.width=W; pc.height=H; const pctx=pc.getContext('2d');
const out=document.createElement('canvas'); out.width=W; out.height=H; const octx=out.getContext('2d');
let WORDS=[];

// ---------------------------------------------------------------- 找词
const norm=s=>String(s).replace(/[，。,.、！？!?\s]/g,'');
function at(txt,after=0,end=false){
  const want=norm(txt);
  for(let i=0;i<WORDS.length;i++){
    if(WORDS[i].start<after-1e-6) continue;
    let acc='';
    for(let j=i;j<WORDS.length;j++){
      acc+=norm(WORDS[j].word);
      if(acc.length>=want.length){ if(acc.startsWith(want)) return end?WORDS[j].end:WORDS[i].start; break }
      if(!want.startsWith(acc)) break;
    }
  }
  throw new Error('找不到词：'+txt+' @'+after);
}

// ---------------------------------------------------------------- 文案
const HEAD=['不用 AE','丝滑动效','一键生成'];
const TICK='NO AE NEEDED · SMOOTH MOTION · ONE-TAP POSTER · TRY IT NOW · TAP TO SWITCH';
const CTA='立即尝试';
const EVENT={title:'PRIVATE\nVIEW', date:'08 NOV · SAT', place:'WEST BUND · SHANGHAI', note:'BY INVITATION', cta:'RSVP NOW'};

// ---------------------------------------------------------------- 版式（6 列 × 12 行；最下 2 行留给后期字幕 → 只放低信息量图形）
const L={
  A:[{r:[0,0,4,3],role:'head',f:'paper'},{r:[4,0,2,3],role:'face'},
     {r:[0,3,6,1],role:'tick',f:'c1'},
     {r:[0,4,2,3],role:'dial',f:'c2'},{r:[2,4,4,3],role:'halftone',f:'c3'},
     {r:[0,7,3,3],role:'cta',f:'c4'},{r:[3,7,3,3],role:'dots',f:'c2'},
     {r:[0,10,6,2],role:'bands',f:'c1'}],
  B:[{r:[0,0,2,3],role:'face'},{r:[2,0,4,3],role:'head',f:'paper'},
     {r:[0,3,3,4],role:'lens',f:'c3'},{r:[3,3,3,2],role:'cta',f:'c1'},{r:[3,5,3,2],role:'sparkle',f:'c2'},
     {r:[0,7,6,1],role:'tick',f:'c4'},
     {r:[0,8,2,2],role:'shape',f:'c2'},{r:[2,8,4,2],role:'stripes',f:'c3'},
     {r:[0,10,6,2],role:'checker',f:'c1'}],
  C:[{r:[0,0,6,1],role:'tick',f:'c2'},
     {r:[0,1,4,4],role:'head',f:'paper'},{r:[4,1,2,3],role:'face'},{r:[4,4,2,1],role:'swatch',f:'c3'},
     {r:[0,5,2,5],role:'letter',f:'c1'},{r:[2,5,4,3],role:'halftone',f:'c4'},{r:[2,8,2,2],role:'cta',f:'c3'},{r:[4,8,2,2],role:'dial',f:'c2'},
     {r:[0,10,6,2],role:'wave',f:'c1'}],
  CHAOS:[{r:[0,0,4,2],role:'head',f:'c4'},{r:[4,0,2,3],role:'face'},{r:[0,2,2,2],role:'sparkle',f:'c2'},{r:[2,2,2,2],role:'lens',f:'paper'},
     {r:[0,4,3,2],role:'stripes',f:'c1'},{r:[3,3,3,3],role:'shape',f:'c3'},{r:[0,6,6,1],role:'tick',f:'paper'},
     {r:[0,7,2,3],role:'letter',f:'c3'},{r:[2,7,2,3],role:'cta',f:'c2'},{r:[4,7,2,3],role:'dots',f:'c1'},
     {r:[0,10,3,2],role:'checker',f:'c4'},{r:[3,10,3,2],role:'sparkle',f:'c1'}],
  CUTE:[{r:[0,0,4,4],role:'head',f:'paper'},{r:[4,0,2,3],role:'face'},{r:[4,3,2,1],role:'tick',f:'c1'},
     {r:[0,4,3,4],role:'face_',f:'c2'},{r:[3,4,3,4],role:'dots',f:'c3'},
     {r:[0,8,6,2],role:'cta',f:'c1'},{r:[0,10,6,2],role:'wave',f:'c4'}],
  SPEC:[{r:[0,0,4,4],role:'head',f:'paper'},{r:[4,0,2,3],role:'face'},{r:[4,3,2,1],role:'swatch',f:'c1'},
     {r:[0,4,6,1],role:'tick',f:'c2'},
     {r:[0,5,2,3],role:'dial',f:'paper'},{r:[2,5,2,3],role:'letter',f:'c3'},{r:[4,5,2,3],role:'halftone',f:'paper'},
     {r:[0,8,6,2],role:'cta',f:'ink'},{r:[0,10,6,2],role:'bands',f:'c2'}],
  T:[{r:[0,0,6,3],role:'tx:headline',f:'paper',txt:{h:'动真格'}},
     {r:[0,3,6,2],role:'tx:stack',f:'c1',txt:{h:'风格化动效海报',s:'不用 AE · 一键生成'}},
     {r:[0,5,4,3],role:'tx:body',f:'paper',txt:{h:'三种风格',b:'可爱 · 规整 · 混乱\n抽一张 换版式与配色'}},
     {r:[4,5,2,3],role:'dots',f:'c2'},
     {r:[0,8,4,2],role:'cta',f:'c4'},{r:[4,8,2,2],role:'face_',f:'c3'},
     {r:[0,10,6,2],role:'bands',f:'c2'}],
  P:[{r:[0,0,6,3],role:'head',f:'paper'},{r:[0,3,6,1],role:'tick',f:'c1'},
     {r:[0,4,3,3],role:'swatch',f:'c2'},{r:[3,4,3,3],role:'halftone',f:'c3'},
     {r:[0,7,3,3],role:'photo',f:'paper'},{r:[3,7,3,3],role:'cta',f:'c4'},
     {r:[0,10,6,2],role:'bands',f:'c1'}],
};
const PHOTO_PAL={name:'吸色',ground:'#D7F25B',paper:'#FFFFFF',ink:'#141414',c1:'#FF4FA3',c2:'#2F6BFF',c3:'#FFD43B',c4:'#7B4DFF'};

// ---------------------------------------------------------------- 导演状态
let D, EV=[], evI=0, lastT=-1;
const freshD=()=>({scene:null,restartT:0,sel:[],mode:'grid',zoom:null,drag:null,press:null,dirty:true});
const sceneOf=o=>({layout:o.layout, style:o.style||'spec', pal:o.pal, head:o.head||HEAD[0], mods:{}, swap:null, seed:o.seed||7});

function cellsOf(sc,t){
  const rects=L[sc.layout].map(c=>c.r.slice());
  if(D.drag&&t>=D.drag.t0){
    const {a,b,axis}=D.drag, k=dragK(t);
    if(axis==='x'){ rects[a][2]+=k; rects[b][0]+=k; rects[b][2]-=k } else { rects[a][3]+=k; rects[b][1]+=k; rects[b][3]-=k }
  }
  if(sc.swap){ const [a,b]=sc.swap; const ta=rects[a]; rects[a]=rects[b]; rects[b]=ta }
  return rects;
}
function dragK(t){
  const {t0,t1}=D.drag; const u=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));
  const key=[[0,0],[0.4,1],[0.8,-0.6],[1,0]];
  for(let i=1;i<key.length;i++){ if(u<=key[i][0]){ const A=key[i-1],B=key[i], p=(u-A[0])/(B[0]-A[0]), e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2; return A[1]+(B[1]-A[1])*e } }
  return 0;
}
function applyScene(t){
  const sc=D.scene; if(!sc) return;
  const Ls=L[sc.layout], rects=cellsOf(sc,t);
  const pal=typeof sc.pal==='string'?G.PRESETS[sc.pal]:sc.pal, st=sc.style;
  Object.assign(S,{aspect:'9:16',cols:6,rows:12,count:Ls.length,seed:sc.seed,variance:50,bias:0,shuffle:false,dur:600,
    style:st, pal:Object.assign({},pal),
    gutter:st==='spec'?12:st==='cute'?20:22, pad:st==='chaos'?56:st==='cute'?32:24, radius:st==='spec'?2:st==='cute'?40:18});
  G.setCells(rects.map(r=>({x:r[0],y:r[1],w:r[2],h:r[3]})));
  G.getTypes();
  S.over={};
  Ls.forEach((c,i)=>{
    const m=sc.mods[i]||{}, o=S.over[i]={}, role=m.role||c.role;
    o.fill=S.pal[m.f||c.f||'paper'];
    if(role==='face'){ o.type='img'; o.aid='vo' }
    else if(role==='photo'){ o.type='img'; o.aid='photo' }
    else if(role==='head'){ o.type='tx:headline'; o.txt={h:m.head||sc.head}; o.al=st==='cute'?'c':'l'; o.sz=-1 }
    else if(role==='tick'){ o.type='tx:ticker'; o.txt={h:TICK} }
    else if(role==='cta'){ o.type='tx:cta'; o.txt={h:m.cta||CTA}; o.al=st==='spec'?'l':'c' }
    else if(role==='face_'){ o.type='face' }
    else { o.type=role; if(c.txt||m.txt) o.txt=Object.assign({},c.txt||{},m.txt||{}) }
  });
  D.dirty=false;
}

// ---------------------------------------------------------------- 卡点脚本
function build(){
  EV=[];
  const LEAD=0.1;
  const ev=(t,fn,lead=LEAD)=>EV.push({t:Math.max(0,t-lead),fn});
  const scene=(t,o)=>ev(t,d=>{ d.scene=sceneOf(o); d.restartT=Math.max(0,t-LEAD); d.sel=[]; d.drag=null; d.dirty=true });
  const set=(t,fn)=>ev(t,d=>{ fn(d.scene); d.dirty=true });
  const mod=(t,i,m)=>set(t,sc=>{ sc.mods[i]=Object.assign({},sc.mods[i]||{},m) });
  const sel=(t,...ix)=>ev(t,d=>{ d.sel=ix });
  const press=(t,i)=>ev(t,d=>{ d.press={i,t0:t-LEAD} });
  const idx=(lay,role)=>L[lay].findIndex(c=>c.role===role);

  // ① 开场钩子
  scene(0,{layout:'A',style:'spec',pal:'lemon',head:HEAD[0],seed:3});
  scene(at('丝滑'),{layout:'B',style:'spec',pal:'volt',head:HEAD[1],seed:5});
  scene(at('海报'),{layout:'C',style:'spec',pal:'tomint',head:HEAD[2],seed:9});
  scene(at('粘览'),{layout:'A',style:'cute',pal:'soda',head:HEAD[1],seed:11});
  scene(at('Cloud'),{layout:'B',style:'spec',pal:'cobalt',head:'Claude 出品',seed:13});
  scene(at('打开网页'),{layout:'C',style:'spec',pal:'lemon',head:HEAD[2],seed:15});

  // ② 抽一张
  scene(at('抽一张'),{layout:'A',style:'spec',pal:'meadow',head:'抽一张',seed:21}); press(at('抽一张'),idx('A','cta'));
  scene(at('抽卡'),{layout:'B',style:'cute',pal:'rose',head:'风格抽卡',seed:23}); press(at('抽卡'),idx('B','cta'));
  scene(at('每抽一次'),{layout:'C',style:'spec',pal:'pasture',head:HEAD[2],seed:25}); press(at('每抽一次'),idx('C','cta'));
  scene(at('配色',14),{layout:'A',style:'spec',pal:'clay',head:'换排版 换配色',seed:27});

  // ③ 三种风格
  scene(at('三种风格'),{layout:'A',style:'spec',pal:'snow',head:'三种风格',seed:31});
  scene(at('混乱'),{layout:'CHAOS',style:'chaos',pal:'market',head:'混乱',seed:33});
  scene(at('可爱'),{layout:'CUTE',style:'cute',pal:'plaid',head:'可爱',seed:35});
  scene(at('规整'),{layout:'SPEC',style:'spec',pal:'spec',head:'规整',seed:37});

  // ④ 单格修改
  scene(at('单独修改'),{layout:'A',style:'spec',pal:'cobalt',head:'单独修改',seed:41});
  const iDial=idx('A','dial'), iHalf=idx('A','halftone'), iDots=idx('A','dots');
  sel(at('点击它'),iDial); mod(at('切换格式'),iDial,{role:'sparkle'});
  sel(at('改文字'),0); set(at('改文字')+0.15,sc=>{ sc.head='改' }); set(at('文字',24.6),sc=>{ sc.head='改文字' }); set(at('内容',25),sc=>{ sc.head='改文字内容' });
  sel(at('切换颜色'),iHalf); mod(at('颜色',25.9),iHalf,{f:'c4'});
  sel(at('交换位置'),iDial,iDots); set(at('位置',27),sc=>{ sc.swap=[iDial,iDots] });
  sel(at('拖动'));
  ev(at('拖动'),d=>{ d.drag={a:iDial,b:iHalf,axis:'x',t0:at('拖动')-LEAD,t1:at('大小',29,true)}; d.scene.swap=null; d.dirty=true });
  ev(at('里面的文字'),d=>{ d.drag=null; d.dirty=true });

  // ⑤ 混乱模式
  scene(at('如果你觉得'),{layout:'SPEC',style:'spec',pal:'navy',head:'太规整？',seed:51});
  scene(at('混乱模式'),{layout:'CHAOS',style:'chaos',pal:'volt',head:'混乱模式',seed:53});
  set(at('鬼马'),sc=>{ sc.head='更鬼马' });
  set(at('灵动'),sc=>{ sc.head='更灵动' });

  // ⑥ 文字层级（不露脸）
  scene(at('文字部分'),{layout:'T',style:'spec',pal:'cobalt',seed:61});
  sel(at('主标题'),0); sel(at('副标题'),1); sel(at('正文'),2); sel(at('按钮',44),4); sel(at('在右边'));
  scene(at('换成'),{layout:'T',style:'spec',pal:'cobalt',seed:61});
  mod(at('换成'),0,{txt:{h:EVENT.title}}); mod(at('换成'),1,{txt:{h:EVENT.date,s:EVENT.place}});
  mod(at('换成'),2,{txt:{h:EVENT.place,b:EVENT.note+'\n'+EVENT.date}}); mod(at('换成'),4,{cta:EVENT.cta});

  // ⑦ 配色（不露脸）
  scene(at('另外'),{layout:'P',style:'spec',pal:'soda',head:'配色',seed:71});
  set(at('配色库'),sc=>{ sc.pal='lemon'; sc.head='配色库' });
  set(at('选择',53),sc=>{ sc.pal='volt' });
  set(at('自己选择'),sc=>{ sc.pal=Object.assign({},G.PRESETS.tomint,{c1:'#7B4DFF',name:'自选'}); sc.head='自选颜色' });
  sel(at('拖入图片'),idx('P','photo')); set(at('拖入图片'),sc=>{ sc.head='拖图吸色' });
  scene(at('吸色'),{layout:'P',style:'spec',pal:PHOTO_PAL,head:'一键吸色',seed:73});

  // ⑧ 全屏口播 → 拉远
  ev(at('我也'),d=>{ d.mode='full' },0);
  const zEnd=at('这样',62,true);
  ev(zEnd,d=>{ d.mode='zoom'; d.zoom={t0:zEnd,t1:zEnd+0.9}; d.scene=sceneOf({layout:'A',style:'spec',pal:'tomint',head:'动真格',seed:81}); d.restartT=zEnd-1.2; d.sel=[]; d.dirty=true },0);
  ev(zEnd+0.9,d=>{ d.mode='grid' },0);

  // ⑨ 结尾
  set(at('小红书',64),sc=>{ sc.head='小红书' });
  set(at('点击笔记'),sc=>{ sc.head='动真格' }); press(at('体验'),idx('A','cta'));

  EV.sort((a,b)=>a.t-b.t);
}
function applyUpTo(t){
  if(t<lastT){ D=freshD(); evI=0 }
  while(evI<EV.length&&EV[evI].t<=t+1e-6){ EV[evI].fn(D); evI++ }
  lastT=t;
}

// ---------------------------------------------------------------- 绘制辅助
function loadImg(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('load '+src)); im.src=src }) }
const pad5=n=>String(n).padStart(5,'0');
let PHOTO=null;
const easeIO=p=>{ p=Math.min(1,Math.max(0,p)); return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2 };
function rr(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath() }
function drawSel(r){
  octx.save();
  octx.lineWidth=12; octx.strokeStyle='#FFFFFF'; rr(octx,r.x-8,r.y-8,r.w+16,r.h+16,20); octx.stroke();
  octx.lineWidth=6; octx.strokeStyle='#141414'; rr(octx,r.x-8,r.y-8,r.w+16,r.h+16,20); octx.stroke();
  octx.restore();
}
function cover(c,im){ const k=Math.max(W/im.width,H/im.height); c.drawImage(im,(W-im.width*k)/2,(H-im.height*k)/2,im.width*k,im.height*k) }

// ---------------------------------------------------------------- 逐帧
async function frame(n){
  const t=n/FPS;
  const face=await loadImg('vo/'+pad5(n+1)+'.jpg');
  G.setAsset('vo',{img:face,fx:0.5,fy:0.32,z:1.25});
  G.setAsset('photo',{img:PHOTO});
  G.setVoAid('vo');
  applyUpTo(t);
  if(D.dirty||D.drag) applyScene(t);
  octx.setTransform(1,0,0,1,0,0);
  if(D.mode==='full'){ cover(octx,face); return out.toDataURL('image/jpeg',0.92) }

  const raw=Math.max(0,t-D.restartT), pt=raw<0.4?0.55+raw*3:1.75+(raw-0.4);
  G.render(pctx,pt);
  const R=G.getRects();
  octx.clearRect(0,0,W,H);
  if(D.mode==='zoom'&&D.zoom){
    // 画框收缩：全屏口播像窗口一样缩进它在海报里的格子；背后海报从放大缩回原大
    const e=easeIO((t-D.zoom.t0)/(D.zoom.t1-D.zoom.t0));
    const fi=L[D.scene.layout].findIndex(c=>c.role==='face'), fr=R[fi];
    const k0=Math.max(W/fr.w,H/fr.h), k=k0+(1-k0)*e, cx=fr.x+fr.w/2, cy=fr.y+fr.h/2;
    const tx=(W/2)+(cx-W/2)*e, ty=(H/2)+(cy-H/2)*e;
    octx.save(); octx.setTransform(k,0,0,k,tx-k*cx,ty-k*cy); octx.drawImage(pc,0,0); octx.restore();
    // 窗口：从全屏插值到格子位置
    const ww=k*fr.w, wh=k*fr.h, wx=tx-ww/2, wy=ty-wh/2, rad=Math.max(2,S.radius)*k*e;
    const z=1+0.25*e, sk=Math.max(ww/face.width,wh/face.height)*z, iw=face.width*sk, ih=face.height*sk;
    const ox=-Math.min(Math.max(0.5*iw-ww/2,0),iw-ww), oy=-Math.min(Math.max((0.5+(0.32-0.5)*e)*ih-wh/2,0),ih-wh);
    octx.save(); rr(octx,wx,wy,ww,wh,rad); octx.clip(); octx.drawImage(face,wx+ox,wy+oy,iw,ih); octx.restore();
  } else octx.drawImage(pc,0,0);
  if(D.press){ const u=(t-D.press.t0)/0.35, r=R[D.press.i];
    if(u>=0&&u<1&&r){ const s=1-0.08*Math.sin(Math.PI*u); octx.save(); octx.beginPath(); octx.rect(r.x-6,r.y-6,r.w+12,r.h+12); octx.clip();
      octx.fillStyle=S.pal.ground; octx.fillRect(r.x-6,r.y-6,r.w+12,r.h+12);
      octx.translate(r.x+r.w/2,r.y+r.h/2); octx.scale(s,s); octx.drawImage(pc,r.x,r.y,r.w,r.h,-r.w/2,-r.h/2,r.w,r.h); octx.restore() } }
  D.sel.forEach(i=>{ if(R[i]) drawSel(R[i]) });
  return out.toDataURL('image/jpeg',0.92);
}

window.FILM={
  async init(){
    WORDS=(await (await fetch('words.json')).json()).segments.flatMap(s=>s.words);
    PHOTO=await loadImg('photo.png');
    if(document.fonts&&document.fonts.ready) await document.fonts.ready;
    D=freshD(); build(); lastT=-1;
    return {events:EV.length, frames:Math.floor(WORDS[WORDS.length-1].end*FPS)};
  },
  frame,
  cues(){ return EV.map(e=>+e.t.toFixed(2)) }
};
})();
