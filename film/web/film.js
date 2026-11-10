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
  A:[{r:[0,0,4,3],role:'head',f:'c2'},{r:[4,0,2,3],role:'face'},
     {r:[0,3,6,1],role:'tick',f:'c1'},
     {r:[0,4,2,3],role:'dial',f:'c3'},{r:[2,4,4,3],role:'halftone',f:'c4'},
     {r:[0,7,3,3],role:'cta',f:'c1'},{r:[3,7,3,3],role:'dots',f:'paper'},
     {r:[0,10,6,2],role:'bands',f:'c2'}],
  B:[{r:[0,0,2,3],role:'face'},{r:[2,0,4,3],role:'head',f:'c1'},
     {r:[0,3,3,4],role:'lens',f:'paper'},{r:[3,3,3,2],role:'cta',f:'c4'},{r:[3,5,3,2],role:'sparkle',f:'c2'},
     {r:[0,7,6,1],role:'tick',f:'ink'},
     {r:[0,8,2,2],role:'shape',f:'c2'},{r:[2,8,4,2],role:'stripes',f:'c4'},
     {r:[0,10,6,2],role:'checker',f:'c3'}],
  C:[{r:[0,0,6,1],role:'tick',f:'c1'},
     {r:[0,1,4,4],role:'head',f:'c2'},{r:[4,1,2,3],role:'face'},{r:[4,4,2,1],role:'swatch',f:'c3'},
     {r:[0,5,2,5],role:'letter',f:'c4'},{r:[2,5,4,3],role:'halftone',f:'paper'},{r:[2,8,2,2],role:'cta',f:'c2'},{r:[4,8,2,2],role:'dial',f:'c3'},
     {r:[0,10,6,2],role:'wave',f:'ink'}],
  CHAOS:[{r:[0,0,4,2],role:'head',f:'c4'},{r:[4,0,2,3],role:'face'},{r:[0,2,2,2],role:'sparkle',f:'c2'},{r:[2,2,2,2],role:'lens',f:'paper'},
     {r:[0,4,3,2],role:'stripes',f:'c3'},{r:[3,3,3,3],role:'shape',f:'c2'},{r:[0,6,6,1],role:'tick',f:'c1'},
     {r:[0,7,2,3],role:'letter',f:'c3'},{r:[2,7,2,3],role:'cta',f:'c4'},{r:[4,7,2,3],role:'dots',f:'c1'},
     {r:[0,10,3,2],role:'checker',f:'c4'},{r:[3,10,3,2],role:'sparkle',f:'c2'}],
  CUTE:[{r:[0,0,4,4],role:'head',f:'c3'},{r:[4,0,2,3],role:'face'},{r:[4,3,2,1],role:'tick',f:'c1'},
     {r:[0,4,3,4],role:'face_',f:'c2'},{r:[3,4,3,4],role:'dots',f:'paper'},
     {r:[0,8,6,2],role:'cta',f:'c1'},{r:[0,10,6,2],role:'wave',f:'c3'}],
  SPEC:[{r:[0,0,4,4],role:'head',f:'c3'},{r:[4,0,2,3],role:'face'},{r:[4,3,2,1],role:'swatch',f:'c1'},
     {r:[0,4,6,1],role:'tick',f:'c2'},
     {r:[0,5,2,3],role:'dial',f:'paper'},{r:[2,5,2,3],role:'letter',f:'c3'},{r:[4,5,2,3],role:'halftone',f:'c1'},
     {r:[0,8,6,2],role:'cta',f:'c2'},{r:[0,10,6,2],role:'bands',f:'c4'}],
  T:[{r:[0,0,6,3],role:'tx:headline',f:'c3',txt:{h:'动真格'}},
     {r:[0,3,6,2],role:'tx:stack',f:'c1',txt:{h:'风格化动效海报',s:'不用 AE · 一键生成'}},
     {r:[0,5,4,3],role:'tx:body',f:'c4',txt:{h:'三种风格',b:'可爱 · 规整 · 混乱\n抽一张 换版式与配色'}},
     {r:[4,5,2,3],role:'dots',f:'paper'},
     {r:[0,8,4,2],role:'cta',f:'c1'},{r:[4,8,2,2],role:'face_',f:'c3'},
     {r:[0,10,6,2],role:'bands',f:'c2'}],
  P:[{r:[0,0,6,3],role:'head',f:'c2'},{r:[0,3,6,1],role:'tick',f:'c1'},
     {r:[0,4,3,3],role:'swatch',f:'c3'},{r:[3,4,3,3],role:'halftone',f:'paper'},
     {r:[0,7,3,3],role:'photo',f:'c1'},{r:[3,7,3,3],role:'cta',f:'c1'},
     {r:[0,10,6,2],role:'bands',f:'c2'}],
};
const PALS={
  teal:{name:'薄荷',ground:'#14C3A0',paper:'#F6EEEA',ink:'#1E2A36',c1:'#F0C4D0',c2:'#C6DC52',c3:'#E87A1E',c4:'#F3D9A4'},
  night:{name:'夜市',ground:'#0A0C0A',paper:'#EDE9E3',ink:'#0A0C0A',c1:'#4B7CF4',c2:'#E95F26',c3:'#C961F5',c4:'#D5CA5F'},
  cream:{name:'奶油紫',ground:'#B8A1FF',paper:'#FBF8FF',ink:'#211640',c1:'#FFDE59',c2:'#FF6F91',c3:'#3A86FF',c4:'#FF9F43'},
  peach:{name:'蜜桃苏打',ground:'#FFC4B8',paper:'#FFF8F5',ink:'#3A1F1A',c1:'#FF5D73',c2:'#3E7BFA',c3:'#FFE57F',c4:'#42D6A4'},
  blues:{name:'蓝调',ground:'#1446A0',paper:'#F4F6FF',ink:'#0A1A3A',c1:'#DB3069',c2:'#F5D547',c3:'#EBEBD3',c4:'#3DDC97'},
  olive:{name:'橄榄霓虹',ground:'#1E2A1A',paper:'#F4F1E6',ink:'#1E2A1A',c1:'#C6F432',c2:'#FF6B35',c3:'#7FD1FF',c4:'#F7C8E0'},
  berry:{name:'草莓牛奶',ground:'#FFD1DC',paper:'#FFF8FA',ink:'#3B1C2A',c1:'#FF4F79',c2:'#FFB703',c3:'#8ECAE6',c4:'#219EBC'},
  mango:{name:'芒果',ground:'#FFB627',paper:'#FFF8E8',ink:'#2A1B0F',c1:'#FF5E3A',c2:'#1E64FF',c3:'#FFE6A7',c4:'#00A676'},
  film:{name:'老电影',ground:'#E9D8A6',paper:'#FBF6E9',ink:'#001219',c1:'#AE2012',c2:'#005F73',c3:'#EE9B00',c4:'#94D2BD'},
  beach:{name:'沙滩',ground:'#F6E3BA',paper:'#FFFCF3',ink:'#2A2116',c1:'#FF6B6B',c2:'#4ECDC4',c3:'#1A535C',c4:'#FFE66D'},
  sakura:{name:'樱花地铁',ground:'#F7A1C4',paper:'#FFF5F9',ink:'#2B1636',c1:'#3A3FD9',c2:'#FFE45E',c3:'#FF4D4D',c4:'#6FE3C1'},
  tv:{name:'复古电视',ground:'#F2E8CF',paper:'#FFFFFF',ink:'#1D1D1B',c1:'#E63946',c2:'#1D3557',c3:'#F4A261',c4:'#2A9D8F'},
  neon:{name:'霓虹夜',ground:'#14051F',paper:'#F2E9FF',ink:'#14051F',c1:'#FF2E88',c2:'#00F5D4',c3:'#FEE440',c4:'#9B5DE5'},
  caramel:{name:'焦糖',ground:'#C4622D',paper:'#FBEFE3',ink:'#2A140A',c1:'#F7C873',c2:'#3C6E71',c3:'#F4B6C2',c4:'#284B63'},
  dusk:{name:'晚霞汽水',ground:'#FF6F59',paper:'#FFF4E6',ink:'#1D1A2F',c1:'#FFD23F',c2:'#3D5AFE',c3:'#FF9EC7',c4:'#00B894'},
  blueberry:{name:'蓝莓奶昔',ground:'#5B5FEF',paper:'#F6F2FF',ink:'#120F2E',c1:'#FFB4D6',c2:'#FFE066',c3:'#2EC4B6',c4:'#FF5E5B'},
  jelly:{name:'果冻',ground:'#FF66C4',paper:'#FFF2FA',ink:'#2A0F2A',c1:'#FFE600',c2:'#00C3FF',c3:'#8A5CFF',c4:'#3DDC84'},
};
const PHOTO_PAL=PALS.jelly;

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
  const pal=typeof sc.pal==='string'?(PALS[sc.pal]||G.PRESETS[sc.pal]):sc.pal, st=sc.style;
  Object.assign(S,{aspect:'9:16',cols:6,rows:12,count:Ls.length,seed:sc.seed,variance:50,bias:0,shuffle:false,dur:600,grain:0,
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

  // ① 开场钩子：每张停 3 秒以上，只在句首切
  scene(0,{layout:'A',style:'spec',pal:'teal',head:HEAD[0],seed:3});
  scene(at('或者'),{layout:'B',style:'spec',pal:'night',head:HEAD[1],seed:5});
  scene(at('那你'),{layout:'C',style:'spec',pal:'cream',head:HEAD[2],seed:9});

  // ② 抽一张：约 2 秒一张
  scene(at('抽一张'),{layout:'A',style:'spec',pal:'olive',head:'抽一张',seed:21}); press(at('抽一张'),idx('A','cta'));
  scene(at('每抽一次'),{layout:'B',style:'cute',pal:'berry',head:'风格抽卡',seed:23}); press(at('每抽一次'),idx('B','cta'));
  scene(at('配色',14),{layout:'C',style:'spec',pal:'film',head:'换排版 换配色',seed:27}); press(at('配色',14),idx('C','cta'));

  // ③ 三种风格
  scene(at('三种风格'),{layout:'A',style:'spec',pal:'beach',head:'三种风格',seed:31});
  scene(at('混乱'),{layout:'CHAOS',style:'chaos',pal:'night',head:'混乱',seed:33});
  scene(at('可爱'),{layout:'CUTE',style:'cute',pal:'sakura',head:'可爱',seed:35});
  scene(at('规整'),{layout:'SPEC',style:'spec',pal:'tv',head:'规整',seed:37});

  // ④ 单格修改
  scene(at('单独修改'),{layout:'A',style:'spec',pal:'teal',head:'单独修改',seed:41});
  const iDial=idx('A','dial'), iHalf=idx('A','halftone'), iDots=idx('A','dots');
  sel(at('点击它'),iDial); mod(at('切换格式'),iDial,{role:'sparkle'});
  sel(at('改文字'),0); set(at('改文字')+0.15,sc=>{ sc.head='改' }); set(at('文字',24.6),sc=>{ sc.head='改文字' }); set(at('内容',25),sc=>{ sc.head='改文字内容' });
  sel(at('切换颜色'),iHalf); mod(at('颜色',25.9),iHalf,{f:'c4'});
  sel(at('交换位置'),iDial,iDots); set(at('位置',27),sc=>{ sc.swap=[iDial,iDots] });
  sel(at('拖动'));
  ev(at('拖动'),d=>{ d.drag={a:iDial,b:iHalf,axis:'x',t0:at('拖动')-LEAD,t1:at('大小',29,true)}; d.scene.swap=null; d.dirty=true });
  ev(at('里面的文字'),d=>{ d.drag=null; d.dirty=true });

  // ⑤ 混乱模式
  scene(at('如果你觉得'),{layout:'SPEC',style:'spec',pal:'film',head:'太规整？',seed:51});
  scene(at('混乱模式'),{layout:'CHAOS',style:'chaos',pal:'neon',head:'混乱模式',seed:53});
  set(at('鬼马'),sc=>{ sc.head='更鬼马' });
  set(at('灵动'),sc=>{ sc.head='更灵动' });

  // ⑥ 文字层级（不露脸）
  scene(at('文字部分'),{layout:'T',style:'spec',pal:'cream',seed:61});
  sel(at('主标题'),0); sel(at('副标题'),1); sel(at('正文'),2); sel(at('按钮',44),4); sel(at('在右边'));
  scene(at('换成'),{layout:'T',style:'spec',pal:'cream',seed:61});
  mod(at('换成'),0,{txt:{h:EVENT.title}}); mod(at('换成'),1,{txt:{h:EVENT.date,s:EVENT.place}});
  mod(at('换成'),2,{txt:{h:EVENT.place,b:EVENT.note+'\n'+EVENT.date}}); mod(at('换成'),4,{cta:EVENT.cta});

  // ⑦ 配色（不露脸）
  scene(at('另外'),{layout:'P',style:'spec',pal:'caramel',head:'配色',seed:71});
  set(at('配色库'),sc=>{ sc.pal='dusk'; sc.head='配色库' });
  set(at('选择',53),sc=>{ sc.pal='blueberry' });
  set(at('自己选择'),sc=>{ sc.pal=Object.assign({},PALS.dusk,{c1:'#7B4DFF',c4:'#14C3A0',name:'自选'}); sc.head='自选颜色' });
  sel(at('拖入图片'),idx('P','photo')); set(at('拖入图片'),sc=>{ sc.head='拖图吸色' });
  scene(at('吸色'),{layout:'P',style:'spec',pal:PHOTO_PAL,head:'一键吸色',seed:73});

  // ⑧ 全屏口播 → 拉远
  ev(at('我也'),d=>{ d.mode='full' },0);
  const zEnd=at('这样',62,true);
  ev(zEnd,d=>{ d.mode='zoom'; d.zoom={t0:zEnd,t1:zEnd+0.9}; d.scene=sceneOf({layout:'A',style:'spec',pal:'teal',head:'动真格',seed:81}); d.restartT=zEnd-1.2; d.sel=[]; d.dirty=true },0);
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
    { const keep=G.getStyle(); const c=document.createElement('canvas');
      Object.assign(S,{aspect:'1:1',style:'chaos',pal:Object.assign({},PALS.jelly),shuffle:false,dur:9});
      G.drawBest(4242,{tier:'R',keepPal:true}); S.aspect='1:1'; S.pal=Object.assign({},PALS.jelly); S.style='chaos';
      G.render(c.getContext('2d'),3.2); PHOTO=c; G.setStyle(keep); }
    try{ await document.fonts.load('900 80px "Noto Sans SC"','动真格不用丝滑一键生成抽张三种风格混乱可爱规整') }catch(e){}
    if(document.fonts&&document.fonts.ready) await document.fonts.ready;
    D=freshD(); build(); lastT=-1;
    return {events:EV.length, frames:Math.floor(WORDS[WORDS.length-1].end*FPS)};
  },
  frame,
  cues(){ return EV.map(e=>+e.t.toFixed(2)) }
};
})();
